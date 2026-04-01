import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Env, ContextVariables, SessionData, User } from '../types';
import { signToken, verifyToken, generateId, generateToken } from '../lib/auth';
import { getUserByEmail, getUserById, createUser } from '../db/queries';

const auth = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

// ============================================================
// GET /auth/google
// Redirect user to Google OAuth consent screen
// ============================================================

auth.get('/google', async (c) => {
  const state = generateToken(16);

  // Store CSRF state in KV (10 min TTL)
  await c.env.SESSIONS.put(`oauth_state:${state}`, '1', { expirationTtl: 600 });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: getCallbackUrl(c.req.raw),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ============================================================
// GET /auth/google/callback
// Exchange authorization code, upsert user, set session cookie
// ============================================================

auth.get('/google/callback', async (c) => {
  const { code, state, error } = c.req.query();

  if (error || !code || !state) {
    return c.redirect(`${c.env.FRONTEND_URL}/?error=oauth_failed`);
  }

  // Validate CSRF state
  const stateKey = `oauth_state:${state}`;
  const stateValid = await c.env.SESSIONS.get(stateKey);
  if (!stateValid) {
    return c.redirect(`${c.env.FRONTEND_URL}/?error=invalid_state`);
  }
  await c.env.SESSIONS.delete(stateKey);

  // Exchange code for Google user info
  let googleUser: GoogleUserInfo;
  try {
    googleUser = await exchangeCodeForUser(code, getCallbackUrl(c.req.raw), c.env);
  } catch (err) {
    console.error('[auth] Google token exchange failed:', err);
    return c.redirect(`${c.env.FRONTEND_URL}/?error=token_exchange_failed`);
  }

  // Upsert user: always update google_id + avatar on login so avatar stays fresh
  let user = await getUserByEmail(c.env.DB, googleUser.email);

  if (user) {
    await c.env.DB
      .prepare(
        `UPDATE users
         SET google_id = ?, avatar_url = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(googleUser.sub, googleUser.picture ?? null, user.id)
      .run();
    // Re-fetch so session data has the latest avatar_url
    user = await getUserById(c.env.DB, user.id);
  } else {
    user = await createUser(c.env.DB, {
      name: googleUser.name,
      email: googleUser.email,
      google_id: googleUser.sub,
      avatar_url: googleUser.picture ?? undefined,
    });
  }

  if (!user) {
    return c.redirect(`${c.env.FRONTEND_URL}/?error=user_creation_failed`);
  }

  const sessionToken = await createSession(user, c.env);

  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === 'production',
    sameSite: 'Lax',
    maxAge: SESSION_TTL,
    path: '/',
  });

  return c.redirect(`${c.env.FRONTEND_URL}/dashboard`);
});

// ============================================================
// GET /auth/me
// Return current user — called on every app load to bootstrap auth state
// ============================================================

auth.get('/me', async (c) => {
  const token = extractSessionToken(c.req.raw);
  if (!token) {
    return c.json({ success: false, error: 'Not authenticated' }, 401);
  }

  const user = await resolveTokenToUser(token, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Session expired or invalid' }, 401);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      is_guest: user.is_guest,
    },
  });
});

// ============================================================
// POST /auth/logout
// Revoke session from KV and clear cookie
// ============================================================

auth.post('/logout', async (c) => {
  const token = extractSessionToken(c.req.raw);

  if (token) {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) {
      await c.env.SESSIONS.delete(`session:${payload.jti}`);
    }
  }

  deleteCookie(c, 'session', { path: '/' });
  return c.json({ success: true, data: null });
});

// ============================================================
// Shared helpers
// ============================================================

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

async function exchangeCodeForUser(
  code: string,
  redirectUri: string,
  env: Env,
): Promise<GoogleUserInfo> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`);
  }

  const tokens = await tokenRes.json<{ access_token: string }>();

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error(`User info fetch failed: ${userRes.status}`);
  }

  return userRes.json<GoogleUserInfo>();
}

async function createSession(user: User, env: Env): Promise<string> {
  const jti = generateId();
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const token = await signToken({ jti, sub: user.id, exp }, env.JWT_SECRET);

  const session: SessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
  };
  await env.SESSIONS.put(`session:${jti}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });

  return token;
}

async function resolveTokenToUser(token: string, env: Env): Promise<User | null> {
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) return null;

  const session = await env.SESSIONS.get<SessionData>(`session:${payload.jti}`, 'json');
  if (!session) return null;

  return getUserById(env.DB, session.userId);
}

function extractSessionToken(request: Request): string | null {
  // Cookie takes priority
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.split(';').find((p) => p.trim().startsWith('session='));
    if (match) return decodeURIComponent(match.split('=')[1].trim());
  }
  // Bearer token fallback
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function getCallbackUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/google/callback`;
}

export default auth;

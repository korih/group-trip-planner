import type { Context, Next } from 'hono';
import type { Env, ContextVariables, SessionData, GuestTokenData } from '../types';
import { verifyToken } from '../lib/auth';
import { getUserById } from '../db/queries';

type AppContext = Context<{ Bindings: Env; Variables: ContextVariables }>;

/**
 * Populates c.var.user if a valid session cookie or Bearer token is present.
 * Does NOT block unauthenticated requests — use requireAuth for that.
 */
export async function optionalAuth(c: AppContext, next: Next): Promise<Response | void> {
  const token = getSessionToken(c);
  if (token) {
    const user = await resolveSession(token, c.env);
    if (user) {
      c.set('userId', user.id);
      c.set('user', user);
      c.set('isGuest', user.is_guest === 1);
      c.set('sessionId', token);
    }
  }
  return next();
}

/**
 * Returns 401 if no valid session is present.
 */
export async function requireAuth(c: AppContext, next: Next): Promise<Response | void> {
  const token = getSessionToken(c);
  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const user = await resolveSession(token, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Session expired' }, 401);
  }

  c.set('userId', user.id);
  c.set('user', user);
  c.set('isGuest', user.is_guest === 1);
  c.set('sessionId', token);

  return next();
}

/**
 * Returns 401/403 if no valid session OR if the user is a guest.
 * Use for routes that require a full (non-guest) account.
 */
export async function requireFullAccount(c: AppContext, next: Next): Promise<Response | void> {
  const token = getSessionToken(c);
  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const user = await resolveSession(token, c.env);
  if (!user) {
    return c.json({ success: false, error: 'Session expired' }, 401);
  }

  if (user.is_guest === 1) {
    return c.json({ success: false, error: 'A full account is required for this action' }, 403);
  }

  c.set('userId', user.id);
  c.set('user', user);
  c.set('isGuest', false);
  c.set('sessionId', token);

  return next();
}

// ============================================================
// Internal helpers
// ============================================================

function getSessionToken(c: AppContext): string | null {
  // Cookie first
  const cookie = c.req.raw.headers.get('Cookie');
  if (cookie) {
    const match = cookie.split(';').find((p) => p.trim().startsWith('session='));
    if (match) return decodeURIComponent(match.split('=')[1].trim());
  }
  // Authorization: Bearer <token> fallback
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

async function resolveSession(token: string, env: Env) {
  // Guest token
  if (token.startsWith('guest_')) {
    const data = await env.SESSIONS.get<GuestTokenData>(`guest:${token}`, 'json');
    if (!data) return null;
    return getUserById(env.DB, data.userId);
  }

  // JWT session
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) return null;

  const session = await env.SESSIONS.get<SessionData>(`session:${payload.jti}`, 'json');
  if (!session) return null;

  return getUserById(env.DB, session.userId);
}

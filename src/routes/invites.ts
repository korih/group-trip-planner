import { Hono } from 'hono';
import type { Env, ContextVariables } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { generateId, generateToken } from '../lib/auth';
import { createUser, addTripMember, getUserById } from '../db/queries';
import { logActivity } from '../lib/activity';

const invites = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// POST /trips/:tripId/invites  — create invite token
invites.post('/', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const body = await c.req.json<{
    role?: 'editor' | 'viewer';
    expiresInHours?: number;
    maxUses?: number;
  }>();

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  const role = body.role ?? 'viewer';
  const token = generateToken(24); // 48-char hex
  const id = generateId();
  const expiresAt = body.expiresInHours
    ? new Date(Date.now() + body.expiresInHours * 3600_000).toISOString()
    : null;

  await c.env.DB
    .prepare(
      `INSERT INTO invite_tokens (id, trip_id, created_by, token, role, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, tripId, c.var.userId, token, role, body.maxUses ?? null, expiresAt)
    .run();

  // Cache in KV for fast validation
  await c.env.SESSIONS.put(
    `invite:${token}`,
    JSON.stringify({ tripId, role, id }),
    { expirationTtl: body.expiresInHours ? body.expiresInHours * 3600 : 60 * 60 * 24 * 30 },
  );

  const row = await c.env.DB.prepare('SELECT * FROM invite_tokens WHERE id = ?').bind(id).first();
  return c.json({ success: true, data: row }, 201);
});

// GET /trips/:tripId/invites  — list active invite tokens
invites.get('/', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  const result = await c.env.DB
    .prepare('SELECT * FROM invite_tokens WHERE trip_id = ? AND revoked = 0 ORDER BY created_at DESC')
    .bind(tripId).all();

  return c.json({ success: true, data: result.results });
});

// DELETE /trips/:tripId/invites/:tokenId  — revoke token
invites.delete('/:tokenId', requireAuth, async (c) => {
  const { tripId, tokenId } = c.req.param();

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role !== 'owner') return c.json({ success: false, error: 'Forbidden' }, 403);

  const tokenRow = await c.env.DB
    .prepare('SELECT token FROM invite_tokens WHERE id = ? AND trip_id = ?')
    .bind(tokenId, tripId).first<{ token: string }>();
  if (!tokenRow) return c.json({ success: false, error: 'Token not found' }, 404);

  await c.env.DB
    .prepare('UPDATE invite_tokens SET revoked = 1 WHERE id = ?')
    .bind(tokenId).run();

  // Remove from KV cache
  await c.env.SESSIONS.delete(`invite:${tokenRow.token}`);

  return c.json({ success: true, data: null });
});

// GET /invites/:token  — validate + return trip preview (public, no auth required)
export async function handleInviteValidate(
  token: string,
  env: Env,
): Promise<Response> {
  const cached = await env.SESSIONS.get<{ tripId: string; role: string; id: string }>(
    `invite:${token}`,
    'json',
  );
  if (!cached) {
    return Response.json({ success: false, error: 'Invalid or expired invite link' }, { status: 404 });
  }

  // Verify in DB (check revoked, max_uses, expiry)
  const tokenRow = await env.DB
    .prepare(
      `SELECT it.*, t.name AS trip_name, t.destination, t.start_date, t.end_date
       FROM invite_tokens it
       JOIN trips t ON it.trip_id = t.id
       WHERE it.token = ? AND it.revoked = 0`,
    )
    .bind(token)
    .first<{
      id: string; trip_id: string; role: string; max_uses: number | null;
      use_count: number; expires_at: string | null; trip_name: string;
      destination: string; start_date: string; end_date: string;
    }>();

  if (!tokenRow) {
    return Response.json({ success: false, error: 'Invalid or revoked invite link' }, { status: 404 });
  }

  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    return Response.json({ success: false, error: 'Invite link has expired' }, { status: 410 });
  }

  if (tokenRow.max_uses !== null && tokenRow.use_count >= tokenRow.max_uses) {
    return Response.json({ success: false, error: 'Invite link has reached its use limit' }, { status: 410 });
  }

  return Response.json({
    success: true,
    data: {
      tokenId: tokenRow.id,
      tripId: tokenRow.trip_id,
      tripName: tokenRow.trip_name,
      destination: tokenRow.destination,
      startDate: tokenRow.start_date,
      endDate: tokenRow.end_date,
      role: tokenRow.role,
    },
  });
}

// POST /invites/:token/redeem  — join as authed user or create guest
export async function handleInviteRedeem(
  token: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // Validate token first
  const validateRes = await handleInviteValidate(token, env);
  if (!validateRes.ok) return validateRes;
  const { data: inviteData } = await validateRes.clone().json<{ data: {
    tokenId: string; tripId: string; role: string;
  } }>();

  // Parse body for optional guest name
  let guestName: string | undefined;
  try {
    const body = await request.json<{ guestName?: string }>();
    guestName = body.guestName;
  } catch { /* no body */ }

  // Check if user is already authenticated via cookie
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const sessionMatch = cookieHeader.match(/session=([^;]+)/);
  let userId: string | null = null;
  let isGuest = false;

  if (sessionMatch) {
    const sessionToken = sessionMatch[1];
    try {
      // Decode JWT header.payload (don't need full verify for this use case — just extract sub)
      const parts = sessionToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const session = await env.SESSIONS.get<{ userId: string }>(`session:${payload.jti}`, 'json');
        if (session) userId = session.userId;
      }
    } catch { /* invalid token */ }
  }

  if (!userId) {
    // Create a guest user
    const displayName = guestName ?? `Guest ${Math.floor(Math.random() * 9000) + 1000}`;
    const guestUser = await createUser(env.DB, {
      name: displayName,
      email: `guest_${generateId()}@placeholder.invalid`,
      is_guest: 1,
    });
    userId = guestUser.id;
    isGuest = true;

    // Store guest token in KV
    const guestToken = `guest_${generateToken(24)}`;
    await env.SESSIONS.put(
      `guest:${guestToken}`,
      JSON.stringify({
        userId,
        tripId: inviteData.tripId,
        role: inviteData.role,
        displayName,
        inviteTokenId: inviteData.tokenId,
      }),
      { expirationTtl: 60 * 60 * 24 * 90 }, // 90-day TTL for guest tokens
    );

    await addTripMember(env.DB, inviteData.tripId, userId, inviteData.role as 'editor' | 'viewer');

    // Update use_count
    await env.DB
      .prepare("UPDATE invite_tokens SET use_count = use_count + 1 WHERE id = ?")
      .bind(inviteData.tokenId).run();

    const user = await getUserById(env.DB, userId);
    await logActivity(env.DB, {
      trip_id: inviteData.tripId,
      actor_id: userId,
      actor_display: displayName,
      action: 'joined_trip',
      entity_type: 'trip_member',
      entity_id: userId,
      entity_label: displayName,
    });

    return Response.json({
      success: true,
      data: { isGuest: true, guestToken, user, tripId: inviteData.tripId },
    });
  }

  // Authenticated user — just add to trip_members
  const existing = await env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(inviteData.tripId, userId).first();

  if (!existing) {
    await addTripMember(env.DB, inviteData.tripId, userId, inviteData.role as 'editor' | 'viewer');
    await env.DB
      .prepare("UPDATE invite_tokens SET use_count = use_count + 1 WHERE id = ?")
      .bind(inviteData.tokenId).run();

    const user = await getUserById(env.DB, userId);
    await logActivity(env.DB, {
      trip_id: inviteData.tripId,
      actor_id: userId,
      actor_display: user?.name ?? 'Unknown',
      action: 'joined_trip',
      entity_type: 'trip_member',
      entity_id: userId,
      entity_label: user?.name ?? 'Unknown',
    });
  }

  return Response.json({
    success: true,
    data: { isGuest, tripId: inviteData.tripId },
  });
}

export default invites;

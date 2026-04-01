import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchApp, runMigrations, seedUser, seedTrip, createSession } from './helpers';
import { generateToken } from '../src/lib/auth';

beforeEach(async () => {
  await runMigrations(env.DB);
});

async function seedInviteToken(
  db: D1Database,
  kv: KVNamespace,
  tripId: string,
  createdBy: string,
  role: 'editor' | 'viewer' = 'viewer',
) {
  const id = crypto.randomUUID();
  const token = generateToken(24);
  await db
    .prepare(
      `INSERT INTO invite_tokens (id, trip_id, created_by, token, role) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, tripId, createdBy, token, role)
    .run();
  await kv.put(`invite:${token}`, JSON.stringify({ tripId, role, id }));
  return { id, token };
}

describe('GET /invites/:token', () => {
  it('returns trip preview for a valid token', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId, { name: 'Paris Trip' });
    const { token } = await seedInviteToken(env.DB, env.SESSIONS, tripId, userId);

    const res = await fetchApp('GET', `/invites/${token}`);
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { tripName: string; role: string } }>();
    expect(body.data.tripName).toBe('Paris Trip');
    expect(body.data.role).toBe('viewer');
  });

  it('returns 404 for an unknown token', async () => {
    const res = await fetchApp('GET', '/invites/doesnotexist');
    expect(res.status).toBe(404);
  });
});

describe('POST /invites/:token/redeem — authenticated user', () => {
  it('adds the user to the trip as the invite role', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const joiningId = await seedUser(env.DB, { email: 'joiner@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);
    const { token } = await seedInviteToken(env.DB, env.SESSIONS, tripId, ownerId, 'editor');

    const sessionToken = await createSession(env.SESSIONS, joiningId, env.JWT_SECRET);
    const res = await fetchApp('POST', `/invites/${token}/redeem`, {
      sessionToken,
    });
    expect(res.status).toBe(200);

    const member = await env.DB
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .bind(tripId, joiningId)
      .first<{ role: string }>();
    expect(member?.role).toBe('editor');
  });

  it('does not add a duplicate member if already in trip', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);
    const { token } = await seedInviteToken(env.DB, env.SESSIONS, tripId, ownerId);

    // Owner is already a member — redeeming their own invite should not fail or duplicate
    const sessionToken = await createSession(env.SESSIONS, ownerId, env.JWT_SECRET);
    const res = await fetchApp('POST', `/invites/${token}/redeem`, { sessionToken });
    expect(res.status).toBe(200);

    const members = await env.DB
      .prepare('SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .bind(tripId, ownerId)
      .all();
    expect(members.results).toHaveLength(1);
  });
});

describe('POST /invites/:token/redeem — guest user', () => {
  it('creates a guest user and returns a guest token', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);
    const { token } = await seedInviteToken(env.DB, env.SESSIONS, tripId, ownerId, 'viewer');

    const res = await fetchApp('POST', `/invites/${token}/redeem`, {
      body: { guestName: 'Charlie Guest' },
    });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { isGuest: boolean; guestToken: string; tripId: string } }>();
    expect(body.data.isGuest).toBe(true);
    expect(body.data.guestToken).toBeTruthy();
    expect(body.data.tripId).toBe(tripId);

    // Guest token should be stored in KV
    const stored = await env.SESSIONS.get(`guest:${body.data.guestToken}`, 'json');
    expect(stored).not.toBeNull();

    // Guest user should exist in DB with is_guest = 1
    const guestUser = await env.DB
      .prepare('SELECT is_guest, name FROM users WHERE name = ?')
      .bind('Charlie Guest')
      .first<{ is_guest: number; name: string }>();
    expect(guestUser?.is_guest).toBe(1);
  });
});

describe('DELETE /trips/:tripId/invites/:tokenId', () => {
  it('revokes a token and removes it from KV', async () => {
    const ownerId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, ownerId);
    const { id: tokenId, token } = await seedInviteToken(env.DB, env.SESSIONS, tripId, ownerId);
    const sessionToken = await createSession(env.SESSIONS, ownerId, env.JWT_SECRET);

    const res = await fetchApp('DELETE', `/trips/${tripId}/invites/${tokenId}`, {
      sessionToken,
    });
    expect(res.status).toBe(200);

    // Should be revoked in DB
    const row = await env.DB
      .prepare('SELECT revoked FROM invite_tokens WHERE id = ?')
      .bind(tokenId)
      .first<{ revoked: number }>();
    expect(row?.revoked).toBe(1);

    // Should be gone from KV
    const cached = await env.SESSIONS.get(`invite:${token}`);
    expect(cached).toBeNull();
  });
});

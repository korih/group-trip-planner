import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchApp, runMigrations, seedUser, seedTrip, createSession } from './helpers';

beforeEach(async () => {
  await runMigrations(env.DB);
});

describe('GET /trips', () => {
  it('returns 401 without auth', async () => {
    const res = await fetchApp('GET', '/trips?userId=x');
    expect(res.status).toBe(401);
  });

  it('returns only the authenticated user\'s trips', async () => {
    const aliceId = await seedUser(env.DB, { email: 'alice@test.com' });
    const bobId = await seedUser(env.DB, { email: 'bob@test.com' });
    await seedTrip(env.DB, aliceId, { name: 'Alice Trip' });
    await seedTrip(env.DB, bobId, { name: 'Bob Trip' });

    const token = await createSession(env.SESSIONS, aliceId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/trips?userId=${aliceId}`, { sessionToken: token });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { name: string }[] }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Alice Trip');
  });
});

describe('POST /trips', () => {
  it('returns 401 without auth', async () => {
    const res = await fetchApp('POST', '/trips', {
      body: { name: 'Test', destination: 'Paris', start_date: '2025-08-01', end_date: '2025-08-07' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a trip and adds creator as owner', async () => {
    const userId = await seedUser(env.DB);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('POST', '/trips', {
      sessionToken: token,
      body: {
        name: 'Tokyo Adventure',
        destination: 'Tokyo, Japan',
        start_date: '2025-08-01',
        end_date: '2025-08-10',
      },
    });
    expect(res.status).toBe(201);

    const body = await res.json<{ data: { id: string; name: string } }>();
    expect(body.data.name).toBe('Tokyo Adventure');

    const member = await env.DB
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .bind(body.data.id, userId)
      .first<{ role: string }>();
    expect(member?.role).toBe('owner');
  });

  it('rejects missing required fields', async () => {
    const userId = await seedUser(env.DB);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('POST', '/trips', {
      sessionToken: token,
      body: { name: 'Incomplete' }, // missing destination, dates
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /trips/:id', () => {
  it('allows owner to update trip', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('PATCH', `/trips/${tripId}`, {
      sessionToken: token,
      body: { name: 'Updated Name' },
    });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { name: string } }>();
    expect(body.data.name).toBe('Updated Name');
  });

  it('forbids viewer from updating trip', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const viewerId = await seedUser(env.DB, { email: 'viewer@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);
    await env.DB
      .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'viewer')`)
      .bind(tripId, viewerId)
      .run();

    const token = await createSession(env.SESSIONS, viewerId, env.JWT_SECRET);
    const res = await fetchApp('PATCH', `/trips/${tripId}`, {
      sessionToken: token,
      body: { name: 'Hacked' },
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /trips/:id', () => {
  it('allows owner to delete their trip', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('DELETE', `/trips/${tripId}`, { sessionToken: token });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT id FROM trips WHERE id = ?').bind(tripId).first();
    expect(row).toBeNull();
  });

  it('forbids non-owner from deleting', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const editorId = await seedUser(env.DB, { email: 'editor@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);
    await env.DB
      .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor')`)
      .bind(tripId, editorId)
      .run();

    const token = await createSession(env.SESSIONS, editorId, env.JWT_SECRET);
    const res = await fetchApp('DELETE', `/trips/${tripId}`, { sessionToken: token });
    expect(res.status).toBe(403);
  });
});

describe('GET /trips/:id/members', () => {
  it('returns all members of the trip', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com', name: 'Owner' });
    const memberId = await seedUser(env.DB, { email: 'member@test.com', name: 'Member' });
    const tripId = await seedTrip(env.DB, ownerId);
    await env.DB
      .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor')`)
      .bind(tripId, memberId)
      .run();

    const token = await createSession(env.SESSIONS, ownerId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/trips/${tripId}/members`, { sessionToken: token });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { user_id: string }[] }>();
    expect(body.data).toHaveLength(2);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchApp, runMigrations, seedUser, seedTrip, createSession } from './helpers';

beforeEach(async () => {
  await runMigrations(env.DB);
});

async function seedItem(
  db: D1Database,
  tripId: string,
  userId: string,
  overrides: Partial<{ id: string; title: string; item_date: string }> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO itinerary_items (id, trip_id, title, item_date, created_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, tripId, overrides.title ?? 'Test Item', overrides.item_date ?? '2025-08-01', userId)
    .run();
  return id;
}

describe('GET /itineraries', () => {
  it('returns items for a trip member', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    await seedItem(env.DB, tripId, userId, { title: 'Visit Shibuya' });

    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/itineraries?tripId=${tripId}`, { sessionToken: token });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { title: string }[] }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Visit Shibuya');
  });

  it('returns 403 for non-members', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const strangerId = await seedUser(env.DB, { email: 'stranger@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);

    const token = await createSession(env.SESSIONS, strangerId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/itineraries?tripId=${tripId}`, { sessionToken: token });
    expect(res.status).toBe(403);
  });
});

describe('POST /itineraries', () => {
  it('creates an itinerary item', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('POST', '/itineraries', {
      sessionToken: token,
      body: {
        trip_id: tripId,
        title: 'Tsukiji Market',
        item_date: '2025-08-02',
        category: 'food',
      },
    });
    expect(res.status).toBe(201);

    const body = await res.json<{ data: { title: string; category: string } }>();
    expect(body.data.title).toBe('Tsukiji Market');
    expect(body.data.category).toBe('food');
  });

  it('rejects creation by a viewer', async () => {
    const ownerId = await seedUser(env.DB, { email: 'owner@test.com' });
    const viewerId = await seedUser(env.DB, { email: 'viewer@test.com' });
    const tripId = await seedTrip(env.DB, ownerId);
    await env.DB
      .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'viewer')`)
      .bind(tripId, viewerId)
      .run();

    const token = await createSession(env.SESSIONS, viewerId, env.JWT_SECRET);
    const res = await fetchApp('POST', '/itineraries', {
      sessionToken: token,
      body: { trip_id: tripId, title: 'Sneaky Item', item_date: '2025-08-02' },
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /itineraries/:id', () => {
  it('updates item fields', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const itemId = await seedItem(env.DB, tripId, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('PATCH', `/itineraries/${itemId}`, {
      sessionToken: token,
      body: { title: 'Updated Title', category: 'transport' },
    });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { title: string; category: string } }>();
    expect(body.data.title).toBe('Updated Title');
    expect(body.data.category).toBe('transport');
  });

  it('updates lat/lng when provided', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const itemId = await seedItem(env.DB, tripId, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('PATCH', `/itineraries/${itemId}`, {
      sessionToken: token,
      body: { lat: 35.6762, lng: 139.6503 },
    });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { lat: number; lng: number } }>();
    expect(body.data.lat).toBeCloseTo(35.6762);
    expect(body.data.lng).toBeCloseTo(139.6503);
  });
});

describe('DELETE /itineraries/:id', () => {
  it('deletes the item', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const itemId = await seedItem(env.DB, tripId, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('DELETE', `/itineraries/${itemId}`, { sessionToken: token });
    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare('SELECT id FROM itinerary_items WHERE id = ?')
      .bind(itemId)
      .first();
    expect(row).toBeNull();
  });
});

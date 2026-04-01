import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchApp, runMigrations, seedUser, seedTrip, createSession } from './helpers';

beforeEach(async () => {
  await runMigrations(env.DB);
});

async function seedList(db: D1Database, tripId: string, userId: string, name = 'My List') {
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO packing_lists (id, trip_id, name, created_by) VALUES (?, ?, ?, ?)`)
    .bind(id, tripId, name, userId)
    .run();
  return id;
}

async function seedPackingItem(db: D1Database, listId: string, label = 'Passport') {
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO packing_items (id, list_id, label, category) VALUES (?, ?, ?, 'documents')`)
    .bind(id, listId, label)
    .run();
  return id;
}

describe('GET /trips/:tripId/packing', () => {
  it('returns lists with nested items', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const listId = await seedList(env.DB, tripId, userId, 'Beach Bag');
    await seedPackingItem(env.DB, listId, 'Sunscreen');
    await seedPackingItem(env.DB, listId, 'Towel');

    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/trips/${tripId}/packing`, { sessionToken: token });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { name: string; items: { label: string }[] }[] }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Beach Bag');
    expect(body.data[0].items).toHaveLength(2);
  });
});

describe('POST /trips/:tripId/packing', () => {
  it('creates an empty list', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('POST', `/trips/${tripId}/packing`, {
      sessionToken: token,
      body: { name: 'Carry-on' },
    });
    expect(res.status).toBe(201);

    const body = await res.json<{ data: { name: string } }>();
    expect(body.data.name).toBe('Carry-on');
  });

  it('creates a list from a template with pre-filled items', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('POST', `/trips/${tripId}/packing`, {
      sessionToken: token,
      body: { template: 'beach' },
    });
    expect(res.status).toBe(201);

    const listId = (await res.json<{ data: { id: string } }>()).data.id;
    const items = await env.DB
      .prepare('SELECT * FROM packing_items WHERE list_id = ?')
      .bind(listId)
      .all();
    expect(items.results.length).toBeGreaterThan(0);
  });
});

describe('PATCH /trips/:tripId/packing/:listId/items/:itemId/check', () => {
  it('marks an item as checked', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const listId = await seedList(env.DB, tripId, userId);
    const itemId = await seedPackingItem(env.DB, listId, 'Passport');
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp(
      'PATCH',
      `/trips/${tripId}/packing/${listId}/items/${itemId}/check`,
      { sessionToken: token, body: { is_checked: true } },
    );
    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare('SELECT is_checked, checked_by FROM packing_items WHERE id = ?')
      .bind(itemId)
      .first<{ is_checked: number; checked_by: string }>();
    expect(row?.is_checked).toBe(1);
    expect(row?.checked_by).toBe(userId);
  });

  it('unchecks a previously checked item', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const listId = await seedList(env.DB, tripId, userId);
    const itemId = await seedPackingItem(env.DB, listId);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    // Check it first
    await fetchApp('PATCH', `/trips/${tripId}/packing/${listId}/items/${itemId}/check`, {
      sessionToken: token,
      body: { is_checked: true },
    });

    // Uncheck it
    const res = await fetchApp(
      'PATCH',
      `/trips/${tripId}/packing/${listId}/items/${itemId}/check`,
      { sessionToken: token, body: { is_checked: false } },
    );
    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare('SELECT is_checked FROM packing_items WHERE id = ?')
      .bind(itemId)
      .first<{ is_checked: number }>();
    expect(row?.is_checked).toBe(0);
  });
});

describe('DELETE /trips/:tripId/packing/:listId', () => {
  it('deletes the list and its items', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const listId = await seedList(env.DB, tripId, userId);
    await seedPackingItem(env.DB, listId, 'Sunscreen');
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('DELETE', `/trips/${tripId}/packing/${listId}`, {
      sessionToken: token,
    });
    expect(res.status).toBe(200);

    const list = await env.DB
      .prepare('SELECT id FROM packing_lists WHERE id = ?')
      .bind(listId)
      .first();
    expect(list).toBeNull();

    const items = await env.DB
      .prepare('SELECT * FROM packing_items WHERE list_id = ?')
      .bind(listId)
      .all();
    expect(items.results).toHaveLength(0);
  });
});

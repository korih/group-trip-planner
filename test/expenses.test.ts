import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchApp, runMigrations, seedUser, seedTrip, createSession } from './helpers';

beforeEach(async () => {
  await runMigrations(env.DB);
});

async function seedExpense(
  db: D1Database,
  tripId: string,
  paidBy: string,
  members: string[],
  amount = 90,
) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO expenses (id, trip_id, title, amount, paid_by, split_type)
       VALUES (?, ?, 'Dinner', ?, ?, 'equal')`,
    )
    .bind(id, tripId, amount, paidBy)
    .run();

  const splitAmount = amount / members.length;
  await db.batch(
    members.map((uid) =>
      db
        .prepare(`INSERT INTO expense_splits (expense_id, user_id, amount) VALUES (?, ?, ?)`)
        .bind(id, uid, splitAmount),
    ),
  );
  return id;
}

describe('GET /expenses', () => {
  it('returns expenses for a trip', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    await seedExpense(env.DB, tripId, userId, [userId]);

    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/expenses?tripId=${tripId}`, { sessionToken: token });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { title: string }[] }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Dinner');
  });
});

describe('POST /expenses', () => {
  it('creates an expense with equal splits', async () => {
    const aliceId = await seedUser(env.DB, { email: 'alice@test.com' });
    const bobId = await seedUser(env.DB, { email: 'bob@test.com' });
    const tripId = await seedTrip(env.DB, aliceId);
    await env.DB
      .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor')`)
      .bind(tripId, bobId)
      .run();

    const token = await createSession(env.SESSIONS, aliceId, env.JWT_SECRET);
    const res = await fetchApp('POST', '/expenses', {
      sessionToken: token,
      body: {
        trip_id: tripId,
        title: 'Hotel',
        amount: 200,
        currency: 'USD',
        category: 'accommodation',
        paid_by: aliceId,
        split_type: 'equal',
        splits: [
          { user_id: aliceId, amount: 100 },
          { user_id: bobId, amount: 100 },
        ],
      },
    });
    expect(res.status).toBe(201);

    const splits = await env.DB
      .prepare('SELECT * FROM expense_splits WHERE expense_id = ?')
      .bind((await res.json<{ data: { id: string } }>()).data.id)
      .all();
    expect(splits.results).toHaveLength(2);
    expect(splits.results.every((s: { amount: unknown }) => s.amount === 100)).toBe(true);
  });
});

describe('GET /expenses/summary', () => {
  it('returns correct per-person balances', async () => {
    const aliceId = await seedUser(env.DB, { email: 'alice@test.com', name: 'Alice' });
    const bobId = await seedUser(env.DB, { email: 'bob@test.com', name: 'Bob' });
    const tripId = await seedTrip(env.DB, aliceId);
    await env.DB
      .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'editor')`)
      .bind(tripId, bobId)
      .run();

    // Alice pays $90, split equally → Alice is owed $45, Bob owes $45
    await seedExpense(env.DB, tripId, aliceId, [aliceId, bobId], 90);

    const token = await createSession(env.SESSIONS, aliceId, env.JWT_SECRET);
    const res = await fetchApp('GET', `/expenses/summary?tripId=${tripId}`, {
      sessionToken: token,
    });
    expect(res.status).toBe(200);

    const body = await res.json<{ data: { user_id: string; balance: number }[] }>();
    const alice = body.data.find((d) => d.user_id === aliceId);
    const bob = body.data.find((d) => d.user_id === bobId);
    expect(alice?.balance).toBeCloseTo(45);  // paid 90, owes 45 → net +45
    expect(bob?.balance).toBeCloseTo(-45);   // paid 0, owes 45 → net -45
  });
});

describe('DELETE /expenses/:id', () => {
  it('deletes expense and its splits', async () => {
    const userId = await seedUser(env.DB);
    const tripId = await seedTrip(env.DB, userId);
    const expenseId = await seedExpense(env.DB, tripId, userId, [userId]);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('DELETE', `/expenses/${expenseId}`, { sessionToken: token });
    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare('SELECT id FROM expenses WHERE id = ?')
      .bind(expenseId)
      .first();
    expect(row).toBeNull();

    const splits = await env.DB
      .prepare('SELECT * FROM expense_splits WHERE expense_id = ?')
      .bind(expenseId)
      .all();
    expect(splits.results).toHaveLength(0);
  });
});

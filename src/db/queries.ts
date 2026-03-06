import type { D1Database } from '@cloudflare/workers-types';
import type {
  User,
  CreateUserInput,
  Trip,
  CreateTripInput,
  UpdateTripInput,
  TripMember,
  MemberRole,
  ItineraryItem,
  CreateItineraryItemInput,
  UpdateItineraryItemInput,
  Expense,
  CreateExpenseInput,
  ExpenseSplit,
} from '../types';

// ── Users ────────────────────────────────────────────────────────────────────

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(id)
    .first<User>();
  return result ?? null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const result = await db
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first<User>();
  return result ?? null;
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<User> {
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO users (id, name, email) VALUES (?, ?, ?)')
    .bind(id, input.name, input.email)
    .run();
  const user = await getUserById(db, id);
  if (!user) throw new Error('Failed to create user');
  return user;
}

// ── Trips ────────────────────────────────────────────────────────────────────

export async function getTripById(db: D1Database, id: string): Promise<Trip | null> {
  const result = await db
    .prepare('SELECT * FROM trips WHERE id = ?')
    .bind(id)
    .first<Trip>();
  return result ?? null;
}

export async function getTripsByUser(db: D1Database, userId: string): Promise<Trip[]> {
  const result = await db
    .prepare(
      `SELECT t.* FROM trips t
       INNER JOIN trip_members tm ON t.id = tm.trip_id
       WHERE tm.user_id = ?
       ORDER BY t.start_date ASC`
    )
    .bind(userId)
    .all<Trip>();
  return result.results;
}

export async function createTrip(db: D1Database, input: CreateTripInput): Promise<Trip> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO trips (id, name, description, destination, start_date, end_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.name,
      input.description ?? null,
      input.destination,
      input.start_date,
      input.end_date,
      input.created_by
    )
    .run();

  // Automatically add creator as owner
  await db
    .prepare('INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)')
    .bind(id, input.created_by, 'owner')
    .run();

  const trip = await getTripById(db, id);
  if (!trip) throw new Error('Failed to create trip');
  return trip;
}

export async function updateTrip(
  db: D1Database,
  id: string,
  input: UpdateTripInput
): Promise<Trip | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
  if (input.destination !== undefined) { fields.push('destination = ?'); values.push(input.destination); }
  if (input.start_date !== undefined) { fields.push('start_date = ?'); values.push(input.start_date); }
  if (input.end_date !== undefined) { fields.push('end_date = ?'); values.push(input.end_date); }
  if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }

  if (fields.length === 0) return getTripById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db
    .prepare(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getTripById(db, id);
}

export async function deleteTrip(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM trips WHERE id = ?').bind(id).run();
}

// ── Trip Members ─────────────────────────────────────────────────────────────

export async function getTripMembers(db: D1Database, tripId: string): Promise<(TripMember & Pick<User, 'name' | 'email'>)[]> {
  const result = await db
    .prepare(
      `SELECT tm.*, u.name, u.email FROM trip_members tm
       INNER JOIN users u ON tm.user_id = u.id
       WHERE tm.trip_id = ?`
    )
    .bind(tripId)
    .all<TripMember & Pick<User, 'name' | 'email'>>();
  return result.results;
}

export async function addTripMember(
  db: D1Database,
  tripId: string,
  userId: string,
  role: MemberRole = 'member'
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)')
    .bind(tripId, userId, role)
    .run();
}

export async function removeTripMember(
  db: D1Database,
  tripId: string,
  userId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, userId)
    .run();
}

// ── Itinerary Items ──────────────────────────────────────────────────────────

export async function getItineraryByTrip(
  db: D1Database,
  tripId: string
): Promise<ItineraryItem[]> {
  const result = await db
    .prepare(
      'SELECT * FROM itinerary_items WHERE trip_id = ? ORDER BY item_date ASC, start_time ASC'
    )
    .bind(tripId)
    .all<ItineraryItem>();
  return result.results;
}

export async function getItineraryItemById(
  db: D1Database,
  id: string
): Promise<ItineraryItem | null> {
  const result = await db
    .prepare('SELECT * FROM itinerary_items WHERE id = ?')
    .bind(id)
    .first<ItineraryItem>();
  return result ?? null;
}

export async function createItineraryItem(
  db: D1Database,
  input: CreateItineraryItemInput
): Promise<ItineraryItem> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO itinerary_items
         (id, trip_id, title, description, location, item_date, start_time, end_time, category, estimated_cost, currency, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.trip_id,
      input.title,
      input.description ?? null,
      input.location ?? null,
      input.item_date,
      input.start_time ?? null,
      input.end_time ?? null,
      input.category,
      input.estimated_cost ?? null,
      input.currency ?? 'USD',
      input.created_by
    )
    .run();

  const item = await getItineraryItemById(db, id);
  if (!item) throw new Error('Failed to create itinerary item');
  return item;
}

export async function updateItineraryItem(
  db: D1Database,
  id: string,
  input: UpdateItineraryItemInput
): Promise<ItineraryItem | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
  if (input.location !== undefined) { fields.push('location = ?'); values.push(input.location); }
  if (input.item_date !== undefined) { fields.push('item_date = ?'); values.push(input.item_date); }
  if (input.start_time !== undefined) { fields.push('start_time = ?'); values.push(input.start_time); }
  if (input.end_time !== undefined) { fields.push('end_time = ?'); values.push(input.end_time); }
  if (input.category !== undefined) { fields.push('category = ?'); values.push(input.category); }
  if (input.estimated_cost !== undefined) { fields.push('estimated_cost = ?'); values.push(input.estimated_cost); }
  if (input.currency !== undefined) { fields.push('currency = ?'); values.push(input.currency); }

  if (fields.length === 0) return getItineraryItemById(db, id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  await db
    .prepare(`UPDATE itinerary_items SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getItineraryItemById(db, id);
}

export async function deleteItineraryItem(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM itinerary_items WHERE id = ?').bind(id).run();
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpensesByTrip(db: D1Database, tripId: string): Promise<Expense[]> {
  const result = await db
    .prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC')
    .bind(tripId)
    .all<Expense>();
  return result.results;
}

export async function getExpenseById(db: D1Database, id: string): Promise<Expense | null> {
  const result = await db
    .prepare('SELECT * FROM expenses WHERE id = ?')
    .bind(id)
    .first<Expense>();
  return result ?? null;
}

export async function createExpense(
  db: D1Database,
  input: CreateExpenseInput,
  memberIds: string[]
): Promise<Expense> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO expenses (id, trip_id, itinerary_item_id, title, amount, currency, paid_by, split_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.trip_id,
      input.itinerary_item_id ?? null,
      input.title,
      input.amount,
      input.currency ?? 'USD',
      input.paid_by,
      input.split_type ?? 'equal'
    )
    .run();

  // Create expense splits
  const splitType = input.split_type ?? 'equal';
  if (splitType === 'equal') {
    const perPerson = input.amount / memberIds.length;
    const stmt = db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount) VALUES (?, ?, ?)'
    );
    await db.batch(memberIds.map((uid) => stmt.bind(id, uid, perPerson)));
  } else if (input.splits) {
    const stmt = db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount) VALUES (?, ?, ?)'
    );
    await db.batch(input.splits.map((s) => stmt.bind(id, s.user_id, s.amount)));
  }

  const expense = await getExpenseById(db, id);
  if (!expense) throw new Error('Failed to create expense');
  return expense;
}

export async function getExpenseSplits(
  db: D1Database,
  expenseId: string
): Promise<(ExpenseSplit & Pick<User, 'name' | 'email'>)[]> {
  const result = await db
    .prepare(
      `SELECT es.*, u.name, u.email FROM expense_splits es
       INNER JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = ?`
    )
    .bind(expenseId)
    .all<ExpenseSplit & Pick<User, 'name' | 'email'>>();
  return result.results;
}

export async function getTripExpenseSummary(
  db: D1Database,
  tripId: string
): Promise<{ user_id: string; name: string; total_paid: number; total_owed: number; balance: number }[]> {
  const result = await db
    .prepare(
      `SELECT
         u.id AS user_id,
         u.name,
         COALESCE(SUM(CASE WHEN e.paid_by = u.id THEN e.amount ELSE 0 END), 0) AS total_paid,
         COALESCE(SUM(es.amount), 0) AS total_owed,
         COALESCE(SUM(CASE WHEN e.paid_by = u.id THEN e.amount ELSE 0 END), 0)
           - COALESCE(SUM(es.amount), 0) AS balance
       FROM users u
       INNER JOIN trip_members tm ON u.id = tm.user_id AND tm.trip_id = ?
       LEFT JOIN expense_splits es ON u.id = es.user_id
       LEFT JOIN expenses e ON es.expense_id = e.id AND e.trip_id = ?
       GROUP BY u.id, u.name`
    )
    .bind(tripId, tripId)
    .all<{ user_id: string; name: string; total_paid: number; total_owed: number; balance: number }>();
  return result.results;
}

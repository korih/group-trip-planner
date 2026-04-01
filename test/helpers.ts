import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index';

export type TestEnv = typeof env;

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function runMigrations(db: D1Database) {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      google_id TEXT UNIQUE,
      avatar_url TEXT,
      is_guest INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      description TEXT,
      destination TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'planning',
      cover_photo_url TEXT,
      destination_lat REAL,
      destination_lng REAL,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'viewer',
      invite_token_id TEXT,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (trip_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS itinerary_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      lat REAL,
      lng REAL,
      photo_url TEXT,
      item_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      category TEXT NOT NULL DEFAULT 'activity',
      estimated_cost REAL,
      currency TEXT DEFAULT 'USD',
      order_index INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      itinerary_item_id TEXT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      category TEXT NOT NULL DEFAULT 'other',
      paid_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      split_type TEXT NOT NULL DEFAULT 'equal',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS expense_splits (
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (expense_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'viewer',
      max_uses INTEGER,
      use_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'other',
      name TEXT NOT NULL,
      confirmation_number TEXT,
      check_in TEXT,
      check_out TEXT,
      booking_url TEXT,
      notes TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS packing_lists (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Packing List',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS packing_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      list_id TEXT NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      assigned_to TEXT,
      is_checked INTEGER NOT NULL DEFAULT 0,
      checked_by TEXT,
      checked_at TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      uploader_id TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      r2_key TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      confirmed INTEGER NOT NULL DEFAULT 0,
      linked_to_type TEXT,
      linked_to_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS day_notes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      note_date TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(trip_id, note_date)
    );
    CREATE TABLE IF NOT EXISTS activity_feed (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      actor_id TEXT,
      actor_display TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_label TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `;
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

// ─── Request helpers ──────────────────────────────────────────────────────────

export function makeRequest(
  method: string,
  path: string,
  options: { body?: unknown; sessionToken?: string } = {},
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.sessionToken) {
    headers['Cookie'] = `session=${options.sessionToken}`;
  }
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

export async function fetchApp(
  method: string,
  path: string,
  options: { body?: unknown; sessionToken?: string } = {},
): Promise<Response> {
  const req = makeRequest(method, path, options);
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function seedUser(
  db: D1Database,
  overrides: Partial<{ id: string; name: string; email: string; is_guest: number }> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, name, email, is_guest) VALUES (?, ?, ?, ?)`,
    )
    .bind(
      id,
      overrides.name ?? 'Test User',
      overrides.email ?? `user-${id}@test.com`,
      overrides.is_guest ?? 0,
    )
    .run();
  return id;
}

export async function seedTrip(
  db: D1Database,
  userId: string,
  overrides: Partial<{ id: string; name: string; destination: string }> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO trips (id, name, destination, start_date, end_date, created_by)
       VALUES (?, ?, ?, '2025-08-01', '2025-08-07', ?)`,
    )
    .bind(id, overrides.name ?? 'Test Trip', overrides.destination ?? 'Tokyo, Japan', userId)
    .run();
  await db
    .prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`)
    .bind(id, userId)
    .run();
  return id;
}

export async function createSession(
  kv: KVNamespace,
  userId: string,
  jwtSecret: string,
): Promise<string> {
  const { signToken } = await import('../src/lib/auth');
  const jti = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await signToken({ jti, sub: userId, exp }, jwtSecret);
  await kv.put(
    `session:${jti}`,
    JSON.stringify({ userId, email: 'test@test.com', name: 'Test User', avatarUrl: null }),
    { expirationTtl: 3600 },
  );
  return token;
}

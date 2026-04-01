-- Migration: 0002_auth_and_features
-- Adds auth fields, new feature tables, and expands the role system

-- ============================================================
-- Alter existing tables
-- ============================================================

-- Users: add Google auth + guest flag
-- Note: SQLite does not support ADD COLUMN with UNIQUE; create index separately
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Trips: map coordinates + display settings
ALTER TABLE trips ADD COLUMN cover_photo_url TEXT;
ALTER TABLE trips ADD COLUMN destination_lat REAL;
ALTER TABLE trips ADD COLUMN destination_lng REAL;
ALTER TABLE trips ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'USD';

-- Itinerary items: map coordinates + ordering
ALTER TABLE itinerary_items ADD COLUMN lat REAL;
ALTER TABLE itinerary_items ADD COLUMN lng REAL;
ALTER TABLE itinerary_items ADD COLUMN photo_url TEXT;
ALTER TABLE itinerary_items ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;

-- Expenses: category + updated_at
ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('food', 'transport', 'accommodation', 'activities', 'shopping', 'other'));
ALTER TABLE expenses ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- ============================================================
-- Recreate trip_members to change CHECK constraint
-- (SQLite does not support ALTER TABLE ... MODIFY COLUMN)
-- Old roles: owner | admin | member
-- New roles: owner | editor | viewer
-- ============================================================

-- Add invite_token_id column first
ALTER TABLE trip_members ADD COLUMN invite_token_id TEXT;

-- Create replacement table with updated role constraint
CREATE TABLE IF NOT EXISTS trip_members_v2 (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  invite_token_id TEXT,
  PRIMARY KEY (trip_id, user_id)
);

-- Migrate existing data: admin -> editor, member -> editor
INSERT INTO trip_members_v2 (trip_id, user_id, role, joined_at, invite_token_id)
SELECT
  trip_id,
  user_id,
  CASE role
    WHEN 'owner' THEN 'owner'
    WHEN 'admin' THEN 'editor'
    ELSE 'editor'
  END,
  joined_at,
  invite_token_id
FROM trip_members;

DROP TABLE trip_members;
ALTER TABLE trip_members_v2 RENAME TO trip_members;

-- Restore indexes
CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON trip_members(user_id);

-- ============================================================
-- New tables
-- ============================================================

-- Invite tokens: shareable links with role + expiry
CREATE TABLE IF NOT EXISTS invite_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  max_uses INTEGER,                    -- NULL = unlimited
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,                     -- NULL = never expires
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Day notes: one rich-text doc per day per trip
CREATE TABLE IF NOT EXISTS day_notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  note_date TEXT NOT NULL,             -- 'YYYY-MM-DD'
  content TEXT NOT NULL DEFAULT '',    -- Tiptap JSON string
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(trip_id, note_date)
);

-- Reservations: flights, hotels, restaurants, etc.
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'other'
    CHECK (type IN ('flight', 'hotel', 'restaurant', 'activity', 'transport', 'other')),
  name TEXT NOT NULL,
  confirmation_number TEXT,
  check_in TEXT,
  check_out TEXT,
  booking_url TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Packing lists: named lists per trip
CREATE TABLE IF NOT EXISTS packing_lists (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Packing List',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Packing items: individual items with assignment + checked state
CREATE TABLE IF NOT EXISTS packing_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  list_id TEXT NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('clothing', 'toiletries', 'documents', 'electronics', 'medical', 'general')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  checked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  checked_at TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documents: R2 file upload metadata
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,         -- 'trips/<tripId>/docs/<docId>/<filename>'
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  confirmed INTEGER NOT NULL DEFAULT 0, -- 1 after client confirms upload complete
  linked_to_type TEXT CHECK (linked_to_type IN ('reservation', 'itinerary_item')),
  linked_to_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activity feed: audit log of all trip changes
CREATE TABLE IF NOT EXISTS activity_feed (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_display TEXT NOT NULL,         -- name snapshot at time of action
  action TEXT NOT NULL,                -- e.g. 'created_item', 'updated_expense'
  entity_type TEXT NOT NULL,           -- 'itinerary_item', 'expense', 'reservation', etc.
  entity_id TEXT,
  entity_label TEXT,                   -- title/name snapshot
  metadata TEXT,                       -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes for new tables
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_trip_id ON invite_tokens(trip_id);
CREATE INDEX IF NOT EXISTS idx_day_notes_trip_date ON day_notes(trip_id, note_date);
CREATE INDEX IF NOT EXISTS idx_reservations_trip_id ON reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_packing_lists_trip_id ON packing_lists(trip_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_list_id ON packing_items(list_id);
CREATE INDEX IF NOT EXISTS idx_documents_trip_id ON documents(trip_id);
CREATE INDEX IF NOT EXISTS idx_documents_linked ON documents(linked_to_type, linked_to_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_trip_id ON activity_feed(trip_id, created_at);

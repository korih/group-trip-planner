// ============================================================
// Cloudflare environment bindings
// ============================================================

export interface Env {
  // Data
  DB: D1Database;
  SESSIONS: KVNamespace;
  DOCUMENTS: R2Bucket;
  TRIP_ROOMS: DurableObjectNamespace;
  // AI
  AI: Ai;
  // Config
  ENVIRONMENT: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
}

// Hono context variables (populated by auth middleware)
export interface ContextVariables {
  userId: string;
  user: User;
  isGuest: boolean;
  sessionId?: string;
}

// ============================================================
// Auth
// ============================================================

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface GuestTokenData {
  tripId: string;
  role: 'viewer';
  displayName: string;
  inviteTokenId: string;
  userId: string;
}

// ============================================================
// User
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string;
  google_id: string | null;
  avatar_url: string | null;
  is_guest: number; // 0 | 1 (SQLite boolean)
  created_at: string;
  updated_at: string;
}

export type CreateUserInput = Pick<User, 'name' | 'email'> & {
  google_id?: string;
  avatar_url?: string;
  is_guest?: number;
};

// ============================================================
// Trip
// ============================================================

export type TripStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  name: string;
  description: string | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  start_date: string;
  end_date: string;
  created_by: string;
  status: TripStatus;
  cover_photo_url: string | null;
  base_currency: string;
  created_at: string;
  updated_at: string;
}

export type CreateTripInput = Pick<
  Trip,
  'name' | 'destination' | 'start_date' | 'end_date'
> & {
  description?: string;
  destination_lat?: number;
  destination_lng?: number;
  base_currency?: string;
  // created_by is supplied separately from auth context, not from request body
};

export type UpdateTripInput = Partial<
  Pick<
    Trip,
    | 'name'
    | 'description'
    | 'destination'
    | 'destination_lat'
    | 'destination_lng'
    | 'start_date'
    | 'end_date'
    | 'status'
    | 'cover_photo_url'
    | 'base_currency'
  >
>;

// ============================================================
// Trip member
// ============================================================

export type MemberRole = 'owner' | 'editor' | 'viewer';

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  invite_token_id: string | null;
}

// ============================================================
// Invite tokens
// ============================================================

export interface InviteToken {
  id: string;
  trip_id: string;
  created_by: string;
  token: string;
  role: 'editor' | 'viewer';
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  revoked: number;
  created_at: string;
}

// ============================================================
// Itinerary
// ============================================================

export type ItineraryCategory = 'activity' | 'accommodation' | 'transport' | 'food' | 'other';

export interface ItineraryItem {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  item_date: string;
  start_time: string | null;
  end_time: string | null;
  category: ItineraryCategory;
  estimated_cost: number | null;
  currency: string;
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CreateItineraryItemInput = Pick<
  ItineraryItem,
  'trip_id' | 'title' | 'item_date' | 'category'
> & {
  description?: string;
  location?: string;
  lat?: number;
  lng?: number;
  photo_url?: string;
  start_time?: string;
  end_time?: string;
  estimated_cost?: number;
  currency?: string;
  order_index?: number;
  created_by?: string; // supplied from auth context
};

export type UpdateItineraryItemInput = Partial<
  Pick<
    ItineraryItem,
    | 'title'
    | 'description'
    | 'location'
    | 'lat'
    | 'lng'
    | 'photo_url'
    | 'item_date'
    | 'start_time'
    | 'end_time'
    | 'category'
    | 'estimated_cost'
    | 'currency'
    | 'order_index'
  >
>;

export interface ReorderItem {
  id: string;
  order_index: number;
  item_date?: string;
}

// ============================================================
// Day notes
// ============================================================

export interface DayNote {
  id: string;
  trip_id: string;
  note_date: string; // 'YYYY-MM-DD'
  content: string;   // Tiptap JSON
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Expense
// ============================================================

export type SplitType = 'equal' | 'custom' | 'percentage';
export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'activities' | 'shopping' | 'other';

export interface Expense {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paid_by: string;
  split_type: SplitType;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSplit {
  expense_id: string;
  user_id: string;
  amount: number;
  settled: boolean;
}

export type CreateExpenseInput = Pick<
  Expense,
  'trip_id' | 'title' | 'amount' | 'paid_by'
> & {
  currency?: string;
  category?: ExpenseCategory;
  itinerary_item_id?: string;
  split_type?: SplitType;
  splits?: Array<{ user_id: string; amount: number }>;
};

export type UpdateExpenseInput = Partial<
  Pick<Expense, 'title' | 'amount' | 'currency' | 'category' | 'paid_by' | 'split_type'>
>;

// ============================================================
// Reservations
// ============================================================

export type ReservationType = 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'other';

export interface Reservation {
  id: string;
  trip_id: string;
  type: ReservationType;
  name: string;
  confirmation_number: string | null;
  check_in: string | null;
  check_out: string | null;
  booking_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CreateReservationInput = Pick<Reservation, 'trip_id' | 'type' | 'name'> & {
  confirmation_number?: string;
  check_in?: string;
  check_out?: string;
  booking_url?: string;
  notes?: string;
};

export type UpdateReservationInput = Partial<
  Pick<Reservation, 'type' | 'name' | 'confirmation_number' | 'check_in' | 'check_out' | 'booking_url' | 'notes'>
>;

// ============================================================
// Packing
// ============================================================

export type PackingCategory = 'clothing' | 'toiletries' | 'documents' | 'electronics' | 'medical' | 'general';
export type PackingTemplate = 'beach' | 'hiking' | 'city' | 'winter';

export interface PackingList {
  id: string;
  trip_id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface PackingItem {
  id: string;
  list_id: string;
  label: string;
  category: PackingCategory;
  assigned_to: string | null;
  is_checked: number; // 0 | 1
  checked_by: string | null;
  checked_at: string | null;
  order_index: number;
  created_at: string;
}

// ============================================================
// Documents
// ============================================================

export interface Document {
  id: string;
  trip_id: string;
  uploader_id: string;
  filename: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  confirmed: number; // 0 | 1
  linked_to_type: 'reservation' | 'itinerary_item' | null;
  linked_to_id: string | null;
  created_at: string;
}

// ============================================================
// Activity feed
// ============================================================

export type ActivityEntityType =
  | 'itinerary_item'
  | 'expense'
  | 'reservation'
  | 'packing_item'
  | 'packing_list'
  | 'document'
  | 'day_note'
  | 'trip'
  | 'member'
  | 'trip_member';

export interface ActivityFeedEntry {
  id: string;
  trip_id: string;
  actor_id: string | null;
  actor_display: string;
  action: string;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  entity_label: string | null;
  metadata: string | null; // JSON
  created_at: string;
}

export type LogActivityInput = Omit<ActivityFeedEntry, 'id' | 'created_at' | 'entity_id' | 'entity_label' | 'metadata'> & {
  entity_id?: string | null;
  entity_label?: string | null;
  metadata?: string | null;
};

// ============================================================
// WebSocket messages
// ============================================================

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: MemberRole;
}

export type ServerMessage =
  | { type: 'pong' }
  | { type: 'presence'; users: PresenceUser[] }
  | { type: 'entity_created'; entityType: string; data: unknown }
  | { type: 'entity_updated'; entityType: string; entityId: string; data: unknown }
  | { type: 'entity_deleted'; entityType: string; entityId: string }
  | { type: 'activity'; entry: ActivityFeedEntry }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'ping' };

// ============================================================
// AI
// ============================================================

export interface AISuggestionRequest {
  destination: string;
  start_date: string;
  end_date: string;
  group_size: number;
  interests?: string[];
  budget?: string;
}

export interface AISuggestionResponse {
  suggestions: string;
  model: string;
}

export interface AIPackSuggestionRequest {
  destination: string;
  duration_days: number;
  trip_type: 'beach' | 'hiking' | 'city' | 'winter' | 'mixed';
}

// ============================================================
// API response helpers
// ============================================================

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

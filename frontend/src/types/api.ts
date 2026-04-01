// Mirror of backend types — kept in sync manually

export type TripStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled';
export type MemberRole = 'owner' | 'editor' | 'viewer';
export type ItineraryCategory = 'activity' | 'accommodation' | 'transport' | 'food' | 'other';
export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'activities' | 'shopping' | 'other';
export type ReservationType = 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport' | 'other';
export type PackingCategory = 'clothing' | 'toiletries' | 'documents' | 'electronics' | 'medical' | 'general';

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

export interface TripMember {
  trip_id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: MemberRole;
  joined_at: string;
}

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

export interface Expense {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paid_by: string;
  split_type: 'equal' | 'custom' | 'percentage';
  created_at: string;
  updated_at: string;
}

export interface ExpenseSplit {
  expense_id: string;
  user_id: string;
  name: string;
  amount: number;
  settled: boolean;
}

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

export interface PackingList {
  id: string;
  trip_id: string;
  name: string;
  items: PackingItem[];
}

export interface PackingItem {
  id: string;
  list_id: string;
  label: string;
  category: PackingCategory;
  assigned_to: string | null;
  assigned_name: string | null;
  is_checked: boolean;
  order_index: number;
}

export interface Document {
  id: string;
  trip_id: string;
  uploader_id: string;
  uploader_name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  linked_to_type: 'reservation' | 'itinerary_item' | null;
  linked_to_id: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  trip_id: string;
  actor_display: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  created_at: string;
}

export interface InviteToken {
  id: string;
  token: string;
  role: 'editor' | 'viewer';
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface WeatherDay {
  date: string;
  temp_max: number;
  temp_min: number;
  precipitation: number;
  weathercode: number;
  windspeed_max: number;
}

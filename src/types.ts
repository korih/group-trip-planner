// Cloudflare environment bindings
export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  AI: Ai;
  ENVIRONMENT: string;
}

// User
export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export type CreateUserInput = Pick<User, 'name' | 'email'>;

// Trip
export type TripStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  name: string;
  description: string | null;
  destination: string;
  start_date: string;
  end_date: string;
  created_by: string;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export type CreateTripInput = Pick<
  Trip,
  'name' | 'destination' | 'start_date' | 'end_date' | 'created_by'
> & {
  description?: string;
};

export type UpdateTripInput = Partial<
  Pick<Trip, 'name' | 'description' | 'destination' | 'start_date' | 'end_date' | 'status'>
>;

// Trip member
export type MemberRole = 'owner' | 'admin' | 'member';

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

// Itinerary
export type ItineraryCategory = 'activity' | 'accommodation' | 'transport' | 'food' | 'other';

export interface ItineraryItem {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  location: string | null;
  item_date: string;
  start_time: string | null;
  end_time: string | null;
  category: ItineraryCategory;
  estimated_cost: number | null;
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CreateItineraryItemInput = Pick<
  ItineraryItem,
  'trip_id' | 'title' | 'item_date' | 'category' | 'created_by'
> & {
  description?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  estimated_cost?: number;
  currency?: string;
};

export type UpdateItineraryItemInput = Partial<
  Pick<
    ItineraryItem,
    | 'title'
    | 'description'
    | 'location'
    | 'item_date'
    | 'start_time'
    | 'end_time'
    | 'category'
    | 'estimated_cost'
    | 'currency'
  >
>;

// Expense
export type SplitType = 'equal' | 'custom' | 'percentage';

export interface Expense {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  title: string;
  amount: number;
  currency: string;
  paid_by: string;
  split_type: SplitType;
  created_at: string;
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
  itinerary_item_id?: string;
  split_type?: SplitType;
  splits?: Array<{ user_id: string; amount: number }>;
};

// AI suggestion request/response
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

// API response helpers
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

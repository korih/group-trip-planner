import { create } from 'zustand';

export interface TripMember {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: 'owner' | 'editor' | 'viewer';
}

export interface CurrentTrip {
  id: string;
  name: string;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  start_date: string;
  end_date: string;
  base_currency: string;
  cover_photo_url: string | null;
  status: string;
}

interface TripState {
  currentTrip: CurrentTrip | null;
  members: TripMember[];
  userRole: 'owner' | 'editor' | 'viewer' | null;
  setCurrentTrip: (trip: CurrentTrip | null) => void;
  setMembers: (members: TripMember[]) => void;
  setUserRole: (role: 'owner' | 'editor' | 'viewer' | null) => void;
}

export const useTripStore = create<TripState>((set) => ({
  currentTrip: null,
  members: [],
  userRole: null,
  setCurrentTrip: (currentTrip) => set({ currentTrip }),
  setMembers: (members) => set({ members }),
  setUserRole: (userRole) => set({ userRole }),
}));

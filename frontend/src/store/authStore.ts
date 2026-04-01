import { create } from 'zustand';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  is_guest: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  guestToken: string | null;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setGuestToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  guestToken: null,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setGuestToken: (guestToken) => set({ guestToken }),
  logout: () => set({ user: null, guestToken: null }),
}));

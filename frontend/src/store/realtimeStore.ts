import { create } from 'zustand';

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'owner' | 'editor' | 'viewer';
}

interface RealtimeState {
  connectedUsers: PresenceUser[];
  isConnected: boolean;
  setConnectedUsers: (users: PresenceUser[]) => void;
  setConnected: (connected: boolean) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connectedUsers: [],
  isConnected: false,
  setConnectedUsers: (connectedUsers) => set({ connectedUsers }),
  setConnected: (isConnected) => set({ isConnected }),
}));

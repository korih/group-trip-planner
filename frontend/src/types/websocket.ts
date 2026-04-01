export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'owner' | 'editor' | 'viewer';
}

export type ServerMessage =
  | { type: 'pong' }
  | { type: 'presence'; users: PresenceUser[] }
  | { type: 'entity_created'; entityType: string; data: unknown }
  | { type: 'entity_updated'; entityType: string; entityId: string; data: unknown }
  | { type: 'entity_deleted'; entityType: string; entityId: string }
  | { type: 'activity'; entry: ActivityEntry }
  | { type: 'error'; message: string };

export interface ActivityEntry {
  id: string;
  trip_id: string;
  actor_display: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  created_at: string;
}

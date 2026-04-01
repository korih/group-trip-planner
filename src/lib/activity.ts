import type { D1Database } from '@cloudflare/workers-types';
import type { LogActivityInput } from '../types';
import { generateId } from './auth';

/**
 * Write an entry to the activity_feed table.
 * Call this from every mutation route after a successful D1 write.
 *
 * Non-blocking: errors are caught and logged but do not fail the request.
 */
export async function logActivity(
  db: D1Database,
  input: LogActivityInput,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO activity_feed (id, trip_id, actor_id, actor_display, action, entity_type, entity_id, entity_label, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId(),
        input.trip_id,
        input.actor_id ?? null,
        input.actor_display,
        input.action,
        input.entity_type,
        input.entity_id ?? null,
        input.entity_label ?? null,
        input.metadata ?? null,
      )
      .run();
  } catch (err) {
    console.error('[activity] Failed to log activity:', err);
  }
}

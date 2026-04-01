import { Hono } from 'hono';
import type { Env, ContextVariables } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { logActivity } from '../lib/activity';
import { generateId } from '../lib/auth';

const dayNotes = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// GET /day-notes?tripId=<id>  — list note dates for a trip
dayNotes.get('/', optionalAuth, async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) return c.json({ success: false, error: 'tripId required' }, 400);

  const result = await c.env.DB
    .prepare('SELECT id, note_date, updated_at FROM day_notes WHERE trip_id = ? ORDER BY note_date ASC')
    .bind(tripId)
    .all<{ id: string; note_date: string; updated_at: string }>();

  return c.json({ success: true, data: result.results });
});

// GET /day-notes/:tripId/:date  — get note for a specific date
dayNotes.get('/:tripId/:date', optionalAuth, async (c) => {
  const { tripId, date } = c.req.param();

  const note = await c.env.DB
    .prepare('SELECT id, trip_id, note_date, content, updated_at FROM day_notes WHERE trip_id = ? AND note_date = ?')
    .bind(tripId, date)
    .first<{ id: string; trip_id: string; note_date: string; content: string; updated_at: string }>();

  return c.json({
    success: true,
    data: note ?? { id: null, trip_id: tripId, note_date: date, content: '' },
  });
});

// PUT /day-notes/:tripId/:date  — upsert note for a date
dayNotes.put('/:tripId/:date', requireAuth, async (c) => {
  const { tripId, date } = c.req.param();
  const body = await c.req.json<{ content: string }>();

  if (body.content.length > 512_000) {
    return c.json({ success: false, error: 'Note content too large (max 500KB)' }, 400);
  }

  const existing = await c.env.DB
    .prepare('SELECT id FROM day_notes WHERE trip_id = ? AND note_date = ?')
    .bind(tripId, date)
    .first<{ id: string }>();

  if (existing) {
    await c.env.DB
      .prepare("UPDATE day_notes SET content = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(body.content, existing.id)
      .run();
  } else {
    const id = generateId();
    await c.env.DB
      .prepare('INSERT INTO day_notes (id, trip_id, note_date, content, created_by) VALUES (?, ?, ?, ?, ?)')
      .bind(id, tripId, date, body.content, c.var.userId)
      .run();
  }

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: existing ? 'updated_note' : 'created_note',
    entity_type: 'day_note',
    entity_label: date,
  });

  return c.json({ success: true, data: { note_date: date, content: body.content } });
});

// DELETE /day-notes/:tripId/:date
dayNotes.delete('/:tripId/:date', requireAuth, async (c) => {
  const { tripId, date } = c.req.param();

  await c.env.DB
    .prepare('DELETE FROM day_notes WHERE trip_id = ? AND note_date = ?')
    .bind(tripId, date)
    .run();

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'deleted_note',
    entity_type: 'day_note',
    entity_label: date,
  });

  return c.json({ success: true, data: null });
});

export default dayNotes;

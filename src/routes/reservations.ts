import { Hono } from 'hono';
import type { Env, ContextVariables, CreateReservationInput, UpdateReservationInput } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { logActivity } from '../lib/activity';
import { generateId } from '../lib/auth';

const reservations = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// GET /trips/:tripId/reservations
reservations.get('/', optionalAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const type = c.req.query('type');

  const bindings: unknown[] = [tripId];
  let query = 'SELECT * FROM reservations WHERE trip_id = ?';
  if (type) { query += ' AND type = ?'; bindings.push(type); }
  query += ' ORDER BY COALESCE(check_in, created_at) ASC';

  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: result.results });
});

// GET /trips/:tripId/reservations/:id
reservations.get('/:id', optionalAuth, async (c) => {
  const { tripId, id } = c.req.param();
  const row = await c.env.DB
    .prepare('SELECT * FROM reservations WHERE id = ? AND trip_id = ?')
    .bind(id, tripId).first();
  if (!row) return c.json({ success: false, error: 'Reservation not found' }, 404);
  return c.json({ success: true, data: row });
});

// POST /trips/:tripId/reservations
reservations.post('/', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const body = await c.req.json<CreateReservationInput>();

  if (!body.type || !body.name) {
    return c.json({ success: false, error: 'type and name are required' }, 400);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  const id = generateId();
  await c.env.DB
    .prepare(
      `INSERT INTO reservations (id, trip_id, type, name, confirmation_number, check_in, check_out, booking_url, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, tripId, body.type, body.name,
      body.confirmation_number ?? null, body.check_in ?? null, body.check_out ?? null,
      body.booking_url ?? null, body.notes ?? null, c.var.userId)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'created_reservation',
    entity_type: 'reservation',
    entity_id: id,
    entity_label: body.name,
  });

  return c.json({ success: true, data: row }, 201);
});

// PATCH /trips/:tripId/reservations/:id
reservations.patch('/:id', requireAuth, async (c) => {
  const { tripId, id } = c.req.param();
  const existing = await c.env.DB
    .prepare('SELECT name FROM reservations WHERE id = ? AND trip_id = ?')
    .bind(id, tripId).first<{ name: string }>();
  if (!existing) return c.json({ success: false, error: 'Reservation not found' }, 404);

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  const body = await c.req.json<UpdateReservationInput>();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.type !== undefined) { fields.push('type = ?'); values.push(body.type); }
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.confirmation_number !== undefined) { fields.push('confirmation_number = ?'); values.push(body.confirmation_number); }
  if (body.check_in !== undefined) { fields.push('check_in = ?'); values.push(body.check_in); }
  if (body.check_out !== undefined) { fields.push('check_out = ?'); values.push(body.check_out); }
  if (body.booking_url !== undefined) { fields.push('booking_url = ?'); values.push(body.booking_url); }
  if (body.notes !== undefined) { fields.push('notes = ?'); values.push(body.notes); }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE reservations SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'updated_reservation',
    entity_type: 'reservation',
    entity_id: id,
    entity_label: existing.name,
  });

  return c.json({ success: true, data: updated });
});

// DELETE /trips/:tripId/reservations/:id
reservations.delete('/:id', requireAuth, async (c) => {
  const { tripId, id } = c.req.param();
  const existing = await c.env.DB
    .prepare('SELECT name FROM reservations WHERE id = ? AND trip_id = ?')
    .bind(id, tripId).first<{ name: string }>();
  if (!existing) return c.json({ success: false, error: 'Reservation not found' }, 404);

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  await c.env.DB.prepare('DELETE FROM reservations WHERE id = ?').bind(id).run();

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'deleted_reservation',
    entity_type: 'reservation',
    entity_id: id,
    entity_label: existing.name,
  });

  return c.json({ success: true, data: null });
});

export default reservations;

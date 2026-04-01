import { Hono } from 'hono';
import type { Env, ContextVariables, CreateTripInput, UpdateTripInput } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import {
  getTripById,
  getTripsByUser,
  createTrip,
  updateTrip,
  deleteTrip,
  getTripMembers,
  addTripMember,
  removeTripMember,
} from '../db/queries';
import { logActivity } from '../lib/activity';

const trips = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// GET /trips?userId=<id>  — list trips for the authenticated user
trips.get('/', requireAuth, async (c) => {
  const userId = c.var.userId;
  const data = await getTripsByUser(c.env.DB, userId);
  return c.json({ success: true, data });
});

// GET /trips/:id  — view a trip (also accessible to guests with a valid invite session)
trips.get('/:id', optionalAuth, async (c) => {
  const trip = await getTripById(c.env.DB, c.req.param('id'));
  if (!trip) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }
  return c.json({ success: true, data: trip });
});

// POST /trips  — create a trip (requires full account)
trips.post('/', requireAuth, async (c) => {
  const body = await c.req.json<CreateTripInput>();

  if (!body.name || !body.destination || !body.start_date || !body.end_date) {
    return c.json(
      { success: false, error: 'name, destination, start_date, and end_date are required' },
      400,
    );
  }

  if (c.var.isGuest) {
    return c.json({ success: false, error: 'A full account is required to create trips' }, 403);
  }

  const trip = await createTrip(c.env.DB, body, c.var.userId);
  return c.json({ success: true, data: trip }, 201);
});

// PATCH /trips/:id  — update trip details (owner or editor)
trips.patch('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');

  const existing = await getTripById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  // Verify the user is a member with edit rights
  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<UpdateTripInput>();
  const trip = await updateTrip(c.env.DB, id, body);
  return c.json({ success: true, data: trip });
});

// DELETE /trips/:id  — owner only
trips.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');

  const existing = await getTripById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role !== 'owner') {
    return c.json({ success: false, error: 'Only the trip owner can delete a trip' }, 403);
  }

  await deleteTrip(c.env.DB, id);
  return c.json({ success: true, data: null });
});

// GET /trips/:id/members  — list members (requires membership)
trips.get('/:id/members', optionalAuth, async (c) => {
  const tripId = c.req.param('id');
  const trip = await getTripById(c.env.DB, tripId);
  if (!trip) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  const members = await getTripMembers(c.env.DB, tripId);
  return c.json({ success: true, data: members });
});

// POST /trips/:id/members  — add member (owner or editor)
trips.post('/:id/members', requireAuth, async (c) => {
  const tripId = c.req.param('id');

  const trip = await getTripById(c.env.DB, tripId);
  if (!trip) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  const requester = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId)
    .first<{ role: string }>();

  if (!requester || requester.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<{ user_id: string; role?: 'editor' | 'viewer' }>();
  if (!body.user_id) {
    return c.json({ success: false, error: 'user_id is required' }, 400);
  }

  await addTripMember(c.env.DB, tripId, body.user_id, body.role ?? 'editor');
  const members = await getTripMembers(c.env.DB, tripId);
  return c.json({ success: true, data: members }, 201);
});

// DELETE /trips/:id/members/:userId  — remove member (owner only, or self-remove)
trips.delete('/:id/members/:userId', requireAuth, async (c) => {
  const tripId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  const requester = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId)
    .first<{ role: string }>();

  const isSelfRemove = c.var.userId === targetUserId;
  const isOwner = requester?.role === 'owner';

  if (!isOwner && !isSelfRemove) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  await removeTripMember(c.env.DB, tripId, targetUserId);
  return c.json({ success: true, data: null });
});

// GET /trips/:id/activity  — activity feed for a trip
trips.get('/:id/activity', optionalAuth, async (c) => {
  const tripId = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
  const before = c.req.query('before'); // ISO timestamp for pagination

  const bindings: unknown[] = [tripId];
  let query = 'SELECT * FROM activity_feed WHERE trip_id = ?';
  if (before) { query += ' AND created_at < ?'; bindings.push(before); }
  query += ' ORDER BY created_at DESC LIMIT ?';
  bindings.push(limit);

  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ success: true, data: result.results });
});

// PATCH /trips/:id/role  — change a member's role (owner only)
trips.patch('/:id/members/:userId/role', requireAuth, async (c) => {
  const { id: tripId, userId: targetUserId } = c.req.param();
  const body = await c.req.json<{ role: 'editor' | 'viewer' }>();

  const requester = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();

  if (!requester || requester.role !== 'owner') {
    return c.json({ success: false, error: 'Only the owner can change roles' }, 403);
  }

  await c.env.DB
    .prepare('UPDATE trip_members SET role = ? WHERE trip_id = ? AND user_id = ?')
    .bind(body.role, tripId, targetUserId).run();

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'changed_member_role',
    entity_type: 'trip_member',
    entity_id: targetUserId,
    entity_label: body.role,
  });

  return c.json({ success: true, data: null });
});

export default trips;

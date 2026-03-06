import { Hono } from 'hono';
import type { Env, CreateTripInput, UpdateTripInput } from '../types';
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

const trips = new Hono<{ Bindings: Env }>();

// GET /trips?userId=<id>
trips.get('/', async (c) => {
  const userId = c.req.query('userId');
  if (!userId) {
    return c.json({ success: false, error: 'userId query param is required' }, 400);
  }
  const data = await getTripsByUser(c.env.DB, userId);
  return c.json({ success: true, data });
});

// GET /trips/:id
trips.get('/:id', async (c) => {
  const trip = await getTripById(c.env.DB, c.req.param('id'));
  if (!trip) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }
  return c.json({ success: true, data: trip });
});

// POST /trips
trips.post('/', async (c) => {
  const body = await c.req.json<CreateTripInput>();

  if (!body.name || !body.destination || !body.start_date || !body.end_date || !body.created_by) {
    return c.json(
      { success: false, error: 'name, destination, start_date, end_date, and created_by are required' },
      400
    );
  }

  const trip = await createTrip(c.env.DB, body);
  return c.json({ success: true, data: trip }, 201);
});

// PATCH /trips/:id
trips.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getTripById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  const body = await c.req.json<UpdateTripInput>();
  const trip = await updateTrip(c.env.DB, id, body);
  return c.json({ success: true, data: trip });
});

// DELETE /trips/:id
trips.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getTripById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  await deleteTrip(c.env.DB, id);
  return c.json({ success: true, data: null });
});

// GET /trips/:id/members
trips.get('/:id/members', async (c) => {
  const tripId = c.req.param('id');
  const trip = await getTripById(c.env.DB, tripId);
  if (!trip) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  const members = await getTripMembers(c.env.DB, tripId);
  return c.json({ success: true, data: members });
});

// POST /trips/:id/members
trips.post('/:id/members', async (c) => {
  const tripId = c.req.param('id');
  const trip = await getTripById(c.env.DB, tripId);
  if (!trip) {
    return c.json({ success: false, error: 'Trip not found' }, 404);
  }

  const body = await c.req.json<{ user_id: string; role?: 'admin' | 'member' }>();
  if (!body.user_id) {
    return c.json({ success: false, error: 'user_id is required' }, 400);
  }

  await addTripMember(c.env.DB, tripId, body.user_id, body.role ?? 'member');
  const members = await getTripMembers(c.env.DB, tripId);
  return c.json({ success: true, data: members }, 201);
});

// DELETE /trips/:id/members/:userId
trips.delete('/:id/members/:userId', async (c) => {
  const tripId = c.req.param('id');
  const userId = c.req.param('userId');
  await removeTripMember(c.env.DB, tripId, userId);
  return c.json({ success: true, data: null });
});

export default trips;

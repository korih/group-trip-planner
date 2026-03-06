import { Hono } from 'hono';
import type { Env, CreateItineraryItemInput, UpdateItineraryItemInput } from '../types';
import {
  getItineraryByTrip,
  getItineraryItemById,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
} from '../db/queries';

const itineraries = new Hono<{ Bindings: Env }>();

// GET /itineraries?tripId=<id>
itineraries.get('/', async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) {
    return c.json({ success: false, error: 'tripId query param is required' }, 400);
  }
  const items = await getItineraryByTrip(c.env.DB, tripId);
  return c.json({ success: true, data: items });
});

// GET /itineraries/:id
itineraries.get('/:id', async (c) => {
  const item = await getItineraryItemById(c.env.DB, c.req.param('id'));
  if (!item) {
    return c.json({ success: false, error: 'Itinerary item not found' }, 404);
  }
  return c.json({ success: true, data: item });
});

// POST /itineraries
itineraries.post('/', async (c) => {
  const body = await c.req.json<CreateItineraryItemInput>();

  if (!body.trip_id || !body.title || !body.item_date || !body.category || !body.created_by) {
    return c.json(
      { success: false, error: 'trip_id, title, item_date, category, and created_by are required' },
      400
    );
  }

  const item = await createItineraryItem(c.env.DB, body);
  return c.json({ success: true, data: item }, 201);
});

// PATCH /itineraries/:id
itineraries.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getItineraryItemById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Itinerary item not found' }, 404);
  }

  const body = await c.req.json<UpdateItineraryItemInput>();
  const item = await updateItineraryItem(c.env.DB, id, body);
  return c.json({ success: true, data: item });
});

// DELETE /itineraries/:id
itineraries.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getItineraryItemById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Itinerary item not found' }, 404);
  }

  await deleteItineraryItem(c.env.DB, id);
  return c.json({ success: true, data: null });
});

export default itineraries;

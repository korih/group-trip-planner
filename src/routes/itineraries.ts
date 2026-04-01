import { Hono } from 'hono';
import type { Env, ContextVariables, CreateItineraryItemInput, UpdateItineraryItemInput, ReorderItem } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import {
  getItineraryByTrip,
  getItineraryItemById,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
} from '../db/queries';
import { geocode } from '../lib/geocode';
import { logActivity } from '../lib/activity';

const itineraries = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// GET /itineraries?tripId=<id>
itineraries.get('/', optionalAuth, async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) {
    return c.json({ success: false, error: 'tripId query param is required' }, 400);
  }
  const items = await getItineraryByTrip(c.env.DB, tripId);
  return c.json({ success: true, data: items });
});

// GET /itineraries/:id
itineraries.get('/:id', optionalAuth, async (c) => {
  const item = await getItineraryItemById(c.env.DB, c.req.param('id'));
  if (!item) {
    return c.json({ success: false, error: 'Itinerary item not found' }, 404);
  }
  return c.json({ success: true, data: item });
});

// POST /itineraries
itineraries.post('/', requireAuth, async (c) => {
  const body = await c.req.json<CreateItineraryItemInput>();

  if (!body.trip_id || !body.title || !body.item_date || !body.category) {
    return c.json(
      { success: false, error: 'trip_id, title, item_date, and category are required' },
      400,
    );
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(body.trip_id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  // Auto-geocode location if provided but no coordinates given
  let lat = body.lat;
  let lng = body.lng;
  if (body.location && lat == null && lng == null) {
    const coords = await geocode(body.location, c.env.SESSIONS);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }

  const item = await createItineraryItem(c.env.DB, { ...body, lat, lng }, c.var.userId);

  await logActivity(c.env.DB, {
    trip_id: body.trip_id,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'created_item',
    entity_type: 'itinerary_item',
    entity_id: item.id,
    entity_label: item.title,
  });

  return c.json({ success: true, data: item }, 201);
});

// POST /itineraries/reorder  — batch reorder items within/across days
itineraries.post('/reorder', requireAuth, async (c) => {
  const body = await c.req.json<{ tripId: string; items: ReorderItem[] }>();

  if (!body.tripId || !Array.isArray(body.items)) {
    return c.json({ success: false, error: 'tripId and items array are required' }, 400);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(body.tripId, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const statements = body.items.map((item) => {
    if (item.item_date) {
      return c.env.DB
        .prepare('UPDATE itinerary_items SET order_index = ?, item_date = ? WHERE id = ? AND trip_id = ?')
        .bind(item.order_index, item.item_date, item.id, body.tripId);
    }
    return c.env.DB
      .prepare('UPDATE itinerary_items SET order_index = ? WHERE id = ? AND trip_id = ?')
      .bind(item.order_index, item.id, body.tripId);
  });

  await c.env.DB.batch(statements);
  return c.json({ success: true, data: null });
});

// PATCH /itineraries/:id
itineraries.patch('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const existing = await getItineraryItemById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Itinerary item not found' }, 404);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(existing.trip_id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<UpdateItineraryItemInput>();

  // Auto-geocode if location changed and no explicit coordinates provided
  let lat = body.lat;
  let lng = body.lng;
  if (body.location && body.location !== existing.location && lat == null && lng == null) {
    const coords = await geocode(body.location, c.env.SESSIONS);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }

  const item = await updateItineraryItem(c.env.DB, id, { ...body, lat, lng });

  await logActivity(c.env.DB, {
    trip_id: existing.trip_id,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'updated_item',
    entity_type: 'itinerary_item',
    entity_id: id,
    entity_label: item?.title ?? existing.title,
  });

  return c.json({ success: true, data: item });
});

// DELETE /itineraries/:id
itineraries.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const existing = await getItineraryItemById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Itinerary item not found' }, 404);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(existing.trip_id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  await deleteItineraryItem(c.env.DB, id);

  await logActivity(c.env.DB, {
    trip_id: existing.trip_id,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'deleted_item',
    entity_type: 'itinerary_item',
    entity_id: id,
    entity_label: existing.title,
  });

  return c.json({ success: true, data: null });
});

export default itineraries;

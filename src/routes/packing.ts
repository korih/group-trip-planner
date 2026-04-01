import { Hono } from 'hono';
import type { Env, ContextVariables, PackingTemplate } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { logActivity } from '../lib/activity';
import { generateId } from '../lib/auth';

const packing = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// Packing list templates — pre-populated item sets
const TEMPLATES: Record<PackingTemplate, Array<{ label: string; category: string }>> = {
  beach: [
    { label: 'Sunscreen', category: 'toiletries' },
    { label: 'Swimsuit', category: 'clothing' },
    { label: 'Beach towel', category: 'clothing' },
    { label: 'Sunglasses', category: 'clothing' },
    { label: 'Flip flops', category: 'clothing' },
    { label: 'Snorkel gear', category: 'general' },
    { label: 'Passport/ID', category: 'documents' },
  ],
  hiking: [
    { label: 'Hiking boots', category: 'clothing' },
    { label: 'Rain jacket', category: 'clothing' },
    { label: 'Trekking poles', category: 'general' },
    { label: 'First aid kit', category: 'medical' },
    { label: 'Headlamp', category: 'electronics' },
    { label: 'Water bottles', category: 'general' },
    { label: 'Snacks', category: 'general' },
    { label: 'Sunscreen', category: 'toiletries' },
    { label: 'Passport/ID', category: 'documents' },
  ],
  city: [
    { label: 'Comfortable walking shoes', category: 'clothing' },
    { label: 'Day bag', category: 'general' },
    { label: 'Phone charger', category: 'electronics' },
    { label: 'Power bank', category: 'electronics' },
    { label: 'Passport/ID', category: 'documents' },
    { label: 'Travel adapter', category: 'electronics' },
    { label: 'Credit/debit cards', category: 'documents' },
  ],
  winter: [
    { label: 'Heavy coat', category: 'clothing' },
    { label: 'Thermal base layers', category: 'clothing' },
    { label: 'Gloves', category: 'clothing' },
    { label: 'Warm hat', category: 'clothing' },
    { label: 'Scarf', category: 'clothing' },
    { label: 'Boots (waterproof)', category: 'clothing' },
    { label: 'Hand warmers', category: 'general' },
    { label: 'Passport/ID', category: 'documents' },
  ],
};

// GET /trips/:tripId/packing  — all lists with items
packing.get('/', optionalAuth, async (c) => {
  const tripId = c.req.param('tripId');

  const lists = await c.env.DB
    .prepare('SELECT * FROM packing_lists WHERE trip_id = ? ORDER BY created_at ASC')
    .bind(tripId)
    .all<{ id: string; name: string; trip_id: string; created_at: string }>();

  // For each list, fetch items
  const result = await Promise.all(
    lists.results.map(async (list) => {
      const items = await c.env.DB
        .prepare(
          `SELECT pi.*, u.name AS assigned_name
           FROM packing_items pi
           LEFT JOIN users u ON pi.assigned_to = u.id
           WHERE pi.list_id = ?
           ORDER BY pi.order_index ASC`,
        )
        .bind(list.id)
        .all();
      return { ...list, items: items.results };
    }),
  );

  return c.json({ success: true, data: result });
});

// POST /trips/:tripId/packing  — create list (optionally from template)
packing.post('/', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const body = await c.req.json<{ name?: string; template?: PackingTemplate }>();

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  const listId = generateId();
  const listName = body.name ?? (body.template ? `${body.template.charAt(0).toUpperCase()}${body.template.slice(1)} Trip` : 'Packing List');

  await c.env.DB
    .prepare('INSERT INTO packing_lists (id, trip_id, name, created_by) VALUES (?, ?, ?, ?)')
    .bind(listId, tripId, listName, c.var.userId)
    .run();

  if (body.template && TEMPLATES[body.template]) {
    const templateItems = TEMPLATES[body.template];
    const stmt = c.env.DB.prepare(
      'INSERT INTO packing_items (id, list_id, label, category, order_index) VALUES (?, ?, ?, ?, ?)',
    );
    await c.env.DB.batch(
      templateItems.map((item, idx) =>
        stmt.bind(generateId(), listId, item.label, item.category, idx),
      ),
    );
  }

  const list = await c.env.DB.prepare('SELECT * FROM packing_lists WHERE id = ?').bind(listId).first();
  const items = await c.env.DB
    .prepare('SELECT * FROM packing_items WHERE list_id = ? ORDER BY order_index ASC')
    .bind(listId).all();

  await logActivity(c.env.DB, {
    trip_id: tripId,
    actor_id: c.var.userId,
    actor_display: c.var.user?.name ?? 'Unknown',
    action: 'created_packing_list',
    entity_type: 'packing_list',
    entity_id: listId,
    entity_label: listName,
  });

  return c.json({ success: true, data: { ...list, items: items.results } }, 201);
});

// DELETE /trips/:tripId/packing/:listId
packing.delete('/:listId', requireAuth, async (c) => {
  const { tripId, listId } = c.req.param();

  const existing = await c.env.DB
    .prepare('SELECT name FROM packing_lists WHERE id = ? AND trip_id = ?')
    .bind(listId, tripId).first<{ name: string }>();
  if (!existing) return c.json({ success: false, error: 'Packing list not found' }, 404);

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  await c.env.DB.prepare('DELETE FROM packing_lists WHERE id = ?').bind(listId).run();
  return c.json({ success: true, data: null });
});

// POST /trips/:tripId/packing/:listId/items
packing.post('/:listId/items', requireAuth, async (c) => {
  const { tripId, listId } = c.req.param();
  const body = await c.req.json<{ label: string; category?: string; assigned_to?: string }>();

  if (!body.label) return c.json({ success: false, error: 'label is required' }, 400);

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, c.var.userId).first<{ role: string }>();
  if (!member || member.role === 'viewer') return c.json({ success: false, error: 'Forbidden' }, 403);

  // Get current max order_index
  const maxOrder = await c.env.DB
    .prepare('SELECT MAX(order_index) AS max_idx FROM packing_items WHERE list_id = ?')
    .bind(listId).first<{ max_idx: number | null }>();
  const orderIndex = (maxOrder?.max_idx ?? -1) + 1;

  const itemId = generateId();
  await c.env.DB
    .prepare(
      'INSERT INTO packing_items (id, list_id, label, category, assigned_to, order_index) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(itemId, listId, body.label, body.category ?? 'general', body.assigned_to ?? null, orderIndex)
    .run();

  const item = await c.env.DB.prepare('SELECT * FROM packing_items WHERE id = ?').bind(itemId).first();
  return c.json({ success: true, data: item }, 201);
});

// PATCH /trips/:tripId/packing/:listId/items/:itemId
packing.patch('/:listId/items/:itemId', requireAuth, async (c) => {
  const { listId, itemId } = c.req.param();
  const body = await c.req.json<{ label?: string; category?: string; assigned_to?: string; order_index?: number }>();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.label !== undefined) { fields.push('label = ?'); values.push(body.label); }
  if (body.category !== undefined) { fields.push('category = ?'); values.push(body.category); }
  if ('assigned_to' in body) { fields.push('assigned_to = ?'); values.push(body.assigned_to ?? null); }
  if (body.order_index !== undefined) { fields.push('order_index = ?'); values.push(body.order_index); }

  if (fields.length > 0) {
    values.push(itemId, listId);
    await c.env.DB
      .prepare(`UPDATE packing_items SET ${fields.join(', ')} WHERE id = ? AND list_id = ?`)
      .bind(...values)
      .run();
  }

  const item = await c.env.DB.prepare('SELECT * FROM packing_items WHERE id = ?').bind(itemId).first();
  return c.json({ success: true, data: item });
});

// PATCH /trips/:tripId/packing/:listId/items/:itemId/check  — toggle checked
packing.patch('/:listId/items/:itemId/check', requireAuth, async (c) => {
  const { itemId } = c.req.param();
  const body = await c.req.json<{ is_checked: boolean }>();
  const userId = c.var.userId;

  if (body.is_checked) {
    await c.env.DB
      .prepare("UPDATE packing_items SET is_checked = 1, checked_by = ?, checked_at = datetime('now') WHERE id = ?")
      .bind(userId, itemId)
      .run();
  } else {
    await c.env.DB
      .prepare('UPDATE packing_items SET is_checked = 0, checked_by = NULL, checked_at = NULL WHERE id = ?')
      .bind(itemId)
      .run();
  }

  const item = await c.env.DB.prepare('SELECT * FROM packing_items WHERE id = ?').bind(itemId).first();
  return c.json({ success: true, data: item });
});

// DELETE /trips/:tripId/packing/:listId/items/:itemId
packing.delete('/:listId/items/:itemId', requireAuth, async (c) => {
  const { listId, itemId } = c.req.param();

  const existing = await c.env.DB
    .prepare('SELECT id FROM packing_items WHERE id = ? AND list_id = ?')
    .bind(itemId, listId).first();
  if (!existing) return c.json({ success: false, error: 'Item not found' }, 404);

  await c.env.DB.prepare('DELETE FROM packing_items WHERE id = ?').bind(itemId).run();
  return c.json({ success: true, data: null });
});

// POST /trips/:tripId/packing/:listId/reorder
packing.post('/:listId/reorder', requireAuth, async (c) => {
  const { listId } = c.req.param();
  const body = await c.req.json<{ items: Array<{ id: string; order_index: number }> }>();

  if (!Array.isArray(body.items)) return c.json({ success: false, error: 'items array required' }, 400);

  const stmt = c.env.DB.prepare(
    'UPDATE packing_items SET order_index = ? WHERE id = ? AND list_id = ?',
  );
  await c.env.DB.batch(body.items.map((item) => stmt.bind(item.order_index, item.id, listId)));

  return c.json({ success: true, data: null });
});

export default packing;

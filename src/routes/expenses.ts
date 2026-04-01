import { Hono } from 'hono';
import type { Env, ContextVariables, CreateExpenseInput, UpdateExpenseInput } from '../types';
import { requireAuth, optionalAuth } from '../middleware/auth';
import {
  getExpensesByTrip,
  getExpenseById,
  createExpense,
  getExpenseSplits,
  getTripExpenseSummary,
  getTripMembers,
} from '../db/queries';

const expenses = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// GET /expenses?tripId=<id>
expenses.get('/', optionalAuth, async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) {
    return c.json({ success: false, error: 'tripId query param is required' }, 400);
  }
  const data = await getExpensesByTrip(c.env.DB, tripId);
  return c.json({ success: true, data });
});

// GET /expenses/summary?tripId=<id>
expenses.get('/summary', optionalAuth, async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) {
    return c.json({ success: false, error: 'tripId query param is required' }, 400);
  }
  const summary = await getTripExpenseSummary(c.env.DB, tripId);
  return c.json({ success: true, data: summary });
});

// GET /expenses/:id
expenses.get('/:id', optionalAuth, async (c) => {
  const expense = await getExpenseById(c.env.DB, c.req.param('id'));
  if (!expense) {
    return c.json({ success: false, error: 'Expense not found' }, 404);
  }
  return c.json({ success: true, data: expense });
});

// GET /expenses/:id/splits
expenses.get('/:id/splits', optionalAuth, async (c) => {
  const expense = await getExpenseById(c.env.DB, c.req.param('id'));
  if (!expense) {
    return c.json({ success: false, error: 'Expense not found' }, 404);
  }
  const splits = await getExpenseSplits(c.env.DB, c.req.param('id'));
  return c.json({ success: true, data: splits });
});

// POST /expenses
expenses.post('/', requireAuth, async (c) => {
  const body = await c.req.json<CreateExpenseInput>();

  if (!body.trip_id || !body.title || body.amount == null) {
    return c.json(
      { success: false, error: 'trip_id, title, and amount are required' },
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

  // Default paid_by to the current user if not specified
  const paidBy = body.paid_by ?? c.var.userId;

  const members = await getTripMembers(c.env.DB, body.trip_id);
  if (members.length === 0) {
    return c.json({ success: false, error: 'Trip has no members' }, 400);
  }

  const memberIds = members.map((m) => m.user_id);
  const expense = await createExpense(c.env.DB, { ...body, paid_by: paidBy }, memberIds);
  return c.json({ success: true, data: expense }, 201);
});

// PATCH /expenses/:id
expenses.patch('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const existing = await getExpenseById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Expense not found' }, 404);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(existing.trip_id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const body = await c.req.json<UpdateExpenseInput>();

  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title); }
  if (body.amount !== undefined) { fields.push('amount = ?'); values.push(body.amount); }
  if (body.currency !== undefined) { fields.push('currency = ?'); values.push(body.currency); }
  if (body.category !== undefined) { fields.push('category = ?'); values.push(body.category); }
  if (body.paid_by !== undefined) { fields.push('paid_by = ?'); values.push(body.paid_by); }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB
      .prepare(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  const updated = await getExpenseById(c.env.DB, id);
  return c.json({ success: true, data: updated });
});

// DELETE /expenses/:id
expenses.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const existing = await getExpenseById(c.env.DB, id);
  if (!existing) {
    return c.json({ success: false, error: 'Expense not found' }, 404);
  }

  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(existing.trip_id, c.var.userId)
    .first<{ role: string }>();

  if (!member || member.role === 'viewer') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM expense_splits WHERE expense_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: null });
});

export default expenses;

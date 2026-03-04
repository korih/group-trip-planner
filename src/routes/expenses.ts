import { Hono } from 'hono';
import type { Env, CreateExpenseInput } from '../types';
import {
  getExpensesByTrip,
  getExpenseById,
  createExpense,
  getExpenseSplits,
  getTripExpenseSummary,
  getTripMembers,
} from '../db/queries';

const expenses = new Hono<{ Bindings: Env }>();

// GET /expenses?tripId=<id>
expenses.get('/', async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) {
    return c.json({ success: false, error: 'tripId query param is required' }, 400);
  }
  const data = await getExpensesByTrip(c.env.DB, tripId);
  return c.json({ success: true, data });
});

// GET /expenses/summary?tripId=<id>
expenses.get('/summary', async (c) => {
  const tripId = c.req.query('tripId');
  if (!tripId) {
    return c.json({ success: false, error: 'tripId query param is required' }, 400);
  }
  const summary = await getTripExpenseSummary(c.env.DB, tripId);
  return c.json({ success: true, data: summary });
});

// GET /expenses/:id
expenses.get('/:id', async (c) => {
  const expense = await getExpenseById(c.env.DB, c.req.param('id'));
  if (!expense) {
    return c.json({ success: false, error: 'Expense not found' }, 404);
  }
  return c.json({ success: true, data: expense });
});

// GET /expenses/:id/splits
expenses.get('/:id/splits', async (c) => {
  const expense = await getExpenseById(c.env.DB, c.req.param('id'));
  if (!expense) {
    return c.json({ success: false, error: 'Expense not found' }, 404);
  }
  const splits = await getExpenseSplits(c.env.DB, c.req.param('id'));
  return c.json({ success: true, data: splits });
});

// POST /expenses
expenses.post('/', async (c) => {
  const body = await c.req.json<CreateExpenseInput>();

  if (!body.trip_id || !body.title || body.amount == null || !body.paid_by) {
    return c.json(
      { success: false, error: 'trip_id, title, amount, and paid_by are required' },
      400
    );
  }

  // Get trip members to split equally if no explicit splits provided
  const members = await getTripMembers(c.env.DB, body.trip_id);
  if (members.length === 0) {
    return c.json({ success: false, error: 'Trip has no members' }, 400);
  }

  const memberIds = members.map((m) => m.user_id);
  const expense = await createExpense(c.env.DB, body, memberIds);
  return c.json({ success: true, data: expense }, 201);
});

export default expenses;

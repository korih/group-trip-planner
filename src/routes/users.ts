import { Hono } from 'hono';
import type { Env } from '../types';
import {
  getUserById,
  getUserByEmail,
  createUser,
} from '../db/queries';

const users = new Hono<{ Bindings: Env }>();

// GET /users/:id
users.get('/:id', async (c) => {
  const user = await getUserById(c.env.DB, c.req.param('id'));
  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }
  return c.json({ success: true, data: user });
});

// GET /users/by-email/:email
users.get('/by-email/:email', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.req.param('email'));
  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }
  return c.json({ success: true, data: user });
});

// POST /users
users.post('/', async (c) => {
  const body = await c.req.json<{ name: string; email: string }>();

  if (!body.name || !body.email) {
    return c.json({ success: false, error: 'name and email are required' }, 400);
  }

  const existing = await getUserByEmail(c.env.DB, body.email);
  if (existing) {
    return c.json({ success: false, error: 'Email already in use' }, 409);
  }

  const user = await createUser(c.env.DB, { name: body.name, email: body.email });
  return c.json({ success: true, data: user }, 201);
});

export default users;

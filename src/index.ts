import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env, ContextVariables } from './types';

// Existing routes
import users from './routes/users';
import trips from './routes/trips';
import itineraries from './routes/itineraries';
import expenses from './routes/expenses';
import ai from './routes/ai';

// New routes
import auth from './routes/auth';
import dayNotes from './routes/day-notes';
import reservations from './routes/reservations';
import packing from './routes/packing';
import documents from './routes/documents';
import weather from './routes/weather';
import currency from './routes/currency';
import ws from './routes/ws';
import invites, { handleInviteValidate, handleInviteRedeem } from './routes/invites';

// Export Durable Object class (required by Cloudflare Workers runtime)
export { TripRoom } from './durable-objects/TripRoom';

const app = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

// ============================================================
// Middleware
// ============================================================

app.use('*', logger());

app.use('*', async (c, next) => {
  const allowedOrigin =
    c.env.ENVIRONMENT === 'production' ? c.env.FRONTEND_URL : '*';

  return cors({
    origin: allowedOrigin,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })(c, next);
});

// Rate limiting: 120 req/min per IP (KV counter, fire-and-forget)
app.use('*', async (c, next) => {
  if (c.env.ENVIRONMENT !== 'production') return next();

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const minute = Math.floor(Date.now() / 60_000);
  const key = `ratelimit:${ip}:${minute}`;

  const count = Number(await c.env.SESSIONS.get(key) ?? '0');
  if (count >= 120) {
    return c.json({ success: false, error: 'Too many requests' }, 429);
  }

  // Increment (fire and forget — don't block the request)
  c.env.SESSIONS.put(key, String(count + 1), { expirationTtl: 120 }).catch(() => {});

  return next();
});

// ============================================================
// Health check
// ============================================================

app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      name: 'Group Trip Planner API',
      version: '1.0.0',
      environment: c.env.ENVIRONMENT,
    },
  });
});

// ============================================================
// Routes
// ============================================================

// Auth
app.route('/auth', auth);

// Utility (public)
app.route('/currency', currency);

// Public invite endpoints
app.get('/invites/:token', async (c) => {
  return handleInviteValidate(c.req.param('token'), c.env);
});
app.post('/invites/:token/redeem', async (c) => {
  return handleInviteRedeem(c.req.param('token'), c.req.raw, c.env);
});

// WebSocket
app.route('/ws', ws);

// Standard resource routes
app.route('/users', users);
app.route('/trips', trips);
app.route('/itineraries', itineraries);
app.route('/expenses', expenses);
app.route('/ai', ai);
app.route('/day-notes', dayNotes);

// Trip-scoped routes
app.route('/trips/:tripId/reservations', reservations);
app.route('/trips/:tripId/packing', packing);
app.route('/trips/:tripId/documents', documents);
app.route('/trips/:tripId/weather', weather);
app.route('/trips/:tripId/invites', invites);
app.route('/trips/:tripId/ws', ws);

// ============================================================
// Error handlers
// ============================================================

app.notFound((c) => {
  return c.json({ success: false, error: 'Not found' }, 404);
});

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;

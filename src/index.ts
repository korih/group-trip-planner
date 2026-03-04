import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';
import users from './routes/users';
import trips from './routes/trips';
import itineraries from './routes/itineraries';
import expenses from './routes/expenses';
import ai from './routes/ai';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check
app.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      name: 'Group Trip Planner API',
      version: '0.1.0',
      environment: c.env.ENVIRONMENT,
    },
  });
});

// API routes
app.route('/users', users);
app.route('/trips', trips);
app.route('/itineraries', itineraries);
app.route('/expenses', expenses);
app.route('/ai', ai);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ success: false, error: 'Internal server error' }, 500);
});

export default app;

import { Hono } from 'hono';
import type { Env, ContextVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import { generateId } from '../lib/auth';

const ws = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

const TICKET_TTL = 30; // seconds — single-use WebSocket ticket

// ============================================================
// GET /trips/:tripId/ws
// Issue a short-lived WebSocket ticket for this trip.
// Client uses the ticket URL to open the actual WebSocket connection.
// Two-step to avoid passing auth tokens in WebSocket URLs (visible in logs).
// ============================================================

ws.get('/trips/:tripId/ws', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');
  const user = c.var.user;

  // Verify user is a trip member
  const member = await c.env.DB
    .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .bind(tripId, user.id)
    .first<{ role: string }>();

  if (!member) {
    return c.json({ success: false, error: 'Not a trip member' }, 403);
  }

  // Generate single-use ticket
  const ticketId = generateId();
  const ticketData = {
    tripId,
    userId: user.id,
    displayName: user.name,
    avatarUrl: user.avatar_url,
    role: member.role,
  };

  await c.env.SESSIONS.put(`ws-ticket:${ticketId}`, JSON.stringify(ticketData), {
    expirationTtl: TICKET_TTL,
  });

  const wsUrl = `${new URL(c.req.url).origin.replace('http', 'ws')}/ws/connect?ticket=${ticketId}`;

  return c.json({ success: true, data: { ticketUrl: wsUrl } });
});

// ============================================================
// GET /ws/connect?ticket=<id>
// Validate ticket + forward to Durable Object TripRoom
// ============================================================

ws.get('/connect', async (c) => {
  const ticketId = c.req.query('ticket');
  if (!ticketId) {
    return c.json({ success: false, error: 'Missing ticket' }, 400);
  }

  // Validate and consume the ticket (single-use)
  const ticketData = await c.env.SESSIONS.get<{
    tripId: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    role: string;
  }>(`ws-ticket:${ticketId}`, 'json');

  if (!ticketData) {
    return c.json({ success: false, error: 'Invalid or expired ticket' }, 401);
  }

  // Delete ticket immediately (single-use)
  await c.env.SESSIONS.delete(`ws-ticket:${ticketId}`);

  // Forward to the TripRoom Durable Object for this trip
  const roomId = c.env.TRIP_ROOMS.idFromName(ticketData.tripId);
  const room = c.env.TRIP_ROOMS.get(roomId);

  // Pass user info via URL params (safe since this URL is internal / server-generated)
  const doUrl = new URL(`https://internal/ws`);
  doUrl.searchParams.set('userId', ticketData.userId);
  doUrl.searchParams.set('displayName', ticketData.displayName);
  doUrl.searchParams.set('avatarUrl', ticketData.avatarUrl ?? '');
  doUrl.searchParams.set('role', ticketData.role);

  return room.fetch(new Request(doUrl.toString(), c.req.raw));
});

// ============================================================
// Internal: broadcast a message to all connected clients in a trip
// Called by mutation routes after D1 writes
// ============================================================

export async function broadcastToTrip(
  env: Env,
  tripId: string,
  message: unknown,
): Promise<void> {
  try {
    const roomId = env.TRIP_ROOMS.idFromName(tripId);
    const room = env.TRIP_ROOMS.get(roomId);
    await room.fetch(
      new Request('https://internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }),
    );
  } catch (err) {
    // Non-fatal: real-time broadcast failure should not break the API response
    console.error('[ws] Broadcast failed:', err);
  }
}

export default ws;

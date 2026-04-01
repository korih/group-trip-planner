import { Hono } from 'hono';
import type { Env, ContextVariables } from '../types';
import { requireAuth } from '../middleware/auth';

const weather = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

const CACHE_TTL = 60 * 60 * 3; // 3 hours

// GET /trips/:tripId/weather
// Returns 16-day forecast for the trip's destination coordinates.
// Proxies Open-Meteo (free, no API key required) with KV caching.
weather.get('/', requireAuth, async (c) => {
  const tripId = c.req.param('tripId');

  // Get trip coordinates
  const trip = await c.env.DB
    .prepare('SELECT destination_lat, destination_lng, destination FROM trips WHERE id = ?')
    .bind(tripId)
    .first<{ destination_lat: number | null; destination_lng: number | null; destination: string }>();

  if (!trip) return c.json({ success: false, error: 'Trip not found' }, 404);

  if (!trip.destination_lat || !trip.destination_lng) {
    return c.json({ success: false, error: 'Trip has no coordinates set' }, 400);
  }

  // Check KV cache
  const cacheKey = `weather:${tripId}`;
  const cached = await c.env.SESSIONS.get(cacheKey, 'json');
  if (cached) {
    return c.json({ success: true, data: cached, cached: true });
  }

  // Fetch from Open-Meteo
  const params = new URLSearchParams({
    latitude: trip.destination_lat.toString(),
    longitude: trip.destination_lng.toString(),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max',
    forecast_days: '16',
    timezone: 'auto',
    temperature_unit: 'celsius',
    windspeed_unit: 'kmh',
    precipitation_unit: 'mm',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) {
    return c.json({ success: false, error: 'Weather service unavailable' }, 503);
  }

  const data = await res.json();

  // Cache result (fire and forget)
  c.env.SESSIONS.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL }).catch(() => {});

  return c.json({ success: true, data, cached: false });
});

export default weather;

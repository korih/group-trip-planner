import { Hono } from 'hono';
import type { Env, ContextVariables } from '../types';

const currency = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

const CACHE_TTL = 60 * 60 * 6; // 6 hours

// GET /currency/rates?base=USD
// Proxies open.er-api.com (free, updated daily) with KV caching.
currency.get('/rates', async (c) => {
  const base = c.req.query('base') ?? 'USD';

  // Validate base currency code
  if (!/^[A-Z]{3}$/.test(base)) {
    return c.json({ success: false, error: 'Invalid base currency' }, 400);
  }

  // Check KV cache
  const cacheKey = `currency_rates:${base}`;
  const cached = await c.env.SESSIONS.get(cacheKey, 'json');
  if (cached) {
    return c.json({ success: true, data: cached, cached: true });
  }

  // Fetch from open.er-api.com (free tier, no API key)
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) {
    return c.json({ success: false, error: 'Exchange rate service unavailable' }, 503);
  }

  const data = await res.json<{ rates: Record<string, number>; time_last_update_utc: string }>();

  const result = {
    base,
    rates: data.rates,
    updated_at: data.time_last_update_utc,
  };

  // Cache result (fire and forget)
  c.env.SESSIONS.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL }).catch(() => {});

  return c.json({ success: true, data: result, cached: false });
});

export default currency;

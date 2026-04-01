import type { KVNamespace } from '@cloudflare/workers-types';

export interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Geocode a location string using Nominatim (OpenStreetMap).
 * Results are cached in KV for 30 days to stay within free tier limits.
 *
 * Usage requirements (Nominatim policy):
 * - Max 1 request/second
 * - Must set a descriptive User-Agent
 */
export async function geocode(
  query: string,
  kv: KVNamespace,
): Promise<GeoResult | null> {
  const cacheKey = `geocode:${hashString(query)}`;

  // Check KV cache first
  const cached = await kv.get<GeoResult>(cacheKey, 'json');
  if (cached) return cached;

  // Call Nominatim
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'GroupTripPlanner/1.0 (trip-planning app)',
        'Accept': 'application/json',
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const results = await response.json<Array<{ lat: string; lon: string; display_name: string }>>();
  if (!results.length) return null;

  const result: GeoResult = {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    displayName: results[0].display_name,
  };

  // Cache result (fire and forget)
  kv.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL }).catch(() => {});

  return result;
}

function hashString(str: string): string {
  // Simple djb2 hash for cache keys
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

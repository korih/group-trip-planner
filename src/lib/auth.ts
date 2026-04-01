/**
 * JWT helpers using Web Crypto API (available in Cloudflare Workers).
 * Signs/verifies HMAC-SHA256 JWTs without any external library.
 */

export interface JwtPayload {
  jti: string;  // JWT ID (used as KV key for revocation)
  sub: string;  // user ID
  exp: number;  // expiry timestamp (seconds)
  iat: number;  // issued at
}

export async function signToken(
  payload: Omit<JwtPayload, 'iat'>,
  secret: string,
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const message = `${header}.${body}`;
  const signature = await hmacSign(message, secret);
  return `${message}.${signature}`;
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const message = `${header}.${body}`;

  const expected = await hmacSign(message, secret);
  if (!timingSafeEqual(expected, signature)) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload;
  } catch {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// Internal helpers
// ============================================================

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return base64url(sig);
}

function base64url(input: string | ArrayBuffer): string {
  let str: string;
  if (typeof input === 'string') {
    str = btoa(input);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(input)));
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

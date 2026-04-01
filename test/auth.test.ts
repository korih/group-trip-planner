import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchApp, runMigrations, seedUser, createSession } from './helpers';
import { signToken, verifyToken, generateToken } from '../src/lib/auth';

beforeEach(async () => {
  await runMigrations(env.DB);
});

// ─── JWT helpers ──────────────────────────────────────────────────────────────

describe('signToken / verifyToken', () => {
  const secret = 'test-secret-key';

  it('signs and verifies a valid token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken({ jti: 'abc', sub: 'user-1', exp }, secret);
    const payload = await verifyToken(token, secret);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-1');
    expect(payload?.jti).toBe('abc');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken({ jti: 'abc', sub: 'user-1', exp }, secret);
    const payload = await verifyToken(token, 'wrong-secret');
    expect(payload).toBeNull();
  });

  it('rejects an expired token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 1; // already expired
    const token = await signToken({ jti: 'abc', sub: 'user-1', exp }, secret);
    const payload = await verifyToken(token, secret);
    expect(payload).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyToken('not.a.token', secret)).toBeNull();
    expect(await verifyToken('only-one-part', secret)).toBeNull();
  });
});

describe('generateToken', () => {
  it('produces a hex string of the correct length', () => {
    expect(generateToken(16)).toHaveLength(32);
    expect(generateToken(24)).toHaveLength(48);
  });

  it('produces unique values', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('returns 401 with no session', async () => {
    const res = await fetchApp('GET', '/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid session', async () => {
    const userId = await seedUser(env.DB, { name: 'Alice', email: 'alice@test.com' });
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const res = await fetchApp('GET', '/auth/me', { sessionToken: token });
    expect(res.status).toBe(200);

    const body = await res.json<{ success: boolean; data: { id: string; name: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(userId);
    expect(body.data.name).toBe('Alice');
  });

  it('returns 401 for a token not in KV', async () => {
    // Sign a valid JWT but don't store the session in KV
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken({ jti: 'orphan-jti', sub: 'nobody', exp }, env.JWT_SECRET);

    const res = await fetchApp('GET', '/auth/me', { sessionToken: token });
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('clears the session from KV', async () => {
    const userId = await seedUser(env.DB);
    const token = await createSession(env.SESSIONS, userId, env.JWT_SECRET);

    const logoutRes = await fetchApp('POST', '/auth/logout', { sessionToken: token });
    expect(logoutRes.status).toBe(200);

    // Subsequent /auth/me should return 401
    const meRes = await fetchApp('GET', '/auth/me', { sessionToken: token });
    expect(meRes.status).toBe(401);
  });
});

/**
 * Base API client — typed fetch wrapper with error handling.
 * All API modules import from here.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const guestToken = sessionStorage.getItem('guest_token');
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // send cookies
    headers: {
      'Content-Type': 'application/json',
      ...(guestToken ? { Authorization: `Bearer ${guestToken}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  const json = (await res.json()) as { success: boolean; data?: T; error?: string };

  if (!res.ok || !json.success) {
    throw new ApiError(res.status, json.error ?? 'Unknown error');
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

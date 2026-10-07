import type { PublicUser } from '../shared/types';

const TOKEN_KEY = 'hp_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again?');
  return data as T;
}

type AuthRes = { token: string; user: PublicUser };

export const api = {
  signup: (username: string, password: string, displayName: string) =>
    req<AuthRes>('POST', '/api/auth/signup', { username, password, displayName }),
  login: (username: string, password: string) => req<AuthRes>('POST', '/api/auth/login', { username, password }),
  guest: (displayName: string) => req<AuthRes>('POST', '/api/auth/guest', { displayName }),
  claim: (username: string, password: string) => req<{ user: PublicUser }>('POST', '/api/auth/claim', { username, password }),
  me: () => req<{ user: PublicUser }>('GET', '/api/auth/me'),
  updateMe: (patch: { avatar?: unknown; displayName?: string }) => req<{ user: PublicUser }>('PUT', '/api/auth/me', patch),
};

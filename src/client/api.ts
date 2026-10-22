import type { PublicUser } from '../shared/types';

const TOKEN_KEY = 'hp_token';
const VISITOR_KEY = 'hp_vid';

/** A random, anonymous id for this browser, used only to count visitors. */
export function visitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return 'nostorage' + Math.random().toString(36).slice(2, 12);
  }
}

/** Record one visit per browser session, with where it came from (?ref= tag or referring site). */
export function trackVisit() {
  try {
    if (sessionStorage.getItem('hp_tracked')) return;
    sessionStorage.setItem('hp_tracked', '1');
  } catch {
    /* still send once */
  }
  const q = new URLSearchParams(location.search);
  const src = q.get('ref') || q.get('utm_source') || (document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '');
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vid: visitorId(), src, invite: location.pathname.startsWith('/p/') }),
    keepalive: true,
  }).catch(() => {});
}

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
    req<AuthRes>('POST', '/api/auth/signup', { username, password, displayName, vid: visitorId() }),
  login: (username: string, password: string) => req<AuthRes>('POST', '/api/auth/login', { username, password }),
  guest: (displayName: string) => req<AuthRes>('POST', '/api/auth/guest', { displayName, vid: visitorId() }),
  claim: (username: string, password: string) => req<{ user: PublicUser }>('POST', '/api/auth/claim', { username, password }),
  me: () => req<{ user: PublicUser }>('GET', '/api/auth/me'),
  updateMe: (patch: { avatar?: unknown; displayName?: string }) => req<{ user: PublicUser }>('PUT', '/api/auth/me', patch),
};

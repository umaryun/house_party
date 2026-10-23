import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request } from 'express';
import { users, toPublic, type UserRecord } from './store';
import { sanitizeAvatar } from '../shared/avatar';
import { analytics, VISITOR_ID } from './analytics';

/** Anonymous visitor id the client sends along, so sign-ups can be tied to where visitors came from. */
const visitorId = (v: unknown) => (typeof v === 'string' && VISITOR_ID.test(v) ? v : undefined);

function loadSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // Persist a generated secret so sessions survive restarts in dev.
  const dir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  const file = path.join(dir, 'secret.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).secret;
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ secret }));
    return secret;
  }
}
const SECRET = loadSecret();
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days

export function signToken(userId: string): string {
  const exp = Date.now() + TOKEN_TTL;
  const body = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: unknown): UserRecord | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${userId}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return users.get(userId) ?? null;
}

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function cleanDisplayName(name: unknown, fallback: string): string {
  if (typeof name !== 'string') return fallback;
  const cleaned = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return cleaned.length >= 1 ? cleaned : fallback;
}

function authed(req: Request): UserRecord | null {
  const h = req.headers.authorization;
  return verifyToken(h?.startsWith('Bearer ') ? h.slice(7) : null);
}

// Simple in-memory rate limit for auth endpoints.
const attempts = new Map<string, { n: number; reset: number }>();
function rateLimited(key: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  a.n++;
  return a.n > max;
}

export const authRouter = Router();

authRouter.post('/signup', (req, res) => {
  if (rateLimited(`signup:${req.ip}`)) return res.status(429).json({ error: 'Slow down a little and try again.' });
  const { username, password, displayName } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Usernames are 3–20 letters, numbers or underscores.' });
  if (typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ error: 'Passwords need at least 6 characters.' });
  if (users.getByUsername(username)) return res.status(409).json({ error: 'That username is taken.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const u = users.create({
    username: username.toLowerCase(),
    displayName: cleanDisplayName(displayName, username),
    passHash: hashPassword(password, salt),
    salt,
    avatar: null,
    guest: false,
  });
  analytics.track('signup', { uid: u.id, vid: visitorId(req.body?.vid), p: { guest: false } });
  res.json({ token: signToken(u.id), user: toPublic(u) });
});

authRouter.post('/login', (req, res) => {
  if (rateLimited(`login:${req.ip}`)) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  const { username, password } = req.body ?? {};
  const u = typeof username === 'string' ? users.getByUsername(username) : undefined;
  if (!u || !u.salt || !u.passHash || typeof password !== 'string')
    return res.status(401).json({ error: 'Wrong username or password.' });
  const a = Buffer.from(hashPassword(password, u.salt), 'hex');
  const b = Buffer.from(u.passHash, 'hex');
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: signToken(u.id), user: toPublic(u) });
});

authRouter.post('/guest', (req, res) => {
  if (rateLimited(`guest:${req.ip}`, 30)) return res.status(429).json({ error: 'Slow down a little and try again.' });
  const name = cleanDisplayName(req.body?.displayName, `Guest${Math.floor(Math.random() * 9000 + 1000)}`);
  const u = users.create({
    username: `guest_${crypto.randomBytes(5).toString('hex')}`,
    displayName: name,
    passHash: null,
    salt: null,
    avatar: null,
    guest: true,
  });
  analytics.track('signup', { uid: u.id, vid: visitorId(req.body?.vid), p: { guest: true } });
  res.json({ token: signToken(u.id), user: toPublic(u) });
});

/** Turn a guest account into a full account, keeping its character and stats. */
authRouter.post('/claim', (req, res) => {
  const u = authed(req);
  if (!u) return res.status(401).json({ error: 'Not signed in.' });
  if (!u.guest) return res.status(400).json({ error: 'Already a full account.' });
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Usernames are 3–20 letters, numbers or underscores.' });
  if (typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ error: 'Passwords need at least 6 characters.' });
  if (users.getByUsername(username)) return res.status(409).json({ error: 'That username is taken.' });
  const salt = crypto.randomBytes(16).toString('hex');
  users.update(u.id, { username: username.toLowerCase(), salt, passHash: hashPassword(password, salt), guest: false });
  analytics.track('account_saved', { uid: u.id });
  res.json({ user: toPublic(u) });
});

authRouter.get('/me', (req, res) => {
  const u = authed(req);
  if (!u) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: toPublic(u) });
});

authRouter.put('/me', (req, res) => {
  const u = authed(req);
  if (!u) return res.status(401).json({ error: 'Not signed in.' });
  const patch: Partial<UserRecord> = {};
  if (req.body?.avatar !== undefined) patch.avatar = sanitizeAvatar(req.body.avatar);
  if (req.body?.displayName !== undefined) patch.displayName = cleanDisplayName(req.body.displayName, u.displayName);
  if (patch.avatar && !u.avatar) analytics.track('character_created', { uid: u.id });
  const updated = users.update(u.id, patch)!;
  res.json({ user: toPublic(updated) });
});

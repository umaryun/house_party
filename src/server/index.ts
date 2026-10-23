import express from 'express';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Server } from 'socket.io';
import { authRouter, verifyToken } from './auth';
import { PartyManager } from './parties';
import { users } from './store';
import { analytics, cleanSource, VISITOR_ID } from './analytics';
import { computeStats } from './stats';
import type { Ack } from '../shared/types';

const PORT = Number(process.env.PORT) || 3001;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use('/api/auth', authRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true },
  pingInterval: 10_000,
  pingTimeout: 15_000,
  maxHttpBufferSize: 1e5,
});
const parties = new PartyManager(io);

app.get('/api/parties', (_req, res) => res.json({ parties: parties.listPublic() }));

// ───── analytics ─────

const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + 60_000 });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  return ++h.n > max;
}

/** One anonymous "visit" per browser session: a random visitor id and where they came from. */
app.post('/api/track', (req, res) => {
  if (limited(`track:${req.ip}`, 30)) return res.status(429).end();
  const vid = req.body?.vid;
  if (typeof vid !== 'string' || !VISITOR_ID.test(vid)) return res.status(400).end();
  analytics.track('visit', { vid, p: { src: cleanSource(req.body?.src), invite: req.body?.invite === true } });
  res.status(204).end();
});

// The dashboard is off unless ADMIN_KEY is set (e.g. as a Railway variable).
const ADMIN_KEY = process.env.ADMIN_KEY ?? '';
const keyHash = (k: string) => crypto.createHash('sha256').update(k).digest();
app.get('/api/admin/stats', (req, res) => {
  if (!ADMIN_KEY) return res.status(404).json({ error: 'The analytics dashboard is off. Set the ADMIN_KEY variable to turn it on.' });
  if (limited(`admin:${req.ip}`, 60)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  const h = req.headers.authorization;
  const given = h?.startsWith('Bearer ') ? h.slice(7) : '';
  if (!crypto.timingSafeEqual(keyHash(given), keyHash(ADMIN_KEY))) return res.status(401).json({ error: 'Wrong admin key.' });
  const days = Math.min(365, Math.max(1, Math.floor(Number(req.query.days) || 30)));
  res.set('Cache-Control', 'no-store');
  res.json(computeStats(analytics.all(), { now: Date.now(), days, live: parties.liveStats() }));
});
app.get('/api/parties/:code', (req, res) => {
  const p = parties.get(req.params.code);
  if (!p) return res.status(404).json({ error: 'Party not found' });
  res.json({ party: p.summary() });
});

io.use((socket, next) => {
  const user = verifyToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.userId = user.id;
  socket.data.partyCode = null;
  next();
});

const reply = <T>(ack: unknown, res: { ok: true; data: T } | { ok: false; error: string }) => {
  if (typeof ack === 'function') (ack as Ack<T>)(res);
};

io.on('connection', (socket) => {
  const uid: string = socket.data.userId;
  const user = () => users.get(uid)!;
  const party = () => parties.get(socket.data.partyCode);

  socket.on('party:create', (data: any, ack: unknown) => {
    if (!user().avatar) return reply(ack, { ok: false, error: 'Create your character first!' });
    party()?.leave(uid);
    const p = parties.create(user(), data?.name, data?.isPublic);
    const r = p.join(socket, user());
    if (r.ok) {
      analytics.track('party_created', { uid, p: { public: p.isPublic } });
      analytics.track('party_joined', { uid, p: { via: 'host' } });
    }
    reply(ack, r.ok ? { ok: true, data: { code: p.code } } : r);
  });

  socket.on('party:join', (data: any, ack: unknown) => {
    const p = parties.get(data?.code);
    if (!p) return reply(ack, { ok: false, error: 'No party with that code. Double-check it? 🤔' });
    if (!user().avatar) return reply(ack, { ok: false, error: 'Create your character first!' });
    const current = party();
    if (current && current !== p) current.leave(uid);
    const r = p.join(socket, user());
    if (r.ok && r.firstJoin) {
      const via = ['invite', 'code', 'public'].includes(data?.via) ? data.via : 'code';
      analytics.track('party_joined', { uid, p: { via } });
    }
    reply(ack, r.ok ? { ok: true, data: { code: p.code } } : r);
  });

  socket.on('party:leave', () => {
    party()?.leave(uid);
    socket.data.partyCode = null;
  });

  socket.on('party:list', (_d: unknown, ack: unknown) => reply(ack, { ok: true, data: parties.listPublic() }));
  socket.on('party:settings', (d: any) => party()?.updateSettings(uid, d ?? {}));
  socket.on('party:kick', (d: any) => party()?.kick(uid, d?.id));
  socket.on('profile:updated', () => party()?.updateProfile(user()));

  socket.on('move', (d: any) => party()?.move(uid, d ?? {}));
  socket.on('action', (d: any) => party()?.setAction(uid, d?.action, d?.danceMove));
  socket.on('emote', (d: any) => party()?.emote(uid, d?.emote));
  socket.on('hold', (d: any) => party()?.hold(uid, d?.item));
  socket.on('dj', (d: any) => party()?.setTrack(uid, d?.track));
  socket.on('chat', (d: any, ack: unknown) => {
    const err = party()?.sendChat(uid, d?.text, d?.to) ?? null;
    reply(ack, err ? { ok: false, error: err } : { ok: true, data: null });
  });

  const gameCmd = (fn: (p: NonNullable<ReturnType<typeof party>>) => string | null | void) => (_d: unknown, ack: unknown) => {
    const p = party();
    if (!p) return reply(ack, { ok: false, error: 'You are not in a party.' });
    const err = fn(p);
    reply(ack, err ? { ok: false, error: err } : { ok: true, data: null });
  };
  socket.on('game:create', (d: any, ack: unknown) => gameCmd((p) => p.createGame(uid, d?.type))(d, ack));
  socket.on('game:join', gameCmd((p) => p.joinGame(uid)));
  socket.on('game:leave', gameCmd((p) => p.leaveGame(uid)));
  socket.on('game:start', gameCmd((p) => p.startGame(uid)));
  socket.on('game:rematch', gameCmd((p) => p.rematch(uid)));
  socket.on('game:close', gameCmd((p) => p.closeGame(uid)));
  socket.on('game:action', (d: unknown) => party()?.gameAction(uid, d));

  socket.on('disconnect', () => party()?.disconnect(uid, socket.id));
});

// Serve the built client in production.
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, () => console.log(`🎉 House Party server on http://localhost:${PORT}`));

// Hosts like Railway send SIGTERM on redeploy: save accounts and analytics before exiting.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    users.flush();
    analytics.flush();
    process.exit(0);
  });
}

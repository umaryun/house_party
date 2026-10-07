import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { Server } from 'socket.io';
import { authRouter, verifyToken } from './auth';
import { PartyManager } from './parties';
import { users } from './store';
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
    reply(ack, r.ok ? { ok: true, data: { code: p.code } } : r);
  });

  socket.on('party:join', (data: any, ack: unknown) => {
    const p = parties.get(data?.code);
    if (!p) return reply(ack, { ok: false, error: 'No party with that code. Double-check it? 🤔' });
    if (!user().avatar) return reply(ack, { ok: false, error: 'Create your character first!' });
    const current = party();
    if (current && current !== p) current.leave(uid);
    const r = p.join(socket, user());
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

import crypto from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { randomSpawn, isWalkable, MAP_W, MAP_H, type Dir } from '../shared/map';
import {
  EMOTES,
  GAMES,
  MUSIC_TRACKS,
  type ChatMessage,
  type Emote,
  type GameEnvelope,
  type GameResults,
  type GameStatus,
  type GameType,
  type HeldItem,
  type MusicTrack,
  type PartySnapshot,
  type PartySummary,
  type PlayerState,
} from '../shared/types';
import { randomAvatar } from '../shared/avatar';
import { users, type UserRecord } from './store';
import { analytics } from './analytics';
import { cleanDisplayName } from './auth';
import { Game, type GameContext } from './games/base';
import { DrawGame } from './games/draw';
import { MafiaGame } from './games/mafia';
import { CharadesGame } from './games/charades';
import { ImposterGame } from './games/imposter';

const MAX_PLAYERS = 24;
const RECONNECT_GRACE_MS = 45_000;
const EMPTY_PARTY_TTL_MS = 10 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface Member extends PlayerState {
  socketId: string | null;
  leaveTimer: NodeJS.Timeout | null;
  chatTimes: number[];
}

interface GameSession {
  type: GameType;
  status: GameStatus;
  hostId: string;
  participants: string[];
  instance: Game | null;
  results?: GameResults;
  startedAt?: number;
}

const GAME_CLASSES: Record<GameType, new (ctx: GameContext, players: string[]) => Game> = {
  draw: DrawGame,
  mafia: MafiaGame,
  charades: CharadesGame,
  imposter: ImposterGame,
};

export class Party {
  members = new Map<string, Member>();
  chat: ChatMessage[] = [];
  track: MusicTrack = 'House Party';
  game: GameSession | null = null;
  dirtyMoves = new Set<string>();
  emptySince: number | null = Date.now();
  private gameUpdateQueued = false;

  constructor(
    private io: Server,
    public code: string,
    public name: string,
    public isPublic: boolean,
    public hostId: string,
  ) {}

  get room() {
    return `party:${this.code}`;
  }

  connectedCount() {
    let n = 0;
    for (const m of this.members.values()) if (m.connected) n++;
    return n;
  }

  summary(): PartySummary {
    const host = this.members.get(this.hostId);
    return {
      code: this.code,
      name: this.name,
      hostName: host?.name ?? '—',
      playerCount: this.connectedCount(),
      maxPlayers: MAX_PLAYERS,
      isPublic: this.isPublic,
      activeGame: this.game && this.game.status !== 'ended' ? this.game.type : null,
      vibe: this.track,
    };
  }

  private publicPlayer(m: Member): PlayerState {
    const { socketId: _s, leaveTimer: _l, chatTimes: _c, ...p } = m;
    return { ...p, isHost: m.id === this.hostId };
  }

  snapshot(selfId: string): PartySnapshot {
    return {
      code: this.code,
      name: this.name,
      isPublic: this.isPublic,
      hostId: this.hostId,
      selfId,
      players: [...this.members.values()].map((m) => this.publicPlayer(m)),
      chat: this.chat.filter((c) => c.kind !== 'dm' || c.from === selfId || c.to === selfId).slice(-80),
      track: this.track,
      serverTime: Date.now(),
    };
  }

  /** firstJoin is false when an existing member reconnects or opens a second tab. */
  join(socket: Socket, user: UserRecord): { ok: true; firstJoin: boolean } | { ok: false; error: string } {
    const existing = this.members.get(user.id);
    if (!existing && this.connectedCount() >= MAX_PLAYERS) return { ok: false, error: 'This party is full! 🎈' };

    if (existing) {
      // Reconnect / second tab: take over the character.
      if (existing.socketId && existing.socketId !== socket.id) {
        const old = this.io.sockets.sockets.get(existing.socketId);
        old?.emit('kicked', 'You joined this party from another tab.');
        old?.leave(this.room);
        if (old) old.data.partyCode = null;
      }
      if (existing.leaveTimer) clearTimeout(existing.leaveTimer);
      existing.leaveTimer = null;
      existing.socketId = socket.id;
      const wasConnected = existing.connected;
      existing.connected = true;
      existing.name = user.displayName;
      existing.avatar = user.avatar ?? existing.avatar;
      socket.join(this.room);
      socket.data.partyCode = this.code;
      this.emptySince = null;
      socket.emit('party:state', this.snapshot(user.id));
      socket.to(this.room).emit('player:update', { id: user.id, connected: true, name: existing.name, avatar: existing.avatar });
      if (!wasConnected) this.system(`${existing.name} is back! 👋`);
      this.sendGameTo(user.id);
      return { ok: true, firstJoin: false };
    }

    const spawn = randomSpawn();
    const m: Member = {
      id: user.id,
      userId: user.id,
      name: user.displayName,
      avatar: user.avatar ?? randomAvatar(),
      x: spawn.x,
      y: spawn.y,
      dir: 'down',
      moving: false,
      action: 'idle',
      danceMove: 0,
      held: 'none',
      isHost: false,
      connected: true,
      socketId: socket.id,
      leaveTimer: null,
      chatTimes: [],
    };
    if (!this.members.has(this.hostId) && this.members.size === 0) this.hostId = user.id;
    this.members.set(user.id, m);
    users.bumpStats(user.id, { parties: 1 });
    socket.join(this.room);
    socket.data.partyCode = this.code;
    this.emptySince = null;
    socket.emit('party:state', this.snapshot(user.id));
    socket.to(this.room).emit('player:joined', this.publicPlayer(m));
    socket.to(this.room).emit('sfx', 'join');
    this.system(`${m.name} arrived at the party! 🎉`);
    this.sendGameTo(user.id);
    return { ok: true, firstJoin: true };
  }

  /** Socket dropped: keep the character around briefly so phones can reconnect seamlessly. */
  disconnect(pid: string, socketId: string) {
    const m = this.members.get(pid);
    if (!m || m.socketId !== socketId) return;
    m.connected = false;
    m.socketId = null;
    m.moving = false;
    this.io.to(this.room).emit('player:update', { id: pid, connected: false, moving: false });
    m.leaveTimer = setTimeout(() => this.remove(pid, 'left'), RECONNECT_GRACE_MS);
    if (this.connectedCount() === 0) this.emptySince = Date.now();
  }

  leave(pid: string) {
    const m = this.members.get(pid);
    if (!m) return;
    if (m.socketId) {
      const s = this.io.sockets.sockets.get(m.socketId);
      s?.leave(this.room);
      if (s) s.data.partyCode = null;
    }
    this.remove(pid, 'left');
  }

  kick(by: string, pid: string) {
    if (by !== this.hostId || pid === by) return;
    const m = this.members.get(pid);
    if (!m) return;
    if (m.socketId) {
      const s = this.io.sockets.sockets.get(m.socketId);
      s?.emit('kicked', 'The host removed you from the party.');
      s?.leave(this.room);
      if (s) s.data.partyCode = null;
    }
    this.remove(pid, 'kicked');
  }

  private remove(pid: string, why: 'left' | 'kicked') {
    const m = this.members.get(pid);
    if (!m) return;
    if (m.leaveTimer) clearTimeout(m.leaveTimer);
    this.members.delete(pid);
    this.dirtyMoves.delete(pid);
    this.io.to(this.room).emit('player:left', pid);
    this.system(why === 'kicked' ? `${m.name} was shown the door. 🚪` : `${m.name} left the party.`);
    this.removeFromGame(pid);
    if (pid === this.hostId) {
      const next = [...this.members.values()].find((x) => x.connected) ?? [...this.members.values()][0];
      if (next) {
        this.hostId = next.id;
        this.system(`${next.name} is now the host. 👑`);
        this.broadcastMeta();
      }
    }
    if (this.connectedCount() === 0 && this.emptySince === null) this.emptySince = Date.now();
  }

  isExpired(now: number) {
    return this.emptySince !== null && now - this.emptySince > EMPTY_PARTY_TTL_MS;
  }

  dispose() {
    this.game?.instance?.dispose();
    for (const m of this.members.values()) if (m.leaveTimer) clearTimeout(m.leaveTimer);
  }

  broadcastMeta() {
    this.io.to(this.room).emit('party:meta', { name: this.name, isPublic: this.isPublic, hostId: this.hostId, track: this.track });
  }

  updateSettings(by: string, data: { name?: unknown; isPublic?: unknown }) {
    if (by !== this.hostId) return;
    if (typeof data.name === 'string') this.name = cleanDisplayName(data.name.slice(0, 32), this.name);
    if (typeof data.isPublic === 'boolean') this.isPublic = data.isPublic;
    this.broadcastMeta();
  }

  // ───────────── world ─────────────

  move(pid: string, d: { x?: unknown; y?: unknown; dir?: unknown; moving?: unknown }) {
    const m = this.members.get(pid);
    if (!m) return;
    const x = Number(d.x);
    const y = Number(d.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > MAP_W || y > MAP_H) return;
    // Reject teleports through walls; tolerate small jitter.
    if (!isWalkable(x, y) && Math.hypot(x - m.x, y - m.y) > 1.6) return; // allow stepping onto seats
    if (Math.hypot(x - m.x, y - m.y) > 4) return;
    m.x = x;
    m.y = y;
    if (d.dir === 'up' || d.dir === 'down' || d.dir === 'left' || d.dir === 'right') m.dir = d.dir as Dir;
    m.moving = !!d.moving;
    if (m.moving && m.action !== 'idle') {
      m.action = 'idle';
      this.io.to(this.room).emit('player:update', { id: pid, action: 'idle' });
    }
    this.dirtyMoves.add(pid);
  }

  flushMoves() {
    if (!this.dirtyMoves.size) return;
    const list = [];
    for (const id of this.dirtyMoves) {
      const m = this.members.get(id);
      if (m) list.push({ id, x: +m.x.toFixed(3), y: +m.y.toFixed(3), dir: m.dir, moving: m.moving });
    }
    this.dirtyMoves.clear();
    this.io.to(this.room).volatile.emit('moves', list);
  }

  setAction(pid: string, action: unknown, danceMove: unknown) {
    const m = this.members.get(pid);
    if (!m) return;
    if (action !== 'idle' && action !== 'dance' && action !== 'sit') return;
    m.action = action;
    m.danceMove = Math.max(0, Math.min(5, Math.floor(Number(danceMove) || 0)));
    this.io.to(this.room).emit('player:update', { id: pid, action: m.action, danceMove: m.danceMove });
  }

  emote(pid: string, emote: unknown) {
    if (!this.members.has(pid) || !(EMOTES as readonly string[]).includes(emote as string)) return;
    this.io.to(this.room).emit('emote', { id: pid, emote: emote as Emote });
  }

  hold(pid: string, item: unknown) {
    const m = this.members.get(pid);
    const allowed: HeldItem[] = ['none', 'drink', 'pizza', 'marshmallow', 'burger'];
    if (!m || !allowed.includes(item as HeldItem)) return;
    m.held = item as HeldItem;
    this.io.to(this.room).emit('player:update', { id: pid, held: m.held });
  }

  setTrack(pid: string, track: unknown) {
    const m = this.members.get(pid);
    if (!m || !(MUSIC_TRACKS as readonly string[]).includes(track as string) || track === this.track) return;
    this.track = track as MusicTrack;
    this.broadcastMeta();
    this.system(`🎧 ${m.name} switched the music to ${this.track}`);
  }

  updateProfile(user: UserRecord) {
    const m = this.members.get(user.id);
    if (!m) return;
    m.name = user.displayName;
    if (user.avatar) m.avatar = user.avatar;
    this.io.to(this.room).emit('player:update', { id: m.id, name: m.name, avatar: m.avatar });
  }

  // ───────────── chat ─────────────

  sendChat(pid: string, text: unknown, to?: unknown): string | null {
    const m = this.members.get(pid);
    if (!m || typeof text !== 'string') return 'Invalid message';
    const clean = text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 280);
    if (!clean) return null;
    const now = Date.now();
    m.chatTimes = m.chatTimes.filter((t) => now - t < 5000);
    if (m.chatTimes.length >= 6) return 'Whoa, slow down! 🐢';
    m.chatTimes.push(now);
    analytics.track('chat', { uid: pid, ...(typeof to === 'string' && to ? { p: { dm: true } } : {}) });
    const msg: ChatMessage = { id: crypto.randomUUID(), from: pid, fromName: m.name, text: clean, ts: now, kind: 'chat' };
    if (typeof to === 'string' && to) {
      const target = this.members.get(to);
      if (!target) return 'They left the party.';
      msg.kind = 'dm';
      msg.to = to;
      msg.toName = target.name;
      this.pushChat(msg);
      const sockets = [m.socketId, target.socketId].filter(Boolean) as string[];
      for (const s of sockets) this.io.to(s).emit('chat', msg);
      return null;
    }
    this.pushChat(msg);
    this.io.to(this.room).emit('chat', msg);
    return null;
  }

  system(text: string) {
    const msg: ChatMessage = { id: crypto.randomUUID(), from: 'system', fromName: 'House Party', text, ts: Date.now(), kind: 'system' };
    this.pushChat(msg);
    this.io.to(this.room).emit('chat', msg);
  }

  private pushChat(msg: ChatMessage) {
    this.chat.push(msg);
    if (this.chat.length > 200) this.chat.splice(0, this.chat.length - 200);
  }

  // ───────────── games ─────────────

  private ctxFor(session: GameSession): GameContext {
    return {
      nameOf: (id) => this.members.get(id)?.name ?? 'Someone',
      avatarOf: (id) => this.members.get(id)?.avatar,
      isConnected: (id) => !!this.members.get(id)?.connected,
      update: () => this.queueGameUpdate(),
      emit: (to, event, payload) => {
        if (to === 'all') this.io.to(this.room).emit(event, payload);
        else if (to === 'spectators') {
          for (const m of this.members.values()) if (!session.participants.includes(m.id) && m.socketId) this.io.to(m.socketId).emit(event, payload);
        } else {
          const sid = this.members.get(to)?.socketId;
          if (sid) this.io.to(sid).emit(event, payload);
        }
      },
      sfx: (to, name) => {
        const ids = to === 'all' ? [...this.members.keys()] : Array.isArray(to) ? to : [to];
        for (const id of ids) {
          const sid = this.members.get(id)?.socketId;
          if (sid) this.io.to(sid).emit('sfx', name);
        }
      },
      emote: (id, emote) => this.emote(id, emote),
      finish: (results) => {
        if (this.game !== session || session.status === 'ended') return;
        session.status = 'ended';
        session.results = results;
        session.instance?.dispose();
        for (const p of session.participants) users.bumpStats(p, { gamesPlayed: 1, wins: results.winners.includes(p) ? 1 : 0 });
        analytics.track('game_finished', { p: { game: session.type, ms: Date.now() - (session.startedAt ?? Date.now()) } });
        this.system(`🏆 ${GAMES[session.type].emoji} ${GAMES[session.type].name}: ${results.headline}`);
        for (const w of results.winners) this.emote(w, 'party');
        this.ctxFor(session).sfx(session.participants, 'win');
        this.queueGameUpdate();
        // Leave the results up for a while, then tidy up if nobody started a rematch.
        setTimeout(() => {
          if (this.game === session && session.status === 'ended') {
            this.game = null;
            this.queueGameUpdate();
          }
        }, 120_000);
      },
    };
  }

  createGame(pid: string, type: unknown): string | null {
    if (!(type as string in GAMES)) return 'Unknown game';
    if (this.game && this.game.status !== 'ended') return 'A game is already running. Join it or wait for it to finish!';
    this.game?.instance?.dispose();
    this.game = { type: type as GameType, status: 'lobby', hostId: pid, participants: [pid], instance: null };
    const info = GAMES[type as GameType];
    this.system(`${info.emoji} ${this.members.get(pid)?.name} is starting ${info.name}! Tap Join to play.`);
    this.io.to(this.room).emit('sfx', 'invite');
    this.queueGameUpdate();
    return null;
  }

  joinGame(pid: string): string | null {
    const g = this.game;
    if (!g || g.status !== 'lobby') return 'There is no game lobby open right now.';
    if (g.participants.includes(pid)) return null;
    if (g.participants.length >= GAMES[g.type].maxPlayers) return 'The game is full.';
    g.participants.push(pid);
    this.queueGameUpdate();
    return null;
  }

  leaveGame(pid: string) {
    this.removeFromGame(pid);
  }

  private removeFromGame(pid: string) {
    const g = this.game;
    if (!g || !g.participants.includes(pid)) return;
    g.participants = g.participants.filter((p) => p !== pid);
    if (g.status === 'playing') g.instance?.leave(pid);
    if (g.hostId === pid) {
      if (g.participants.length) g.hostId = g.participants[0];
      else {
        g.instance?.dispose();
        this.game = null;
      }
    }
    if (this.game && this.game.status === 'lobby' && !this.game.participants.length) this.game = null;
    this.queueGameUpdate();
  }

  startGame(pid: string): string | null {
    const g = this.game;
    if (!g || g.status !== 'lobby') return 'No lobby to start.';
    if (g.hostId !== pid) return 'Only the game host can start.';
    g.participants = g.participants.filter((p) => this.members.get(p)?.connected);
    const info = GAMES[g.type];
    if (g.participants.length < info.minPlayers) return `${info.name} needs at least ${info.minPlayers} players.`;
    g.status = 'playing';
    g.startedAt = Date.now();
    g.instance = new GAME_CLASSES[g.type](this.ctxFor(g), [...g.participants]);
    g.instance.start();
    analytics.track('game_started', { uids: [...g.participants], p: { game: g.type } });
    this.io.to(this.room).emit('sfx', 'start');
    this.queueGameUpdate();
    return null;
  }

  /** After a game ends: host can send everyone back to the lobby with the same crew. */
  rematch(pid: string): string | null {
    const g = this.game;
    if (!g || g.status !== 'ended') return 'Nothing to rematch.';
    g.participants = g.participants.filter((p) => this.members.get(p)?.connected);
    if (!g.participants.includes(pid)) g.participants.unshift(pid);
    g.hostId = pid;
    g.status = 'lobby';
    g.instance = null;
    g.results = undefined;
    this.system(`🔁 ${this.members.get(pid)?.name} wants a rematch of ${GAMES[g.type].name}!`);
    this.queueGameUpdate();
    return null;
  }

  closeGame(pid: string) {
    const g = this.game;
    if (!g) return;
    if (g.status === 'playing' && g.hostId !== pid) return;
    if (g.status === 'playing') this.system(`${GAMES[g.type].name} was ended early.`);
    g.instance?.dispose();
    this.game = null;
    this.queueGameUpdate();
  }

  gameAction(pid: string, action: unknown) {
    const g = this.game;
    if (!g || g.status !== 'playing' || !g.instance) return;
    g.instance.action(pid, action);
  }

  private queueGameUpdate() {
    if (this.gameUpdateQueued) return;
    this.gameUpdateQueued = true;
    setImmediate(() => {
      this.gameUpdateQueued = false;
      for (const id of this.members.keys()) this.sendGameTo(id);
    });
  }

  private sendGameTo(pid: string) {
    const m = this.members.get(pid);
    if (!m?.socketId) return;
    this.io.to(m.socketId).emit('game', this.envelope(pid));
  }

  private envelope(pid: string): GameEnvelope | null {
    const g = this.game;
    if (!g) return null;
    return {
      type: g.type,
      status: g.status,
      hostId: g.hostId,
      participants: g.participants,
      serverTime: Date.now(),
      view: g.instance ? g.instance.view(pid) : null,
      results: g.results,
    };
  }
}

export class PartyManager {
  parties = new Map<string, Party>();

  constructor(private io: Server) {
    setInterval(() => {
      for (const p of this.parties.values()) p.flushMoves();
    }, 66);
    setInterval(() => {
      const now = Date.now();
      for (const [code, p] of this.parties) {
        if (p.isExpired(now)) {
          p.dispose();
          this.parties.delete(code);
        }
      }
    }, 30_000);
  }

  newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.parties.has(code)) return code;
    }
  }

  create(host: UserRecord, name: unknown, isPublic: unknown): Party {
    const code = this.newCode();
    const p = new Party(
      this.io,
      code,
      cleanDisplayName(typeof name === 'string' ? name.slice(0, 32) : '', `${host.displayName}'s House Party`),
      isPublic === true,
      host.id,
    );
    this.parties.set(code, p);
    return p;
  }

  get(code: unknown) {
    return typeof code === 'string' ? this.parties.get(code.toUpperCase().trim()) : undefined;
  }

  liveStats() {
    let playersOnline = 0;
    let partiesLive = 0;
    let gamesRunning = 0;
    for (const p of this.parties.values()) {
      const n = p.connectedCount();
      playersOnline += n;
      if (n === 0) continue;
      partiesLive++;
      if (p.game?.status === 'playing') gamesRunning++;
    }
    return { playersOnline, partiesLive, gamesRunning };
  }

  listPublic(): PartySummary[] {
    return [...this.parties.values()]
      .filter((p) => p.isPublic && p.connectedCount() > 0)
      .map((p) => p.summary())
      .sort((a, b) => b.playerCount - a.playerCount)
      .slice(0, 50);
  }
}

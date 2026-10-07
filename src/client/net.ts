import { io, type Socket } from 'socket.io-client';
import type { ChatMessage, DrawSegment, GameEnvelope, MoveUpdate, PartySnapshot, PlayerState } from '../shared/types';
import { getState, setState, toast } from './store';
import { getToken, setToken } from './api';
import { sound } from './sound';
import type { World } from './world/World';

let socket: Socket | null = null;
export const bridge: { world: World | null; chatOpen: boolean } = { world: null, chatOpen: false };

type DrawListener = { seg(s: DrawSegment): void; full(s: DrawSegment[]): void };
const drawListeners = new Set<DrawListener>();
export function onDraw(l: DrawListener) {
  drawListeners.add(l);
  return () => {
    drawListeners.delete(l);
  };
}

export function connectSocket() {
  if (socket) return socket;
  const s = io({ auth: (cb) => cb({ token: getToken() }), transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
  socket = s;

  s.on('connect', () => {
    setState({ connected: true });
    const party = getState().party;
    if (party) {
      // seamless rejoin after a network blip
      request('party:join', { code: party.code }).catch(() => {
        toast('The party ended while you were away.', 'error');
        leaveLocal();
      });
    }
  });
  s.on('disconnect', () => setState({ connected: false }));
  s.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      setToken(null);
      disconnectSocket();
      setState({ user: null, screen: 'landing' });
    }
  });

  s.on('party:state', (snap: PartySnapshot) => {
    const players: Record<string, PlayerState> = {};
    for (const p of snap.players) players[p.id] = p;
    setState({
      party: { code: snap.code, name: snap.name, isPublic: snap.isPublic, hostId: snap.hostId, selfId: snap.selfId, track: snap.track },
      players,
      chat: snap.chat,
      clockOffset: snap.serverTime - Date.now(),
      screen: 'party',
    });
    bridge.world?.setPlayers(snap.players);
    try {
      history.replaceState(null, '', `/p/${snap.code}`);
    } catch {
      /* ignore */
    }
  });
  s.on('party:meta', (m) => {
    setState((st) => (st.party ? { party: { ...st.party, ...m } } : {}));
    const players = getState().players;
    const next: Record<string, PlayerState> = {};
    for (const [id, p] of Object.entries(players)) next[id] = { ...p, isHost: id === m.hostId };
    setState({ players: next });
    for (const id of Object.keys(next)) bridge.world?.updatePlayer({ id, isHost: id === m.hostId });
  });
  s.on('player:joined', (p: PlayerState) => {
    setState((st) => ({ players: { ...st.players, [p.id]: p } }));
    bridge.world?.addPlayer(p);
  });
  s.on('player:left', (id: string) => {
    setState((st) => {
      const players = { ...st.players };
      delete players[id];
      return { players };
    });
    bridge.world?.removePlayer(id);
  });
  s.on('player:update', (u: Partial<PlayerState> & { id: string }) => {
    setState((st) => (st.players[u.id] ? { players: { ...st.players, [u.id]: { ...st.players[u.id], ...u } } } : {}));
    bridge.world?.updatePlayer(u);
  });
  s.on('moves', (list: MoveUpdate[]) => bridge.world?.applyMoves(list));
  s.on('emote', (e: { id: string; emote: string }) => bridge.world?.showEmote(e.id, e.emote));
  s.on('chat', (m: ChatMessage) => {
    const selfId = getState().party?.selfId;
    setState((st) => ({
      chat: [...st.chat.slice(-150), m],
      unread: bridge.chatOpen || m.kind === 'system' || m.from === selfId ? st.unread : st.unread + 1,
    }));
    if (m.kind === 'chat' || m.kind === 'dm') {
      if (m.kind === 'chat') bridge.world?.showBubble(m.from, m.text);
      if (m.from !== selfId) sound.play(m.kind === 'dm' ? 'dm' : 'message');
    }
  });
  s.on('game', (g: GameEnvelope | null) => {
    const prev = getState().game;
    setState({ game: g, ...(g ? { clockOffset: g.serverTime - Date.now() } : {}) });
    if (g && (!prev || prev.status !== g.status) && g.status === 'lobby' && g.hostId !== getState().party?.selfId) {
      // banner handled in UI
    }
  });
  s.on('draw:seg', (seg: DrawSegment) => drawListeners.forEach((l) => l.seg(seg)));
  s.on('draw:full', (segs: DrawSegment[]) => drawListeners.forEach((l) => l.full(segs)));
  s.on('toast', (t: { text: string; kind?: 'info' | 'success' | 'error' }) => toast(t.text, t.kind));
  s.on('sfx', (name: string) => sound.play(name));
  s.on('kicked', (reason: string) => {
    toast(reason, 'error');
    leaveLocal();
  });
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function emit(event: string, data?: unknown) {
  socket?.emit(event, data);
}

export function request<T = unknown>(event: string, data?: unknown, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Not connected'));
    const timer = setTimeout(() => reject(new Error('The server took too long. Check your connection?')), timeout);
    socket.emit(event, data, (res: { ok: boolean; data?: T; error?: string }) => {
      clearTimeout(timer);
      if (res?.ok) resolve(res.data as T);
      else reject(new Error(res?.error || 'Something went wrong'));
    });
  });
}

export function leaveLocal() {
  setState({ party: null, players: {}, chat: [], game: null, unread: 0, screen: 'home' });
  try {
    history.replaceState(null, '', '/');
  } catch {
    /* ignore */
  }
}

export function leaveParty() {
  emit('party:leave');
  leaveLocal();
}

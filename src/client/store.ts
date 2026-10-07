import { useSyncExternalStore } from 'react';
import type { ChatMessage, GameEnvelope, MusicTrack, PlayerState, PublicUser } from '../shared/types';

export type Screen = 'loading' | 'landing' | 'creator' | 'home' | 'party';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export interface PartyMeta {
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  selfId: string;
  track: MusicTrack;
}

export interface State {
  screen: Screen;
  user: PublicUser | null;
  party: PartyMeta | null;
  players: Record<string, PlayerState>;
  chat: ChatMessage[];
  unread: number;
  game: GameEnvelope | null;
  clockOffset: number; // serverTime - localTime
  toasts: Toast[];
  pendingCode: string | null;
  connected: boolean;
}

let state: State = {
  screen: 'loading',
  user: null,
  party: null,
  players: {},
  chat: [],
  unread: 0,
  game: null,
  clockOffset: 0,
  toasts: [],
  pendingCode: null,
  connected: false,
};

const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 4200 : 3200);
}

export function serverNow() {
  return Date.now() + state.clockOffset;
}

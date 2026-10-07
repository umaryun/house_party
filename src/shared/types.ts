import type { Avatar } from './avatar';
import type { Dir } from './map';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: Avatar | null;
  guest: boolean;
  stats: { gamesPlayed: number; wins: number; parties: number };
}

export type PlayerAction = 'idle' | 'dance' | 'sit';
export type HeldItem = 'none' | 'drink' | 'pizza' | 'marshmallow' | 'burger';

export const EMOTES = ['wave', 'laugh', 'heart', 'clap', 'cry', 'wow', 'angry', 'cheers', 'fire', 'party', 'music'] as const;
export type Emote = (typeof EMOTES)[number];

export const EMOTE_EMOJI: Record<Emote, string> = {
  wave: '👋',
  laugh: '😂',
  heart: '❤️',
  clap: '👏',
  cry: '😭',
  wow: '😮',
  angry: '😤',
  cheers: '🥂',
  fire: '🔥',
  party: '🎉',
  music: '🎵',
};

export interface PlayerState {
  id: string; // socket-level player id (stable per user within a party)
  userId: string;
  name: string;
  avatar: Avatar;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  action: PlayerAction;
  danceMove: number;
  held: HeldItem;
  isHost: boolean;
  connected: boolean;
}

export interface MoveUpdate {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
}

export interface ChatMessage {
  id: string;
  from: string; // player id or 'system'
  fromName: string;
  text: string;
  ts: number;
  kind: 'chat' | 'system' | 'dm' | 'game';
  to?: string; // dm target player id
  toName?: string;
}

export const MUSIC_TRACKS = ['House Party', 'Disco Fever', 'Lo-Fi Chill', 'Afro Vibes', 'Synthwave'] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];

export interface PartySummary {
  code: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isPublic: boolean;
  activeGame: GameType | null;
  vibe: string;
}

export interface PartySnapshot {
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  selfId: string;
  players: PlayerState[];
  chat: ChatMessage[];
  track: MusicTrack;
  serverTime: number;
}

export type GameType = 'draw' | 'mafia' | 'charades' | 'imposter';

export interface GameInfo {
  type: GameType;
  name: string;
  tagline: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  color: string;
  howTo: string[];
}

export const GAMES: Record<GameType, GameInfo> = {
  draw: {
    type: 'draw',
    name: 'Sketch & Guess',
    tagline: 'One draws, everyone guesses. Fastest guess wins the most points.',
    emoji: '🎨',
    minPlayers: 2,
    maxPlayers: 12,
    color: '#FF8A3D',
    howTo: [
      'Each turn one player picks a secret word and draws it.',
      'Everyone else races to type the right guess.',
      'Faster guesses score more. The artist scores when people get it.',
    ],
  },
  mafia: {
    type: 'mafia',
    name: 'Mafia',
    tagline: 'Secret roles, midnight hits and who-do-you-trust drama.',
    emoji: '🕵️',
    minPlayers: 4,
    maxPlayers: 16,
    color: '#FF4D6D',
    howTo: [
      'Everyone secretly gets a role: Mafia, Doctor, Detective or Villager.',
      'At night the Mafia picks a victim, the Doctor saves someone and the Detective investigates.',
      'By day the town debates and votes someone out. Town wins when the Mafia is gone. Mafia wins when they equal the town.',
    ],
  },
  charades: {
    type: 'charades',
    name: 'Emoji Charades',
    tagline: 'Act it out with emojis and moves only. No words allowed!',
    emoji: '🎭',
    minPlayers: 2,
    maxPlayers: 12,
    color: '#9B5DE5',
    howTo: [
      'The actor secretly gets a movie, animal, action or thing.',
      'They act it out using ONLY emojis and their character\'s moves.',
      'Everyone else guesses. The quicker you are, the more you score.',
    ],
  },
  imposter: {
    type: 'imposter',
    name: 'Who\'s the Imposter?',
    tagline: 'Everyone knows the secret word… except one of you.',
    emoji: '👀',
    minPlayers: 3,
    maxPlayers: 12,
    color: '#2EC4F1',
    howTo: [
      'Everyone gets the same secret word, except the Imposter who only sees the category.',
      'Take turns giving a one-word clue. Not too obvious, not too vague!',
      'Vote out the Imposter. If they are caught they get one shot at guessing the word.',
    ],
  },
};

export type GameStatus = 'lobby' | 'playing' | 'ended';

export interface GameFeedItem {
  id: number;
  text: string;
  kind: 'guess' | 'correct' | 'close' | 'system' | 'chat' | 'clue' | 'emoji' | 'mafia' | 'dead';
  from?: string;
  fromName?: string;
}

/** Envelope the server sends every client describing the party's current game. */
export interface GameEnvelope {
  type: GameType;
  status: GameStatus;
  hostId: string;
  participants: string[];
  serverTime: number;
  /** Game-specific per-player view (null in lobby). */
  view: any;
  results?: GameResults;
}

export interface GameResults {
  ranking: { id: string; name: string; score: number }[];
  winners: string[];
  headline: string;
}

// Socket events
export interface ServerToClient {
  'party:state': (s: PartySnapshot) => void;
  'party:meta': (m: { name: string; isPublic: boolean; hostId: string; track: MusicTrack }) => void;
  'player:joined': (p: PlayerState) => void;
  'player:left': (id: string) => void;
  'player:update': (p: Partial<PlayerState> & { id: string }) => void;
  moves: (m: MoveUpdate[]) => void;
  emote: (e: { id: string; emote: Emote }) => void;
  chat: (m: ChatMessage) => void;
  game: (g: GameEnvelope | null) => void;
  'draw:seg': (s: DrawSegment) => void;
  'draw:full': (s: DrawSegment[]) => void;
  toast: (t: { text: string; kind?: 'info' | 'success' | 'error' }) => void;
  kicked: (reason: string) => void;
  sfx: (name: string) => void;
}

export interface DrawSegment {
  sid: string; // stroke id
  color: string;
  size: number;
  pts: number[]; // normalized [x0,y0,x1,y1...]
}

export type Ack<T = unknown> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

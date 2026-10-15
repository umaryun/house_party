// Tiny persistent user store backed by a JSON file. Swap for a real database when scaling out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Avatar } from '../shared/avatar';
import type { PublicUser } from '../shared/types';

export interface UserRecord {
  id: string;
  username: string; // lowercase unique handle
  displayName: string;
  passHash: string | null; // null for guests
  salt: string | null;
  avatar: Avatar | null;
  guest: boolean;
  createdAt: number;
  stats: { gamesPlayed: number; wins: number; parties: number };
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'users.json');

class UserStore {
  private users = new Map<string, UserRecord>();
  private byName = new Map<string, string>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(FILE)) {
        const list: UserRecord[] = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        for (const u of list) this.index(u);
      }
    } catch (err) {
      console.error('[store] failed to load users', err);
    }
  }

  private index(u: UserRecord) {
    this.users.set(u.id, u);
    this.byName.set(u.username, u.id);
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }

  /** Write pending changes now (also called on shutdown so a redeploy doesn't lose them). */
  flush() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify([...this.users.values()]));
    fs.renameSync(tmp, FILE);
  }

  get(id: string) {
    return this.users.get(id);
  }

  getByUsername(username: string) {
    const id = this.byName.get(username.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }

  create(data: Omit<UserRecord, 'id' | 'createdAt' | 'stats'>): UserRecord {
    const u: UserRecord = { ...data, id: crypto.randomUUID(), createdAt: Date.now(), stats: { gamesPlayed: 0, wins: 0, parties: 0 } };
    this.index(u);
    this.scheduleSave();
    return u;
  }

  update(id: string, patch: Partial<UserRecord>) {
    const u = this.users.get(id);
    if (!u) return undefined;
    if (patch.username && patch.username !== u.username) {
      this.byName.delete(u.username);
      this.byName.set(patch.username, id);
    }
    Object.assign(u, patch);
    this.scheduleSave();
    return u;
  }

  bumpStats(id: string, delta: Partial<UserRecord['stats']>) {
    const u = this.users.get(id);
    if (!u) return;
    u.stats.gamesPlayed += delta.gamesPlayed ?? 0;
    u.stats.wins += delta.wins ?? 0;
    u.stats.parties += delta.parties ?? 0;
    this.scheduleSave();
  }
}

export const users = new UserStore();

export function toPublic(u: UserRecord): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, guest: u.guest, stats: u.stats };
}

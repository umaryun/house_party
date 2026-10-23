// Product analytics: an append-only event log on the data volume. Events carry internal ids only:
// no IP addresses, names or message contents are stored.
import fs from 'node:fs';
import path from 'node:path';

export type EventType =
  | 'visit'
  | 'signup'
  | 'account_saved'
  | 'character_created'
  | 'party_created'
  | 'party_joined'
  | 'game_started'
  | 'game_finished'
  | 'chat';

export interface AnalyticsEvent {
  t: number; // ms epoch
  type: EventType;
  uid?: string; // user id
  vid?: string; // anonymous visitor id (browser)
  uids?: string[]; // participants (games)
  p?: Record<string, string | number | boolean>;
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'events.jsonl');
const KEEP_MS = 400 * 24 * 3600 * 1000;

class Analytics {
  private events: AnalyticsEvent[] = [];
  private pending: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(FILE)) {
        const cutoff = Date.now() - KEEP_MS;
        for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
          if (!line) continue;
          try {
            const e = JSON.parse(line) as AnalyticsEvent;
            if (e && typeof e.t === 'number' && e.t >= cutoff) this.events.push(e);
          } catch {
            /* skip a torn last line */
          }
        }
      }
    } catch (err) {
      console.error('[analytics] failed to load events', err);
    }
  }

  track(type: EventType, data: Omit<AnalyticsEvent, 't' | 'type'> = {}) {
    const e: AnalyticsEvent = { t: Date.now(), type, ...data };
    this.events.push(e);
    this.pending.push(JSON.stringify(e));
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 2000);
  }

  /** Append buffered events to disk (also called on shutdown). */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.length) return;
    try {
      fs.appendFileSync(FILE, this.pending.join('\n') + '\n');
      this.pending = [];
    } catch (err) {
      console.error('[analytics] failed to write events', err);
    }
  }

  all(): readonly AnalyticsEvent[] {
    return this.events;
  }
}

export const analytics = new Analytics();

/** Where a visit came from: an explicit ?ref= tag, else the referring site, else direct. */
export function cleanSource(src: unknown): string {
  if (typeof src !== 'string' || !src) return 'direct';
  let s = src.toLowerCase().trim().slice(0, 60);
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (s === 't.co' || s === 'twitter.com') s = 'x.com';
  if (s.endsWith('tiktok.com')) s = 'tiktok';
  if (s.endsWith('youtube.com') || s === 'youtu.be') s = 'youtube';
  if (s.endsWith('instagram.com')) s = 'instagram';
  s = s.replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  return s || 'direct';
}

export const VISITOR_ID = /^[a-z0-9]{8,40}$/;

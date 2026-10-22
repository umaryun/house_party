import { describe, it, expect } from 'vitest';
import { computeStats } from '../src/server/stats';
import { cleanSource, type AnalyticsEvent } from '../src/server/analytics';

const NOW = Date.UTC(2026, 9, 22, 18, 0, 0);
const DAY = 24 * 3600 * 1000;
const live = { playersOnline: 3, partiesLive: 1, gamesRunning: 0 };
const ev = (daysAgo: number, type: AnalyticsEvent['type'], extra: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
  t: NOW - daysAgo * DAY,
  type,
  ...extra,
});

describe('computeStats', () => {
  const events: AnalyticsEvent[] = [
    ev(0, 'visit', { vid: 'v1', p: { src: 'tiktok' } }),
    ev(0, 'visit', { vid: 'v1', p: { src: 'tiktok' } }), // same visitor again
    ev(0, 'visit', { vid: 'v2', p: { src: 'direct' } }),
    ev(1, 'visit', { vid: 'v3', p: { src: 'x.com' } }),
    ev(0, 'signup', { uid: 'u1', vid: 'v1', p: { guest: true } }),
    ev(1, 'signup', { uid: 'u3', vid: 'v3', p: { guest: false } }),
    ev(0, 'character_created', { uid: 'u1' }),
    ev(1, 'character_created', { uid: 'u3' }),
    ev(1, 'party_created', { uid: 'u3', p: { public: false } }),
    ev(1, 'party_joined', { uid: 'u3', p: { via: 'host' } }),
    ev(0, 'party_joined', { uid: 'u1', p: { via: 'invite' } }),
    ev(0, 'party_joined', { uid: 'u3', p: { via: 'code' } }),
    ev(0, 'game_started', { uids: ['u1', 'u3'], p: { game: 'draw' } }),
    ev(0, 'game_finished', { p: { game: 'draw', ms: 90000 } }),
    ev(0, 'chat', { uid: 'u1' }),
    ev(40, 'signup', { uid: 'old', p: { guest: true } }), // outside a 30-day range
  ];
  const r = computeStats(events, { now: NOW, days: 30, live });

  it('counts unique visitors, sign-ups and players in range', () => {
    expect(r.totals.visitors).toBe(3);
    expect(r.totals.signups).toBe(2);
    expect(r.totals.guestSignups).toBe(1);
    expect(r.totals.activePlayers).toBe(2);
    expect(r.totals.returningPlayers).toBe(1); // u3 was active on two days
    expect(r.totals.gamesPlayed).toBe(1);
    expect(r.totals.avgPlayersPerGame).toBe(2);
    expect(r.live).toEqual(live);
  });

  it('builds one point per day ending today', () => {
    expect(r.daily).toHaveLength(30);
    const today = r.daily[r.daily.length - 1];
    expect(today.date).toBe('2026-10-22');
    expect(today.visitors).toBe(2);
    expect(today.players).toBe(2);
    expect(today.games).toBe(1);
    expect(today.chats).toBe(1);
  });

  it('follows the sign-up cohort through the funnel', () => {
    expect(r.funnel.map((f) => f.count)).toEqual([3, 2, 2, 2, 2]);
  });

  it('breaks down games, joins and sources', () => {
    expect(r.games).toEqual([{ type: 'draw', started: 1, finished: 1, avgPlayers: 2 }]);
    expect(r.joins.find((j) => j.via === 'invite')?.count).toBe(1);
    const tiktok = r.sources.find((s) => s.source === 'tiktok')!;
    expect(tiktok).toEqual({ source: 'tiktok', visitors: 1, signups: 1 });
  });
});

describe('cleanSource', () => {
  it('normalizes referrers and ref tags', () => {
    expect(cleanSource('https://www.tiktok.com/@someone/video/1')).toBe('tiktok');
    expect(cleanSource('https://t.co/abc')).toBe('x.com');
    expect(cleanSource('https://m.youtube.com/shorts/1')).toBe('youtube');
    expect(cleanSource('TikTok')).toBe('tiktok');
    expect(cleanSource('')).toBe('direct');
    expect(cleanSource('<script>')).toBe('script');
  });
});

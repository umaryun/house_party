// Turns the raw event log into the dashboard report. Pure, so it is easy to test.
import type { AnalyticsEvent } from './analytics';
import type { DailyPoint, StatsReport } from '../shared/analytics';

const DAY = 24 * 3600 * 1000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

export function computeStats(
  all: readonly AnalyticsEvent[],
  opts: { now: number; days: number; live: StatsReport['live'] },
): StatsReport {
  const { now, days } = opts;
  // The range covers whole UTC days, ending today.
  const startOfToday = Math.floor(now / DAY) * DAY;
  const from = startOfToday - (days - 1) * DAY;
  const events = all.filter((e) => e.t >= from && e.t <= now);

  const daily = new Map<string, DailyPoint>();
  for (let i = 0; i < days; i++) {
    const date = dayKey(from + i * DAY);
    daily.set(date, { date, visitors: 0, signups: 0, players: 0, games: 0, chats: 0 });
  }
  const visitorsByDay = new Map<string, Set<string>>();
  const playersByDay = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(v);
  };

  const visitors = new Set<string>();
  const signedUp = new Set<string>(); // user ids that signed up in range
  const signupVisitors = new Map<string, string>(); // uid -> vid
  const madeCharacter = new Set<string>();
  const joinedParty = new Set<string>();
  const playedGame = new Set<string>();
  const activeDays = new Map<string, Set<string>>();
  const sourceOfVisitor = new Map<string, string>();
  const games = new Map<string, { started: number; finished: number; players: number }>();
  const joins = new Map<string, number>();
  let guestSignups = 0;
  let accountsSaved = 0;
  let partiesCreated = 0;
  let gamesPlayed = 0;
  let gamePlayers = 0;
  let chatMessages = 0;

  for (const e of events) {
    const d = dayKey(e.t);
    const point = daily.get(d);
    switch (e.type) {
      case 'visit':
        if (!e.vid) break;
        visitors.add(e.vid);
        add(visitorsByDay, d, e.vid);
        if (!sourceOfVisitor.has(e.vid)) sourceOfVisitor.set(e.vid, String(e.p?.src ?? 'direct'));
        break;
      case 'signup':
        if (!e.uid) break;
        signedUp.add(e.uid);
        if (e.vid) signupVisitors.set(e.uid, e.vid);
        if (e.p?.guest) guestSignups++;
        if (point) point.signups++;
        break;
      case 'account_saved':
        accountsSaved++;
        break;
      case 'character_created':
        if (e.uid) madeCharacter.add(e.uid);
        break;
      case 'party_created':
        partiesCreated++;
        break;
      case 'party_joined': {
        if (!e.uid) break;
        joinedParty.add(e.uid);
        add(playersByDay, d, e.uid);
        add(activeDays, e.uid, d);
        const via = String(e.p?.via ?? 'code');
        joins.set(via, (joins.get(via) ?? 0) + 1);
        break;
      }
      case 'game_started': {
        const type = String(e.p?.game ?? 'unknown');
        const g = games.get(type) ?? { started: 0, finished: 0, players: 0 };
        const n = e.uids?.length ?? Number(e.p?.players ?? 0);
        g.started++;
        g.players += n;
        games.set(type, g);
        gamesPlayed++;
        gamePlayers += n;
        for (const u of e.uids ?? []) {
          playedGame.add(u);
          add(playersByDay, d, u);
          add(activeDays, u, d);
        }
        if (point) point.games++;
        break;
      }
      case 'game_finished': {
        const type = String(e.p?.game ?? 'unknown');
        const g = games.get(type) ?? { started: 0, finished: 0, players: 0 };
        g.finished++;
        games.set(type, g);
        break;
      }
      case 'chat':
        chatMessages++;
        if (point) point.chats++;
        break;
    }
  }
  for (const [d, set] of visitorsByDay) {
    const p = daily.get(d);
    if (p) p.visitors = set.size;
  }
  for (const [d, set] of playersByDay) {
    const p = daily.get(d);
    if (p) p.players = set.size;
  }

  const activePlayers = new Set([...joinedParty, ...playedGame]);
  const returningPlayers = [...activeDays.values()].filter((s) => s.size >= 2).length;

  // Funnel follows the people who signed up in this range.
  const cohort = [...signedUp];
  const funnel = [
    { step: 'Visited the site', count: visitors.size },
    { step: 'Signed up', count: cohort.length },
    { step: 'Made a character', count: cohort.filter((u) => madeCharacter.has(u)).length },
    { step: 'Joined a party', count: cohort.filter((u) => joinedParty.has(u)).length },
    { step: 'Played a game', count: cohort.filter((u) => playedGame.has(u)).length },
  ];

  const sourceVisitors = new Map<string, number>();
  for (const src of sourceOfVisitor.values()) sourceVisitors.set(src, (sourceVisitors.get(src) ?? 0) + 1);
  const sourceSignups = new Map<string, number>();
  for (const vid of signupVisitors.values()) {
    const src = sourceOfVisitor.get(vid);
    if (src) sourceSignups.set(src, (sourceSignups.get(src) ?? 0) + 1);
  }

  return {
    generatedAt: now,
    days,
    live: opts.live,
    totals: {
      visitors: visitors.size,
      signups: signedUp.size,
      guestSignups,
      accountsSaved,
      activePlayers: activePlayers.size,
      returningPlayers,
      partiesCreated,
      gamesPlayed,
      chatMessages,
      avgPlayersPerGame: gamesPlayed ? Math.round((gamePlayers / gamesPlayed) * 10) / 10 : 0,
    },
    daily: [...daily.values()],
    funnel,
    games: [...games.entries()]
      .map(([type, g]) => ({ type, started: g.started, finished: g.finished, avgPlayers: g.started ? Math.round((g.players / g.started) * 10) / 10 : 0 }))
      .sort((a, b) => b.started - a.started),
    joins: [...joins.entries()].map(([via, count]) => ({ via, count })).sort((a, b) => b.count - a.count),
    sources: [...sourceVisitors.entries()]
      .map(([source, n]) => ({ source, visitors: n, signups: sourceSignups.get(source) ?? 0 }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 12),
  };
}

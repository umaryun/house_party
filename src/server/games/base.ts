import type { Avatar } from '../../shared/avatar';
import type { GameFeedItem, GameResults } from '../../shared/types';

export interface GameContext {
  nameOf(id: string): string;
  avatarOf(id: string): Avatar | undefined;
  isConnected(id: string): boolean;
  /** Ask the party to re-send views to everybody (coalesced). */
  update(): void;
  emit(to: string | 'all', event: string, payload: unknown): void;
  sfx(to: string | string[] | 'all', name: string): void;
  /** Make a player's character perform an emote in the house too. */
  emote(id: string, emote: string): void;
  finish(results: GameResults): void;
}

interface FeedEntry extends GameFeedItem {
  visibleTo?: Set<string>; // undefined = everyone
}

export abstract class Game {
  protected timers = new Set<NodeJS.Timeout>();
  protected feedItems: FeedEntry[] = [];
  private feedId = 0;
  scores = new Map<string, number>();
  deadline = 0;
  disposed = false;

  constructor(protected ctx: GameContext, public players: string[]) {
    for (const p of players) this.scores.set(p, 0);
  }

  abstract start(): void;
  abstract action(pid: string, action: any): void;
  abstract view(pid: string): unknown;
  /** Called when a participant leaves the party mid-game. */
  leave(_pid: string): void {}

  isPlayer(pid: string) {
    return this.players.includes(pid);
  }

  protected after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  protected clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /** Start a phase that ends at a deadline. */
  protected phaseTimer(ms: number, fn: () => void) {
    this.clearTimers();
    this.deadline = Date.now() + ms;
    this.after(ms, fn);
  }

  protected feed(text: string, kind: GameFeedItem['kind'], opts: { from?: string; visibleTo?: Iterable<string> } = {}) {
    const item: FeedEntry = {
      id: ++this.feedId,
      text,
      kind,
      from: opts.from,
      fromName: opts.from ? this.ctx.nameOf(opts.from) : undefined,
      visibleTo: opts.visibleTo ? new Set(opts.visibleTo) : undefined,
    };
    this.feedItems.push(item);
    if (this.feedItems.length > 120) this.feedItems.shift();
  }

  protected feedFor(pid: string): GameFeedItem[] {
    return this.feedItems
      .filter((f) => !f.visibleTo || f.visibleTo.has(pid))
      .slice(-60)
      .map(({ visibleTo: _v, ...rest }) => rest);
  }

  protected addScore(pid: string, n: number) {
    this.scores.set(pid, (this.scores.get(pid) ?? 0) + n);
  }

  protected scoreList() {
    return this.players
      .map((id) => ({ id, name: this.ctx.nameOf(id), score: this.scores.get(id) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }

  protected finishByScore(headlineFn?: (winnerNames: string) => string) {
    const ranking = this.scoreList();
    const top = ranking[0]?.score ?? 0;
    const winners = top > 0 ? ranking.filter((r) => r.score === top).map((r) => r.id) : [];
    const names = winners.map((w) => this.ctx.nameOf(w)).join(' & ');
    this.ctx.finish({
      ranking,
      winners,
      headline: winners.length ? (headlineFn ? headlineFn(names) : `${names} wins!`) : 'Nobody scored. Rematch?',
    });
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
  }
}

export function normalizeGuess(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample<T>(arr: readonly T[], n: number): T[] {
  return shuffle([...arr]).slice(0, n);
}

export function cleanText(s: unknown, max = 120): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

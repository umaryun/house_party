import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameContext } from '../src/server/games/base';
import type { GameResults } from '../src/shared/types';
import { DrawGame } from '../src/server/games/draw';
import { MafiaGame } from '../src/server/games/mafia';
import { CharadesGame } from '../src/server/games/charades';
import { ImposterGame } from '../src/server/games/imposter';

function makeCtx() {
  const emitted: { to: string; event: string; payload: unknown }[] = [];
  let results: GameResults | null = null;
  const ctx: GameContext = {
    nameOf: (id) => id.toUpperCase(),
    avatarOf: () => undefined,
    isConnected: () => true,
    update: () => {},
    emit: (to, event, payload) => emitted.push({ to, event, payload }),
    sfx: () => {},
    emote: () => {},
    finish: (r) => {
      results = r;
    },
  };
  return { ctx, emitted, results: () => results };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Sketch & Guess', () => {
  it('scores correct guesses and ends the turn when everyone guessed', () => {
    const { ctx } = makeCtx();
    const g = new DrawGame(ctx, ['a', 'b', 'c']);
    g.start();
    const drawer = g.drawer;
    g.action(drawer, { kind: 'choose', index: 0 });
    expect(g.phase).toBe('drawing');
    const word = g.word;
    const [p1, p2] = g.players.filter((p) => p !== drawer);
    // guessers can't see the word, drawer can
    expect((g.view(p1) as any).word).toBeNull();
    expect((g.view(drawer) as any).word).toBe(word);
    g.action(p1, { kind: 'guess', text: 'definitely wrong' });
    g.action(p1, { kind: 'guess', text: word.toUpperCase() + '!' });
    expect(g.guessed).toEqual([p1]);
    expect(g.scores.get(p1)).toBeGreaterThan(100);
    expect(g.scores.get(drawer)).toBe(50);
    g.action(p2, { kind: 'guess', text: word });
    vi.advanceTimersByTime(1000);
    expect(g.phase).toBe('reveal');
  });

  it('only accepts strokes from the drawer and validates them', () => {
    const { ctx, emitted } = makeCtx();
    const g = new DrawGame(ctx, ['a', 'b']);
    g.start();
    g.action(g.drawer, { kind: 'choose', index: 1 });
    const other = g.players.find((p) => p !== g.drawer)!;
    g.action(other, { kind: 'seg', seg: { sid: 'x', color: '#000000', size: 4, pts: [0, 0, 1, 1] } });
    g.action(g.drawer, { kind: 'seg', seg: { sid: 'x', color: 'red', size: 4, pts: [0, 0, 1, 1] } });
    expect(g.segs).toHaveLength(0);
    g.action(g.drawer, { kind: 'seg', seg: { sid: 'x', color: '#000000', size: 4, pts: [0, 0, 2, 1] } });
    expect(g.segs).toHaveLength(1);
    expect(g.segs[0].pts[2]).toBe(1); // clamped
    expect(emitted.some((e) => e.event === 'draw:seg' && e.to === other)).toBe(true);
  });

  it('finishes after every player has drawn', () => {
    const { ctx, results } = makeCtx();
    const g = new DrawGame(ctx, ['a', 'b', 'c', 'd']);
    g.start();
    for (let i = 0; i < 20 && !results(); i++) vi.advanceTimersByTime(200_000);
    expect(results()).not.toBeNull();
    expect(g.turn).toBe(8); // 4 players x 2 rounds
  });
});

describe('Mafia', () => {
  it('deals roles by player count', () => {
    const { ctx } = makeCtx();
    const g = new MafiaGame(ctx, ['a', 'b', 'c', 'd', 'e', 'f']);
    g.start();
    const roles = [...g.roles.values()];
    expect(roles.filter((r) => r === 'mafia')).toHaveLength(2);
    expect(roles.filter((r) => r === 'doctor')).toHaveLength(1);
    expect(roles.filter((r) => r === 'detective')).toHaveLength(1);
  });

  it('runs a night kill, a day vote and declares the town winner', () => {
    const { ctx, results } = makeCtx();
    const g = new MafiaGame(ctx, ['a', 'b', 'c', 'd', 'e']);
    g.start();
    vi.advanceTimersByTime(10_000);
    expect(g.phase).toBe('night');
    const by = (r: string) => [...g.roles].find(([, role]) => role === r)![0];
    const mafia = by('mafia');
    const doctor = by('doctor');
    const detective = by('detective');
    const villager = by('villager');
    // mafia can't see other roles, villager doesn't see mafia
    expect(Object.keys((g.view(villager) as any).knownRoles)).toEqual([villager]);
    g.action(mafia, { kind: 'night', target: villager });
    g.action(doctor, { kind: 'night', target: doctor });
    g.action(detective, { kind: 'night', target: mafia });
    vi.advanceTimersByTime(2000);
    expect(g.alive.has(villager)).toBe(false);
    expect((g.view(detective) as any).investigations[0]).toEqual({ target: mafia, mafia: true });
    vi.advanceTimersByTime(7000);
    expect(g.phase).toBe('day');
    for (const p of g.alive) g.action(p, { kind: 'vote', target: p === mafia ? doctor : mafia });
    vi.advanceTimersByTime(3000);
    expect(g.winner).toBe('town');
    expect(results()!.winners).not.toContain(mafia);
  });

  it('doctor save prevents the kill', () => {
    const { ctx } = makeCtx();
    const g = new MafiaGame(ctx, ['a', 'b', 'c', 'd']);
    g.start();
    vi.advanceTimersByTime(10_000);
    const mafia = [...g.roles].find(([, r]) => r === 'mafia')![0];
    const doctor = [...g.roles].find(([, r]) => r === 'doctor')![0];
    const victim = g.players.find((p) => p !== mafia && p !== doctor)!;
    g.action(mafia, { kind: 'night', target: victim });
    g.action(doctor, { kind: 'night', target: victim });
    vi.advanceTimersByTime(2000);
    expect(g.alive.size).toBe(4);
  });
});

describe('Emoji Charades', () => {
  it('rejects letters from the actor and scores guesses', () => {
    const { ctx, emitted } = makeCtx();
    const g = new CharadesGame(ctx, ['a', 'b', 'c']);
    g.start();
    g.action(g.actor, { kind: 'clue', text: 'its a cat' });
    expect(g.clues).toHaveLength(0);
    expect(emitted.some((e) => e.event === 'toast')).toBe(true);
    g.action(g.actor, { kind: 'clue', text: '🐱🐟' });
    g.action(g.actor, { kind: 'clue', text: '1️⃣' });
    expect(g.clues).toEqual(['🐱🐟', '1️⃣']);
    const guesser = g.players.find((p) => p !== g.actor)!;
    g.action(guesser, { kind: 'guess', text: g.item.word });
    expect(g.guessed).toContain(guesser);
  });
});

describe("Who's the Imposter", () => {
  it('imposter caught and guesses wrong => crew wins', () => {
    const { ctx, results } = makeCtx();
    const g = new ImposterGame(ctx, ['a', 'b', 'c', 'd']);
    g.start();
    expect((g.view(g.imposter) as any).word).toBeNull();
    vi.advanceTimersByTime(9000);
    expect(g.phase).toBe('clues');
    for (let i = 0; i < 8; i++) {
      const cur = g.order[g.clueTurn % g.order.length];
      g.action(cur, { kind: 'clue', text: `clue${i}` });
    }
    expect(g.phase).toBe('vote');
    for (const p of g.players) g.action(p, { kind: 'vote', target: p === g.imposter ? g.players.find((x) => x !== p) : g.imposter });
    vi.advanceTimersByTime(2500);
    expect(g.accused).toBe(g.imposter);
    vi.advanceTimersByTime(6000);
    expect(g.phase).toBe('lastChance');
    g.action(g.imposter, { kind: 'guessWord', text: 'zzzz' });
    expect(g.outcome).toBe('crew');
    expect(results()!.winners).not.toContain(g.imposter);
  });

  it('crew may not say the secret word as a clue', () => {
    const { ctx } = makeCtx();
    const g = new ImposterGame(ctx, ['a', 'b', 'c']);
    g.start();
    vi.advanceTimersByTime(9000);
    const cur = g.order[0];
    if (cur !== g.imposter) {
      g.action(cur, { kind: 'clue', text: g.word });
      expect(g.clues).toHaveLength(0);
    }
  });
});

import { Game, cleanText, levenshtein, normalizeGuess, shuffle } from './base';
import { CHARADES, type CharadeItem } from './words';

const ACT_MS = 75_000;
const REVEAL_MS = 6_000;
export const POSES = [
  'wave', 'dance', 'laugh', 'cry', 'sleep', 'run', 'jump', 'think', 'love', 'angry', 'scared', 'eat', 'swim', 'fly', 'point', 'shrug',
] as const;

export class CharadesGame extends Game {
  phase: 'acting' | 'reveal' = 'acting';
  order: string[] = [];
  turn = 0;
  totalTurns = 0;
  rounds = 1;
  actor = '';
  item: CharadeItem = CHARADES[0];
  deck: CharadeItem[] = [];
  guessed: string[] = [];
  clues: string[] = [];
  pose: string = 'wave';
  poseSeq = 0;
  passesLeft = 1;

  start() {
    this.order = shuffle(this.players);
    this.rounds = this.players.length <= 3 ? 2 : 1;
    this.totalTurns = this.order.length * this.rounds;
    this.deck = shuffle(CHARADES);
    this.feed('🎭 Emoji Charades! Actors can only use emojis and moves.', 'system');
    this.nextTurn();
  }

  private draw(): CharadeItem {
    if (!this.deck.length) this.deck = shuffle(CHARADES);
    return this.deck.pop()!;
  }

  private nextTurn() {
    if (this.turn >= this.totalTurns || this.order.length < 2) return this.finishByScore((n) => `${n} steals the show! 🌟`);
    this.actor = this.order[this.turn % this.order.length];
    this.turn++;
    this.phase = 'acting';
    this.item = this.draw();
    this.guessed = [];
    this.clues = [];
    this.pose = 'wave';
    this.poseSeq++;
    this.passesLeft = 1;
    this.feed(`🎬 ${this.ctx.nameOf(this.actor)} is acting! Category: ${this.item.category}`, 'system');
    this.ctx.sfx(this.actor, 'yourTurn');
    this.phaseTimer(ACT_MS, () => this.endTurn());
    this.ctx.update();
  }

  private endTurn() {
    if (this.phase === 'reveal') return;
    this.phase = 'reveal';
    this.feed(`It was “${this.item.word}”`, 'system');
    this.ctx.sfx('all', 'reveal');
    this.phaseTimer(REVEAL_MS, () => this.nextTurn());
    this.ctx.update();
  }

  action(pid: string, a: any) {
    if (!a || typeof a !== 'object') return;
    if (a.kind === 'clue' && pid === this.actor && this.phase === 'acting') {
      const text = cleanText(a.text, 40);
      if (!text) return;
      // Keycap emojis (1️⃣ 2️⃣) are fine for counting words; plain letters and digits are not.
      if (/[\p{L}\p{N}]/u.test(text.replace(/[0-9#*]\uFE0F?\u20E3/g, ''))) {
        this.ctx.emit(pid, 'toast', { text: 'Emojis only! No letters or numbers 🤐', kind: 'error' });
        return;
      }
      this.clues.push(text);
      if (this.clues.length > 30) this.clues.shift();
      this.feed(text, 'emoji', { from: pid });
      this.ctx.sfx('all', 'pop');
      this.ctx.update();
    } else if (a.kind === 'pose' && pid === this.actor && this.phase === 'acting') {
      if (!(POSES as readonly string[]).includes(a.pose)) return;
      this.pose = a.pose;
      this.poseSeq++;
      this.ctx.update();
    } else if (a.kind === 'pass' && pid === this.actor && this.phase === 'acting' && this.passesLeft > 0) {
      this.passesLeft--;
      this.item = this.draw();
      this.clues = [];
      this.feed(`${this.ctx.nameOf(pid)} passed on that one. New category: ${this.item.category}`, 'system');
      this.ctx.update();
    } else if (a.kind === 'guess') {
      this.guess(pid, cleanText(a.text, 60));
    }
  }

  private guess(pid: string, text: string) {
    if (!text || pid === this.actor) return;
    const canScore = this.phase === 'acting' && this.isPlayer(pid) && !this.guessed.includes(pid);
    if (canScore) {
      const g = normalizeGuess(text);
      const target = normalizeGuess(this.item.word);
      const loose = target.replace(/^the/, '');
      if (g === target || g === loose) {
        this.guessed.push(pid);
        const remaining = Math.max(0, this.deadline - Date.now()) / ACT_MS;
        const pts = Math.round(100 + 300 * remaining);
        this.addScore(pid, pts);
        this.addScore(this.actor, 75);
        this.feed(`${this.ctx.nameOf(pid)} got it! +${pts}`, 'correct', { from: pid });
        this.ctx.sfx(pid, 'correct');
        this.ctx.sfx(this.players.filter((p) => p !== pid), 'ding');
        this.ctx.emote(pid, 'clap');
        const guessers = this.players.filter((p) => p !== this.actor && this.ctx.isConnected(p));
        if (guessers.every((p) => this.guessed.includes(p))) this.after(800, () => this.endTurn());
        this.ctx.update();
        return;
      }
      if (target.length > 3 && levenshtein(g, target) === 1) this.feed(`“${text}” is SO close!`, 'close', { visibleTo: [pid] });
    }
    if (this.guessed.includes(pid) && this.phase === 'acting')
      this.feed(text, 'chat', { from: pid, visibleTo: [this.actor, ...this.guessed] });
    else this.feed(text, 'guess', { from: pid });
    this.ctx.update();
  }

  leave(pid: string) {
    this.order = this.order.filter((p) => p !== pid);
    this.players = this.players.filter((p) => p !== pid);
    if (this.players.length < 2) return this.finishByScore();
    if (pid === this.actor && this.phase === 'acting') this.endTurn();
    this.totalTurns = Math.min(this.totalTurns, this.turn + this.order.length * this.rounds);
  }

  view(pid: string) {
    const knows = this.phase === 'reveal' || pid === this.actor || this.guessed.includes(pid);
    return {
      phase: this.phase,
      actorId: this.actor,
      category: this.item.category,
      word: knows ? this.item.word : null,
      wordShape: this.item.word.replace(/[^\s]/g, '_'),
      clues: this.clues,
      pose: this.pose,
      poseSeq: this.poseSeq,
      passesLeft: pid === this.actor ? this.passesLeft : 0,
      guessed: this.guessed,
      deadline: this.deadline,
      turn: this.turn,
      totalTurns: this.totalTurns,
      scores: this.scoreList(),
      feed: this.feedFor(pid),
    };
  }
}

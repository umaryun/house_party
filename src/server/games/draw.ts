import type { DrawSegment } from '../../shared/types';
import { Game, cleanText, levenshtein, normalizeGuess, sample, shuffle } from './base';
import { DRAW_WORDS } from './words';

const CHOOSE_MS = 15_000;
const DRAW_MS = 80_000;
const REVEAL_MS = 6_000;

type Phase = 'choosing' | 'drawing' | 'reveal';

export class DrawGame extends Game {
  phase: Phase = 'choosing';
  order: string[] = [];
  turn = 0;
  totalTurns = 0;
  rounds = 2;
  drawer = '';
  choices: string[] = [];
  word = '';
  guessed: string[] = [];
  revealed = new Set<number>();
  segs: DrawSegment[] = [];
  usedWords = new Set<string>();
  turnStart = 0;

  start() {
    this.order = shuffle(this.players);
    this.rounds = this.players.length <= 3 ? 3 : 2;
    this.totalTurns = this.order.length * this.rounds;
    this.feed('🎨 Sketch & Guess is on! Type your guesses below.', 'system');
    this.nextTurn();
  }

  private nextTurn() {
    if (this.turn >= this.totalTurns || this.order.length < 2) return this.finishByScore((n) => `${n} is the master artist!`);
    this.drawer = this.order[this.turn % this.order.length];
    this.turn++;
    this.phase = 'choosing';
    this.word = '';
    this.guessed = [];
    this.revealed.clear();
    this.segs = [];
    this.ctx.emit('all', 'draw:full', []);
    const pool = DRAW_WORDS.filter((w) => !this.usedWords.has(w));
    this.choices = sample(pool.length >= 3 ? pool : DRAW_WORDS, 3);
    this.ctx.sfx(this.drawer, 'yourTurn');
    this.phaseTimer(CHOOSE_MS, () => this.beginDrawing(this.choices[Math.floor(Math.random() * 3)]));
    this.ctx.update();
  }

  private beginDrawing(word: string) {
    this.word = word;
    this.usedWords.add(word);
    this.phase = 'drawing';
    this.turnStart = Date.now();
    this.feed(`✏️ ${this.ctx.nameOf(this.drawer)} is drawing!`, 'system');
    this.phaseTimer(DRAW_MS, () => this.endTurn());
    const letters = [...word].map((c, i) => (c === ' ' ? -1 : i)).filter((i) => i >= 0);
    const reveal = () => {
      const hidden = letters.filter((i) => !this.revealed.has(i));
      if (hidden.length > 2) {
        this.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
        this.ctx.update();
      }
    };
    this.after(DRAW_MS * 0.5, reveal);
    if (letters.length >= 5) this.after(DRAW_MS * 0.75, reveal);
    this.ctx.update();
  }

  private endTurn() {
    if (this.phase === 'reveal') return;
    this.phase = 'reveal';
    this.feed(`The word was “${this.word}”`, 'system');
    this.ctx.sfx('all', 'reveal');
    this.phaseTimer(REVEAL_MS, () => this.nextTurn());
    this.ctx.update();
  }

  action(pid: string, a: any) {
    if (!a || typeof a !== 'object') return;
    switch (a.kind) {
      case 'choose':
        if (this.phase === 'choosing' && pid === this.drawer && this.choices[a.index]) this.beginDrawing(this.choices[a.index]);
        break;
      case 'seg': {
        if (this.phase !== 'drawing' || pid !== this.drawer) return;
        const seg = validSeg(a.seg);
        if (!seg) return;
        if (this.segs.length > 6000) return;
        this.segs.push(seg);
        for (const p of this.players) if (p !== pid) this.ctx.emit(p, 'draw:seg', seg);
        this.ctx.emit('spectators', 'draw:seg', seg);
        break;
      }
      case 'undo': {
        if (pid !== this.drawer || this.phase !== 'drawing' || !this.segs.length) return;
        const last = this.segs[this.segs.length - 1].sid;
        this.segs = this.segs.filter((s) => s.sid !== last);
        this.ctx.emit('all', 'draw:full', this.segs);
        break;
      }
      case 'clear':
        if (pid !== this.drawer || this.phase !== 'drawing') return;
        this.segs = [];
        this.ctx.emit('all', 'draw:full', []);
        break;
      case 'sync':
        this.ctx.emit(pid, 'draw:full', this.segs);
        break;
      case 'guess':
        this.guess(pid, cleanText(a.text, 60));
        break;
    }
  }

  private guess(pid: string, text: string) {
    if (!text) return;
    const canScore = this.phase === 'drawing' && this.isPlayer(pid) && pid !== this.drawer && !this.guessed.includes(pid);
    if (canScore) {
      const g = normalizeGuess(text);
      const target = normalizeGuess(this.word);
      if (g === target) {
        this.guessed.push(pid);
        const remaining = Math.max(0, this.deadline - Date.now()) / DRAW_MS;
        const pts = Math.round(100 + 300 * remaining + Math.max(0, 100 - (this.guessed.length - 1) * 25));
        this.addScore(pid, pts);
        this.addScore(this.drawer, 50);
        this.feed(`${this.ctx.nameOf(pid)} guessed it! +${pts}`, 'correct', { from: pid });
        this.ctx.sfx(pid, 'correct');
        this.ctx.sfx(this.players.filter((p) => p !== pid), 'ding');
        this.ctx.emote(pid, 'party');
        const guessers = this.players.filter((p) => p !== this.drawer && this.ctx.isConnected(p));
        if (guessers.every((p) => this.guessed.includes(p))) this.after(800, () => this.endTurn());
        this.ctx.update();
        return;
      }
      if (target.length > 3 && levenshtein(g, target) === 1) {
        this.feed(`“${text}” is SO close!`, 'close', { visibleTo: [pid] });
      }
    }
    // Players who already know the word (drawer + correct guessers) chat privately among themselves.
    const inTheKnow = this.phase === 'drawing' && (pid === this.drawer || this.guessed.includes(pid));
    if (inTheKnow) this.feed(text, 'chat', { from: pid, visibleTo: [this.drawer, ...this.guessed] });
    else this.feed(text, 'guess', { from: pid });
    this.ctx.update();
  }

  leave(pid: string) {
    this.order = this.order.filter((p) => p !== pid);
    this.players = this.players.filter((p) => p !== pid);
    if (this.players.length < 2) return this.finishByScore();
    if (pid === this.drawer && this.phase !== 'reveal') {
      this.feed(`${this.ctx.nameOf(pid)} left mid-drawing.`, 'system');
      if (this.phase === 'choosing') this.nextTurn();
      else this.endTurn();
    }
    this.totalTurns = Math.min(this.totalTurns, this.turn + this.order.length * this.rounds);
  }

  private hint(): string {
    if (!this.word) return '';
    return [...this.word].map((c, i) => (c === ' ' ? ' ' : this.revealed.has(i) ? c : '_')).join('');
  }

  view(pid: string) {
    const knows = this.phase === 'reveal' || pid === this.drawer || this.guessed.includes(pid);
    return {
      phase: this.phase,
      round: Math.min(this.rounds, Math.floor((this.turn - 1) / Math.max(1, this.order.length)) + 1),
      rounds: this.rounds,
      drawerId: this.drawer,
      choices: pid === this.drawer && this.phase === 'choosing' ? this.choices : null,
      word: knows ? this.word : null,
      hint: this.hint(),
      guessed: this.guessed,
      deadline: this.deadline,
      scores: this.scoreList(),
      feed: this.feedFor(pid),
    };
  }
}

function validSeg(s: any): DrawSegment | null {
  if (!s || typeof s !== 'object') return null;
  if (typeof s.sid !== 'string' || s.sid.length > 24) return null;
  if (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)) return null;
  const size = Number(s.size);
  if (!(size >= 1 && size <= 60)) return null;
  if (!Array.isArray(s.pts) || s.pts.length < 2 || s.pts.length > 600 || s.pts.length % 2) return null;
  const pts: number[] = [];
  for (const v of s.pts) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    pts.push(Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000);
  }
  return { sid: s.sid, color: s.color, size, pts };
}

import { Game, cleanText, levenshtein, normalizeGuess, shuffle } from './base';
import { IMPOSTER_WORDS } from './words';

const REVEAL_MS = 9_000;
const CLUE_MS = 30_000;
const VOTE_MS = 75_000;
const RESULT_MS = 6_000;
const LAST_CHANCE_MS = 30_000;

type Phase = 'reveal' | 'clues' | 'vote' | 'result' | 'lastChance' | 'over';

export class ImposterGame extends Game {
  phase: Phase = 'reveal';
  category = '';
  word = '';
  imposter = '';
  order: string[] = [];
  clueTurn = 0;
  clueRounds = 2;
  clues: { pid: string; text: string; round: number }[] = [];
  votes = new Map<string, string>();
  accused: string | null = null;
  imposterGuess: string | null = null;
  outcome: 'crew' | 'imposter' | null = null;
  narration = '';

  start() {
    const cats = Object.keys(IMPOSTER_WORDS);
    this.category = cats[Math.floor(Math.random() * cats.length)];
    const words = IMPOSTER_WORDS[this.category];
    this.word = words[Math.floor(Math.random() * words.length)];
    this.imposter = this.players[Math.floor(Math.random() * this.players.length)];
    this.order = shuffle(this.players);
    // The imposter never goes first: it would be too brutal.
    if (this.order[0] === this.imposter && this.order.length > 1) [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
    this.narration = 'Peek at your card… one of you is the Imposter!';
    this.feed('👀 Who\'s the Imposter? Check your secret card.', 'system');
    this.phaseTimer(REVEAL_MS, () => this.startClues());
    this.ctx.update();
  }

  private get currentCluer() {
    return this.order[this.clueTurn % this.order.length];
  }

  private startClues() {
    this.phase = 'clues';
    this.clueTurn = 0;
    this.promptClue();
  }

  private promptClue() {
    if (this.clueTurn >= this.order.length * this.clueRounds) return this.startVote();
    this.narration = `${this.ctx.nameOf(this.currentCluer)}, give a one-word clue.`;
    this.ctx.sfx(this.currentCluer, 'yourTurn');
    this.phaseTimer(CLUE_MS, () => {
      this.clues.push({ pid: this.currentCluer, text: '🤐 (ran out of time)', round: this.round() });
      this.clueTurn++;
      this.promptClue();
    });
    this.ctx.update();
  }

  private round() {
    return Math.floor(this.clueTurn / this.order.length) + 1;
  }

  private startVote() {
    this.phase = 'vote';
    this.votes.clear();
    this.narration = 'Discuss and vote! Who doesn\'t know the word?';
    this.feed('🗳️ Voting is open.', 'system');
    this.ctx.sfx('all', 'reveal');
    this.phaseTimer(VOTE_MS, () => this.resolveVote());
    this.ctx.update();
  }

  private resolveVote() {
    if (this.phase !== 'vote') return;
    const tally = new Map<string, number>();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    let accused: string | null = null;
    if (tally.size) {
      const max = Math.max(...tally.values());
      const top = [...tally.entries()].filter(([, v]) => v === max);
      if (top.length === 1) accused = top[0][0];
    }
    this.accused = accused;
    this.phase = 'result';
    const caught = accused === this.imposter;
    if (!accused) this.narration = 'It\'s a tie! Nobody gets voted out…';
    else this.narration = `The group voted out ${this.ctx.nameOf(accused)}… ${caught ? 'who WAS the Imposter! 🎯' : 'who was innocent! 😱'}`;
    this.feed(this.narration, 'system');
    this.ctx.sfx('all', caught ? 'correct' : 'death');
    this.phaseTimer(RESULT_MS, () => {
      if (caught) {
        this.phase = 'lastChance';
        this.narration = `${this.ctx.nameOf(this.imposter)} gets one last chance to guess the word!`;
        this.ctx.sfx(this.imposter, 'yourTurn');
        this.phaseTimer(LAST_CHANCE_MS, () => this.end('crew'));
        this.ctx.update();
      } else this.end('imposter');
    });
    this.ctx.update();
  }

  private end(outcome: 'crew' | 'imposter') {
    if (this.phase === 'over') return;
    this.outcome = outcome;
    this.phase = 'over';
    this.clearTimers();
    const winners = outcome === 'imposter' ? [this.imposter] : this.players.filter((p) => p !== this.imposter);
    for (const w of winners) this.addScore(w, outcome === 'imposter' ? 300 : 100);
    this.narration =
      outcome === 'imposter'
        ? `😈 ${this.ctx.nameOf(this.imposter)} the Imposter wins! The word was “${this.word}”.`
        : `🎉 The crew wins! The word was “${this.word}”.`;
    this.feed(this.narration, 'system');
    this.ctx.finish({
      ranking: this.scoreList(),
      winners,
      headline: outcome === 'imposter' ? `The Imposter (${this.ctx.nameOf(this.imposter)}) wins! 😈` : 'Crew wins! 🎉',
    });
  }

  action(pid: string, a: any) {
    if (!a || typeof a !== 'object') return;
    if (a.kind === 'chat') {
      const text = cleanText(a.text, 200);
      if (!text) return;
      this.feed(text, 'chat', { from: pid });
      this.ctx.update();
      return;
    }
    if (!this.isPlayer(pid)) return;
    if (a.kind === 'clue' && this.phase === 'clues' && pid === this.currentCluer) {
      const text = cleanText(a.text, 30);
      if (!text) return;
      if (pid !== this.imposter && normalizeGuess(text).includes(normalizeGuess(this.word))) {
        this.ctx.emit(pid, 'toast', { text: 'You can\'t say the secret word! 🙊', kind: 'error' });
        return;
      }
      this.clues.push({ pid, text, round: this.round() });
      this.ctx.sfx('all', 'pop');
      this.clueTurn++;
      this.promptClue();
    } else if (a.kind === 'vote' && this.phase === 'vote') {
      const t = typeof a.target === 'string' && this.players.includes(a.target) && a.target !== pid ? a.target : null;
      if (!t) return;
      this.votes.set(pid, t);
      this.ctx.sfx('all', 'vote');
      if (this.players.every((p) => this.votes.has(p) || !this.ctx.isConnected(p))) {
        this.clearTimers();
        this.deadline = Date.now() + 2500;
        this.after(2500, () => this.resolveVote());
      }
      this.ctx.update();
    } else if (a.kind === 'guessWord' && this.phase === 'lastChance' && pid === this.imposter) {
      const g = normalizeGuess(cleanText(a.text, 40));
      if (!g) return;
      this.imposterGuess = cleanText(a.text, 40);
      const target = normalizeGuess(this.word);
      const right = g === target || (target.length > 5 && levenshtein(g, target) <= 1);
      this.feed(`${this.ctx.nameOf(pid)} guesses “${this.imposterGuess}”… ${right ? 'CORRECT! 😱' : 'wrong! ❌'}`, 'system');
      this.end(right ? 'imposter' : 'crew');
    }
  }

  leave(pid: string) {
    if (this.phase === 'over') return;
    if (pid === this.imposter) {
      this.feed(`${this.ctx.nameOf(pid)} (the Imposter!) fled the party.`, 'system');
      return this.end('crew');
    }
    this.players = this.players.filter((p) => p !== pid);
    const wasCurrent = this.phase === 'clues' && this.currentCluer === pid;
    const idx = this.order.indexOf(pid);
    this.order = this.order.filter((p) => p !== pid);
    if (this.players.length < 3) {
      this.feed('Not enough players left.', 'system');
      return this.end('imposter');
    }
    if (this.phase === 'clues') {
      // keep turn pointer on the same next player
      if (idx >= 0 && idx < this.clueTurn % (this.order.length + 1)) this.clueTurn--;
      if (wasCurrent) this.promptClue();
    }
    this.ctx.update();
  }

  view(pid: string) {
    const isImposter = pid === this.imposter;
    const over = this.phase === 'over';
    const isPlayer = this.isPlayer(pid);
    return {
      phase: this.phase,
      narration: this.narration,
      category: this.category,
      word: over || (isPlayer && !isImposter) ? this.word : null,
      amImposter: isPlayer ? isImposter : null,
      imposterId: over || this.phase === 'lastChance' ? this.imposter : null,
      order: this.order,
      currentCluer: this.phase === 'clues' ? this.currentCluer : null,
      clueRound: this.round(),
      clueRounds: this.clueRounds,
      clues: this.clues,
      votes: this.phase === 'vote' || this.phase === 'result' || over ? Object.fromEntries(this.votes) : null,
      myVote: this.votes.get(pid) ?? null,
      accused: this.accused,
      imposterGuess: this.imposterGuess,
      outcome: this.outcome,
      deadline: this.deadline,
      feed: this.feedFor(pid),
    };
  }
}

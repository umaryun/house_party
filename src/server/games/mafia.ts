import { Game, cleanText, shuffle } from './base';

export type MafiaRole = 'mafia' | 'doctor' | 'detective' | 'villager';
type Phase = 'roles' | 'night' | 'morning' | 'day' | 'verdict' | 'over';

const ROLES_MS = 10_000;
const NIGHT_MS = 35_000;
const MORNING_MS = 7_000;
const DAY_MS = 100_000;
const VERDICT_MS = 7_000;

const DEATH_LINES = [
  '{name} was found face-down in the punch bowl.',
  '{name} went to get more chips… and never came back.',
  '{name} was discovered behind the DJ booth. The music stopped.',
  '{name} took one last selfie. It was not a good one.',
  'The pool floatie drifted by… carrying {name}\'s lifeless body.',
];
const SAVE_LINES = [
  'The Mafia struck, but the Doctor got there just in time! Nobody died.',
  'A scream at midnight… but everyone woke up alive. Nice save, Doc.',
];
const QUIET_LINES = ['A peaceful night. Suspiciously peaceful.', 'Everyone wakes up. Nobody died… this time.'];

export class MafiaGame extends Game {
  phase: Phase = 'roles';
  roles = new Map<string, MafiaRole>();
  alive = new Set<string>();
  day = 0;
  mafiaVotes = new Map<string, string>();
  doctorPick: string | null = null;
  detectivePick: string | null = null;
  lastDoctorPick: string | null = null;
  dayVotes = new Map<string, string>(); // voter -> target | 'skip'
  investigations = new Map<string, { target: string; mafia: boolean }[]>();
  narration = '';
  winner: 'town' | 'mafia' | null = null;

  start() {
    const n = this.players.length;
    const mafiaCount = n >= 10 ? 3 : n >= 6 ? 2 : 1;
    const order = shuffle(this.players);
    order.forEach((p, i) => {
      let role: MafiaRole = 'villager';
      if (i < mafiaCount) role = 'mafia';
      else if (i === mafiaCount) role = 'doctor';
      else if (i === mafiaCount + 1 && n >= 5) role = 'detective';
      this.roles.set(p, role);
      this.alive.add(p);
    });
    this.narration = 'Shh… check your secret role. Don\'t let anyone see it!';
    this.feed('🕵️ Welcome to Mafia. Trust no one.', 'system');
    this.phaseTimer(ROLES_MS, () => this.startNight());
    this.ctx.update();
  }

  private aliveWith(role: MafiaRole) {
    return [...this.alive].filter((p) => this.roles.get(p) === role);
  }

  private get dead() {
    return this.players.filter((p) => !this.alive.has(p));
  }

  private startNight() {
    this.phase = 'night';
    this.day++;
    this.mafiaVotes.clear();
    this.doctorPick = null;
    this.detectivePick = null;
    this.narration = `Night ${this.day}. The house goes dark… Mafia, choose your target.`;
    this.feed(`🌙 Night ${this.day} falls.`, 'system');
    this.ctx.sfx('all', 'night');
    this.phaseTimer(NIGHT_MS, () => this.resolveNight());
    this.ctx.update();
  }

  private nightDone() {
    const mafia = this.aliveWith('mafia');
    if (!mafia.every((m) => this.mafiaVotes.has(m))) return false;
    if (this.aliveWith('doctor').length && !this.doctorPick) return false;
    if (this.aliveWith('detective').length && !this.detectivePick) return false;
    return true;
  }

  private resolveNight() {
    if (this.phase !== 'night') return;
    // Mafia target = plurality of mafia votes (random tie-break).
    const tally = new Map<string, number>();
    for (const t of this.mafiaVotes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    let target: string | null = null;
    if (tally.size) {
      const max = Math.max(...tally.values());
      const top = [...tally.entries()].filter(([, v]) => v === max).map(([k]) => k);
      target = top[Math.floor(Math.random() * top.length)];
    }
    const det = this.aliveWith('detective')[0];
    if (det && this.detectivePick) {
      const isMafia = this.roles.get(this.detectivePick) === 'mafia';
      const list = this.investigations.get(det) ?? [];
      list.push({ target: this.detectivePick, mafia: isMafia });
      this.investigations.set(det, list);
      this.feed(
        `🔍 Your investigation: ${this.ctx.nameOf(this.detectivePick)} ${isMafia ? 'IS in the Mafia!' : 'is not Mafia.'}`,
        'system',
        { visibleTo: [det] },
      );
    }
    this.lastDoctorPick = this.doctorPick;
    this.phase = 'morning';
    if (target && target !== this.doctorPick) {
      this.alive.delete(target);
      const line = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)].replace('{name}', this.ctx.nameOf(target));
      this.narration = `☀️ Morning. ${line} They were ${roleLabel(this.roles.get(target)!)}.`;
      this.ctx.sfx('all', 'death');
      this.ctx.emote(target, 'cry');
    } else if (target) {
      this.narration = `☀️ ${SAVE_LINES[Math.floor(Math.random() * SAVE_LINES.length)]}`;
      this.ctx.sfx('all', 'save');
    } else {
      this.narration = `☀️ ${QUIET_LINES[Math.floor(Math.random() * QUIET_LINES.length)]}`;
    }
    this.feed(this.narration, 'system');
    if (this.checkWin()) return;
    this.phaseTimer(MORNING_MS, () => this.startDay());
    this.ctx.update();
  }

  private startDay() {
    this.phase = 'day';
    this.dayVotes.clear();
    this.narration = 'Discuss! Who\'s acting shady? Vote someone out, or skip.';
    this.phaseTimer(DAY_MS, () => this.resolveDay());
    this.ctx.update();
  }

  private resolveDay() {
    if (this.phase !== 'day') return;
    const tally = new Map<string, number>();
    for (const t of this.dayVotes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    const skip = tally.get('skip') ?? 0;
    tally.delete('skip');
    let out: string | null = null;
    if (tally.size) {
      const max = Math.max(...tally.values());
      const top = [...tally.entries()].filter(([, v]) => v === max);
      if (top.length === 1 && max > skip) out = top[0][0];
    }
    this.phase = 'verdict';
    if (out) {
      this.alive.delete(out);
      const role = this.roles.get(out)!;
      this.narration = `⚖️ The town has spoken. ${this.ctx.nameOf(out)} is out… and they were ${roleLabel(role)}${role === 'mafia' ? '! 🎯' : '. 😬'}`;
      this.ctx.sfx('all', role === 'mafia' ? 'correct' : 'death');
    } else {
      this.narration = '⚖️ No agreement. Nobody leaves the party today.';
    }
    this.feed(this.narration, 'system');
    if (this.checkWin()) return;
    this.phaseTimer(VERDICT_MS, () => this.startNight());
    this.ctx.update();
  }

  private checkWin(): boolean {
    const mafia = this.aliveWith('mafia').length;
    const town = this.alive.size - mafia;
    if (mafia === 0) this.winner = 'town';
    else if (mafia >= town) this.winner = 'mafia';
    if (!this.winner) return false;
    this.phase = 'over';
    this.clearTimers();
    const winners = this.players.filter((p) => (this.roles.get(p) === 'mafia') === (this.winner === 'mafia'));
    for (const w of winners) this.addScore(w, 100);
    this.narration = this.winner === 'town' ? '🎉 The town wins! The Mafia has been crushed.' : '😈 The Mafia takes over the party!';
    this.feed(this.narration, 'system');
    this.ctx.finish({
      ranking: this.scoreList(),
      winners,
      headline: this.winner === 'town' ? 'Town wins! 🏡' : 'Mafia wins! 😈',
    });
    return true;
  }

  action(pid: string, a: any) {
    if (!a || typeof a !== 'object') return;
    const alive = this.alive.has(pid);
    const role = this.roles.get(pid);
    if (a.kind === 'chat') return this.chat(pid, cleanText(a.text, 200));
    const target = typeof a.target === 'string' ? a.target : null;
    if (a.kind === 'night' && this.phase === 'night' && alive && target) {
      if (!this.alive.has(target)) return;
      if (role === 'mafia') {
        if (this.roles.get(target) === 'mafia') return;
        this.mafiaVotes.set(pid, target);
        this.feed(`${this.ctx.nameOf(pid)} wants to target ${this.ctx.nameOf(target)}.`, 'mafia', {
          visibleTo: this.aliveWith('mafia'),
        });
      } else if (role === 'doctor') {
        this.doctorPick = target;
      } else if (role === 'detective') {
        if (target === pid) return;
        this.detectivePick = target;
      } else return;
      if (this.nightDone()) {
        this.clearTimers();
        this.deadline = Date.now() + 2000;
        this.after(2000, () => this.resolveNight());
      }
      this.ctx.update();
    }
    if (a.kind === 'vote' && this.phase === 'day' && alive) {
      const t = a.target === 'skip' ? 'skip' : target;
      if (!t || (t !== 'skip' && !this.alive.has(t))) return;
      const prev = this.dayVotes.get(pid);
      this.dayVotes.set(pid, t);
      if (prev !== t)
        this.feed(
          t === 'skip' ? `${this.ctx.nameOf(pid)} votes to skip.` : `${this.ctx.nameOf(pid)} votes for ${this.ctx.nameOf(t)}.`,
          'system',
        );
      this.ctx.sfx('all', 'vote');
      if ([...this.alive].every((p) => this.dayVotes.has(p))) {
        this.clearTimers();
        this.deadline = Date.now() + 3000;
        this.after(3000, () => this.resolveDay());
      }
      this.ctx.update();
    }
  }

  private chat(pid: string, text: string) {
    if (!text) return;
    const alive = this.alive.has(pid);
    const isPlayer = this.isPlayer(pid);
    if (!isPlayer || !alive) {
      // Ghosts and spectators whisper among themselves.
      const audience = [...this.dead];
      if (!isPlayer) audience.push(pid);
      this.feed(text, 'dead', { from: pid, visibleTo: audience });
    } else if (this.phase === 'night') {
      if (this.roles.get(pid) !== 'mafia') return;
      this.feed(text, 'mafia', { from: pid, visibleTo: [...this.aliveWith('mafia'), ...this.dead] });
    } else {
      this.feed(text, 'chat', { from: pid });
    }
    this.ctx.update();
  }

  leave(pid: string) {
    if (!this.alive.has(pid) || this.phase === 'over') return;
    this.alive.delete(pid);
    this.feed(`${this.ctx.nameOf(pid)} left the party. They were ${roleLabel(this.roles.get(pid)!)}.`, 'system');
    if (!this.checkWin()) {
      if (this.phase === 'night' && this.nightDone()) this.resolveNight();
      else this.ctx.update();
    }
  }

  view(pid: string) {
    const role = this.roles.get(pid) ?? null;
    const isMafia = role === 'mafia';
    const over = this.phase === 'over';
    let myPick: string | null = null;
    if (this.phase === 'night') {
      if (isMafia) myPick = this.mafiaVotes.get(pid) ?? null;
      if (role === 'doctor') myPick = this.doctorPick;
      if (role === 'detective') myPick = this.detectivePick;
    } else if (this.phase === 'day') myPick = this.dayVotes.get(pid) ?? null;

    const revealAll = over || (!this.alive.has(pid) && this.isPlayer(pid));
    return {
      phase: this.phase,
      day: this.day,
      deadline: this.deadline,
      narration: this.narration,
      myRole: role,
      alive: [...this.alive],
      players: this.players,
      // Dead players' roles are public; everything is public once the game ends or you're a ghost.
      knownRoles: Object.fromEntries(
        this.players
          .filter((p) => revealAll || !this.alive.has(p) || p === pid || (isMafia && this.roles.get(p) === 'mafia'))
          .map((p) => [p, this.roles.get(p)]),
      ),
      myPick,
      mafiaVotes: isMafia && this.phase === 'night' ? Object.fromEntries(this.mafiaVotes) : null,
      dayVotes: this.phase === 'day' || this.phase === 'verdict' ? Object.fromEntries(this.dayVotes) : null,
      investigations: role === 'detective' ? this.investigations.get(pid) ?? [] : null,
      lastDoctorPick: role === 'doctor' ? this.lastDoctorPick : null,
      winner: this.winner,
      feed: this.feedFor(pid),
    };
  }
}

function roleLabel(r: MafiaRole) {
  return { mafia: 'Mafia 🔪', doctor: 'the Doctor 💉', detective: 'the Detective 🔍', villager: 'a Villager 🙂' }[r];
}

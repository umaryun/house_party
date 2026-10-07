// All audio is synthesized with WebAudio: no asset downloads, instant start.
import type { MusicTrack } from '../shared/types';

type Pattern = {
  bpm: number;
  swing?: number;
  kick: string; // 16 steps, 'x' = hit
  snare: string;
  hat: string;
  openHat?: string;
  shaker?: string;
  bass: (number | null)[]; // semitone offsets per 16th step (relative to chord root), null = rest
  bassWave: OscillatorType;
  chords: number[][]; // 4 bars of chord tones (midi)
  chordRhythm: string;
  chordWave: OscillatorType;
  chordCutoff: number;
  arp?: boolean;
};

const TRACKS: Record<MusicTrack, Pattern> = {
  'House Party': {
    bpm: 124,
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    openHat: '..x...x...x...x.',
    bass: [null, null, 0, null, null, null, 12, null, null, null, 0, null, null, 12, 0, null],
    bassWave: 'square',
    chords: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [48, 52, 55, 60],
      [55, 59, 62, 65],
    ],
    chordRhythm: '..x..x....x..x..',
    chordWave: 'sawtooth',
    chordCutoff: 1800,
  },
  'Disco Fever': {
    bpm: 118,
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    openHat: '..x...x...x...x.',
    bass: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 7, 12],
    bassWave: 'sawtooth',
    chords: [
      [50, 53, 57, 60],
      [55, 59, 62, 65],
      [52, 55, 59, 62],
      [57, 61, 64, 67],
    ],
    chordRhythm: 'x.....x...x.....',
    chordWave: 'sawtooth',
    chordCutoff: 2600,
  },
  'Lo-Fi Chill': {
    bpm: 82,
    swing: 0.18,
    kick: 'x......x..x.....',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    bass: [0, null, null, null, null, null, null, 7, null, null, 0, null, null, null, null, null],
    bassWave: 'triangle',
    chords: [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [55, 59, 62, 65],
    ],
    chordRhythm: 'x.......x.......',
    chordWave: 'triangle',
    chordCutoff: 1200,
  },
  'Afro Vibes': {
    bpm: 108,
    kick: 'x..x..x...x..x..',
    snare: '....x..x....x...',
    hat: '..x...x...x...x.',
    shaker: 'xxxxxxxxxxxxxxxx',
    bass: [0, null, null, 0, null, null, 7, null, null, null, 5, null, 3, null, null, null],
    bassWave: 'sine',
    chords: [
      [57, 60, 64, 67],
      [62, 65, 69, 72],
      [55, 59, 62, 67],
      [60, 64, 67, 71],
    ],
    chordRhythm: '..x..x..x..x..x.',
    chordWave: 'square',
    chordCutoff: 2200,
  },
  Synthwave: {
    bpm: 100,
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0],
    bassWave: 'sawtooth',
    chords: [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [48, 52, 55, 60],
      [55, 59, 62, 67],
    ],
    chordRhythm: 'x...............',
    chordWave: 'sawtooth',
    chordCutoff: 1400,
    arp: true,
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class SoundEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxGain!: GainNode;
  musicGain!: GainNode;
  musicBus!: GainNode;
  noise!: AudioBuffer;
  track: MusicTrack = 'House Party';
  musicOn = true;
  sfxOn = true;
  musicVolume = 0.55;
  private proximity = 0.4;
  private nextStep = 0;
  private step = 0;
  private timer: number | null = null;
  private lastKick = 0;
  playing = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('hp_audio') || '{}');
      if (typeof saved.musicOn === 'boolean') this.musicOn = saved.musicOn;
      if (typeof saved.sfxOn === 'boolean') this.sfxOn = saved.sfxOn;
      if (typeof saved.musicVolume === 'number') this.musicVolume = saved.musicVolume;
    } catch {
      /* ignore */
    }
  }

  private save() {
    try {
      localStorage.setItem('hp_audio', JSON.stringify({ musicOn: this.musicOn, sfxOn: this.sfxOn, musicVolume: this.musicVolume }));
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture at least once. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfxGain = c.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      this.musicGain = c.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.musicGain);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ───────────── music ─────────────

  startMusic(track: MusicTrack) {
    this.track = track;
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.applyVolume();
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  setTrack(track: MusicTrack) {
    this.track = track;
  }

  setProximity(p: number) {
    this.proximity = p;
    this.applyVolume();
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    this.save();
    this.applyVolume();
  }

  setSfxOn(on: boolean) {
    this.sfxOn = on;
    this.save();
  }

  setMusicVolume(v: number) {
    this.musicVolume = v;
    this.save();
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.ctx || !this.musicGain) return;
    const v = this.musicOn && this.playing ? this.musicVolume * this.proximity : 0;
    this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  /** 0..1 pulse that decays after each kick, for lights. Falls back to a clock when muted. */
  beat(): number {
    if (this.ctx && this.playing && this.musicOn) {
      const e = this.ctx.currentTime - this.lastKick;
      return e < 0 ? 0 : Math.max(0, 1 - e * 4);
    }
    const t = performance.now() / 1000;
    const per = 60 / TRACKS[this.track].bpm;
    return Math.max(0, 1 - ((t % per) / per) * 3);
  }

  private schedule() {
    const c = this.ctx!;
    const pat = TRACKS[this.track];
    const stepDur = 60 / pat.bpm / 4;
    while (this.nextStep < c.currentTime + 0.12) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      let time = this.nextStep;
      if (pat.swing && s % 2 === 1) time += stepDur * pat.swing;
      this.playStep(pat, s, bar, time, stepDur);
      this.nextStep += stepDur;
      this.step++;
    }
  }

  private playStep(p: Pattern, s: number, bar: number, t: number, sd: number) {
    if (this.musicGain.gain.value < 0.001 && !this.musicOn) return;
    if (p.kick[s] === 'x') this.kick(t);
    if (p.snare[s] === 'x') this.snare(t, p.bpm < 90);
    if (p.hat[s] === 'x') this.hat(t, 0.04, 0.12);
    if (p.openHat?.[s] === 'x') this.hat(t, 0.18, 0.07);
    if (p.shaker?.[s] === 'x') this.hat(t, 0.03, s % 4 === 2 ? 0.08 : 0.04);
    const chord = p.chords[bar];
    const b = p.bass[s];
    if (b !== null && b !== undefined) this.tone(mtof(chord[0] - 24 + b), t, sd * 1.6, p.bassWave, 0.22, 900);
    if (p.chordRhythm[s] === 'x') {
      const len = p.chordRhythm === 'x...............' ? sd * 15 : p.bpm < 90 ? sd * 7 : sd * 1.5;
      for (const n of chord) this.tone(mtof(n), t, len, p.chordWave, 0.045, p.chordCutoff);
    }
    if (p.arp) {
      const n = chord[s % chord.length] + (s % 8 >= 4 ? 12 : 0);
      this.tone(mtof(n + 12), t, sd * 0.9, 'square', 0.03, 3000);
    }
  }

  private kick(t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.32);
    this.lastKick = t;
  }

  private snare(t: number, soft: boolean) {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = soft ? 1400 : 2200;
    const g = c.createGain();
    g.gain.setValueAtTime(soft ? 0.25 : 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(f).connect(g).connect(this.musicBus);
    n.start(t);
    n.stop(t + 0.2);
  }

  private hat(t: number, len: number, vol: number) {
    const c = this.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f).connect(g).connect(this.musicBus);
    n.start(t);
    n.stop(t + len + 0.02);
  }

  private tone(freq: number, t: number, len: number, wave: OscillatorType, vol: number, cutoff: number, dest?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(dest ?? this.musicBus);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  // ───────────── sfx ─────────────

  play(name: string) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    const d = this.sfxGain;
    const seq = (notes: number[], step: number, wave: OscillatorType = 'triangle', vol = 0.3, len = 0.18) =>
      notes.forEach((n, i) => this.tone(mtof(n), t + i * step, len, wave, vol, 5000, d));
    switch (name) {
      case 'click':
        this.tone(1200, t, 0.05, 'sine', 0.15, 6000, d);
        break;
      case 'pop':
      case 'message':
        this.tone(880, t, 0.08, 'sine', 0.2, 6000, d);
        this.tone(1320, t + 0.04, 0.08, 'sine', 0.15, 6000, d);
        break;
      case 'dm':
        seq([84, 88, 91], 0.06, 'sine', 0.2, 0.15);
        break;
      case 'join':
        seq([72, 79], 0.1, 'triangle', 0.25, 0.25);
        break;
      case 'invite':
        seq([72, 76, 79, 84], 0.08, 'square', 0.12, 0.2);
        break;
      case 'start':
        seq([67, 72, 76, 79, 84], 0.07, 'square', 0.13, 0.25);
        break;
      case 'ding':
        this.tone(mtof(88), t, 0.3, 'sine', 0.18, 8000, d);
        break;
      case 'correct':
        seq([76, 79, 84, 88], 0.06, 'triangle', 0.3, 0.25);
        break;
      case 'win':
        seq([72, 76, 79, 84, 79, 84, 88], 0.11, 'square', 0.14, 0.3);
        break;
      case 'death':
        this.tone(110, t, 0.6, 'sawtooth', 0.25, 500, d);
        this.tone(82, t + 0.2, 0.7, 'sawtooth', 0.25, 400, d);
        break;
      case 'save':
        seq([79, 84, 91], 0.09, 'sine', 0.25, 0.3);
        break;
      case 'night':
        seq([57, 60, 64], 0.25, 'sine', 0.2, 0.9);
        break;
      case 'vote':
        this.tone(600, t, 0.06, 'square', 0.08, 3000, d);
        break;
      case 'yourTurn':
        seq([84, 91, 96], 0.09, 'sine', 0.25, 0.4);
        break;
      case 'reveal':
        seq([67, 71, 74, 79], 0.05, 'triangle', 0.22, 0.25);
        break;
      case 'tick':
        this.tone(1500, t, 0.03, 'square', 0.06, 6000, d);
        break;
      case 'piano': {
        const chords = [
          [60, 64, 67, 72],
          [57, 60, 64, 69],
          [65, 69, 72, 77],
          [67, 71, 74, 79],
        ];
        const ch = chords[Math.floor(Math.random() * chords.length)];
        ch.forEach((n, i) => this.tone(mtof(n), t + i * 0.08, 1.2, 'triangle', 0.18, 3000, d));
        break;
      }
      case 'note':
        break;
    }
  }

  note(midi: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    this.tone(mtof(midi), t, 0.9, 'triangle', 0.25, 3500, this.sfxGain);
    this.tone(mtof(midi + 12), t, 0.5, 'sine', 0.06, 5000, this.sfxGain);
  }
}

export const sound = new SoundEngine();

// Offline-rendered soundtrack for the launch video: a 120bpm house groove built with the same
// synth voices as the in-app music, arranged around the video's cuts, plus sound effects.
const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM;
const DROP = 3.0; // groove starts on the reveal
const BREAK = [25.5, 26.0]; // silence before "GAME NIGHT"
const END_HIT = 38.0;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 60], // C
  [55, 59, 62, 65], // G7
];

export async function renderSoundtrack(duration: number, cues: { t: number; name: string; gain?: number }[]): Promise<string> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * duration), SR);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  master.connect(comp).connect(ctx.destination);

  const music = ctx.createGain();
  music.gain.value = 0.75;
  music.connect(master);
  // sidechain-style pump on the musical bus (ducks on every kick)
  const pump = ctx.createGain();
  pump.connect(music);
  const fxBus = ctx.createGain();
  fxBus.gain.value = 0.55;
  fxBus.connect(master);

  const noise = ctx.createBuffer(1, SR * 2, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const inBreak = (t: number) => t >= BREAK[0] && t < BREAK[1];

  // ── voices ──
  const kick = (t: number, v = 1) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0.7 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(music);
    o.start(t);
    o.stop(t + 0.4);
    pump.gain.setValueAtTime(0.35, t);
    pump.gain.linearRampToValueAtTime(1, t + 0.22);
  };
  const noiseHit = (t: number, len: number, vol: number, type: BiquadFilterType, freq: number, dest: AudioNode = pump, q = 0.8) => {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f).connect(g).connect(dest);
    n.start(t, Math.random());
    n.stop(t + len + 0.02);
  };
  const tone = (t: number, freq: number, len: number, wave: OscillatorType, vol: number, cutoff: number, dest: AudioNode = pump, attack = 0.008) => {
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
    return { o, f };
  };
  const chord = (t: number, notes: number[], len: number, vol: number, cutoff: number, wave: OscillatorType = 'sawtooth') => {
    for (const n of notes) {
      tone(t, mtof(n), len, wave, vol, cutoff);
      tone(t, mtof(n) * 1.006, len, wave, vol * 0.6, cutoff); // detuned double for width
    }
  };

  // ── intro (0–3s): filtered pads, building hats, snare roll ──
  for (let i = 0; i < 6; i++) {
    const t = i * BEAT;
    const cut = 500 + i * 450;
    chord(t, CHORDS[Math.floor(i / 4) % 4], BEAT * 1.6, 0.06, cut, 'sawtooth');
    tone(t, mtof(CHORDS[Math.floor(i / 4) % 4][0] - 24), BEAT * 0.9, 'triangle', 0.18, 400);
  }
  for (let t = 1.0; t < DROP; t += BEAT / 2) noiseHit(t, 0.04, 0.05 + (t / DROP) * 0.07, 'highpass', 7000);
  for (let t = 2.0, step = BEAT / 4; t < DROP - 0.01; t += step) {
    noiseHit(t, 0.08, 0.06 + ((t - 2) / 1) * 0.22, 'bandpass', 2000, pump, 0.6);
    if (t > 2.5) step = BEAT / 8;
  }

  // ── groove (3s → end) ──
  let step = 0;
  for (let t = DROP; t < END_HIT - 0.001; t += BEAT / 4, step++) {
    if (inBreak(t)) continue;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const notes = CHORDS[bar % 4];
    const afterGames = t >= BREAK[1];
    if (s % 4 === 0) kick(t);
    if (s === 4 || s === 12) {
      noiseHit(t, 0.16, 0.32, 'bandpass', 1800, pump, 0.9); // clap
      noiseHit(t + 0.012, 0.12, 0.2, 'bandpass', 1300, pump, 0.9);
    }
    if (s % 4 === 2) noiseHit(t, 0.16, 0.13, 'highpass', 6500); // open hat
    if (s % 2 === 1) noiseHit(t, 0.03, 0.06, 'highpass', 9000); // closed hat
    // bass: offbeat octaves
    if (s % 4 === 2) tone(t, mtof(notes[0] - 24), BEAT * 0.45, 'square', 0.2, 800);
    if (s === 14) tone(t + BEAT * 0.25, mtof(notes[0] - 12), BEAT * 0.2, 'square', 0.1, 900);
    // chord stabs
    if (s === 2 || s === 5 || s === 10 || s === 13) chord(t, notes, BEAT * 0.55, 0.03, afterGames ? 3400 : 2600);
    // sparkly arp after the game section kicks in and on the outro
    if (afterGames && s % 2 === 0) {
      const n = notes[(s / 2) % notes.length] + 12 + (s >= 8 ? 12 : 0);
      tone(t, mtof(n), BEAT * 0.4, 'square', 0.022, 4200);
    }
    // little fill into each new section
    if ([7.5, 11.5, 16.5, 19.5].some((x) => Math.abs(t - x) < 0.01)) {
      for (let k = 0; k < 4; k++) noiseHit(t + k * (BEAT / 4), 0.07, 0.14 + k * 0.04, 'bandpass', 2200, pump, 0.6);
    }
  }
  // end hit + ring out
  kick(END_HIT, 1.1);
  chord(END_HIT, [45, 57, 60, 64, 69, 72], 2.0, 0.04, 2600);
  noiseHit(END_HIT, 1.6, 0.18, 'highpass', 5000, pump); // crash

  // ── sfx ──
  for (const c of cues) {
    const t = Math.max(0, c.t);
    const v = c.gain ?? 1;
    switch (c.name) {
      case 'pop':
        tone(t, 700, 0.09, 'sine', 0.35 * v, 6000, fxBus, 0.003);
        tone(t + 0.035, 1100, 0.09, 'sine', 0.25 * v, 6000, fxBus, 0.003);
        break;
      case 'click':
        noiseHit(t, 0.03, 0.4 * v, 'bandpass', 3500, fxBus, 2);
        tone(t, 1800, 0.04, 'square', 0.08 * v, 6000, fxBus, 0.002);
        break;
      case 'whoosh': {
        const n = ctx.createBufferSource();
        n.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.2;
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(5000, t + 0.22);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.45 * v, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        n.connect(f).connect(g).connect(fxBus);
        n.start(t, Math.random());
        n.stop(t + 0.32);
        break;
      }
      case 'swoosh':
        for (let k = 0; k < 3; k++) tone(t + k * 0.04, mtof(76 + k * 5), 0.18, 'triangle', 0.18 * v, 5000, fxBus, 0.004);
        break;
      case 'riser': {
        const n = ctx.createBufferSource();
        n.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(8000, t + 0.55);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        n.connect(f).connect(g).connect(fxBus);
        n.start(t);
        n.stop(t + 0.62);
        break;
      }
      case 'impact': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
        g.gain.setValueAtTime(0.9 * v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        o.connect(g).connect(fxBus);
        o.start(t);
        o.stop(t + 0.85);
        noiseHit(t, 0.9, 0.22 * v, 'highpass', 4000, fxBus);
        break;
      }
      case 'chime':
        [79, 84, 88].forEach((n, i) => tone(t + i * 0.06, mtof(n), 0.4, 'sine', 0.22 * v, 8000, fxBus, 0.004));
        break;
      case 'sparkle':
        [84, 88, 91, 96, 100].forEach((n, i) => tone(t + i * 0.045, mtof(n), 0.3, 'sine', 0.16 * v, 9000, fxBus, 0.003));
        break;
      case 'correct':
        [76, 79, 84, 88].forEach((n, i) => tone(t + i * 0.07, mtof(n), 0.3, 'triangle', 0.3 * v, 6000, fxBus, 0.004));
        break;
      case 'death':
        tone(t, 110, 0.6, 'sawtooth', 0.22 * v, 600, fxBus);
        tone(t + 0.18, 82, 0.7, 'sawtooth', 0.22 * v, 500, fxBus);
        break;
    }
  }

  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

function encodeWav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + len * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  // base64 in chunks
  const bytes = new Uint8Array(data.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

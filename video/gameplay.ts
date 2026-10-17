// "playing mafia with my friends was a mistake 💀" — a ~28s gameplay clip for TikTok/Shorts aimed
// at 15–26 year olds. Every shot is styled as a screen recording of the real app (same engine and
// UI classes), with feed-native captions, punch-in zooms and meme sound hits.
// Renders deterministically the same way as main.ts: the capture script calls __renderFrame(t).
import gsap from 'gsap';
import '../src/client/styles.css';
import './video.css';
import { World } from '../src/client/world/World';
import { avatarPortrait, drawAvatar } from '../src/client/world/avatarRender';
import { randomAvatar, type Avatar } from '../src/shared/avatar';
import type { PlayerState } from '../src/shared/types';
import { renderSoundtrack, type Arrangement } from './audio';

const DURATION = 31;
const SW = 1080;
const SH = 1920;
/** The app is laid out at phone width and scaled up to fill the frame, like a screen recording. */
const APP_W = 390;
const S = SW / APP_W;
const APP_H = Math.round(SH / S);

const ARRANGEMENT: Arrangement = {
  drop: 0, // beat from the first frame
  breaks: [
    [3.95, 4.45], // record scratch → "LEO??"
    [7.15, 7.7], // → "TOLD YOU"
  ],
  brightAfter: 22.2,
  fills: [9.0, 16.5, 19.1, 21.7, 25.7],
  endHit: 30.0,
};

const stage = document.getElementById('stage')!;
const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out', duration: 0.4 } });
const updaters: ((t: number) => void)[] = [];
const events: { t: number; fn: () => void; done: boolean }[] = [];
const cues: { t: number; name: string; gain?: number }[] = [];
const at = (t: number, fn: () => void) => events.push({ t, fn, done: false });
const sfx = (t: number, name: string, gain = 1) => cues.push({ t, name, gain });

// Worlds render at high resolution so the scaled-up "screen recording" stays sharp.
Object.defineProperty(window, 'devicePixelRatio', { get: () => S, configurable: true });

function el<T extends HTMLElement = HTMLElement>(html: string, parent: HTMLElement = stage): T {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  const e = d.firstElementChild as T;
  parent.appendChild(e);
  return e;
}

function scene(start: number, end: number, cls = '', z = 1) {
  const s = el(`<div class="scene ${cls}" style="z-index:${z}"></div>`);
  if (start === 0) gsap.set(s, { visibility: 'visible' });
  tl.set(s, { visibility: 'visible' }, start);
  tl.set(s, { visibility: 'hidden' }, end);
  return s;
}

/** A full-bleed app screen inside a scene. */
function appScreen(parent: HTMLElement) {
  return el(`<div class="app-frame" style="width:${APP_W}px;height:${APP_H}px;transform:scale(${S})"></div>`, parent);
}

function pop(target: gsap.TweenTarget, t: number, opts: gsap.TweenVars = {}, from: gsap.TweenVars = {}) {
  gsap.set(target, { autoAlpha: 0, scale: 0.4, ...from });
  tl.to(target, { autoAlpha: 1, scale: 1, x: 0, y: 0, rotation: 0, duration: 0.35, ease: 'back.out(2.4)', ...opts }, t);
}

function hide(target: gsap.TweenTarget, t: number) {
  tl.to(target, { autoAlpha: 0, duration: 0.12, ease: 'power2.in' }, t);
}

/** Zoom punch: snap in, settle slightly zoomed. */
function punch(target: HTMLElement, t: number, to = 1.08, origin = '50% 45%') {
  tl.set(target, { transformOrigin: origin }, t);
  tl.fromTo(target, { scale: to + 0.1 }, { scale: to, duration: 0.35, ease: 'power3.out', immediateRender: false }, t);
}

function unpunch(target: HTMLElement, t: number) {
  tl.to(target, { scale: 1, duration: 0.2, ease: 'power2.inOut' }, t);
}

function shake(target: HTMLElement, t: number, amp = 16) {
  tl.to(
    target,
    { keyframes: [{ x: -amp, y: amp * 0.5 }, { x: amp, y: -amp * 0.6 }, { x: -amp * 0.6, y: amp * 0.3 }, { x: amp * 0.3, y: 0 }, { x: 0, y: 0 }], duration: 0.32, ease: 'none' },
    t,
  );
}

function cut(t: number, incoming: HTMLElement) {
  const f = el('<div class="flash"></div>');
  tl.fromTo(f, { opacity: 0.5 }, { opacity: 0, duration: 0.18, ease: 'power2.out', immediateRender: false }, t);
  tl.fromTo(incoming, { scale: 1.06 }, { scale: 1, duration: 0.35, ease: 'power3.out', immediateRender: false }, t);
  sfx(t - 0.05, 'whoosh', 0.8);
}

/** Feed-native caption: bold white text with a heavy black outline. */
function caption(t: number, end: number, html: string, top = 300, size = 74) {
  const c = el(`<div class="tk" style="top:${top}px;font-size:${size}px">${html}</div>`);
  pop(c, t, { duration: 0.28, ease: 'back.out(3)' }, { scale: 0.6 });
  if (end) hide(c, end);
  return c;
}

/** Emojis floating up from a point. */
function burst(t: number, emoji: string, cx: number, cy: number, n = 7) {
  for (let i = 0; i < n; i++) {
    const e = el(`<div class="burst" style="left:${cx}px;top:${cy}px">${emoji}</div>`);
    gsap.set(e, { autoAlpha: 0 });
    const dx = (i - (n - 1) / 2) * 70 + ((i * 37) % 30);
    tl.set(e, { autoAlpha: 1, scale: 0.4 }, t + i * 0.04);
    tl.to(e, { x: dx, y: -260 - ((i * 53) % 160), scale: 1.2, rotation: (i % 2 ? 1 : -1) * 25, duration: 0.9, ease: 'power2.out' }, t + i * 0.04);
    tl.to(e, { autoAlpha: 0, duration: 0.25 }, t + i * 0.04 + 0.7);
  }
}

// ───────────────────────── cast ─────────────────────────

const base = (patch: Partial<Avatar>): Avatar => ({ ...randomAvatar(), facialHair: 'none', glasses: 'none', hat: 'none', ...patch });
const CAST: Record<string, Avatar> = {
  umar: base({ skin: '#8D5524', hairStyle: 'short', hairColor: '#1B1B1F', facialHair: 'goatee', top: 'hoodie', topColor: '#FF4D6D', accentColor: '#FFD23F', bottom: 'jeans', bottomColor: '#2B2D3A', eyes: 'happy', mouth: 'grin', shoeColor: '#FFFFFF' }),
  zara: base({ skin: '#F1C27D', hairStyle: 'long', hairColor: '#3B2417', top: 'dress', topColor: '#9B5DE5', accentColor: '#FFD23F', bottom: 'skirt', eyes: 'lashes', mouth: 'smile', earrings: true, blush: true, shoeColor: '#FF4D6D' }),
  leo: base({ skin: '#FFE0C7', hairStyle: 'curly', hairColor: '#D9A55B', top: 'jacket', topColor: '#2EC4F1', accentColor: '#FFFFFF', bottom: 'pants', bottomColor: '#2B2D3A', glasses: 'round', freckles: true, mouth: 'smirk', eyes: 'round' }),
  amaka: base({ skin: '#6B3E1E', hairStyle: 'braids', hairColor: '#1B1B1F', top: 'tank', topColor: '#FFD23F', bottom: 'shorts', bottomColor: '#4D6BFF', eyes: 'round', mouth: 'grin', glasses: 'shades', earrings: true }),
  kenji: base({ skin: '#F9D2B4', hairStyle: 'spiky', hairColor: '#1B1B1F', top: 'jersey', topColor: '#FF8A3D', accentColor: '#FFFFFF', hat: 'headphones', hatColor: '#4D6BFF' }),
  mia: base({ skin: '#F9D2B4', hairStyle: 'wavy', hairColor: '#F3D38A', top: 'tank', topColor: '#FF4D8D' }),
  tobi: base({ skin: '#A86B3C', hairStyle: 'afro', hairColor: '#1B1B1F', top: 'tee', topColor: '#3DDC97' }),
  sam: base({ skin: '#C68642', hairStyle: 'mohawk', hairColor: '#2BC79F', top: 'jacket', topColor: '#14151C', accentColor: '#2BC79F' }),
  nia: base({ skin: '#8D5524', hairStyle: 'bun', hairColor: '#1B1B1F', top: 'dress', topColor: '#3DDC97', bottom: 'skirt', hat: 'flower' }),
  rio: base({ skin: '#F1C27D', hairStyle: 'wavy', hairColor: '#1B1B1F', top: 'hoodie', topColor: '#FFD23F', accentColor: '#14151C' }),
};
const NAMES: Record<string, string> = Object.fromEntries(Object.keys(CAST).map((k) => [k, k[0].toUpperCase() + k.slice(1)]));
const portrait = (id: string, size = 128) => avatarPortrait(CAST[id], size);

function P(id: string, x: number, y: number, extra: Partial<PlayerState> = {}): PlayerState {
  return { id, userId: id, name: NAMES[id], avatar: CAST[id], x, y, dir: 'down', moving: false, action: 'idle', danceMove: 0, held: 'none', isHost: id === 'umar', connected: true, ...extra };
}

let curT = 0;
const beatAt = (t: number) => Math.max(0, 1 - ((t % 0.5) / 0.5) * 3.2);
const noop = { onMove() {}, onAction() {}, onTapPlayer() {}, onNearby() {}, onInteract() {}, onRoom() {} };
function makeWorld(app: HTMLElement, selfId: string, players: PlayerState[]) {
  const cv = el<HTMLCanvasElement>('<canvas class="world"></canvas>', app);
  const w = new World(cv, selfId, noop);
  w.beat = () => beatAt(curT);
  w.setPlayers(players);
  w.keysEnabled = false;
  return w;
}

/** The in-party HUD so world shots read as a real screen recording. */
function hud(app: HTMLElement) {
  el(`<div class="hud-top" style="position:absolute"><div class="party-chip"><span class="pname">the group chat 🏠</span><span class="pcode">K7XQ2</span></div><div class="hud-right"><span class="icon-btn">👥<span class="badge" style="background:var(--green);color:#06301c">6</span></span></div></div>`, app);
  el(`<div class="hud-bottom" style="position:absolute"><div class="hud-row"><div class="chat-pill"><span class="pill-icon" style="display:grid;place-items:center">💬</span><span class="muted">Say something…</span></div><span class="icon-btn">😀</span><span class="icon-btn">🕺</span><span class="games-btn">🎲</span></div></div>`, app);
}

// ───────────────────────── S1 · Hook (0–2.6s) ─────────────────────────

{
  const s = scene(0, 2.6, '', 2);
  const app = appScreen(s);
  const w = makeWorld(app, 'umar', [
    P('umar', 20.8, 10.7, { dir: 'right' }),
    P('zara', 22.3, 11.0),
    P('leo', 23.8, 10.5, { dir: 'left', held: 'drink' }),
    P('amaka', 21.3, 12.2, { dir: 'up' }),
    P('kenji', 23.4, 12.3, { dir: 'up' }),
    P('mia', 24.9, 11.6, { dir: 'left' }),
  ]);
  hud(app);
  const cam = { x: 23.0, y: 10.1, zoom: 2.05 };
  tl.to(cam, { x: 22.8, zoom: 2.25, duration: 2.0, ease: 'sine.inOut' }, 0);
  tl.to(cam, { x: 22.3, y: 10.3, zoom: 3.0, duration: 0.3, ease: 'power3.out' }, 2.15);
  updaters.push(() => (w.cinematic = { ...cam }));
  at(0.25, () => w.showBubble('zara', 'it wasnt me i swear 😭'));
  at(0.9, () => w.showBubble('leo', 'zara ur literally shaking'));
  at(1.45, () => w.showEmote('kenji', 'laugh'));
  at(1.55, () => w.showBubble('amaka', 'SUSSSS 👀'));
  at(1.6, () => w.showEmote('mia', 'wow'));
  sfx(0.25, 'pop', 0.6);
  sfx(0.9, 'pop', 0.6);
  sfx(1.55, 'pop', 0.6);
  // Visible from frame 0: the hook is readable even before anything moves.
  const hook = el('<div class="tk" style="top:250px;font-size:82px">playing mafia with my friends was a <span class="y">mistake</span> 💀</div>');
  tl.set(hook, { visibility: 'hidden' }, 2.6);
  tl.fromTo(hook, { scale: 1.04 }, { scale: 1, duration: 0.4, immediateRender: false }, 0);
}

// ───────────────────────── S2 · Mafia (2.6–9.4s) ─────────────────────────

{
  const T = 2.6;
  const s = scene(T, 9.4, '', 3);
  cut(T, s);
  const app = appScreen(s);
  const body = el(
    `<div class="game-overlay" style="position:absolute;animation:none"><div class="game-head" style="border-bottom:3px solid #FF4D6D"><span style="font-size:30px">🕵️</span><div class="gt"></div><span class="close-x" style="display:grid;place-items:center">🏠</span></div><div class="game-body"></div></div>`,
    app,
  ).querySelector('.game-body') as HTMLElement;
  body.innerHTML = `<div class="mafia night"><div class="row" style="padding:10px 12px 0;justify-content:space-between"><span class="pill phase">🌙 Night 1</span><span class="pill">6 alive</span></div><div class="narration nar">Night 1. The house goes dark… Mafia, choose your target.</div><div class="role-card rc" style="background:linear-gradient(135deg,#FFD23F,#b5791a)"><span class="re">🙂</span><div><div style="font-family:var(--display);font-size:20px">You are a Villager</div><div class="small" style="font-weight:600">Find the Mafia. Trust no one.</div></div></div><div class="player-grid" style="grid-template-columns:repeat(3,1fr);padding:10px 12px"></div><div class="feed fd" style="padding:4px 14px;gap:6px;font-size:17px"></div></div>`;
  const mafiaEl = body.querySelector('.mafia') as HTMLElement;
  const grid = body.querySelector('.player-grid') as HTMLElement;
  const tiles: Record<string, HTMLElement> = {};
  for (const id of ['umar', 'zara', 'leo', 'amaka', 'kenji', 'mia']) {
    tiles[id] = el(`<div class="pg-item" style="padding:6px 4px"><img src="${portrait(id, 140)}" style="width:52px;height:52px"><span class="nm">${id === 'umar' ? 'You' : NAMES[id]}</span></div>`, grid);
  }
  caption(T + 0.15, 3.9, 'night 1. someone is NOT making it 🔪', 90, 66);

  // morning: Leo is gone
  const M = 4.0;
  sfx(M - 0.05, 'scratch', 1);
  sfx(M + 0.02, 'boom', 1);
  const nar = body.querySelector('.nar')!;
  tl.set(nar, { innerHTML: '☀️ Morning. <b>Leo</b> was found face-down in the punch bowl.' }, M);
  tl.set(mafiaEl, { className: 'mafia day' }, M);
  tl.set(body.querySelector('.phase')!, { innerHTML: '☀️ Day 1' }, M);
  tl.set(tiles.leo, { className: 'pg-item dead' }, M);
  tl.set(body.querySelector('.rc')!, { display: 'none' }, M + 0.5);
  const leoCap = caption(M, 4.65, 'LEO?? 😭', 760, 150);
  shake(s, M, 22);
  punch(leoCap, M, 1);

  // the group turns on Zara
  const feed = body.querySelector('.fd') as HTMLElement;
  const lines: [number, string, string][] = [
    [4.7, 'amaka', 'zara was by the punch bowl all night 👀'],
    [5.15, 'zara', 'i was getting CHIPS???'],
    [5.6, 'kenji', 'thats exactly what mafia would say'],
    [6.05, 'zara', 'ur all so annoying 😭'],
    [6.5, 'mia', 'vote zara'],
  ];
  for (const [t, id, text] of lines) {
    const f = el(`<div class="feed-item chat"><b style="color:${id === 'zara' ? '#FF8FA6' : '#FFD23F'}">${NAMES[id]}: </b>${text}</div>`, feed);
    pop(f, t, { duration: 0.25 }, { scale: 0.8, x: -20 });
    sfx(t, 'pop', 0.55);
  }
  caption(5.1, 7.1, 'the group chat turning on her 💀', 90, 66);
  const votes = el('<span class="votes">1</span>', tiles.zara);
  gsap.set(votes, { autoAlpha: 0 });
  [6.3, 6.5, 6.7, 6.9].forEach((t, i) => {
    tl.set(votes, { autoAlpha: 1, innerHTML: String(i + 1) }, t);
    tl.fromTo(votes, { scale: 1.6 }, { scale: 1, duration: 0.2, immediateRender: false }, t);
    sfx(t, 'click', 0.7);
  });

  // verdict
  const V = 7.2;
  sfx(V - 0.05, 'scratch', 0.9);
  sfx(V + 0.08, 'boom', 1);
  tl.set(nar, { innerHTML: '⚖️ Zara is out… and she was <b style="color:#FF4D6D">MAFIA 🔪</b>' }, V);
  tl.set(tiles.zara, { className: 'pg-item dead' }, V);
  const tag = el('<span class="rtag">🔪 Mafia</span>', tiles.zara);
  gsap.set(tag, { autoAlpha: 0 });
  tl.set(tag, { autoAlpha: 1 }, V);
  const stamp = el('<div class="stamp" style="left:200px;top:820px;font-size:120px">TOLD YOU 💀</div>', s);
  pop(stamp, V + 0.05, { rotation: -10, duration: 0.3, ease: 'back.out(3)' }, { scale: 3, rotation: -30 });
  shake(s, V + 0.05, 18);
  caption(7.85, 9.4, 'my best friend btw', 90, 80);
  burst(7.9, '😭', 480, 420, 7);
}

// ───────────────────────── S3 · Round 2 card (9.4–10.2s) ─────────────────────────

{
  const s = scene(9.4, 10.2, 'bg-party', 4);
  cut(9.4, s);
  const a = el('<div class="tk" style="top:600px;font-size:118px">round 2:<br><span class="y">sketch &amp; guess</span> 🎨</div>', s);
  pop(a, 9.42, { duration: 0.3 }, { scale: 2.2, rotation: -6 });
  const b = el('<div class="tk" style="top:1050px;font-size:72px">(kenji is drawing 😬)</div>', s);
  pop(b, 9.65, { duration: 0.25 }, { scale: 0.5 });
  sfx(9.65, 'pop', 0.8);
}

// ───────────────────────── S4 · Sketch & Guess fail (10.2–17.0s) ─────────────────────────

{
  const T = 10.2;
  const s = scene(T, 17.0, '', 5);
  cut(T, s);
  const app = appScreen(s);
  const body = el(
    `<div class="game-overlay" style="position:absolute;animation:none"><div class="game-head" style="border-bottom:3px solid #FF8A3D"><span style="font-size:30px">🎨</span><div class="gt"></div><span class="close-x" style="display:grid;place-items:center">🏠</span></div><div class="game-body"></div></div>`,
    app,
  ).querySelector('.game-body') as HTMLElement;
  body.innerHTML = `<div class="draw-layout" style="flex-direction:column"><div class="main" style="flex:none;width:100%;align-items:stretch"><div class="row" style="width:100%;justify-content:space-between"><span class="pill">✏️ Kenji</span><div class="word-display wd" style="flex:1">_ _ _</div><span class="pill">⏱ 41</span></div><div class="canvas-wrap" style="width:100%"><canvas width="800" height="600"></canvas></div></div><div class="side" style="width:auto;border:0"><div class="feed fd" style="font-size:18px;gap:7px"></div></div></div>`;
  const cvs = body.querySelector('canvas') as HTMLCanvasElement;
  const c = cvs.getContext('2d')!;
  const canvasWrap = body.querySelector('.canvas-wrap') as HTMLElement;
  // A gloriously bad cat.
  const wob = (cx: number, cy: number, rx: number, ry: number, n: number, j = 9): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + Math.sin(i * 2.7) * (j / 100);
      return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
    });
  const strokes: { col: string; w: number; pts: [number, number][] }[] = [
    { col: '#1E1A2E', w: 9, pts: wob(420, 400, 210, 120, 26, 14) }, // body (a potato, honestly)
    { col: '#1E1A2E', w: 9, pts: wob(250, 230, 105, 95, 20, 12) }, // head, way too big
    { col: '#1E1A2E', w: 9, pts: [[170, 160], [185, 70], [225, 145]] }, // ear
    { col: '#1E1A2E', w: 9, pts: [[275, 140], [330, 75], [335, 165]] }, // other ear, somewhere
    { col: '#1E1A2E', w: 7, pts: [[215, 215], [222, 222]] }, // eye
    { col: '#1E1A2E', w: 7, pts: [[290, 205], [297, 212]] }, // eye
    { col: '#1E1A2E', w: 6, pts: [[150, 255], [60, 240]] }, // whiskers
    { col: '#1E1A2E', w: 6, pts: [[150, 275], [65, 300]] },
    { col: '#1E1A2E', w: 9, pts: [[330, 500], [320, 575]] }, // legs
    { col: '#1E1A2E', w: 9, pts: [[420, 515], [425, 585]] },
    { col: '#1E1A2E', w: 9, pts: [[520, 505], [535, 580]] },
    { col: '#FF8A3D', w: 14, pts: [[625, 380], [700, 300], [690, 220], [740, 170]] }, // tail (orange, for some reason)
    { col: '#FF4D6D', w: 7, pts: [[240, 265], [255, 280], [270, 265]] }, // mouth
  ];
  const total = strokes.reduce((n, st) => n + st.pts.length, 0);
  updaters.push((t) => {
    if (t < T - 0.1 || t > 17.1) return;
    const prog = Math.min(1, Math.max(0, (t - (T + 0.15)) / 3.4));
    let budget = prog * total;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 800, 600);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const st of strokes) {
      if (budget <= 1) break;
      const n = Math.min(st.pts.length, Math.floor(budget));
      budget -= st.pts.length;
      c.strokeStyle = st.col;
      c.lineWidth = st.w;
      c.beginPath();
      st.pts.slice(0, n).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    }
  });
  caption(T + 0.1, 12.3, 'kenjis art skills:', 90, 72);
  const feed = body.querySelector('.fd') as HTMLElement;
  const guesses: [number, string, string][] = [
    [11.2, 'mia', 'a potato?'],
    [11.7, 'leo', 'cloud 💀'],
    [12.2, 'amaka', 'IS THAT A DOG'],
    [12.75, 'zara', 'bro what is that 😭'],
    [13.3, 'umar', 'kenji pls 💀'],
  ];
  for (const [t, id, text] of guesses) {
    const f = el(`<div class="feed-item guess"><b>${NAMES[id]}: </b>${text}</div>`, feed);
    pop(f, t, { duration: 0.25 }, { scale: 0.8, x: -20 });
    sfx(t, 'pop', 0.55);
  }
  punch(canvasWrap, 12.3, 1.06);
  caption(12.35, 14.4, '💀💀💀', 70, 110);
  unpunch(canvasWrap, 14.3);
  // somehow, Mia gets it
  const C = 14.5;
  const ok = el(`<div class="feed-item correct">Mia guessed it! +380 🎉</div>`, feed);
  pop(ok, C, { duration: 0.3 }, { scale: 0.7 });
  const wd = body.querySelector('.wd')!;
  tl.set(wd, { innerHTML: 'cat', className: 'word-display secret wd' }, C);
  tl.fromTo(wd, { scale: 1.8 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, C);
  sfx(C, 'correct', 1);
  const k2 = el(`<div class="feed-item chat"><b style="color:#FFD23F">Kenji: </b>see?? im an artist 🎨</div>`, feed);
  pop(k2, 15.6, { duration: 0.25 }, { scale: 0.8, x: -20 });
  sfx(15.6, 'pop', 0.55);
  caption(C + 0.25, 17.0, 'HOW did she get that 😭', 90, 76);
  shake(s, C + 0.25, 14);
  burst(14.8, '🎉', 480, 1350, 6);
}

// ───────────────────────── S4b · Emoji Charades (17.0–19.6s) ─────────────────────────

{
  const T = 17.0;
  const s = scene(T, 19.6, '', 6);
  cut(T, s);
  const app = appScreen(s);
  const body = el(
    `<div class="game-overlay" style="position:absolute;animation:none"><div class="game-head" style="border-bottom:3px solid #9B5DE5"><span style="font-size:30px">🎭</span><div class="gt"></div><span class="close-x" style="display:grid;place-items:center">🏠</span></div><div class="game-body"></div></div>`,
    app,
  ).querySelector('.game-body') as HTMLElement;
  body.innerHTML = `<div style="flex:1;display:flex;flex-direction:column"><div class="row" style="padding:8px 12px 0;justify-content:space-between"><span class="pill">🎭 Leo is acting</span><span class="pill" style="font-size:15px">🎬 Movie</span><span class="pill">⏱ 52</span></div><div class="word-display wd">_ _ _   _ _ _ _   _ _ _ _</div><div class="stage-box" style="height:280px"><canvas width="560" height="300"></canvas><div class="clue-strip"></div></div><div class="feed fd" style="font-size:18px;gap:7px"></div></div>`;
  const strip = body.querySelector('.clue-strip') as HTMLElement;
  ['🦁', '👑', '🌅'].forEach((e, i) => {
    const sp = el(`<span>${e}</span>`, strip);
    pop(sp, T + 0.25 + i * 0.25, { duration: 0.25 }, { scale: 0, y: 30 });
    sfx(T + 0.25 + i * 0.25, 'pop', 0.6);
  });
  const cv = body.querySelector('canvas') as HTMLCanvasElement;
  const c = cv.getContext('2d')!;
  updaters.push((t) => {
    if (t < T - 0.1 || t > 19.7) return;
    c.clearRect(0, 0, 560, 300);
    const pose = t < T + 0.9 ? 'angry' : t < T + 1.6 ? 'jump' : 'love';
    drawAvatar(c, CAST.leo, 280, 285, 3.6, { dir: 'down', anim: 'idle', t, pose });
  });
  caption(T + 0.05, 18.55, 'round 3: emoji charades 🎭', 90, 72);
  const feed = body.querySelector('.fd') as HTMLElement;
  const lines: [number, string, string][] = [
    [17.9, 'amaka', 'lion?'],
    [18.25, 'kenji', 'shrek?? 💀'],
  ];
  for (const [t, id, text] of lines) {
    const f = el(`<div class="feed-item guess"><b>${NAMES[id]}: </b>${text}</div>`, feed);
    pop(f, t, { duration: 0.25 }, { scale: 0.8, x: -20 });
    sfx(t, 'pop', 0.55);
  }
  const C = 18.6;
  const ok = el(`<div class="feed-item correct">Zara got it! +390 🎉</div>`, feed);
  pop(ok, C, { duration: 0.3 }, { scale: 0.7 });
  const wd = body.querySelector('.wd')!;
  tl.set(wd, { innerHTML: 'The Lion King', className: 'word-display secret wd' }, C);
  tl.fromTo(wd, { scale: 1.6 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, C);
  sfx(C, 'correct', 1);
  caption(C + 0.05, 19.6, 'zara redeeming herself 😭', 90, 76);
}

// ───────────────────────── S4c · Who's the Imposter (19.6–22.2s) ─────────────────────────

{
  const T = 19.6;
  const s = scene(T, 22.2, '', 7);
  cut(T, s);
  const app = appScreen(s);
  const body = el(
    `<div class="game-overlay" style="position:absolute;animation:none"><div class="game-head" style="border-bottom:3px solid #2EC4F1"><span style="font-size:30px">👀</span><div class="gt"></div><span class="close-x" style="display:grid;place-items:center">🏠</span></div><div class="game-body"></div></div>`,
    app,
  ).querySelector('.game-body') as HTMLElement;
  body.innerHTML = `<div style="flex:1"><div class="row" style="padding:10px 12px 0;justify-content:space-between"><span class="pill">🗳️ Vote</span><span class="pill">⏱ 33</span></div><div class="secret-card" style="background:linear-gradient(135deg,#2EC4F1,#3a2a9c)"><div style="font-weight:700">🍔 Food · The secret word is</div><div class="big">pizza</div></div><div class="clue-board"></div></div>`;
  const board = body.querySelector('.clue-board') as HTMLElement;
  const rows: [string, string][] = [
    ['umar', 'cheesy'],
    ['zara', 'italian'],
    ['leo', 'slice'],
    ['kenji', 'uh… round?'],
  ];
  let kenjiRow: HTMLElement | null = null;
  rows.forEach(([id, clue], i) => {
    const r = el(`<div class="clue-row"><img src="${portrait(id, 110)}"><span class="cn">${id === 'umar' ? 'You' : NAMES[id]}</span><div class="row wrap grow"><span class="clue-word">${clue}</span></div></div>`, board);
    pop(r.querySelector('.clue-word')!, T + 0.2 + i * 0.22, { duration: 0.25 }, { scale: 0 });
    sfx(T + 0.2 + i * 0.22, 'pop', 0.6);
    if (id === 'kenji') kenjiRow = r;
  });
  caption(T + 0.05, 20.8, 'round 4: who’s the imposter 👀', 90, 70);
  const votes = el('<span class="pill" style="background:var(--red)">🗳️ 4</span>', kenjiRow!);
  pop(votes, 20.85, { duration: 0.25 }, { scale: 0 });
  tl.set(kenjiRow!, { className: 'clue-row turn' }, 20.85);
  sfx(20.85, 'click', 0.9);
  const stamp = el('<div class="stamp" style="left:250px;top:1340px;font-size:120px">CAUGHT 😈</div>', s);
  pop(stamp, 21.1, { rotation: -10, duration: 0.3, ease: 'back.out(3)' }, { scale: 3, rotation: -30 });
  sfx(21.1, 'boom', 0.9);
  shake(s, 21.1, 16);
  caption(21.2, 22.2, 'kenji cannot lie to save his life 💀', 90, 66);
}

// ───────────────────────── S5 · Hanging out (22.2–26.2s) ─────────────────────────

{
  const T = 22.2;
  const B = T + 2.0; // cut to the bonfire
  const s = scene(T, 26.2, '', 8);
  cut(T, s);
  const app = appScreen(s);
  const w = makeWorld(app, 'umar', [
    P('umar', 7.4, 14.9, { action: 'dance', danceMove: 0 }),
    P('zara', 5.6, 14.3, { action: 'dance', danceMove: 1 }),
    P('leo', 9.3, 14.1, { action: 'dance', danceMove: 3 }),
    P('amaka', 6.2, 16.0, { action: 'dance', danceMove: 5 }),
    P('kenji', 8.8, 16.2, { action: 'dance', danceMove: 4 }),
    P('mia', 10.6, 15.4, { action: 'dance', danceMove: 2 }),
    P('tobi', 6.1, 24.1, { held: 'marshmallow', dir: 'right' }),
    P('sam', 10.3, 25.6, { held: 'marshmallow', dir: 'left' }),
    P('nia', 7.9, 26.4, { held: 'marshmallow', dir: 'up' }),
    P('rio', 22.0, 24.6),
  ]);
  hud(app);
  const cam = { x: 7.8, y: 15.0, zoom: 1.75 };
  tl.to(cam, { zoom: 1.95, duration: 2.0, ease: 'none' }, T);
  tl.set(cam, { x: 7.6, y: 24.6, zoom: 1.9 }, B);
  tl.to(cam, { zoom: 2.15, duration: 2.0, ease: 'none' }, B);
  updaters.push(() => (w.cinematic = { ...cam }));
  cut(B, s);
  caption(T + 0.1, B - 0.05, 'anyway we’re still friends 🕺', 300, 74);

  // the party chat, open over the dance floor
  const drawer = el(
    `<div class="chat-drawer" style="left:10px;width:370px;bottom:78px;height:300px;animation:none"><header><span>💬 Party chat</span></header><div class="chat-list cl" style="justify-content:flex-end"></div></div>`,
    app,
  );
  pop(drawer, T + 0.2, { duration: 0.3, ease: 'power3.out' }, { y: 60, scale: 1 });
  const list = drawer.querySelector('.cl') as HTMLElement;
  const msgs: [number, string, string][] = [
    [T + 0.35, 'zara', 'rematch. right now.'],
    [T + 0.75, 'leo', 'im not drinking the punch this time'],
    [T + 1.15, 'kenji', 'same time tmr?'],
    [T + 1.55, 'amaka', 'obviously 😭'],
  ];
  for (const [t, id, text] of msgs) {
    const m = el(`<div class="msg"><img src="${portrait(id, 96)}"><div style="min-width:0"><div class="who">${NAMES[id]}</div><div class="bubble">${text}</div></div></div>`, list);
    gsap.set(m, { display: 'none' });
    tl.set(m, { display: 'flex' }, t);
    pop(m, t, { duration: 0.22 }, { scale: 0.85, y: 20 });
    sfx(t, 'pop', 0.6);
  }
  hide(drawer, B - 0.05);
  at(T + 0.5, () => w.showEmote('zara', 'fire'));
  at(T + 1.0, () => w.showEmote('leo', 'laugh'));
  at(T + 1.4, () => w.showEmote('mia', 'heart'));

  // bonfire
  at(B + 0.15, () => w.showBubble('tobi', 'this is our house now'));
  at(B + 0.6, () => w.showEmote('sam', 'heart'));
  at(B + 0.9, () => w.showBubble('nia', 'every friday?? 🥺'));
  at(B + 1.4, () => w.showEmote('tobi', 'party'));
  sfx(B + 0.15, 'pop', 0.6);
  sfx(B + 0.9, 'pop', 0.6);
  caption(B + 0.1, 26.2, 'every friday now fr 🔥', 300, 74);
}

// ───────────────────────── S6 · CTA (26.2–31.0s) ─────────────────────────

{
  const T = 26.2;
  const s = scene(T, DURATION + 0.01, 'bg-party', 9);
  cut(T, s);
  const logo = el('<div class="abs center-x mega" style="top:150px;font-size:120px">HOUSE<br><span class="pink">PARTY</span></div>', s);
  pop(logo, T + 0.05, { rotation: -3, duration: 0.45 }, { scale: 2.2, rotation: 8 });
  const head = el('<div class="tk" style="top:450px;font-size:80px">your group chat <span class="y">needs</span> this 🫵</div>', s);
  pop(head, T + 0.45, { duration: 0.3 }, { scale: 0.6 });
  const games = el('<div class="abs" style="left:60px;right:150px;top:650px;text-align:center"></div>', s);
  ['🕵️ Mafia', '🎨 Sketch & Guess', '🎭 Emoji Charades', '👀 Imposter'].forEach((g, i) => {
    const ch = el(`<span class="feature-chip" style="font-size:38px;margin:6px">${g}</span>`, games);
    pop(ch, T + 0.75 + i * 0.1, { duration: 0.3 }, { scale: 0.4, y: 30 });
  });
  sfx(T + 0.45, 'boom', 0.7);
  const cv = el<HTMLCanvasElement>('<canvas width="1080" height="560" style="position:absolute;left:0;top:800px;width:1080px;height:560px"></canvas>', s);
  const c = cv.getContext('2d')!;
  const crew = ['zara', 'leo', 'umar', 'amaka', 'kenji'];
  updaters.push((t) => {
    if (t < T) return;
    c.clearRect(0, 0, 1080, 560);
    crew.forEach((id, i) => {
      const k = Math.min(1, Math.max(0, (t - T - 0.2 - i * 0.07) / 0.35));
      const e = 1 - Math.pow(1 - k, 3);
      drawAvatar(c, CAST[id], 140 + i * 200, 520 + (1 - e) * 300 - (i % 2 ? 0 : 18), i === 2 ? 6.3 : 5.6, {
        dir: 'down',
        anim: 'dance',
        t: t + i * 0.3,
        danceMove: [1, 3, 0, 5, 2][i],
        seed: i,
      });
    });
  });
  const btn = el('<div class="abs center-x" style="top:1370px"><span class="cta-btn" style="font-size:60px">play free 👉 houseparty.pro</span></div>', s);
  pop(btn, T + 1.3, { duration: 0.4 }, { scale: 0.3, y: 80 });
  sfx(T + 1.3, 'sparkle', 0.9);
  tl.to(btn, { scale: 1.05, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut' }, T + 1.8);
  const sub = el('<div class="abs center-x sub" style="top:1555px;font-size:40px">no download · send your friends a code</div>', s);
  pop(sub, T + 1.6, {}, { scale: 0.8, y: 30 });
}

// ───────────────────────── frame driver ─────────────────────────

window.__duration = DURATION;
window.__renderFrame = (t: number) => {
  curT = t;
  window.__clock.set(t * 1000);
  for (const e of events)
    if (!e.done && e.t <= t) {
      e.done = true;
      e.fn();
    }
  tl.seek(t, false);
  for (const u of updaters) u(t);
  window.__clock.flush();
};
window.__audio = () => renderSoundtrack(DURATION, cues, ARRANGEMENT);
window.__ready = document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 50)));

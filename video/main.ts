// House Party launch video. Renders deterministically: the capture script calls
// window.__renderFrame(t) for every frame, which advances a virtual clock, seeks the GSAP
// timeline and lets the real game engine draw.
import gsap from 'gsap';
import '../src/client/styles.css';
import './video.css';
import { World } from '../src/client/world/World';
import { avatarPortrait, drawAvatar } from '../src/client/world/avatarRender';
import { randomAvatar, type Avatar } from '../src/shared/avatar';
import type { PlayerState } from '../src/shared/types';
import { renderSoundtrack } from './audio';

declare global {
  interface Window {
    __clock: { set(ms: number): void; flush(): void };
    __renderFrame(t: number): void;
    __duration: number;
    __ready: Promise<void>;
    __audio(): Promise<string>;
  }
}

export const DURATION = 40;
const stage = document.getElementById('stage')!;
const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out', duration: 0.45 } });
const updaters: ((t: number) => void)[] = [];
const events: { t: number; fn: () => void; done: boolean }[] = [];
export const cues: { t: number; name: string; gain?: number }[] = [];
const at = (t: number, fn: () => void) => events.push({ t, fn, done: false });
const sfx = (t: number, name: string, gain = 1) => cues.push({ t, name, gain });

function el<T extends HTMLElement = HTMLElement>(html: string, parent: HTMLElement = stage): T {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  const e = d.firstElementChild as T;
  parent.appendChild(e);
  return e;
}

function scene(start: number, end: number, cls = '', z = 1) {
  const s = el(`<div class="scene ${cls}" style="z-index:${z}"></div>`);
  tl.set(s, { visibility: 'visible' }, start);
  tl.set(s, { visibility: 'hidden' }, end);
  return s;
}

/** Hide now, pop in at time t. */
function pop(target: gsap.TweenTarget, t: number, opts: gsap.TweenVars = {}, from: gsap.TweenVars = {}) {
  gsap.set(target, { autoAlpha: 0, scale: 0.4, ...from });
  tl.to(target, { autoAlpha: 1, scale: 1, x: 0, y: 0, rotation: 0, duration: 0.5, ease: 'back.out(2.2)', ...opts }, t);
}

function out(target: gsap.TweenTarget, t: number, opts: gsap.TweenVars = {}) {
  tl.to(target, { autoAlpha: 0, scale: 0.8, duration: 0.25, ease: 'power2.in', ...opts }, t);
}

/** Split text into word spans and stagger them in. */
function words(container: HTMLElement, html: string, t: number, stagger = 0.07) {
  container.innerHTML = html
    .split(/(<[^>]+>[^<]*<\/[^>]+>|\s+)/)
    .filter((w) => w && !/^\s+$/.test(w))
    .map((w) => `<span class="word">${w}</span>`)
    .join(' ');
  const ws = container.querySelectorAll('.word');
  gsap.set(ws, { autoAlpha: 0, y: 60, scale: 0.6 });
  tl.to(ws, { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(2.5)', stagger }, t);
  return ws;
}

/** Quick white flash + incoming zoom used on hard cuts. */
function cut(t: number, incoming?: HTMLElement) {
  const f = el('<div class="flash"></div>');
  tl.fromTo(f, { opacity: 0.55 }, { opacity: 0, duration: 0.22, ease: 'power2.out', immediateRender: false }, t);
  if (incoming) tl.fromTo(incoming, { scale: 1.07 }, { scale: 1, duration: 0.45, ease: 'power3.out', immediateRender: false }, t);
  sfx(t - 0.06, 'whoosh', 0.8);
}

// ───────────────────────── cast ─────────────────────────

const base = (patch: Partial<Avatar>): Avatar => ({ ...randomAvatar(), facialHair: 'none', glasses: 'none', hat: 'none', ...patch });
const CAST: Record<string, Avatar> = {
  umar: base({ skin: '#8D5524', hairStyle: 'short', hairColor: '#1B1B1F', facialHair: 'goatee', top: 'hoodie', topColor: '#FF4D6D', accentColor: '#FFD23F', bottom: 'jeans', bottomColor: '#2B2D3A', eyes: 'happy', mouth: 'grin', shoeColor: '#FFFFFF', blush: false, freckles: false, earrings: false }),
  zara: base({ skin: '#F1C27D', hairStyle: 'long', hairColor: '#3B2417', top: 'dress', topColor: '#9B5DE5', accentColor: '#FFD23F', bottom: 'skirt', eyes: 'lashes', mouth: 'smile', earrings: true, blush: true, shoeColor: '#FF4D6D' }),
  leo: base({ skin: '#FFE0C7', hairStyle: 'curly', hairColor: '#D9A55B', top: 'jacket', topColor: '#2EC4F1', accentColor: '#FFFFFF', bottom: 'pants', bottomColor: '#2B2D3A', glasses: 'round', freckles: true, mouth: 'smirk', eyes: 'round' }),
  amaka: base({ skin: '#6B3E1E', hairStyle: 'braids', hairColor: '#1B1B1F', top: 'tank', topColor: '#FFD23F', bottom: 'shorts', bottomColor: '#4D6BFF', eyes: 'round', mouth: 'grin', glasses: 'shades', earrings: true }),
  tobi: base({ skin: '#A86B3C', hairStyle: 'afro', hairColor: '#1B1B1F', top: 'tee', topColor: '#3DDC97', hat: 'none' }),
  kenji: base({ skin: '#F9D2B4', hairStyle: 'spiky', hairColor: '#1B1B1F', top: 'jersey', topColor: '#FF8A3D', accentColor: '#FFFFFF', hat: 'headphones', hatColor: '#4D6BFF' }),
  jay: base({ skin: '#C68642', hairStyle: 'locs', hairColor: '#3B2417', top: 'sweater', topColor: '#F15BB5', accentColor: '#FFFFFF', hat: 'cap', hatColor: '#14151C' }),
  sofia: base({ skin: '#E0AC69', hairStyle: 'ponytail', hairColor: '#C0392B', top: 'tee', topColor: '#FFFFFF', accentColor: '#FF4D6D', bottom: 'skirt', bottomColor: '#14151C' }),
  dre: base({ skin: '#4A2A14', hairStyle: 'buzz', hairColor: '#1B1B1F', top: 'suit', accentColor: '#FF4D6D', glasses: 'shades' }),
  ivy: base({ skin: '#FFE0C7', hairStyle: 'bob', hairColor: '#FF6FA8', top: 'hoodie', topColor: '#9B5DE5', hat: 'party', hatColor: '#FFD23F' }),
  nia: base({ skin: '#8D5524', hairStyle: 'bun', hairColor: '#1B1B1F', top: 'dress', topColor: '#3DDC97', bottom: 'skirt', hat: 'flower' }),
  mia: base({ skin: '#F9D2B4', hairStyle: 'wavy', hairColor: '#F3D38A', top: 'tank', topColor: '#FF4D8D' }),
  sam: base({ skin: '#C68642', hairStyle: 'mohawk', hairColor: '#2BC79F', top: 'jacket', topColor: '#14151C', accentColor: '#2BC79F' }),
  lola: base({ skin: '#E0AC69', hairStyle: 'curly', hairColor: '#1B1B1F', top: 'sweater', topColor: '#2EC4F1', accentColor: '#FFFFFF', hat: 'beanie', hatColor: '#FF4D6D' }),
  kai: base({ skin: '#A86B3C', hairStyle: 'short', hairColor: '#6A3E1F', top: 'tee', topColor: '#4D6BFF', hat: 'crown' }),
  rio: base({ skin: '#F1C27D', hairStyle: 'wavy', hairColor: '#1B1B1F', top: 'hoodie', topColor: '#FFD23F', accentColor: '#14151C' }),
};
const NAMES: Record<string, string> = Object.fromEntries(Object.keys(CAST).map((k) => [k, k[0].toUpperCase() + k.slice(1)]));
const portrait = (id: string, size = 200) => avatarPortrait(CAST[id], size);

function P(id: string, x: number, y: number, extra: Partial<PlayerState> = {}): PlayerState {
  return { id, userId: id, name: NAMES[id], avatar: CAST[id], x, y, dir: 'down', moving: false, action: 'idle', danceMove: 0, held: 'none', isHost: id === 'umar', connected: true, ...extra };
}

const PLAYERS: PlayerState[] = [
  P('umar', 21.5, 10.6),
  P('tobi', 23.7, 10.9, { held: 'drink' }),
  P('kenji', 20.0, 12.2),
  P('jay', 24.6, 12.7, { held: 'pizza', dir: 'left' }),
  P('leo', 6.3, 14.6, { action: 'dance', danceMove: 0 }),
  P('sofia', 8.7, 13.7, { action: 'dance', danceMove: 1 }),
  P('dre', 10.3, 15.6, { action: 'dance', danceMove: 4 }),
  P('ivy', 4.6, 16.1, { action: 'dance', danceMove: 5 }),
  P('nia', 8.1, 16.5, { action: 'dance', danceMove: 3 }),
  P('amaka', 21.2, 24.6),
  P('mia', 25.3, 25.4),
  P('zara', 6.0, 24.2, { held: 'marshmallow', dir: 'right' }),
  P('sam', 10.4, 25.7, { held: 'marshmallow', dir: 'left' }),
  P('lola', 36.5, 13.7, { action: 'sit', dir: 'up' }),
  P('kai', 35.6, 7.2),
  P('rio', 6.5, 7.3, { held: 'pizza' }),
];

let curT = 0;
const beatAt = (t: number) => (t < 3 ? 0 : Math.max(0, 1 - (((t - 3) % 0.5) / 0.5) * 3.2));
const worlds: World[] = [];
const noop = { onMove() {}, onAction() {}, onTapPlayer() {}, onNearby() {}, onInteract() {}, onRoom() {} };
function makeWorld(canvas: HTMLCanvasElement, selfId: string) {
  const w = new World(canvas, selfId, noop);
  w.beat = () => beatAt(curT);
  w.setPlayers(PLAYERS);
  w.keysEnabled = false;
  worlds.push(w);
  return w;
}
const allWorlds = (fn: (w: World) => void) => worlds.forEach(fn);
const bubble = (t: number, id: string, text: string) => at(t, () => allWorlds((w) => w.showBubble(id, text)));
const emote = (t: number, id: string, e: string) => at(t, () => allWorlds((w) => w.showEmote(id, e)));

// ───────────────────────── S1 · Hook (0–3s) ─────────────────────────

{
  const s = scene(0, 3.0, 'bg-night', 2);
  el('<div class="map-dots"></div>', s);
  const pov = el('<div class="abs center-x" style="top:170px"><span class="pov">POV:</span></div>', s);
  const line = el('<div class="abs center-x head" style="top:290px"></div>', s);
  words(line, 'your friends live in <span class="y">4 different</span> countries 🌍', 0, 0.0);
  gsap.set(pov, { rotation: -3 });
  // Visible on frame 0 for sound-off viewers; just a tiny settle.
  tl.fromTo(line, { scale: 1.06 }, { scale: 1, duration: 0.5, immediateRender: false }, 0);

  const spots: [string, string, number, number][] = [
    ['umar', '🇳🇬 Lagos', 80, 690],
    ['zara', '🇬🇧 London', 740, 640],
    ['leo', '🇨🇦 Toronto', 110, 1230],
    ['amaka', '🇦🇪 Dubai', 720, 1280],
  ];
  const friends = spots.map(([id, city, x, y], i) => {
    const f = el(`<div class="friend" style="left:${x}px;top:${y}px"><div class="ring"><img src="${portrait(id, 220)}"></div><div class="city">${city}</div></div>`, s);
    pop(f, 0.12 + i * 0.16, {}, { y: 40 });
    sfx(0.12 + i * 0.16, 'pop', 0.7);
    tl.to(f, { y: -14, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.9 + i * 0.1);
    return f;
  });
  // swap the line
  const line2 = el('<div class="abs center-x head" style="top:290px"></div>', s);
  tl.to(line, { autoAlpha: 0, y: -40, duration: 0.2, ease: 'power2.in' }, 1.45);
  words(line2, '…but it\'s <span class="p">party night</span> 🎉', 1.55, 0.08);
  sfx(1.55, 'swoosh', 0.6);

  // house appears, friends fly into it, zoom through the door
  const house = el(
    `<svg class="house-icon" viewBox="0 0 64 64"><path d="M8 30 32 9l24 21v23a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="#FF4D8D" stroke="#3b1050" stroke-width="1.6"/><rect x="26" y="38" width="12" height="18" rx="2" fill="#FFD23F" stroke="#3b1050" stroke-width="1.2"/><rect x="14" y="34" width="8" height="8" rx="1.5" fill="#FFE8A0"/><rect x="42" y="34" width="8" height="8" rx="1.5" fill="#FFE8A0"/><circle cx="50" cy="12" r="4" fill="#2EC4F1"/><text x="44" y="24" font-size="8">🎵</text></svg>`,
    s,
  );
  pop(house, 2.05, { duration: 0.45 }, { scale: 0.2, rotation: -20 });
  sfx(2.05, 'pop', 1);
  friends.forEach((f, i) => {
    tl.to(f, { x: 540 - (f.offsetLeft + 115), y: 960 - (f.offsetTop + 100), scale: 0.15, autoAlpha: 0, duration: 0.45, ease: 'power3.in' }, 2.15 + i * 0.05);
  });
  tl.to(house, { scale: 9, y: 520, duration: 0.55, ease: 'power3.in' }, 2.5);
  tl.to([pov, line2], { autoAlpha: 0, y: -80, duration: 0.3, ease: 'power2.in' }, 2.5);
  sfx(2.45, 'riser', 0.9);
}

// ───────────────────────── World layer (S2 3–8s, S6 20–26s) ─────────────────────────

const worldLayer = el('<div class="scene" style="z-index:1"></div>');
tl.set(worldLayer, { visibility: 'visible' }, 3.0).set(worldLayer, { visibility: 'hidden' }, 8.0);
tl.set(worldLayer, { visibility: 'visible' }, 20.0).set(worldLayer, { visibility: 'hidden' }, 26.0);
const mainCanvas = el<HTMLCanvasElement>('<canvas class="world" style="position:absolute;inset:0;width:1080px;height:1920px"></canvas>', worldLayer);
const mainWorld = makeWorld(mainCanvas, '__director');
const cam = { x: 22.3, y: 10.4, zoom: 3.3 };
updaters.push(() => {
  mainWorld.cinematic = { ...cam };
});

// Someone walking through the living room for life in the shot.
function walk(id: string, from: [number, number], to: [number, number], t0: number, t1: number) {
  updaters.push((t) => {
    if (t < t0 - 0.1 || t > t1 + 0.2) return;
    const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const x = from[0] + (to[0] - from[0]) * k;
    const y = from[1] + (to[1] - from[1]) * k;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    allWorlds((w) => w.applyMoves([{ id, x, y, dir, moving: k > 0 && k < 1 }]));
  });
}

// ───────────────────────── S2 · Reveal (3–8s) ─────────────────────────

{
  const s = scene(3.0, 8.0, '', 3);
  cut(3.0, worldLayer);
  sfx(3.0, 'impact', 1);
  // camera: tight on the living room crowd, then pull back to the whole dollhouse
  tl.set(cam, { x: 22.3, y: 10.3, zoom: 3.4 }, 3.0);
  tl.to(cam, { x: 22.0, y: 10.6, zoom: 3.0, duration: 1.35, ease: 'sine.inOut' }, 3.0);
  tl.to(cam, { x: 22, y: 15.5, zoom: 0.745, duration: 1.25, ease: 'power3.inOut' }, 4.35);
  tl.to(cam, { zoom: 0.77, duration: 2.4, ease: 'sine.inOut' }, 5.6);
  bubble(3.12, 'tobi', 'omg you actually came 🥹');
  emote(3.3, 'umar', 'party');
  bubble(3.65, 'kenji', 'this house is unreal');
  emote(3.75, 'jay', 'laugh');
  walk('kenji', [20.0, 12.2], [22.4, 12.6], 3.9, 5.2);

  const logo = el('<div class="abs center-x mega" style="top:250px;font-size:150px">HOUSE<br><span class="pink">PARTY</span></div>', s);
  pop(logo, 5.0, { duration: 0.6, ease: 'back.out(1.8)' }, { scale: 2.4, rotation: -8 });
  tl.set(logo, { rotation: -3 }, 5.6);
  sfx(4.98, 'impact', 0.9);
  const tag = el('<div class="abs center-x sub" style="top:1360px;font-size:54px;line-height:1.25"></div>', s);
  words(tag, 'Your friends. <span style="color:#FFD23F">One house.</span> Any phone.', 5.7, 0.09);
  tl.to(logo, { scale: 1.04, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 6.0);
}

// ───────────────────────── S3 · Four phones, one party (8–12s) ─────────────────────────

function phone(parent: HTMLElement, x: number, y: number, w: number, appScale: number) {
  const h = 845 * appScale + 32;
  const ph = el(`<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><div class="notch"></div><div class="screen"><div class="app-frame" style="transform:scale(${appScale})"></div></div></div>`, parent);
  return { ph, app: ph.querySelector('.app-frame') as HTMLElement };
}

{
  const s = scene(8.0, 12.0, 'bg-party', 4);
  cut(8.0, s);
  const head = el('<div class="abs center-x head" style="top:150px"></div>', s);
  words(head, '<span class="y">4 countries.</span> 1 house.', 8.05, 0.1);
  const views: [string, string, number, number, number][] = [
    ['umar', '🇳🇬 Lagos', 95, 380, -4],
    ['leo', '🇨🇦 Toronto', 585, 400, 3],
    ['amaka', '🇦🇪 Dubai', 105, 1080, 3],
    ['zara', '🇬🇧 London', 590, 1100, -3],
  ];
  const scale = 300 / 390;
  views.forEach(([id, city, x, y, rot], i) => {
    const { ph, app } = phone(s, x, y, 332, scale);
    const cv = el<HTMLCanvasElement>('<canvas class="world"></canvas>', app);
    const w = makeWorld(cv, id);
    const pl = PLAYERS.find((p) => p.id === id)!;
    const c0 = { x: pl.x, y: pl.y - 0.9, zoom: 1.45 };
    updaters.push((t) => {
      const k = Math.min(1, Math.max(0, (t - 8) / 4));
      w.cinematic = { x: c0.x, y: c0.y, zoom: c0.zoom + k * 0.25 };
    });
    // mini HUD
    el(`<div class="hud-top" style="position:absolute"><div class="party-chip"><span class="pname">Umar's House Party</span><span class="pcode">K7XQ2</span></div></div>`, app);
    const banner = el(
      `<div class="game-banner" style="position:absolute;left:10px;right:10px;bottom:76px;width:auto"><span class="gb-emoji">🎨</span><div class="gb-text"><b>Zara</b> is starting <b>Sketch &amp; Guess</b><div class="muted small">3/12 joined</div></div><button class="btn green sm join">Join!</button></div>`,
      app,
    );
    el(`<div class="hud-bottom" style="position:absolute"><div class="hud-row"><div class="chat-pill"><span class="pill-icon" style="display:grid;place-items:center">💬</span><span class="muted">Say something…</span></div><span class="icon-btn">😀</span><span class="icon-btn">🕺</span><span class="games-btn">🎲</span></div></div>`, app);
    pop(banner, 10.0, { duration: 0.45, ease: 'back.out(1.6)' }, { y: 120, scale: 1 });
    const join = banner.querySelector('.join')!;
    tl.to(join, { scale: 0.82, duration: 0.08, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 10.75 + i * 0.07);
    const tag = el(`<div class="city-tag" style="left:${x - 14}px;top:${y - 26}px">${city}</div>`, s);
    pop(ph, 8.1 + i * 0.12, { rotation: rot, duration: 0.55, ease: 'back.out(1.7)' }, { y: 300, scale: 0.6, rotation: rot * 4 });
    pop(tag, 8.45 + i * 0.12, {}, { scale: 0.2 });
    sfx(8.1 + i * 0.12, 'pop', 0.6);
  });
  sfx(10.0, 'chime', 0.8);
  emote(11.0, 'umar', 'party');
  emote(11.05, 'leo', 'fire');
  emote(11.1, 'amaka', 'heart');
  emote(11.15, 'zara', 'clap');
  sfx(10.75, 'click', 0.8);
  const cap = el('<div class="abs center-x sub" style="top:1790px;font-size:40px">same party · live · from anywhere</div>', s);
  pop(cap, 9.2, {}, { scale: 0.8, y: 20 });
}

// ───────────────────────── S4 · Character creator (12–17s) ─────────────────────────

{
  const s = scene(12.0, 17.0, 'bg-party', 5);
  cut(12.0, s);
  const head = el('<div class="abs center-x head" style="top:150px"></div>', s);
  words(head, 'Make a character that\'s <span class="y">actually you</span>', 12.05, 0.08);

  const me = CAST.umar;
  const looks: Avatar[] = [
    { ...me, hairStyle: 'bald', facialHair: 'none', top: 'tee', topColor: '#D9DCE3', accentColor: '#D9DCE3', bottom: 'pants', bottomColor: '#6C7080', eyes: 'round', mouth: 'neutral', hat: 'none', glasses: 'none', shoeColor: '#14151C' },
    { ...me, hairStyle: 'afro', facialHair: 'none', top: 'tee', topColor: '#D9DCE3', accentColor: '#D9DCE3', bottom: 'pants', bottomColor: '#6C7080', eyes: 'round', mouth: 'smile', hat: 'none', glasses: 'none', shoeColor: '#14151C' },
    { ...me, hairStyle: 'afro', hairColor: '#8E5CF7', facialHair: 'none', top: 'tee', topColor: '#D9DCE3', bottom: 'pants', bottomColor: '#6C7080', mouth: 'smile', hat: 'none', glasses: 'none' },
    { ...me, hairStyle: 'afro', hairColor: '#8E5CF7', top: 'jacket', topColor: '#FF4D6D', accentColor: '#FFD23F', bottom: 'jeans', mouth: 'grin', hat: 'none', glasses: 'none' },
    { ...me, hairStyle: 'afro', hairColor: '#8E5CF7', top: 'jacket', topColor: '#FF4D6D', accentColor: '#FFD23F', bottom: 'jeans', mouth: 'grin', hat: 'none', glasses: 'shades' },
    { ...me, hairStyle: 'short', hairColor: '#1B1B1F', top: 'jacket', topColor: '#FF4D6D', accentColor: '#FFD23F', bottom: 'jeans', mouth: 'grin', hat: 'crown', hatColor: '#FFD23F', glasses: 'shades' },
    { ...me, hairStyle: 'short', hairColor: '#1B1B1F', top: 'hoodie', topColor: '#FF4D6D', accentColor: '#FFD23F', bottom: 'jeans', mouth: 'grin', hat: 'headphones', hatColor: '#2EC4F1', glasses: 'none', eyes: 'happy' },
    me,
  ];
  const labels = ['', 'hair ✂️', 'color 🎨', 'outfit 👕', 'glasses 😎', 'hats 👑', 'headphones 🎧', 'you ✨'];
  const changeT = (i: number) => 12.55 + i * 0.5;
  const cv = el<HTMLCanvasElement>('<canvas width="1000" height="1000" style="position:absolute;left:40px;top:430px;width:1000px;height:1000px"></canvas>', s);
  const c = cv.getContext('2d')!;
  const glow = el('<div class="abs" style="left:190px;top:1240px;width:700px;height:140px;border-radius:50%;background:radial-gradient(closest-side, rgba(255,210,63,0.45), transparent)"></div>', s);
  s.insertBefore(glow, cv);
  updaters.push((t) => {
    if (t < 12 || t > 17) return;
    let idx = 0;
    for (let i = 1; i < looks.length; i++) if (t >= changeT(i - 1)) idx = i;
    const since = idx ? t - changeT(idx - 1) : 1;
    const squash = since < 0.25 ? 1 + Math.sin((since / 0.25) * Math.PI) * 0.12 : 1;
    c.clearRect(0, 0, 1000, 1000);
    c.save();
    c.translate(500, 860);
    c.scale(1 / squash, squash);
    const dancing = t > 16.0;
    drawAvatar(c, looks[idx], 0, 0, 12, {
      dir: 'down',
      anim: dancing ? 'dance' : 'idle',
      t,
      danceMove: 3,
      emote: !dancing && since < 0.45 && idx > 0 ? 'wow' : null,
    });
    c.restore();
  });
  // option bubbles orbiting around the character
  const thumbs: [string, number, number][] = [
    [avatarPortrait({ ...me, hairStyle: 'braids' }, 128), 70, 520],
    [avatarPortrait({ ...me, hat: 'cowboy', hatColor: '#8B5E3C' }, 128), 860, 470],
    [avatarPortrait({ ...me, hairStyle: 'mohawk', hairColor: '#2BC79F' }, 128), 50, 1000],
    [avatarPortrait({ ...me, glasses: 'stars' }, 128), 870, 930],
    [avatarPortrait({ ...me, hat: 'party', hatColor: '#9B5DE5' }, 128), 110, 1330],
    [avatarPortrait({ ...me, hairStyle: 'bun', hairColor: '#FF6FA8' }, 128), 820, 1350],
  ];
  thumbs.forEach(([src, x, y], i) => {
    const o = el(`<div class="orbit" style="left:${x}px;top:${y}px"><img src="${src}"></div>`, s);
    pop(o, 12.3 + i * 0.1, {}, { scale: 0.2, rotation: i % 2 ? 30 : -30 });
    tl.to(o, { y: i % 2 ? -26 : 26, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 12.8);
  });
  const swatches = ['#FF4D6D', '#FFD23F', '#2EC4F1', '#3DDC97', '#9B5DE5'];
  swatches.forEach((col, i) => {
    const o = el(`<div class="orbit swatch-o" style="left:${300 + i * 110}px;top:1540px;background:${col}"></div>`, s);
    pop(o, 12.6 + i * 0.06, {}, { scale: 0, y: 60 });
  });
  // labels for each change
  const lab = el('<div class="abs center-x" style="top:400px"><span class="pill-cap" style="font-size:54px"></span></div>', s);
  const labSpan = lab.querySelector('span')!;
  gsap.set(lab, { autoAlpha: 0 });
  for (let i = 1; i < looks.length; i++) {
    const t = changeT(i - 1);
    tl.set(labSpan, { innerHTML: labels[i] }, t);
    tl.fromTo(lab, { autoAlpha: 1, scale: 1.35 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, t);
    sfx(t, i === looks.length - 1 ? 'sparkle' : 'pop', 0.8);
  }
  const chips = el('<div class="abs center-x" style="top:1680px;padding:0 80px"></div>', s);
  ['14 hairstyles', 'outfits', 'hats & glasses', 'every skin tone'].forEach((txt, i) => {
    const ch = el(`<span class="feature-chip">${txt}</span>`, chips);
    pop(ch, 16.0 + i * 0.1, {}, { scale: 0.3, y: 40 });
  });
}

// ───────────────────────── S5 · Invite (17–20s) ─────────────────────────

const APP_SCALE = 618 / 390;
function bigPhone(parent: HTMLElement, top = 420) {
  return phone(parent, (1080 - 650) / 2, top, 650, APP_SCALE);
}

{
  const s = scene(17.0, 20.0, 'bg-party', 6);
  cut(17.0, s);
  const head = el('<div class="abs center-x head" style="top:150px"></div>', s);
  words(head, 'Send a code. <span class="c">They\'re in.</span>', 17.05, 0.09);
  const { ph, app } = bigPhone(s);
  pop(ph, 17.0, { duration: 0.5, ease: 'back.out(1.5)' }, { y: 400, scale: 0.9 });
  const inviteCv = el<HTMLCanvasElement>('<canvas class="world"></canvas>', app);
  const inviteWorld = makeWorld(inviteCv, 'umar');
  updaters.push((t) => {
    inviteWorld.cinematic = { x: 22.2, y: 10.2 + Math.min(1, Math.max(0, t - 17)) * 0.2, zoom: 1.7 };
  });
  el('<div style="position:absolute;inset:0;background:rgba(8,3,22,0.55)"></div>', app);
  const sheet = el(
    `<div class="modal" style="position:absolute;left:0;right:0;bottom:0;max-height:none;border-radius:26px 26px 0 0;animation:none">
      <div class="modal-head"><h2>Invite friends</h2><span class="close-x" style="display:grid;place-items:center">✕</span></div>
      <div style="display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center">
        <p class="muted" style="margin:0">Share this code. Friends can join from anywhere in the world.</p>
        <div class="logo code-v" style="font-size:64px;letter-spacing:10px;transform:none;min-height:70px"></div>
        <button class="btn yellow lg block share">📤 Share invite link</button>
        <div class="pill live copied" style="font-size:15px;padding:8px 14px">✅ Link copied, sent to the group chat</div>
      </div>
    </div>`,
    app,
  );
  gsap.set(sheet, { yPercent: 100 });
  tl.to(sheet, { yPercent: 0, duration: 0.45, ease: 'power3.out' }, 17.2);
  const code = sheet.querySelector('.code-v') as HTMLElement;
  'K7XQ2'.split('').forEach((ch, i) => {
    const sp = el(`<span style="display:inline-block">${ch}</span>`, code);
    pop(sp, 17.5 + i * 0.1, { duration: 0.3 }, { scale: 2.5, y: -30 });
    sfx(17.5 + i * 0.1, 'click', 0.7);
  });
  const share = sheet.querySelector('.share')!;
  tl.to(share, { scale: 0.9, duration: 0.09, yoyo: true, repeat: 1 }, 18.1);
  sfx(18.1, 'click', 1);
  pop(sheet.querySelector('.copied')!, 18.2, { duration: 0.35 }, { scale: 0.5 });
  const toasts: [string, string][] = [
    ['zara', 'Zara joined the party 🎉'],
    ['leo', 'Leo joined the party 🎉'],
    ['amaka', 'Amaka joined the party 🎉'],
  ];
  toasts.forEach(([id, txt], i) => {
    const tst = el(`<div class="toast-v abs" style="left:260px;top:${560 + i * 120}px"><img src="${portrait(id, 160)}">${txt}</div>`, s);
    pop(tst, 18.35 + i * 0.32, { duration: 0.45, ease: 'back.out(1.8)' }, { x: 300, scale: 0.9 });
    sfx(18.35 + i * 0.32, 'chime', 0.7);
  });
}

// ───────────────────────── S6 · Hang out (20–26s) ─────────────────────────

{
  const s = scene(20.0, 26.0, '', 7);
  const head = el('<div class="abs center-x" style="top:150px"><span class="pill-cap" style="font-size:58px">Hang out like you\'re <span style="color:#FFD23F">&nbsp;actually there</span></span></div>', s);
  pop(head, 20.05, {}, { scale: 0.6, y: -40 });
  const shots: { t: number; x: number; y: number; z0: number; z1: number; cap: string }[] = [
    { t: 20.0, x: 22.4, y: 10.6, z0: 3.9, z1: 4.3, cap: '💬 Chat' },
    { t: 21.5, x: 7.5, y: 14.9, z0: 3.0, z1: 3.35, cap: '🕺 Dance' },
    { t: 23.0, x: 23.2, y: 24.5, z0: 3.4, z1: 3.75, cap: '🏊 Swim' },
    { t: 24.5, x: 8.2, y: 24.5, z0: 3.3, z1: 3.7, cap: '🔥 Roast marshmallows' },
  ];
  shots.forEach((sh, i) => {
    tl.set(cam, { x: sh.x, y: sh.y, zoom: sh.z0 }, sh.t);
    tl.to(cam, { zoom: sh.z1, y: sh.y + 0.1, duration: 1.5, ease: 'none' }, sh.t);
    cut(sh.t, worldLayer);
    const cap = el(`<div class="abs center-x" style="top:1500px"><span class="pill-cap">${sh.cap}</span></div>`, s);
    pop(cap, sh.t + 0.05, { duration: 0.4 }, { scale: 0.4, y: 60 });
    out(cap, sh.t + 1.38, { duration: 0.12 });
    if (i === 0) sfx(sh.t, 'impact', 0.6);
  });
  bubble(20.12, 'tobi', 'you made it!!! 😭');
  emote(20.35, 'umar', 'wave');
  bubble(20.75, 'jay', 'ok this is actually fun');
  emote(21.65, 'sofia', 'fire');
  emote(22.1, 'dre', 'party');
  emote(22.4, 'ivy', 'heart');
  bubble(23.1, 'mia', "pool's open 🏊");
  emote(23.55, 'amaka', 'laugh');
  bubble(24.6, 'zara', 'best. night. ever.');
  emote(25.0, 'sam', 'heart');
}

// ───────────────────────── S7 · Game night (26–35s) ─────────────────────────

{
  const s = scene(26.0, 27.0, 'bg-party', 8);
  cut(26.0, s);
  sfx(26.0, 'impact', 1.2);
  const burst = el('<div class="abs" style="left:-460px;top:-0px;width:2000px;height:2000px;background:repeating-conic-gradient(rgba(255,210,63,0.16) 0 10deg, transparent 10deg 20deg);border-radius:50%"></div>', s);
  tl.fromTo(burst, { rotation: 0 }, { rotation: 40, duration: 1, ease: 'none', immediateRender: false }, 26.0);
  const t1 = el('<div class="abs center-x mega" style="top:640px;font-size:190px">GAME<br><span class="pink">NIGHT</span></div>', s);
  pop(t1, 26.02, { duration: 0.5, ease: 'back.out(2)' }, { scale: 3, rotation: 10 });
  const dice = el('<div class="abs center-x" style="top:1130px;font-size:180px">🎲</div>', s);
  pop(dice, 26.2, { rotation: 360, duration: 0.6 }, { scale: 0, rotation: -180 });
  const sub = el('<div class="abs center-x sub" style="top:1380px">4 party games, built right in</div>', s);
  pop(sub, 26.4, {}, { scale: 0.7, y: 30 });
}

function gameScene(start: number, title: string, emoji: string, color: string, players: string) {
  const s = scene(start, start + 2.0, 'bg-party', 9);
  cut(start, s);
  const lab = el(`<div class="abs center-x" style="top:150px"><span class="game-label" style="background:${color}">${emoji} ${title}</span></div>`, s);
  pop(lab, start + 0.02, { duration: 0.45 }, { scale: 0.3, rotation: -6 });
  const pl = el(`<div class="abs center-x sub" style="top:310px;font-size:36px;opacity:.9">${players}</div>`, s);
  pop(pl, start + 0.15, {}, { scale: 0.8 });
  const { ph, app } = bigPhone(s, 400);
  pop(ph, start, { duration: 0.45, ease: 'power3.out' }, { y: 260, scale: 0.95 });
  return { s, app };
}

function gameHead(app: HTMLElement, emoji: string, name: string, color: string, extra = '') {
  return el(
    `<div class="game-overlay" style="position:absolute;animation:none"><div class="game-head" style="border-bottom:3px solid ${color}"><span style="font-size:30px">${emoji}</span><div class="gt"><h2>${name}</h2><div class="sub">Playing</div></div>${extra}<span class="close-x" style="display:grid;place-items:center">🏠</span></div><div class="game-body"></div></div>`,
    app,
  ).querySelector('.game-body') as HTMLElement;
}

function timerSvg(sec: number, col = '#3DDC97') {
  const r = 21;
  const circ = 2 * Math.PI * r;
  return `<div class="timer"><svg width="50" height="50"><circle cx="25" cy="25" r="${r}" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.12)" stroke-width="5"/><circle cx="25" cy="25" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - sec / 80)}"/></svg><div class="tnum">${sec}</div></div>`;
}

function feedLine(parent: HTMLElement, t: number, html: string, cls = '') {
  const f = el(`<div class="feed-item ${cls}">${html}</div>`, parent);
  pop(f, t, { duration: 0.3, ease: 'back.out(2)' }, { scale: 0.7, x: -30 });
  return f;
}

function confettiBurst(parent: HTMLElement, t: number, cx: number, cy: number) {
  const cols = ['#FF4D8D', '#FFD23F', '#2EC4F1', '#3DDC97', '#9B5DE5', '#FF8A3D'];
  for (let i = 0; i < 26; i++) {
    const p = el(`<div class="confetti-v" style="left:${cx}px;top:${cy}px;background:${cols[i % cols.length]}"></div>`, parent);
    gsap.set(p, { autoAlpha: 0 });
    const a = (i / 26) * Math.PI * 2;
    const d = 220 + (i % 5) * 70;
    tl.set(p, { autoAlpha: 1 }, t);
    tl.to(p, { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8 + 160, rotation: 360 + i * 40, duration: 0.9, ease: 'power2.out' }, t);
    tl.to(p, { autoAlpha: 0, duration: 0.3 }, t + 0.7);
  }
}

// a) Sketch & Guess
{
  const T0 = 27.0;
  const { s, app } = gameScene(T0, 'Sketch & Guess', '🎨', '#FF8A3D', 'one draws · everyone guesses');
  const body = gameHead(app, '🎨', 'Sketch & Guess', '#FF8A3D');
  body.innerHTML = `<div class="draw-layout"><div class="main" style="flex:none;width:100%;align-items:stretch"><div class="row" style="width:100%;justify-content:space-between"><span class="pill">Round 1/2</span><div class="word-display" style="flex:1">_ _ _ _ _</div>${timerSvg(54)}</div><div class="canvas-wrap" style="width:100%"><canvas width="800" height="600"></canvas></div></div><div class="side"><div class="score-strip"></div><div class="feed"></div><div class="guess-bar"><input class="input" placeholder="Type your guess…"><span class="btn sm">Guess</span></div></div></div>`;
  const strip = body.querySelector('.score-strip') as HTMLElement;
  [['leo', 50, 'active'], ['amaka', 0, ''], ['kenji', 0, ''], ['zara', 0, '']].forEach(([id, sc, cls]) => {
    el(`<div class="score-chip ${cls}"><img src="${portrait(id as string, 60)}">${cls ? '✏️ ' : ''}${NAMES[id as string]}<b>${sc}</b></div>`, strip);
  });
  const feed = body.querySelector('.feed') as HTMLElement;
  feedLine(feed, T0 + 0.5, '<b>Kenji: </b>triangle?', 'guess');
  feedLine(feed, T0 + 0.85, '<b>Zara: </b>nachos!!', 'guess');
  feedLine(feed, T0 + 1.3, 'Amaka guessed it! +410 🎉', 'correct');
  const word = body.querySelector('.word-display') as HTMLElement;
  tl.set(word, { innerHTML: 'pizza', className: 'word-display secret' }, T0 + 1.3);
  tl.fromTo(word, { scale: 1.6 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, T0 + 1.3);
  confettiBurst(s, T0 + 1.3, 540, 900);
  sfx(T0 + 1.3, 'correct', 1);
  const cvs = body.querySelector('canvas') as HTMLCanvasElement;
  const c = cvs.getContext('2d')!;
  // A pizza slice, drawn stroke by stroke.
  const quad = (p0: number[], p1: number[], p2: number[], n: number): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const u = i / n;
      return [(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1]];
    });
  const strokes: { col: string; w: number; pts: [number, number][]; fill?: boolean }[] = [
    { col: '#C98A3B', w: 30, pts: quad([215, 190], [400, 105], [585, 190], 16) },
    { col: '#1E1A2E', w: 8, pts: [[225, 200], [400, 530], [575, 200]] },
    { col: '#FFD23F', w: 8, pts: quad([255, 225], [400, 175], [545, 225], 8).concat([[400, 480], [255, 225]] as [number, number][]) },
    ...[[345, 255], [450, 250], [400, 340], [360, 300], [440, 310], [400, 410]].map(([x, y]) => ({ col: '#E8303F', w: 6, pts: circlePts(x, y, 20, 10), fill: true })),
    { col: '#3DDC97', w: 7, pts: [[310, 238], [325, 250], [312, 258]] as [number, number][] },
    { col: '#3DDC97', w: 7, pts: [[480, 270], [495, 262], [488, 282]] as [number, number][] },
  ];
  const total = strokes.reduce((n, s2) => n + s2.pts.length, 0);
  updaters.push((t) => {
    if (t < T0 || t > T0 + 2.1) return;
    const prog = Math.min(1, Math.max(0, (t - (T0 + 0.1)) / 1.15));
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
      if (st.fill && n === st.pts.length) {
        c.fillStyle = st.col;
        c.fill();
      }
    }
  });
}

function circlePts(cx: number, cy: number, r: number, n: number): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r] as [number, number]);
}

// b) Mafia
{
  const T0 = 29.0;
  const { app } = gameScene(T0, 'Mafia', '🕵️', '#FF4D6D', 'secret roles · midnight drama');
  const body = gameHead(app, '🕵️', 'Mafia', '#FF4D6D');
  body.innerHTML = `<div class="mafia night"><div class="row" style="padding:10px 12px 0;justify-content:space-between"><span class="pill">🌙 Night 1</span>${timerSvg(27)}</div><div class="narration nar">Night 1. The house goes dark… Mafia, choose your target.</div><div style="position:relative;height:96px;margin-top:10px"><div class="role-card hidden rc-a" style="position:absolute;left:4%;right:4%;margin:0"><span class="re">🃏</span><b>Tap to peek at your role</b></div><div class="role-card rc-b" style="position:absolute;left:4%;right:4%;margin:0;background:linear-gradient(135deg,#FF4D6D,#7a1030)"><span class="re">🔪</span><div><div style="font-family:var(--display);font-size:22px">You are the Mafia</div><div class="small" style="font-weight:600">Pick someone to eliminate. Blend in by day.</div></div></div></div><div class="player-grid"></div></div>`;
  const a = body.querySelector('.rc-a')!;
  const b = body.querySelector('.rc-b')!;
  gsap.set(b, { rotationY: -90, autoAlpha: 0 });
  tl.to(a, { rotationY: 90, duration: 0.18, ease: 'power2.in' }, T0 + 0.35);
  tl.set(a, { autoAlpha: 0 }, T0 + 0.53);
  tl.to(b, { rotationY: 0, autoAlpha: 1, duration: 0.25, ease: 'back.out(2)' }, T0 + 0.53);
  sfx(T0 + 0.5, 'swoosh', 0.7);
  const grid = body.querySelector('.player-grid') as HTMLElement;
  const ids = ['umar', 'zara', 'leo', 'amaka', 'kenji', 'tobi'];
  const tiles: Record<string, HTMLElement> = {};
  ids.forEach((id) => {
    tiles[id] = el(`<div class="pg-item"><img src="${portrait(id, 116)}"><span class="nm">${id === 'umar' ? 'You' : NAMES[id]}</span></div>`, grid);
  });
  tl.set(tiles.zara, { className: 'pg-item picked' }, T0 + 0.95);
  tl.fromTo(tiles.zara, { scale: 1.15 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, T0 + 0.95);
  sfx(T0 + 0.95, 'click', 0.9);
  const nar = body.querySelector('.nar')!;
  tl.set(nar, { innerHTML: '☀️ Morning. Zara was found face-down in the punch bowl. 😱' }, T0 + 1.4);
  tl.fromTo(nar, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, T0 + 1.4);
  tl.set(tiles.zara, { className: 'pg-item dead' }, T0 + 1.4);
  tl.set(body.querySelector('.mafia'), { className: 'mafia day' }, T0 + 1.4);
  sfx(T0 + 1.4, 'death', 0.9);
}

// c) Emoji Charades
{
  const T0 = 31.0;
  const { app } = gameScene(T0, 'Emoji Charades', '🎭', '#9B5DE5', 'act it out · no words allowed');
  const body = gameHead(app, '🎭', 'Emoji Charades', '#9B5DE5');
  body.innerHTML = `<div style="flex:1;display:flex;flex-direction:column"><div class="row" style="padding:8px 12px 0;justify-content:space-between"><span class="pill">Turn 2/4</span><span class="pill" style="font-size:15px">🎬 Movie</span>${timerSvg(41, '#FFD23F')}</div><div class="word-display wd">_ _ _   _ _ _ _   _ _ _ _</div><div class="stage-box"><canvas width="560" height="300"></canvas><div class="clue-strip"></div><div style="position:absolute;bottom:6px;left:0;right:0;text-align:center;font-weight:700;z-index:3;text-shadow:0 2px 4px #000">🎭 Leo is acting</div></div><div class="feed fd"></div><div class="guess-bar"><input class="input" placeholder="What are they acting? Guess!"><span class="btn sm">Guess</span></div></div>`;
  const strip = body.querySelector('.clue-strip') as HTMLElement;
  ['🦁', '👑', '🌅', '🐗'].forEach((e, i) => {
    const sp = el(`<span>${e}</span>`, strip);
    pop(sp, T0 + 0.25 + i * 0.25, { duration: 0.3 }, { scale: 0, y: 30 });
    sfx(T0 + 0.25 + i * 0.25, 'pop', 0.6);
  });
  const feed = body.querySelector('.fd') as HTMLElement;
  feedLine(feed, T0 + 0.9, '<b>Mia: </b>lion?', 'guess');
  feedLine(feed, T0 + 1.3, 'Dre got it! +390 🎉', 'correct');
  const wd = body.querySelector('.wd')!;
  tl.set(wd, { innerHTML: 'The Lion King', className: 'word-display secret wd' }, T0 + 1.3);
  tl.fromTo(wd, { scale: 1.5 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, T0 + 1.3);
  sfx(T0 + 1.3, 'correct', 1);
  const cv = body.querySelector('canvas') as HTMLCanvasElement;
  const c = cv.getContext('2d')!;
  updaters.push((t) => {
    if (t < T0 || t > T0 + 2.1) return;
    c.clearRect(0, 0, 560, 300);
    const pose = t < T0 + 0.6 ? 'angry' : t < T0 + 1.3 ? 'jump' : 'love';
    drawAvatar(c, CAST.leo, 280, 275, 3.6, { dir: 'down', anim: 'idle', t, pose });
  });
}

// d) Imposter
{
  const T0 = 33.0;
  const { s, app } = gameScene(T0, "Who's the Imposter?", '👀', '#2EC4F1', 'everyone knows the word… except one');
  const body = gameHead(app, '👀', "Who's the Imposter?", '#2EC4F1');
  body.innerHTML = `<div style="flex:1"><div class="row" style="padding:10px 12px 0;justify-content:space-between"><span class="pill">🗳️ Vote</span>${timerSvg(60)}</div><div class="secret-card" style="background:linear-gradient(135deg,#2EC4F1,#3a2a9c)"><div style="font-weight:700">🍔 Food · The secret word is</div><div class="big">pizza</div></div><div class="clue-board"></div></div>`;
  const board = body.querySelector('.clue-board') as HTMLElement;
  const rows: [string, string][] = [
    ['umar', 'cheesy'],
    ['zara', 'italian'],
    ['leo', 'slice'],
    ['kenji', 'uh… round?'],
  ];
  let kenjiRow: HTMLElement | null = null;
  rows.forEach(([id, clue], i) => {
    const r = el(`<div class="clue-row"><img src="${portrait(id, 72)}"><span class="cn">${id === 'umar' ? 'You' : NAMES[id]}</span><div class="row wrap grow"><span class="clue-word">${clue}</span></div></div>`, board);
    const chip = r.querySelector('.clue-word')!;
    pop(chip, T0 + 0.2 + i * 0.2, { duration: 0.3 }, { scale: 0 });
    sfx(T0 + 0.2 + i * 0.2, 'pop', 0.6);
    if (id === 'kenji') kenjiRow = r;
  });
  const votes = el('<span class="pill" style="background:var(--red)">🗳️ 3</span>', kenjiRow!);
  pop(votes, T0 + 1.05, { duration: 0.3 }, { scale: 0 });
  tl.set(kenjiRow!, { className: 'clue-row turn' }, T0 + 1.05);
  sfx(T0 + 1.05, 'click', 0.9);
  const stamp = el('<div class="stamp" style="left:230px;top:1180px">CAUGHT! 😈</div>', s);
  pop(stamp, T0 + 1.35, { rotation: -12, duration: 0.35, ease: 'back.out(3)' }, { scale: 3, rotation: -30 });
  sfx(T0 + 1.35, 'impact', 0.9);
}

// ───────────────────────── S8 · CTA (35–40s) ─────────────────────────

{
  const s = scene(35.0, 40.01, 'bg-party', 10);
  cut(35.0, s);
  const cols = ['#FF4D8D', '#FFD23F', '#2EC4F1', '#3DDC97', '#9B5DE5', '#FF8A3D'];
  const conf = Array.from({ length: 34 }, (_, i) => {
    const p = el(`<div class="confetti-v" style="left:${(i * 97) % 1060}px;top:-40px;background:${cols[i % 6]}"></div>`, s);
    return { p, speed: 260 + ((i * 53) % 220), off: (i * 137) % 1900, spin: 200 + (i % 7) * 60 };
  });
  updaters.push((t) => {
    if (t < 35) return;
    const e = t - 35;
    for (const c of conf) gsap.set(c.p, { y: (c.off + e * c.speed) % 2000, rotation: e * c.spin });
  });
  const logo = el('<div class="abs center-x mega" style="top:200px;font-size:170px">HOUSE<br><span class="pink">PARTY</span></div>', s);
  pop(logo, 35.05, { rotation: -3, duration: 0.6, ease: 'back.out(1.8)' }, { scale: 2.6, rotation: 8 });
  sfx(35.0, 'impact', 1);
  const head = el('<div class="abs center-x head" style="top:570px;font-size:76px"></div>', s);
  words(head, 'Throw your first party <span class="y">tonight</span> 🎉', 35.6, 0.08);
  const cv = el<HTMLCanvasElement>('<canvas width="1080" height="560" style="position:absolute;left:0;top:830px;width:1080px;height:560px"></canvas>', s);
  const c = cv.getContext('2d')!;
  const crew = ['zara', 'leo', 'umar', 'amaka', 'kenji'];
  updaters.push((t) => {
    if (t < 35) return;
    c.clearRect(0, 0, 1080, 560);
    crew.forEach((id, i) => {
      const k = Math.min(1, Math.max(0, (t - 35.2 - i * 0.08) / 0.4));
      const ease = 1 - Math.pow(1 - k, 3);
      const x = 120 + i * 210;
      const y = 530 + (1 - ease) * 300 - (i % 2 ? 0 : 18);
      drawAvatar(c, CAST[id], x, y, i === 2 ? 6.8 : 6.0, { dir: 'down', anim: 'dance', t: t + i * 0.3, danceMove: [1, 3, 0, 5, 2][i], seed: i });
    });
  });
  const btn = el('<div class="abs center-x" style="top:1380px"><span class="cta-btn">Play free 🎉</span></div>', s);
  pop(btn, 36.3, { duration: 0.5 }, { scale: 0.3, y: 80 });
  sfx(36.3, 'pop', 1);
  tl.to(btn, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 37.0);
  const sub = el('<div class="abs center-x sub" style="top:1560px;font-size:42px">no download · works on any phone</div>', s);
  pop(sub, 36.7, {}, { scale: 0.8, y: 30 });
  const link = el('<div class="abs center-x" style="top:1650px"><span class="pill-cap" style="font-size:52px">🔗 link in bio</span></div>', s);
  pop(link, 37.0, {}, { scale: 0.5, y: 40 });
  sfx(37.0, 'sparkle', 0.8);
}

// ───────────────────────── frame driver ─────────────────────────

window.__duration = DURATION;
window.__renderFrame = (t: number) => {
  curT = t;
  window.__clock.set(t * 1000);
  for (const e of events) if (!e.done && e.t <= t) {
    e.done = true;
    e.fn();
  }
  tl.seek(t, false);
  for (const u of updaters) u(t);
  window.__clock.flush();
};
window.__audio = () => renderSoundtrack(DURATION, cues);
window.__ready = document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 50)));

// Preview mode: ?t=12.5 renders one frame; ?play plays in real time.
const q = new URLSearchParams(location.search);
if (q.has('t')) {
  const target = +q.get('t')!;
  window.__ready.then(() => {
    for (let t = 0; t <= target; t += 1 / 30) window.__renderFrame(t);
    window.__renderFrame(target);
  });
}

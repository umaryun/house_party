// Procedural chibi character renderer. Everything is drawn with canvas paths so any combination
// of customization options works without sprite sheets. Coordinates are in "character pixels":
// the feet are at (0, 0) and the character is ~56px tall at scale 1.
import type { Avatar } from '../../shared/avatar';
import type { Dir } from '../../shared/map';
import type { HeldItem } from '../../shared/types';
import { shade } from './color';

export type Anim = 'idle' | 'walk' | 'dance' | 'sit' | 'swim';

export interface RenderOpts {
  dir: Dir;
  anim: Anim;
  t: number; // seconds, monotonically increasing
  danceMove?: number;
  emote?: string | null; // active emote name
  emoteT?: number; // seconds since emote started
  pose?: string | null; // charades pose, overrides anim
  held?: HeldItem;
  seed?: number; // per-character phase offset
  ghost?: boolean;
}

interface Arm {
  a: number; // shoulder angle (0 = down, +outward, PI = up)
  b: number; // elbow bend added to lower arm
}

interface Pose {
  bob: number;
  tilt: number;
  shiftX: number;
  legL: number; // foot lift
  legR: number;
  legSpread: number;
  armL: Arm;
  armR: Arm;
  eyes: 'closed' | 'happy' | 'wide' | 'hearts' | null;
  mouth: 'open' | 'frown' | 'grin' | 'o' | 'flat' | null;
  brows: 'angry' | 'worried' | 'up' | null;
  tears: boolean;
  flush: boolean;
  zzz: boolean;
  sweat: boolean;
  hover: number;
  squash: number;
  faceDir: Dir | null;
  itemOverride: HeldItem | null;
}

const basePose = (): Pose => ({
  bob: 0,
  tilt: 0,
  shiftX: 0,
  legL: 0,
  legR: 0,
  legSpread: 0,
  armL: { a: 0.12, b: 0 },
  armR: { a: 0.12, b: 0 },
  eyes: null,
  mouth: null,
  brows: null,
  tears: false,
  flush: false,
  zzz: false,
  sweat: false,
  hover: 0,
  squash: 1,
  faceDir: null,
  itemOverride: null,
});

function computePose(o: RenderOpts): Pose {
  const p = basePose();
  const t = o.t + (o.seed ?? 0);
  const action = o.pose ?? (o.emote ? `emote:${o.emote}` : o.anim);
  const s = Math.sin;
  switch (action) {
    case 'idle':
      p.bob = s(t * 2.2) * 0.6;
      p.armL.a = 0.12 + s(t * 2.2) * 0.03;
      p.armR.a = 0.12 + s(t * 2.2) * 0.03;
      break;
    case 'walk':
    case 'run': {
      const sp = action === 'run' ? 16 : 11;
      const c = s(t * sp);
      p.bob = -Math.abs(c) * 2;
      p.legL = Math.max(0, c) * 4;
      p.legR = Math.max(0, -c) * 4;
      p.armL = { a: 0.15 + c * 0.6, b: action === 'run' ? -1 : -0.2 };
      p.armR = { a: 0.15 - c * 0.6, b: action === 'run' ? -1 : -0.2 };
      p.tilt = action === 'run' ? 0.06 : 0;
      if (action === 'run') p.sweat = true;
      break;
    }
    case 'sit':
      p.bob = 7;
      p.armL = { a: 0.35, b: -0.9 };
      p.armR = { a: 0.35, b: -0.9 };
      break;
    case 'swim':
    case 'pose:swim':
      p.bob = s(t * 3) * 1.5;
      p.armL = { a: 1.5 + s(t * 4) * 1.2, b: -0.4 };
      p.armR = { a: 1.5 - s(t * 4) * 1.2, b: -0.4 };
      break;
    case 'dance':
    case 'emote:party':
    case 'emote:fire':
      danceMoves(p, action === 'dance' ? o.danceMove ?? 0 : 3, t);
      p.eyes = action === 'dance' ? (Math.floor(t / 2.7) % 3 === 0 ? 'happy' : null) : 'happy';
      p.mouth = 'grin';
      break;
    case 'emote:wave':
    case 'wave':
      p.armR = { a: 2.3, b: 0.9 + s(t * 12) * 0.5 };
      p.mouth = 'grin';
      break;
    case 'emote:laugh':
    case 'laugh':
      p.bob = Math.abs(s(t * 18)) * -1.5;
      p.eyes = 'happy';
      p.mouth = 'open';
      p.armL = { a: 0.5, b: -1.8 };
      p.armR = { a: 0.5, b: -1.8 };
      p.tilt = s(t * 9) * 0.05;
      break;
    case 'emote:heart':
    case 'love':
      p.eyes = 'hearts';
      p.mouth = 'grin';
      p.flush = true;
      p.armL = { a: 0.9, b: -2.1 };
      p.armR = { a: 0.9, b: -2.1 };
      p.bob = s(t * 6) * 1;
      break;
    case 'emote:clap': {
      const c = Math.abs(s(t * 14));
      p.armL = { a: 0.6, b: -1.5 - c * 0.5 };
      p.armR = { a: 0.6, b: -1.5 - c * 0.5 };
      p.eyes = 'happy';
      p.mouth = 'grin';
      break;
    }
    case 'emote:cry':
    case 'cry':
      p.eyes = 'closed';
      p.mouth = 'frown';
      p.brows = 'worried';
      p.tears = true;
      p.armL = { a: 0.6, b: -2.4 };
      p.armR = { a: 0.6, b: -2.4 };
      p.bob = s(t * 10) * 0.8;
      break;
    case 'emote:wow':
      p.eyes = 'wide';
      p.mouth = 'o';
      p.brows = 'up';
      p.bob = -Math.max(0, s(t * 8)) * 3;
      p.armL = { a: 0.9, b: 0.3 };
      p.armR = { a: 0.9, b: 0.3 };
      break;
    case 'emote:angry':
    case 'angry':
      p.brows = 'angry';
      p.mouth = 'frown';
      p.flush = true;
      p.shiftX = s(t * 40) * 1;
      p.armL = { a: 0.4, b: -0.3 };
      p.armR = { a: 0.4, b: -0.3 };
      break;
    case 'emote:cheers':
      p.armR = { a: 2.6, b: 0.3 };
      p.mouth = 'grin';
      p.eyes = 'happy';
      p.itemOverride = 'drink';
      break;
    case 'sleep':
      p.eyes = 'closed';
      p.mouth = 'flat';
      p.zzz = true;
      p.tilt = 0.18;
      p.bob = s(t * 1.5) * 0.8;
      p.armL = { a: 0.1, b: 0 };
      p.armR = { a: 0.1, b: 0 };
      break;
    case 'jump': {
      const j = Math.abs(s(t * 5));
      p.hover = j * 14;
      p.squash = 1 + (1 - j) * 0.08;
      p.armL = { a: 2.4 * j + 0.3, b: 0 };
      p.armR = { a: 2.4 * j + 0.3, b: 0 };
      p.mouth = 'grin';
      break;
    }
    case 'think':
      p.armR = { a: 0.5, b: -2.3 };
      p.armL = { a: 0.3, b: -1.4 };
      p.brows = 'up';
      p.mouth = 'flat';
      p.tilt = 0.08;
      p.faceDir = Math.floor(t) % 2 ? 'left' : 'right';
      break;
    case 'scared':
      p.eyes = 'wide';
      p.mouth = 'o';
      p.brows = 'worried';
      p.shiftX = s(t * 50) * 1.2;
      p.armL = { a: 2.4, b: 0.8 };
      p.armR = { a: 2.4, b: 0.8 };
      p.sweat = true;
      break;
    case 'eat':
      p.armR = { a: 0.6, b: -2.3 + Math.abs(s(t * 6)) * 0.4 };
      p.mouth = Math.sin(t * 12) > 0 ? 'o' : 'flat';
      p.itemOverride = 'burger';
      break;
    case 'fly': {
      const f = s(t * 10);
      p.hover = 10 + s(t * 2) * 4;
      p.armL = { a: 1.6 + f * 0.5, b: 0 };
      p.armR = { a: 1.6 + f * 0.5, b: 0 };
      p.mouth = 'grin';
      break;
    }
    case 'point':
      p.armR = { a: 1.55, b: 0 };
      p.mouth = 'open';
      p.brows = 'up';
      p.faceDir = 'right';
      break;
    case 'shrug':
      p.armL = { a: 1.0, b: 1.6 };
      p.armR = { a: 1.0, b: 1.6 };
      p.brows = 'up';
      p.mouth = 'flat';
      p.bob = -Math.abs(s(t * 3)) * 1.5;
      break;
    default:
      if (action.startsWith('dance')) danceMoves(p, o.danceMove ?? 0, t);
  }
  return p;
}

function danceMoves(p: Pose, move: number, t: number) {
  const s = Math.sin;
  const beat = t * 2 * Math.PI * (124 / 60) * 0.5; // ~124bpm, one cycle per 2 beats
  switch (move % 6) {
    case 0: // bounce + pump
      p.bob = -Math.abs(s(beat)) * 4;
      p.armL = { a: 0.6 + Math.max(0, s(beat)) * 1.8, b: -0.6 };
      p.armR = { a: 0.6 + Math.max(0, -s(beat)) * 1.8, b: -0.6 };
      p.legL = Math.max(0, s(beat)) * 3;
      p.legR = Math.max(0, -s(beat)) * 3;
      break;
    case 1: // sway, arms overhead
      p.shiftX = s(beat) * 3;
      p.tilt = s(beat) * 0.12;
      p.armL = { a: 2.7 + s(beat) * 0.2, b: 0.2 };
      p.armR = { a: 2.7 - s(beat) * 0.2, b: 0.2 };
      p.bob = -Math.abs(s(beat * 2)) * 1.5;
      break;
    case 2: { // disco point
      const up = s(beat) > 0;
      p.armR = up ? { a: 2.5, b: 0 } : { a: 0.6, b: 0 };
      p.armL = { a: 0.3, b: -1.4 };
      p.shiftX = up ? 2 : -2;
      p.tilt = up ? -0.1 : 0.06;
      p.bob = -Math.abs(s(beat)) * 2;
      break;
    }
    case 3: { // jumpy hype
      const j = Math.abs(s(beat));
      p.hover = j * 7;
      p.armL = { a: 2.2 + j * 0.6, b: 0.3 };
      p.armR = { a: 2.2 + j * 0.6, b: 0.3 };
      p.squash = 1 + (1 - j) * 0.06;
      break;
    }
    case 4: { // robot
      const step = Math.floor(beat / (Math.PI / 2)) % 4;
      const angles: [Arm, Arm][] = [
        [{ a: 1.57, b: 1.57 }, { a: 0.1, b: 0 }],
        [{ a: 1.57, b: -1.57 }, { a: 1.57, b: 1.57 }],
        [{ a: 0.1, b: 0 }, { a: 1.57, b: -1.57 }],
        [{ a: 1.57, b: 1.57 }, { a: 1.57, b: 1.57 }],
      ];
      [p.armL, p.armR] = angles[step];
      p.shiftX = [0, 2, 0, -2][step];
      p.eyes = null;
      p.mouth = 'flat';
      break;
    }
    case 5: { // swing / floss-ish
      const w = s(beat * 2);
      p.armL = { a: 0.7 + w * 0.5, b: -0.4 };
      p.armR = { a: 0.7 - w * 0.5, b: -0.4 };
      p.shiftX = -w * 3;
      p.tilt = w * 0.05;
      p.bob = -Math.abs(w) * 2;
      break;
    }
  }
}

// ───────────────────────── drawing ─────────────────────────

const OUTLINE = 'rgba(20,16,40,0.55)';

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function fillStroke(c: CanvasRenderingContext2D, fill: string, lw = 1.2) {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = OUTLINE;
  c.stroke();
}

export function drawShadow(c: CanvasRenderingContext2D, x: number, y: number, scale: number, hover = 0) {
  c.save();
  c.fillStyle = `rgba(10,5,30,${0.28 - Math.min(0.15, hover / 100)})`;
  ellipse(c, x, y, 13 * scale * (1 - hover / 60), 4.5 * scale * (1 - hover / 60));
  c.fill();
  c.restore();
}

/** Draw a character with feet at (x, y). */
export function drawAvatar(c: CanvasRenderingContext2D, a: Avatar, x: number, y: number, scale: number, o: RenderOpts) {
  const p = computePose(o);
  const dir = p.faceDir ?? o.dir;
  const back = dir === 'up' && !o.pose;
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  if (o.ghost) c.globalAlpha = 0.45;
  if (o.anim !== 'swim') drawShadow(c, 0, 0, 1, p.hover);
  c.translate(p.shiftX, -p.hover);
  c.scale(1 / p.squash, p.squash);
  c.rotate(p.tilt);
  if (o.anim === 'swim') {
    // Only upper body above the water line.
    c.save();
    c.beginPath();
    c.rect(-40, -80, 80, 66);
    c.clip();
    c.translate(0, 10 + p.bob);
    drawBody(c, a, p, dir, back, o, true);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.5;
    ellipse(c, 0, -14, 15 + Math.sin(o.t * 3) * 1.5, 4);
    c.stroke();
  } else {
    c.translate(0, p.bob);
    drawBody(c, a, p, dir, back, o, false);
  }
  c.restore();
}

function drawBody(c: CanvasRenderingContext2D, a: Avatar, p: Pose, dir: Dir, back: boolean, o: RenderOpts, swimming: boolean) {
  const sit = o.anim === 'sit' && !o.pose;
  const fx = dir === 'left' ? -3.2 : dir === 'right' ? 3.2 : 0;
  // Long hair goes behind everything
  if (!back) drawHairBack(c, a);
  if (!swimming) drawLegs(c, a, p, sit);
  // Arms behind body when facing away
  if (back) {
    drawArm(c, a, p.armL, -1, o, p);
    drawArm(c, a, p.armR, 1, o, p);
  }
  drawTorso(c, a, back);
  if (!back) {
    drawArm(c, a, p.armL, -1, o, p);
    drawArm(c, a, p.armR, 1, o, p);
  }
  drawHead(c, a, p, fx, back, o);
}

function drawLegs(c: CanvasRenderingContext2D, a: Avatar, p: Pose, sit: boolean) {
  const legTop = -12;
  const showSkin = a.bottom === 'shorts' || a.bottom === 'skirt' || a.top === 'dress';
  for (const side of [-1, 1]) {
    const lift = side < 0 ? p.legL : p.legR;
    const lx = side * (4.2 + p.legSpread);
    const footY = sit ? -4 : -lift;
    const len = footY - legTop;
    // leg
    rrect(c, lx - 3.4, legTop, 6.8, len, 3);
    fillStroke(c, showSkin ? a.skin : a.bottomColor);
    if (a.bottom === 'shorts' && a.top !== 'dress') {
      rrect(c, lx - 3.8, legTop, 7.6, 6, 2);
      fillStroke(c, a.bottomColor);
    }
    // shoe
    rrect(c, lx - 4.2, footY - 3.2, 8.4, 4.4, 2.2);
    fillStroke(c, a.shoeColor);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(lx - 3, footY - 2.6, 3, 1.2);
  }
}

function sleeveColor(a: Avatar) {
  if (a.top === 'tank') return a.skin;
  if (a.top === 'suit') return '#23253A';
  return a.top === 'jacket' ? a.topColor : a.topColor;
}

function drawTorso(c: CanvasRenderingContext2D, a: Avatar, back: boolean) {
  const top = -27;
  const h = 17;
  const col = a.top === 'suit' ? '#23253A' : a.topColor;
  if (a.top === 'dress') {
    c.beginPath();
    c.moveTo(-7.5, top + 1);
    c.lineTo(7.5, top + 1);
    c.lineTo(12, -6);
    c.quadraticCurveTo(0, -3, -12, -6);
    c.closePath();
    fillStroke(c, col);
    c.fillStyle = shade(col, -0.15);
    c.fillRect(-7, top + 8, 14, 2.4);
    return;
  }
  if (a.bottom === 'skirt') {
    c.beginPath();
    c.moveTo(-8, -13);
    c.lineTo(8, -13);
    c.lineTo(11, -6);
    c.lineTo(-11, -6);
    c.closePath();
    fillStroke(c, a.bottomColor);
  }
  rrect(c, -9, top, 18, h, [6, 6, 4, 4] as any);
  fillStroke(c, a.top === 'tank' ? a.topColor : col);
  if (a.top === 'tank') {
    // shoulders show skin
    c.fillStyle = a.skin;
    c.beginPath();
    c.ellipse(-7.5, top + 2, 2.6, 2.2, 0, 0, Math.PI * 2);
    c.ellipse(7.5, top + 2, 2.6, 2.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  if (back) {
    if (a.top === 'hoodie') {
      c.fillStyle = shade(col, -0.18);
      rrect(c, -6, top - 1, 12, 7, 4);
      c.fill();
    }
    return;
  }
  switch (a.top) {
    case 'tee':
      c.fillStyle = a.accentColor;
      ellipse(c, 0, top + 8, 3.5, 3.5);
      c.fill();
      break;
    case 'hoodie':
      c.fillStyle = shade(col, -0.18);
      rrect(c, -6, -17.5, 12, 4.5, 2);
      c.fill();
      c.strokeStyle = a.accentColor;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-2, top + 2);
      c.lineTo(-2, top + 7);
      c.moveTo(2, top + 2);
      c.lineTo(2, top + 7);
      c.stroke();
      break;
    case 'jacket':
      c.fillStyle = a.accentColor;
      c.beginPath();
      c.moveTo(-3, top);
      c.lineTo(3, top);
      c.lineTo(2.5, -10);
      c.lineTo(-2.5, -10);
      c.closePath();
      c.fill();
      c.strokeStyle = shade(col, -0.3);
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-3, top);
      c.lineTo(-5.5, top + 6);
      c.moveTo(3, top);
      c.lineTo(5.5, top + 6);
      c.stroke();
      break;
    case 'sweater':
      c.fillStyle = a.accentColor;
      c.fillRect(-8.5, top + 6, 17, 2.2);
      c.fillRect(-8.5, top + 10.5, 17, 2.2);
      break;
    case 'suit':
      c.fillStyle = '#FFFFFF';
      c.beginPath();
      c.moveTo(-3.5, top);
      c.lineTo(3.5, top);
      c.lineTo(0, top + 9);
      c.closePath();
      c.fill();
      c.fillStyle = a.accentColor;
      c.beginPath();
      c.moveTo(-1.3, top + 1);
      c.lineTo(1.3, top + 1);
      c.lineTo(0.8, top + 8);
      c.lineTo(0, top + 9.5);
      c.lineTo(-0.8, top + 8);
      c.closePath();
      c.fill();
      break;
    case 'jersey':
      c.fillStyle = a.accentColor;
      c.fillRect(-8.6, top + 2, 2, h - 3);
      c.fillRect(6.6, top + 2, 2, h - 3);
      c.font = 'bold 8px Fredoka, sans-serif';
      c.textAlign = 'center';
      c.fillText('23', 0, top + 12);
      break;
    case 'tank':
      break;
  }
  // collar shading
  c.fillStyle = 'rgba(0,0,0,0.12)';
  ellipse(c, 0, top + 0.5, 4.5, 1.6);
  c.fill();
}

function armPoints(arm: Arm, side: number) {
  const sx = side * 8.2;
  const sy = -24.5;
  const d1 = { x: side * Math.sin(arm.a), y: Math.cos(arm.a) };
  const ex = sx + d1.x * 6.5;
  const ey = sy + d1.y * 6.5;
  const a2 = arm.a + arm.b;
  const hx = ex + side * Math.sin(a2) * 6;
  const hy = ey + Math.cos(a2) * 6;
  return { sx, sy, ex, ey, hx, hy };
}

function drawArm(c: CanvasRenderingContext2D, a: Avatar, arm: Arm, side: number, o: RenderOpts, p: Pose) {
  const { sx, sy, ex, ey, hx, hy } = armPoints(arm, side);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = OUTLINE;
  c.lineWidth = 6.6;
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(ex, ey);
  c.lineTo(hx, hy);
  c.stroke();
  c.strokeStyle = sleeveColor(a);
  c.lineWidth = 4.6;
  c.beginPath();
  c.moveTo(sx, sy);
  c.lineTo(ex, ey);
  if (a.top === 'tank' || a.top === 'tee' || a.top === 'jersey' || a.top === 'dress') {
    c.stroke();
    c.strokeStyle = a.skin;
    c.beginPath();
    c.moveTo(ex, ey);
  }
  c.lineTo(hx, hy);
  c.stroke();
  // hand
  ellipse(c, hx, hy, 2.6, 2.6);
  fillStroke(c, a.skin, 1);
  const item = p.itemOverride ?? o.held;
  if (side === 1 && item && item !== 'none') drawHeld(c, item, hx, hy);
}

function drawHeld(c: CanvasRenderingContext2D, item: HeldItem, x: number, y: number) {
  c.save();
  c.translate(x, y);
  switch (item) {
    case 'drink':
      c.beginPath();
      c.moveTo(-3, -7);
      c.lineTo(3, -7);
      c.lineTo(2.2, 2);
      c.lineTo(-2.2, 2);
      c.closePath();
      fillStroke(c, '#E8303F', 1);
      c.fillStyle = '#fff';
      c.fillRect(-3, -7, 6, 1.5);
      break;
    case 'pizza':
      c.beginPath();
      c.moveTo(-4, -6);
      c.lineTo(4, -6);
      c.lineTo(0, 3);
      c.closePath();
      fillStroke(c, '#FFC94A', 1);
      c.fillStyle = '#D9482B';
      ellipse(c, -1, -3.5, 1.1, 1.1);
      c.fill();
      ellipse(c, 1.3, -2, 1, 1);
      c.fill();
      c.fillStyle = '#C98A3B';
      c.fillRect(-4, -7, 8, 1.6);
      break;
    case 'marshmallow':
      c.strokeStyle = '#7A5230';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, 2);
      c.lineTo(6, -12);
      c.stroke();
      rrect(c, 4, -16, 5, 4, 1.5);
      fillStroke(c, '#FFF3E0', 1);
      break;
    case 'burger':
      rrect(c, -4.5, -5, 9, 3.5, 2);
      fillStroke(c, '#E7A54A', 1);
      c.fillStyle = '#5A3220';
      c.fillRect(-4.5, -1.8, 9, 2);
      c.fillStyle = '#5BBF4A';
      c.fillRect(-4.5, -2.4, 9, 0.8);
      rrect(c, -4.5, 0, 9, 2.2, 1);
      fillStroke(c, '#E7A54A', 1);
      break;
  }
  c.restore();
}

// ───────────── head ─────────────

const HEAD_Y = -39;
const HRX = 14.5;
const HRY = 13.5;

function drawHead(c: CanvasRenderingContext2D, a: Avatar, p: Pose, fx: number, back: boolean, o: RenderOpts) {
  c.save();
  c.translate(0, HEAD_Y);
  // neck
  c.fillStyle = shade(a.skin, -0.12);
  c.fillRect(-3, 9, 6, 4);
  // afro / big volume behind head
  if (a.hairStyle === 'afro') {
    ellipse(c, 0, -4, 21, 18.5);
    fillStroke(c, a.hairColor);
    curlRing(c, a.hairColor, 0, -4, 20, 17.5, 14, 4.2);
  }
  if (a.hairStyle === 'curly') {
    curlRing(c, a.hairColor, 0, -3, 15, 13.5, 13, 4.5, Math.PI * 1.02, Math.PI * 1.98);
  }
  if (back && a.hairStyle === 'ponytail') drawPonytail(c, a, o.t, true);
  if (!back && a.hairStyle === 'ponytail') drawPonytail(c, a, o.t, false);
  // ears
  if (!back) {
    for (const side of [-1, 1]) {
      if ((fx < 0 && side < 0) || (fx > 0 && side > 0)) continue;
      ellipse(c, side * (HRX - 0.5) + fx * 0.3, 2, 3.2, 3.8);
      fillStroke(c, a.skin, 1);
      if (a.earrings) {
        c.fillStyle = '#FFD23F';
        ellipse(c, side * (HRX - 0.5) + fx * 0.3, 6.6, 1.4, 1.4);
        c.fill();
      }
    }
  }
  // face
  ellipse(c, 0, 0, HRX, HRY);
  fillStroke(c, a.skin, 1.3);
  // soft face shading
  c.fillStyle = 'rgba(255,255,255,0.18)';
  ellipse(c, -4 + fx * 0.3, -5, 6, 4);
  c.fill();

  if (back) {
    drawHairBackView(c, a, o.t);
  } else {
    drawFace(c, a, p, fx, o.t + (o.seed ?? 0));
    drawHairFront(c, a, fx);
  }
  drawHat(c, a, back, fx);
  if (p.zzz) {
    c.fillStyle = '#fff';
    c.font = 'bold 9px Fredoka, sans-serif';
    const z = (o.t * 1.2) % 1;
    c.globalAlpha = 1 - z;
    c.fillText('z', 14 + z * 6, -16 - z * 12);
    c.globalAlpha = 1;
  }
  c.restore();
}

function curlRing(c: CanvasRenderingContext2D, color: string, cx: number, cy: number, rx: number, ry: number, n: number, r: number, from = 0, to = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const t = from + ((to - from) * i) / (to - from >= Math.PI * 2 - 0.01 ? n : n - 1);
    ellipse(c, cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, r, r);
    fillStroke(c, color, 1);
  }
}

function drawFace(c: CanvasRenderingContext2D, a: Avatar, p: Pose, fx: number, t: number) {
  const ey = 1.5;
  const ex = 5.4;
  // blush
  if (a.blush || p.flush) {
    c.fillStyle = p.flush ? 'rgba(255,60,80,0.45)' : 'rgba(255,110,130,0.35)';
    ellipse(c, -8 + fx, 6, 3, 1.8);
    c.fill();
    ellipse(c, 8 + fx, 6, 3, 1.8);
    c.fill();
  }
  if (a.freckles) {
    c.fillStyle = shade(a.skin, -0.35);
    for (const [dx, dy] of [[-8, 4], [-6.5, 5.5], [-9, 6], [8, 4], [6.5, 5.5], [9, 6]]) {
      ellipse(c, dx + fx, dy, 0.55, 0.55);
      c.fill();
    }
  }
  // eyes
  const blink = (t % 4.3) < 0.13;
  const style = p.eyes ?? a.eyes;
  for (const side of [-1, 1]) {
    const x = side * ex + fx;
    c.fillStyle = '#1E1A2E';
    c.strokeStyle = '#1E1A2E';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    if (style === 'hearts') {
      heart(c, x, ey, 3.2, '#FF3B6B');
      continue;
    }
    if (style === 'happy' || (style === 'wink' && side === 1)) {
      c.beginPath();
      c.arc(x, ey + 1.2, 2.6, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
      continue;
    }
    if (style === 'closed' || (blink && style !== 'wide')) {
      c.beginPath();
      c.arc(x, ey - 0.5, 2.5, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
      continue;
    }
    const big = style === 'wide' ? 1.3 : 1;
    ellipse(c, x, ey, 2.5 * big, 3.1 * big);
    c.fillStyle = '#fff';
    c.fill();
    ellipse(c, x + fx * 0.15, ey + 0.3, 1.9 * big, 2.5 * big);
    c.fillStyle = a.eyeColor;
    c.fill();
    ellipse(c, x + fx * 0.15, ey + 0.6, 1.1 * big, 1.5 * big);
    c.fillStyle = '#120F1C';
    c.fill();
    c.fillStyle = '#fff';
    ellipse(c, x + fx * 0.15 - 0.8, ey - 0.8, 0.75, 0.75);
    c.fill();
    if (style === 'sleepy' || style === 'cool') {
      c.fillStyle = a.skin;
      c.fillRect(x - 3.2, ey - 4, 6.4, style === 'sleepy' ? 3.6 : 2.4);
      c.beginPath();
      c.moveTo(x - 3, ey - (style === 'sleepy' ? 0.4 : 1.6));
      c.lineTo(x + 3, ey - (style === 'sleepy' ? 0.4 : 1.6));
      c.stroke();
    }
    if (style === 'lashes') {
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + side * 2.2, ey - 2);
      c.lineTo(x + side * 3.8, ey - 3.2);
      c.moveTo(x + side * 1, ey - 2.8);
      c.lineTo(x + side * 2, ey - 4.3);
      c.stroke();
    }
  }
  if (p.tears) {
    c.fillStyle = 'rgba(90,180,255,0.85)';
    const d = (t * 2) % 1;
    for (const side of [-1, 1]) {
      ellipse(c, side * ex + fx, ey + 3 + d * 7, 1.3, 2);
      c.fill();
    }
  }
  if (p.sweat) {
    c.fillStyle = 'rgba(120,200,255,0.9)';
    ellipse(c, 11 + fx * 0.5, -6, 1.4, 2.2);
    c.fill();
  }
  // brows
  const browStyle = a.brows;
  if (browStyle !== 'none' || p.brows) {
    c.strokeStyle = shade(a.hairColor === '#F2F2F2' ? '#B8B8C2' : a.hairColor, -0.2);
    c.lineWidth = browStyle === 'thick' ? 2.2 : 1.4;
    for (const side of [-1, 1]) {
      const x = side * ex + fx;
      c.beginPath();
      if (p.brows === 'angry') {
        c.moveTo(x - side * 2.8, -5.2);
        c.lineTo(x + side * 2.5, -3);
      } else if (p.brows === 'worried') {
        c.moveTo(x - side * 2.8, -3.5);
        c.lineTo(x + side * 2.5, -5.5);
      } else if (p.brows === 'up') {
        c.arc(x, -4, 2.8, Math.PI * 1.15, Math.PI * 1.85);
      } else if (browStyle === 'arched') {
        c.arc(x, -2.6, 3, Math.PI * 1.15, Math.PI * 1.85);
      } else {
        c.moveTo(x - 2.5, -4.4);
        c.lineTo(x + 2.5, -4.4);
      }
      c.stroke();
    }
  }
  // facial hair behind mouth
  drawFacialHair(c, a, fx);
  // mouth
  const my = 7.2;
  const mx = fx * 0.9;
  const m = p.mouth ?? a.mouth;
  c.strokeStyle = '#3A1E28';
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  switch (m) {
    case 'smile':
      c.beginPath();
      c.arc(mx, my - 2, 3, Math.PI * 0.2, Math.PI * 0.8);
      c.stroke();
      break;
    case 'grin':
      c.beginPath();
      c.moveTo(mx - 3.4, my - 0.8);
      c.quadraticCurveTo(mx, my + 4.5, mx + 3.4, my - 0.8);
      c.closePath();
      c.fillStyle = '#5A1E2E';
      c.fill();
      c.save();
      c.clip();
      c.fillStyle = '#fff';
      c.fillRect(mx - 4, my - 1, 8, 1.6);
      c.fillStyle = '#FF7A8A';
      ellipse(c, mx, my + 2.8, 2, 1.2);
      c.fill();
      c.restore();
      break;
    case 'neutral':
    case 'flat':
      c.beginPath();
      c.moveTo(mx - 2.2, my);
      c.lineTo(mx + 2.2, my);
      c.stroke();
      break;
    case 'smirk':
      c.beginPath();
      c.moveTo(mx - 2.5, my + 0.3);
      c.quadraticCurveTo(mx + 1, my + 1.5, mx + 3, my - 1.2);
      c.stroke();
      break;
    case 'open':
      ellipse(c, mx, my + 0.6, 2.8, 2.4);
      c.fillStyle = '#5A1E2E';
      c.fill();
      c.fillStyle = '#FF7A8A';
      ellipse(c, mx, my + 1.8, 1.6, 0.9);
      c.fill();
      break;
    case 'o':
      ellipse(c, mx, my + 0.6, 1.6, 2);
      c.fillStyle = '#5A1E2E';
      c.fill();
      break;
    case 'frown':
      c.beginPath();
      c.arc(mx, my + 2.5, 2.6, Math.PI * 1.2, Math.PI * 1.8);
      c.stroke();
      break;
    case 'tongue':
      c.beginPath();
      c.arc(mx, my - 2, 3, Math.PI * 0.2, Math.PI * 0.8);
      c.stroke();
      c.fillStyle = '#FF6F86';
      rrect(c, mx + 0.2, my + 0.4, 2.6, 2.8, 1.3);
      c.fill();
      break;
  }
  drawGlasses(c, a, fx, ex, ey);
}

function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  c.save();
  c.translate(x, y);
  c.beginPath();
  c.moveTo(0, s * 0.9);
  c.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.7, -s * 1.4, 0, -s * 0.5);
  c.bezierCurveTo(s * 0.7, -s * 1.4, s * 1.6, -s * 0.2, 0, s * 0.9);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function drawFacialHair(c: CanvasRenderingContext2D, a: Avatar, fx: number) {
  const col = a.hairColor;
  switch (a.facialHair) {
    case 'stubble':
      c.fillStyle = 'rgba(40,30,30,0.18)';
      c.beginPath();
      c.ellipse(fx * 0.5, 6.5, 10, 6, 0, 0, Math.PI);
      c.fill();
      break;
    case 'mustache':
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(fx * 0.9 - 2.2, 5.3, 2.8, 1.5, -0.2, 0, Math.PI * 2);
      c.ellipse(fx * 0.9 + 2.2, 5.3, 2.8, 1.5, 0.2, 0, Math.PI * 2);
      c.fill();
      break;
    case 'goatee':
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(fx * 0.9, 11, 2.6, 2.2, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(fx * 0.9 - 2, 5.4, 2.2, 1.1, -0.2, 0, Math.PI * 2);
      c.ellipse(fx * 0.9 + 2, 5.4, 2.2, 1.1, 0.2, 0, Math.PI * 2);
      c.fill();
      break;
    case 'beard':
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(-HRX + 0.5, 0);
      c.quadraticCurveTo(-HRX + 1, 13, fx, 14.5);
      c.quadraticCurveTo(HRX - 1, 13, HRX - 0.5, 0);
      c.lineTo(HRX - 3, 2);
      c.quadraticCurveTo(fx + 6, 4, fx, 4.5);
      c.quadraticCurveTo(fx - 6, 4, -HRX + 3, 2);
      c.closePath();
      c.fill();
      // mouth opening
      c.fillStyle = a.skin;
      ellipse(c, fx * 0.9, 7.6, 3.4, 1.8);
      c.fill();
      break;
  }
}

function drawGlasses(c: CanvasRenderingContext2D, a: Avatar, fx: number, ex: number, ey: number) {
  if (a.glasses === 'none') return;
  c.lineWidth = 1.2;
  c.strokeStyle = '#1E1A2E';
  const l = -ex + fx;
  const r = ex + fx;
  switch (a.glasses) {
    case 'round':
      ellipse(c, l, ey, 4, 4);
      c.stroke();
      ellipse(c, r, ey, 4, 4);
      c.stroke();
      break;
    case 'square':
      rrect(c, l - 4.2, ey - 3.3, 8.4, 6.6, 1.5);
      c.stroke();
      rrect(c, r - 4.2, ey - 3.3, 8.4, 6.6, 1.5);
      c.stroke();
      break;
    case 'shades':
      for (const x of [l, r]) {
        c.beginPath();
        c.moveTo(x - 4.4, ey - 2.8);
        c.lineTo(x + 4.4, ey - 2.8);
        c.quadraticCurveTo(x + 4, ey + 3.6, x, ey + 3.2);
        c.quadraticCurveTo(x - 4, ey + 3.6, x - 4.4, ey - 2.8);
        c.fillStyle = '#16131F';
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(x - 2.8, ey - 1.8, 2.2, 1);
      }
      break;
    case 'stars':
      for (const x of [l, r]) star(c, x, ey, 4.8, '#FF4DB8');
      break;
  }
  c.beginPath();
  c.moveTo(l + 4, ey - 0.5);
  c.lineTo(r - 4, ey - 0.5);
  c.stroke();
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.5 : r;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    c.lineTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
  }
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.stroke();
}

// ───────────── hair ─────────────

function drawHairBack(c: CanvasRenderingContext2D, a: Avatar) {
  const col = shade(a.hairColor, -0.12);
  c.save();
  c.translate(0, HEAD_Y);
  switch (a.hairStyle) {
    case 'long':
      rrect(c, -15.5, -6, 31, 30, [4, 4, 9, 9] as any);
      fillStroke(c, col);
      break;
    case 'wavy':
      c.beginPath();
      c.moveTo(-15.5, -4);
      for (let i = 0; i <= 6; i++) c.lineTo(-15.5 + i * 5.2, 15 + (i % 2 ? 3 : 0));
      c.lineTo(15.5, -4);
      c.closePath();
      fillStroke(c, col);
      break;
    case 'locs':
      for (let i = -3; i <= 3; i++) {
        rrect(c, i * 4.4 - 2.2, -2, 4.4, 20 + Math.abs(i), 2.2);
        fillStroke(c, col, 1);
      }
      break;
  }
  c.restore();
}

function hairCap(c: CanvasRenderingContext2D, col: string, fringe: (x: number) => number, alphaVal = 1) {
  c.save();
  c.globalAlpha *= alphaVal;
  c.beginPath();
  const steps = 24;
  // top arc of the head (slightly larger than the head)
  c.ellipse(0, -1, HRX + 1.2, HRY + 1.6, 0, Math.PI, 0);
  // fringe from right back to left
  for (let i = steps; i >= 0; i--) {
    const x = -HRX - 1.2 + ((2 * (HRX + 1.2)) * i) / steps;
    c.lineTo(x, fringe(x));
  }
  c.closePath();
  fillStroke(c, col, 1.2);
  c.restore();
}

function drawHairFront(c: CanvasRenderingContext2D, a: Avatar, fx: number) {
  const col = a.hairColor;
  const hi = 'rgba(255,255,255,0.22)';
  switch (a.hairStyle) {
    case 'bald':
      c.fillStyle = 'rgba(255,255,255,0.3)';
      ellipse(c, -4, -9, 4, 2);
      c.fill();
      return;
    case 'buzz':
      hairCap(c, col, (x) => -7.5 + Math.abs(x) * 0.25, 0.85);
      return;
    case 'short':
      hairCap(c, col, (x) => -5 - (x + 15) * 0.12 + Math.abs(Math.sin(x * 0.7)) * 1.2 + (Math.abs(x) > 12 ? 5 : 0));
      break;
    case 'spiky':
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(i * 4.2 - 4, -10);
        c.lineTo(i * 4.6 + fx * 0.3, -21 - (3 - Math.abs(i)) * 1.4);
        c.lineTo(i * 4.2 + 4, -10);
        c.closePath();
        fillStroke(c, col, 1);
      }
      hairCap(c, col, (x) => -5 + Math.abs(Math.sin(x * 0.6)) * 2.5 + (Math.abs(x) > 12 ? 5 : 0));
      break;
    case 'curly':
      hairCap(c, col, (x) => -5 + Math.abs(Math.sin(x * 0.5)) * 2.5 + (Math.abs(x) > 12 ? 4 : 0));
      curlRing(c, col, 0, -5, 11, 4, 6, 3.4, Math.PI * 1.1, Math.PI * 1.9);
      break;
    case 'afro':
      hairCap(c, col, (x) => -6 + Math.abs(Math.sin(x * 0.5)) * 2 + (Math.abs(x) > 12 ? 6 : 0));
      break;
    case 'wavy':
      hairCap(c, col, (x) => (x < 1 + fx ? -4 + Math.sin(x * 0.4) * 1.5 : -8) + (Math.abs(x) > 12 ? 10 : 0));
      sideStrands(c, col, 12);
      break;
    case 'long':
      hairCap(c, col, (x) => (Math.abs(x - fx * 0.4) < 1 ? -11 : -6.5 + Math.abs(x) * 0.12) + (Math.abs(x) > 11 ? 12 : 0));
      sideStrands(c, col, 18);
      break;
    case 'bob':
      hairCap(c, col, (x) => (Math.abs(x) > 11 ? 9 : -3.5));
      break;
    case 'ponytail':
      hairCap(c, col, (x) => -7 + Math.abs(x) * 0.15 + (Math.abs(x) > 12 ? 4 : 0));
      break;
    case 'bun':
      ellipse(c, 0, -17, 6.5, 6);
      fillStroke(c, col);
      hairCap(c, col, (x) => -7 + Math.abs(x) * 0.12 + (Math.abs(x) > 12 ? 5 : 0));
      break;
    case 'braids':
      hairCap(c, col, (x) => (Math.abs(x - fx * 0.4) < 0.8 ? -12 : -6 + Math.abs(x) * 0.1) + (Math.abs(x) > 12 ? 6 : 0));
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          ellipse(c, side * 13.5, 4 + i * 4, 2.8 - i * 0.15, 2.6);
          fillStroke(c, col, 1);
        }
        c.fillStyle = '#FF4D6D';
        c.fillRect(side * 13.5 - 2, 23, 4, 2);
      }
      break;
    case 'locs':
      hairCap(c, col, (x) => -6 + Math.abs(Math.sin(x * 0.6)) * 2 + (Math.abs(x) > 12 ? 6 : 0));
      for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          rrect(c, side * (12.5 + i * 2.5) - 2, -4, 4, 18 - i * 3, 2);
          fillStroke(c, col, 1);
        }
      }
      break;
    case 'mohawk':
      hairCap(c, col, (x) => -6 + Math.abs(x) * 0.1, 0.35);
      rrect(c, -3.2, -25, 6.4, 13, 3);
      fillStroke(c, col);
      break;
  }
  // shine
  c.strokeStyle = hi;
  c.lineWidth = 2;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(0, -1, HRX - 2, Math.PI * 1.25, Math.PI * 1.45);
  c.stroke();
}

function sideStrands(c: CanvasRenderingContext2D, col: string, len: number) {
  for (const side of [-1, 1]) {
    c.beginPath();
    c.moveTo(side * (HRX + 1.2), -2);
    c.quadraticCurveTo(side * (HRX + 2.5), len * 0.6, side * (HRX - 1), len);
    c.lineTo(side * (HRX - 5), len - 2);
    c.quadraticCurveTo(side * (HRX - 3), 4, side * (HRX - 4), -3);
    c.closePath();
    fillStroke(c, col, 1);
  }
}

function drawPonytail(c: CanvasRenderingContext2D, a: Avatar, t: number, back: boolean) {
  const sway = Math.sin(t * 3) * 2;
  c.beginPath();
  if (back) {
    c.moveTo(-4, -8);
    c.quadraticCurveTo(-6 + sway, 8, sway, 18);
    c.quadraticCurveTo(6 + sway, 8, 4, -8);
  } else {
    c.moveTo(10, -8);
    c.quadraticCurveTo(24 + sway, -4, 18 + sway, 12);
    c.quadraticCurveTo(14, 2, 8, -2);
  }
  c.closePath();
  fillStroke(c, a.hairColor);
}

function drawHairBackView(c: CanvasRenderingContext2D, a: Avatar, t: number) {
  const col = a.hairColor;
  if (a.hairStyle === 'bald') return;
  const cover = (bottom: number, alphaVal = 1) => {
    c.save();
    c.globalAlpha *= alphaVal;
    c.beginPath();
    c.ellipse(0, -1, HRX + 1.2, HRY + 1.6, 0, Math.PI, 0);
    c.lineTo(HRX + 1.2, bottom);
    c.quadraticCurveTo(0, bottom + 4, -HRX - 1.2, bottom);
    c.closePath();
    fillStroke(c, col);
    c.restore();
  };
  switch (a.hairStyle) {
    case 'buzz':
      cover(4, 0.85);
      break;
    case 'mohawk':
      cover(4, 0.35);
      rrect(c, -3.2, -25, 6.4, 34, 3);
      fillStroke(c, col);
      break;
    case 'long':
      cover(24);
      break;
    case 'wavy':
      cover(16);
      break;
    case 'bob':
      cover(9);
      break;
    case 'locs':
      cover(6);
      for (let i = -3; i <= 3; i++) {
        rrect(c, i * 4.2 - 2, 0, 4, 18 + Math.abs(i), 2);
        fillStroke(c, col, 1);
      }
      break;
    case 'braids':
      cover(6);
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++) {
          ellipse(c, side * 5, 8 + i * 4, 2.8, 2.6);
          fillStroke(c, col, 1);
        }
      break;
    case 'bun':
      cover(6);
      ellipse(c, 0, -15, 6.5, 6);
      fillStroke(c, col);
      break;
    case 'ponytail':
      cover(6);
      drawPonytail(c, a, t, true);
      break;
    case 'curly':
      cover(6);
      curlRing(c, col, 0, -2, 12, 9, 10, 3.6);
      break;
    case 'afro':
      cover(8);
      break;
    default:
      cover(6);
  }
}

// ───────────── hats ─────────────

function drawHat(c: CanvasRenderingContext2D, a: Avatar, back: boolean, fx: number) {
  const col = a.hatColor;
  const big = a.hairStyle === 'afro' ? 1.25 : 1;
  switch (a.hat) {
    case 'none':
      return;
    case 'cap':
      c.beginPath();
      c.ellipse(0, -7, 15.5 * big, 11 * big, 0, Math.PI, 0);
      c.closePath();
      fillStroke(c, col);
      if (!back) {
        c.beginPath();
        c.ellipse(fx * 1.5, -7, 13, 3.5, 0, 0, Math.PI);
        c.closePath();
        fillStroke(c, shade(col, -0.2));
      }
      c.fillStyle = shade(col, 0.3);
      ellipse(c, 0, -18 * big, 1.6, 1.2);
      c.fill();
      break;
    case 'beanie':
      c.beginPath();
      c.ellipse(0, -6, 15.8 * big, 13 * big, 0, Math.PI, 0);
      c.closePath();
      fillStroke(c, col);
      rrect(c, -16 * big, -8, 32 * big, 5, 2.5);
      fillStroke(c, shade(col, -0.15));
      ellipse(c, 0, -19 * big - 2, 3.5, 3.5);
      fillStroke(c, a.accentColor);
      break;
    case 'party': {
      c.save();
      c.translate(4, -14 * big);
      c.rotate(0.18);
      c.beginPath();
      c.moveTo(-7, 2);
      c.lineTo(0, -18);
      c.lineTo(7, 2);
      c.closePath();
      fillStroke(c, col);
      c.save();
      c.clip();
      c.fillStyle = a.accentColor;
      for (let i = 0; i < 3; i++) c.fillRect(-8, -14 + i * 6, 16, 2.4);
      c.restore();
      ellipse(c, 0, -18, 2.6, 2.6);
      fillStroke(c, '#FFD23F');
      c.restore();
      break;
    }
    case 'crown': {
      c.beginPath();
      const y0 = -11 * big;
      c.moveTo(-9, y0);
      c.lineTo(-10, y0 - 9);
      c.lineTo(-5, y0 - 4);
      c.lineTo(0, y0 - 11);
      c.lineTo(5, y0 - 4);
      c.lineTo(10, y0 - 9);
      c.lineTo(9, y0);
      c.closePath();
      fillStroke(c, '#FFC93C');
      c.fillStyle = '#FF4D6D';
      ellipse(c, 0, y0 - 3, 1.6, 1.6);
      c.fill();
      c.fillStyle = '#2EC4F1';
      ellipse(c, -6, y0 - 2.5, 1.2, 1.2);
      c.fill();
      ellipse(c, 6, y0 - 2.5, 1.2, 1.2);
      c.fill();
      break;
    }
    case 'headphones':
      c.strokeStyle = OUTLINE;
      c.lineWidth = 4.6;
      c.beginPath();
      c.arc(0, -1, 15.5 * big, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
      c.strokeStyle = col;
      c.lineWidth = 3;
      c.stroke();
      for (const side of [-1, 1]) {
        rrect(c, side * 15.5 * big - 3.5, -4, 7, 10, 3);
        fillStroke(c, back ? col : shade(col, -0.1));
        c.fillStyle = a.accentColor;
        ellipse(c, side * 15.5 * big, 1, 1.6, 2.4);
        c.fill();
      }
      break;
    case 'bow':
      c.save();
      c.translate(-9, -12 * big);
      c.rotate(-0.4);
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(side * 7, -4.5);
        c.lineTo(side * 7, 4.5);
        c.closePath();
        fillStroke(c, col);
      }
      ellipse(c, 0, 0, 2.2, 2.2);
      fillStroke(c, shade(col, -0.2));
      c.restore();
      break;
    case 'cowboy':
      c.beginPath();
      c.ellipse(0, -9 * big, 23, 5, 0, 0, Math.PI * 2);
      fillStroke(c, shade(col, -0.1));
      rrect(c, -10, -22 * big, 20, 13, [7, 7, 2, 2] as any);
      fillStroke(c, col);
      c.fillStyle = a.accentColor;
      c.fillRect(-10, -12.5 * big, 20, 2.2);
      break;
    case 'flower': {
      const cols = ['#FF6FA8', '#FFD23F', '#FFFFFF', '#9B5DE5', '#FF8A3D'];
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI * (1.08 + i * 0.14);
        const x = Math.cos(ang) * 14.5 * big;
        const y = -1 + Math.sin(ang) * 13.5 * big;
        c.fillStyle = cols[i % cols.length];
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2;
          ellipse(c, x + Math.cos(pa) * 1.8, y + Math.sin(pa) * 1.8, 1.6, 1.6);
          c.fill();
        }
        c.fillStyle = '#FFB000';
        ellipse(c, x, y, 1.2, 1.2);
        c.fill();
      }
      break;
    }
  }
}

/** Render an avatar portrait (head + shoulders) for UI badges. Returns a data URL. */
const portraitCache = new Map<string, string>();
export function avatarPortrait(a: Avatar, size = 96): string {
  const key = JSON.stringify(a) + size;
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d')!;
  const s = size / 46;
  drawAvatar(c, a, size / 2, size + 14 * s, s, { dir: 'down', anim: 'idle', t: 0.3 });
  const url = cv.toDataURL();
  if (portraitCache.size > 300) portraitCache.clear();
  portraitCache.set(key, url);
  return url;
}

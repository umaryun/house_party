// Furniture art. Each piece draws itself relative to the top-left of its tile footprint and may
// extend upward (negative y) by `rise` pixels to fake height in the 3/4 view.
import { TILE as T, type Furniture } from '../../shared/map';
import { shade } from './color';

type Ctx = CanvasRenderingContext2D;

export interface SpriteDef {
  rise: number;
  pad?: number; // horizontal overhang
  layer?: 'floor' | 'sorted' | 'overhead';
  draw?: (c: Ctx, w: number, h: number, f: Furniture) => void;
  animate?: (c: Ctx, w: number, h: number, t: number, f: Furniture, beat: number) => void;
}

const OL = 'rgba(28,18,48,0.55)';

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number | number[], fill: string, stroke = true) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = OL;
    c.lineWidth = 1.5;
    c.stroke();
  }
}

/** A box seen in 3/4 view: top face then front face. */
function box(c: Ctx, x: number, y: number, w: number, d: number, z: number, top: string, front: string, r = 3) {
  rr(c, x, y + d - z, w, z, [0, 0, r, r], front);
  rr(c, x, y - z, w, d, r, top);
}

function circle(c: Ctx, x: number, y: number, r: number, fill: string, stroke = false) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = OL;
    c.lineWidth = 1.2;
    c.stroke();
  }
}

function flame(c: Ctx, x: number, y: number, s: number, t: number) {
  const layers: [string, number][] = [
    ['#FF5A1F', 1],
    ['#FFA62B', 0.7],
    ['#FFF07A', 0.4],
  ];
  for (const [col, k] of layers) {
    c.beginPath();
    const fl = Math.sin(t * 13 + x) * 2 * k;
    c.moveTo(x - 7 * s * k, y);
    c.quadraticCurveTo(x - 8 * s * k, y - 10 * s * k, x + fl, y - 20 * s * k - Math.abs(Math.sin(t * 7)) * 3);
    c.quadraticCurveTo(x + 8 * s * k, y - 10 * s * k, x + 7 * s * k, y);
    c.closePath();
    c.fillStyle = col;
    c.fill();
  }
}

const NEON = ['#FF4DB8', '#4DF2FF', '#FFE14D', '#7CFF6B', '#B36BFF', '#FF8A3D'];

export const SPRITES: Record<string, SpriteDef> = {
  counter: {
    rise: 18,
    draw: (c, w) => {
      box(c, 0, 0, w, T, 18, '#F6F2EA', '#6FA0C8');
      c.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let x = T; x < w; x += T) {
        c.beginPath();
        c.moveTo(x, T - 16);
        c.lineTo(x, T);
        c.stroke();
      }
      for (let x = T / 2; x < w; x += T) rr(c, x - 3, T - 12, 6, 2, 1, '#E8E2D6', false);
    },
  },
  stove: {
    rise: 18,
    draw: (c, w) => {
      box(c, 0, 0, w, T, 18, '#3B3D4E', '#C9CED8');
      rr(c, 8, T - 14, w - 16, 11, 2, '#2B2D3A');
      for (const [x, y] of [[16, -10], [44, -10], [16, 2], [44, 2]]) {
        c.beginPath();
        c.arc(x, y + 4, 6, 0, Math.PI * 2);
        c.strokeStyle = '#7A7F92';
        c.lineWidth = 2;
        c.stroke();
      }
    },
    animate: (c, _w, _h, t) => {
      c.fillStyle = `rgba(255,${80 + Math.sin(t * 3) * 30},40,0.55)`;
      c.beginPath();
      c.arc(16, -6, 4, 0, Math.PI * 2);
      c.fill();
    },
  },
  sink: {
    rise: 18,
    draw: (c, w) => {
      box(c, 0, 0, w, T, 18, '#F6F2EA', '#6FA0C8');
      c.beginPath();
      c.ellipse(w / 2, -4, 18, 8, 0, 0, Math.PI * 2);
      c.fillStyle = '#B8C6D6';
      c.fill();
      c.strokeStyle = OL;
      c.stroke();
      rr(c, w / 2 - 2, -20, 4, 10, 2, '#9AA6B6');
      rr(c, w / 2 - 2, -20, 10, 3, 1.5, '#9AA6B6');
    },
  },
  fridge: {
    rise: 50,
    draw: (c, w) => {
      box(c, 2, 0, w - 4, T - 2, 48, '#EEF3F8', '#D7E0EA', 5);
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.beginPath();
      c.moveTo(4, -4);
      c.lineTo(w - 4, -4);
      c.stroke();
      rr(c, w - 12, -14, 3, 8, 1.5, '#9AA6B6', false);
      rr(c, w - 12, 2, 3, 14, 1.5, '#9AA6B6', false);
      circle(c, 14, -12, 3, '#FF4D6D');
      circle(c, 24, -10, 3, '#FFD23F');
      rr(c, 10, 4, 10, 12, 1, '#FFFFFF');
    },
  },
  island: {
    rise: 18,
    draw: (c, w, h) => {
      box(c, 0, 0, w, h, 18, '#F4EFE6', '#33507A', 6);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(6, h - 16, w - 12, 2);
      // pizza box
      rr(c, 14, -10, 34, 24, 2, '#E8C59A');
      c.beginPath();
      c.arc(31, 2, 10, 0, Math.PI * 2);
      c.fillStyle = '#F4B942';
      c.fill();
      c.strokeStyle = '#C98A3B';
      c.lineWidth = 2;
      c.stroke();
      for (const [x, y] of [[27, -2], [35, 0], [30, 7], [36, 6]]) circle(c, x, y, 2, '#D9482B');
      c.strokeStyle = 'rgba(120,70,30,0.5)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(21, 2);
      c.lineTo(41, 2);
      c.moveTo(31, -8);
      c.lineTo(31, 12);
      c.stroke();
      // chips bowl
      c.beginPath();
      c.ellipse(82, 2, 13, 8, 0, 0, Math.PI * 2);
      c.fillStyle = '#FF4D6D';
      c.fill();
      c.strokeStyle = OL;
      c.stroke();
      for (let i = 0; i < 6; i++) circle(c, 74 + i * 3, 0 + (i % 2) * 2, 3, '#FFD86B');
      // cups
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(108 + i * 9, -6 + (i % 2) * 8);
        c.lineTo(114 + i * 9, -6 + (i % 2) * 8);
        c.lineTo(113 + i * 9, 4 + (i % 2) * 8);
        c.lineTo(109 + i * 9, 4 + (i % 2) * 8);
        c.closePath();
        c.fillStyle = '#E8303F';
        c.fill();
      }
      // soda bottles
      rr(c, 136, -14, 6, 16, 2, '#3DDC97');
      rr(c, 144, -12, 6, 14, 2, '#8B4513');
    },
  },
  stool: {
    rise: 12,
    draw: (c) => {
      c.strokeStyle = '#5A4632';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(10, 4);
      c.lineTo(8, 26);
      c.moveTo(22, 4);
      c.lineTo(24, 26);
      c.stroke();
      c.beginPath();
      c.ellipse(16, 2, 11, 6, 0, 0, Math.PI * 2);
      c.fillStyle = '#E25A3B';
      c.fill();
      c.strokeStyle = OL;
      c.lineWidth = 1.5;
      c.stroke();
    },
    layer: 'floor',
  },
  cooler: {
    rise: 18,
    draw: (c, w) => {
      box(c, 2, 4, w - 4, T - 6, 18, '#F5F7FA', '#2E86DE', 4);
      rr(c, 4, 0, w - 8, 3, 1, '#D0D8E2', false);
      for (const [x, col] of [[8, '#E8303F'], [14, '#3DDC97'], [20, '#FFD23F']] as [number, string][]) rr(c, x, -16, 5, 9, 2, col);
    },
  },
  tv: {
    rise: 44,
    draw: (c, w) => {
      box(c, 8, 8, w - 16, T - 10, 12, '#8B5E3C', '#6E4529');
      rr(c, 0, -44, w, 46, 4, '#16141F');
      rr(c, w / 2 - 10, 2, 20, 6, 1, '#16141F');
    },
    animate: (c, w, _h, t) => {
      const sx = 5;
      const sy = -40;
      const sw = w - 10;
      const sh = 38;
      const g = c.createLinearGradient(sx, sy, sx + sw, sy + sh);
      const hue = (t * 20) % 360;
      g.addColorStop(0, `hsl(${hue},80%,55%)`);
      g.addColorStop(1, `hsl(${(hue + 80) % 360},80%,45%)`);
      c.fillStyle = g;
      c.fillRect(sx, sy, sw, sh);
      // a little "music video" equalizer
      c.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 16; i++) {
        const hh = 4 + Math.abs(Math.sin(t * 4 + i * 0.9)) * 22;
        c.fillRect(sx + 8 + i * ((sw - 16) / 16), sy + sh - 4 - hh, 5, hh);
      }
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + sw * 0.4, sy);
      c.lineTo(sx + sw * 0.2, sy + sh);
      c.lineTo(sx, sy + sh);
      c.fill();
    },
  },
  sofa: {
    rise: 22,
    draw: (c, w) => sofaFacingUp(c, w, '#7B61FF'),
  },
  loungeSofa: {
    rise: 22,
    draw: (c, w) => sofaFacingUp(c, w, '#E0A13A'),
  },
  armchair: {
    rise: 22,
    draw: (c, w, h, f) => {
      const backLeft = f.seat === 'right';
      const col = '#3DB7A4';
      rr(c, 0, -8, w, h + 8, 6, shade(col, -0.15));
      rr(c, 3, -2, w - 6, h - 6, 5, col);
      // backrest on the far side
      rr(c, backLeft ? -2 : w - 10, -14, 12, h + 10, 6, shade(col, -0.25));
    },
  },
  coffeeTable: {
    rise: 12,
    draw: (c, w, h) => {
      box(c, 0, 4, w, h - 6, 12, '#A8714A', '#7A4E30', 6);
      rr(c, 12, -2, 22, 14, 2, '#4D6BFF');
      rr(c, 16, -6, 20, 14, 2, '#FFD23F');
      c.beginPath();
      c.ellipse(w - 34, 6, 14, 8, 0, 0, Math.PI * 2);
      c.fillStyle = '#FFFFFF';
      c.fill();
      c.strokeStyle = OL;
      c.stroke();
      for (let i = 0; i < 7; i++) circle(c, w - 44 + i * 3.2, 4 + (i % 2) * 3, 2.5, i % 2 ? '#FF4D6D' : '#FFB000');
      rr(c, w - 16, -8, 7, 12, 2, '#9B5DE5');
    },
  },
  rug: {
    rise: 0,
    layer: 'floor',
    draw: (c, w, h) => {
      rr(c, 4, 4, w - 8, h - 8, 18, '#C2405A', false);
      c.strokeStyle = '#F4D58D';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(14, 14, w - 28, h - 28, 12);
      c.stroke();
      c.strokeStyle = 'rgba(244,213,141,0.5)';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(w / 2, h / 2, w / 4, h / 4, 0, 0, Math.PI * 2);
      c.stroke();
    },
  },
  plant: {
    rise: 34,
    draw: (c) => {
      box(c, 7, 12, 18, 14, 14, '#C46B3C', '#A0522D', 3);
      const leaves: [number, number, number, string][] = [
        [16, -10, 10, '#2E8B57'],
        [8, -4, 8, '#3DAA6B'],
        [24, -4, 8, '#3DAA6B'],
        [16, -22, 8, '#4CC07E'],
        [11, -16, 7, '#2E8B57'],
        [22, -15, 7, '#4CC07E'],
      ];
      for (const [x, y, r, col] of leaves) circle(c, x, y, r, col, true);
    },
  },
  lamp: {
    rise: 50,
    draw: (c) => {
      c.beginPath();
      c.ellipse(16, 24, 8, 4, 0, 0, Math.PI * 2);
      c.fillStyle = '#3B3D4E';
      c.fill();
      c.fillStyle = '#3B3D4E';
      c.fillRect(15, -30, 2, 54);
      c.beginPath();
      c.moveTo(6, -30);
      c.lineTo(26, -30);
      c.lineTo(22, -46);
      c.lineTo(10, -46);
      c.closePath();
      c.fillStyle = '#FFE8B0';
      c.fill();
      c.strokeStyle = OL;
      c.stroke();
    },
  },
  piano: {
    rise: 30,
    draw: (c, w, h) => {
      box(c, 0, 0, w, h - 6, 30, '#1C1A26', '#121019', 8);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(8, -26, w - 16, 4);
      // keys
      rr(c, 4, h - 40, w - 8, 10, 2, '#FAFAFA');
      c.fillStyle = '#121019';
      for (let i = 0; i < 9; i++) if (i % 7 !== 2 && i % 7 !== 6) c.fillRect(9 + i * 6, h - 40, 3, 6);
      // sheet music
      rr(c, w / 2 - 10, -38, 20, 14, 1, '#FFFFFF');
    },
  },
  bookshelf: {
    rise: 46,
    draw: (c, w) => {
      box(c, 0, 4, w, T - 6, 46, '#8B5E3C', '#6E4529', 3);
      const cols = ['#FF4D6D', '#4D6BFF', '#FFD23F', '#3DDC97', '#9B5DE5', '#FF8A3D', '#2EC4F1', '#FFFFFF'];
      for (let shelf = 0; shelf < 3; shelf++) {
        const y = -36 + shelf * 14;
        c.fillStyle = '#4A2E1C';
        c.fillRect(4, y, w - 8, 12);
        let x = 6;
        let i = shelf * 3;
        while (x < w - 10) {
          const bw = 3 + ((i * 7) % 4);
          c.fillStyle = cols[i % cols.length];
          c.fillRect(x, y + 2 + (i % 3), bw, 10 - (i % 3));
          x += bw + 1;
          i++;
        }
      }
    },
  },
  gameShelf: {
    rise: 46,
    draw: (c, w) => {
      box(c, 0, 4, w, T - 6, 46, '#3D3A55', '#2B2940', 3);
      const cols = ['#FF4D6D', '#FFD23F', '#3DDC97', '#4D6BFF', '#FF8A3D', '#F15BB5'];
      for (let shelf = 0; shelf < 3; shelf++) {
        const y = -36 + shelf * 14;
        for (let i = 0; i < 5; i++) rr(c, 6 + i * 17, y + 2 - (i % 2) * 2, 15, 10 + (i % 2) * 2, 1, cols[(i + shelf * 2) % cols.length], false);
      }
    },
  },
  gameTable: {
    rise: 16,
    draw: (c, w, h) => {
      box(c, 0, 2, w, h - 2, 16, '#6E4529', '#55341F', 14);
      rr(c, 8, -8, w - 16, h - 18, 10, '#1F7A55', false);
      c.strokeStyle = '#F4D58D';
      c.lineWidth = 1.5;
      c.beginPath();
      c.roundRect(12, -4, w - 24, h - 26, 8);
      c.stroke();
      // cards, dice, chips
      const cards: [number, number, number][] = [[40, 6, -0.2], [52, 4, 0.1], [64, 7, 0.3]];
      for (const [x, y, r] of cards) {
        c.save();
        c.translate(x, y);
        c.rotate(r);
        rr(c, -6, -9, 12, 17, 2, '#FFFFFF');
        c.fillStyle = '#E8303F';
        c.font = 'bold 8px sans-serif';
        c.fillText('♥', -3, 2);
        c.restore();
      }
      rr(c, 110, 0, 11, 11, 2, '#FFFFFF');
      circle(c, 113, 3, 1.3, '#121019');
      circle(c, 118, 8, 1.3, '#121019');
      rr(c, 124, 6, 11, 11, 2, '#FF4D6D');
      for (let i = 0; i < 4; i++) circle(c, 150 + (i % 2) * 6, 2 + i * 3, 5, ['#4D6BFF', '#FFD23F', '#3DDC97', '#F15BB5'][i], true);
    },
    animate: (c, w, h, t) => {
      // pulsing glow invites people to play
      const a = 0.25 + Math.sin(t * 3) * 0.15;
      c.strokeStyle = `rgba(255,225,77,${a})`;
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(-6, -22, w + 12, h + 26, 16);
      c.stroke();
    },
  },
  chair: {
    rise: 14,
    layer: 'floor',
    draw: (c) => {
      rr(c, 6, 4, 20, 18, 4, '#8B5E3C');
      rr(c, 6, 0, 20, 6, 3, '#6E4529');
    },
  },
  arcade: {
    rise: 52,
    draw: (c, w) => {
      const col = w > 0 ? '#2B2D7A' : '#000';
      box(c, 4, 4, w - 8, T - 6, 52, shade(col, 0.1), col, 4);
      rr(c, 8, -46, w - 16, 10, 2, '#FFD23F');
      rr(c, 8, -34, w - 16, 26, 2, '#0B0B14');
      rr(c, 6, -6, w - 12, 10, 2, '#3A3C99');
      circle(c, 18, -1, 3, '#FF4D6D', true);
      circle(c, 30, 0, 2.5, '#3DDC97', true);
      circle(c, 38, 0, 2.5, '#2EC4F1', true);
    },
    animate: (c, w, _h, t, f) => {
      const seed = f.x;
      c.save();
      c.beginPath();
      c.rect(9, -33, w - 18, 24);
      c.clip();
      c.fillStyle = '#0B0B14';
      c.fillRect(9, -33, w - 18, 24);
      // tiny space-shooter
      for (let i = 0; i < 6; i++) {
        const x = 12 + ((i * 7 + t * 20 + seed * 3) % (w - 24));
        const y = -30 + ((i * 13 + t * 9) % 12);
        c.fillStyle = NEON[(i + seed) % NEON.length];
        c.fillRect(x, y, 4, 3);
      }
      c.fillStyle = '#7CFF6B';
      c.fillRect(w / 2 - 3 + Math.sin(t * 3 + seed) * 10, -14, 6, 3);
      c.restore();
      c.fillStyle = NEON[Math.floor(t * 2 + seed) % NEON.length];
      c.font = 'bold 7px Fredoka, sans-serif';
      c.textAlign = 'center';
      c.fillText('ARCADE', w / 2, -38.5);
    },
  },
  djBooth: {
    rise: 26,
    draw: (c, w) => {
      box(c, 0, 2, w, T - 2, 26, '#2B2D3A', '#16141F', 4);
      // turntables + mixer
      for (const x of [22, w - 22]) {
        rr(c, x - 16, -22, 32, 22, 3, '#3B3D4E');
        circle(c, x, -11, 9, '#0B0B14', true);
      }
      rr(c, w / 2 - 12, -20, 24, 18, 2, '#4A4C5E');
    },
    animate: (c, w, _h, t, _f, beat) => {
      for (const x of [22, w - 22]) {
        c.strokeStyle = 'rgba(255,255,255,0.4)';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(x, -11, 5, t * 6, t * 6 + 1.2);
        c.stroke();
        circle(c, x, -11, 2, '#FF4D6D');
      }
      for (let i = 0; i < 4; i++) circle(c, w / 2 - 7 + i * 5, -14, 1.5, NEON[(i + Math.floor(t * 4)) % NEON.length]);
      // front LED equalizer
      const bars = 14;
      for (let i = 0; i < bars; i++) {
        const lvl = Math.abs(Math.sin(t * 5 + i * 0.7)) * (0.5 + beat * 0.5);
        const hh = 4 + lvl * 16;
        c.fillStyle = NEON[i % NEON.length];
        c.fillRect(8 + i * ((w - 16) / bars), T - 4 - hh, (w - 16) / bars - 2, hh);
      }
    },
  },
  speaker: {
    rise: 44,
    draw: (c, w) => {
      box(c, 4, 4, w - 8, T - 6, 44, '#2B2D3A', '#16141F', 4);
    },
    animate: (c, w, _h, _t, _f, beat) => {
      const r1 = 9 + beat * 2;
      circle(c, w / 2, -6, r1, '#0B0B14', true);
      circle(c, w / 2, -6, r1 * 0.45, '#3B3D4E');
      circle(c, w / 2, -30, 5 + beat, '#0B0B14', true);
    },
  },
  discoBall: {
    rise: 0,
    layer: 'overhead',
    animate: (c, _w, _h, t) => {
      c.strokeStyle = 'rgba(200,200,220,0.6)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(16, -120);
      c.lineTo(16, -66);
      c.stroke();
      const g = c.createRadialGradient(12, -58, 2, 16, -54, 14);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(1, '#8C8FA8');
      c.beginPath();
      c.arc(16, -54, 12, 0, Math.PI * 2);
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + t;
        c.fillStyle = NEON[i % NEON.length];
        c.globalAlpha = 0.5 + Math.sin(t * 6 + i) * 0.5;
        c.fillRect(16 + Math.cos(a) * 8 - 1.5, -54 + Math.sin(i * 1.7) * 9 - 1.5, 3, 3);
      }
      c.restore();
    },
  },
  fireplace: {
    rise: 44,
    draw: (c, w) => {
      box(c, 0, 4, w, T - 6, 44, '#9E4F3A', '#7E3B2A', 3);
      // brick lines
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let y = -36; y < 22; y += 7) {
        c.beginPath();
        c.moveTo(2, y);
        c.lineTo(w - 2, y);
        c.stroke();
      }
      rr(c, -4, -44, w + 8, 6, 2, '#5A3A2A');
      rr(c, 20, -24, w - 40, 44, [16, 16, 0, 0], '#1A0F0A');
      // photos on mantel
      rr(c, 14, -56, 14, 12, 1, '#FFFFFF');
      rr(c, w - 30, -58, 12, 14, 1, '#FFFFFF');
      c.fillStyle = '#2EC4F1';
      c.fillRect(16, -54, 10, 8);
      c.fillStyle = '#FF8A3D';
      c.fillRect(w - 28, -56, 8, 10);
    },
    animate: (c, w, _h, t) => {
      flame(c, w / 2 - 10, 18, 0.9, t);
      flame(c, w / 2 + 8, 18, 1.1, t + 1);
    },
  },
  beanbag: {
    rise: 10,
    layer: 'floor',
    draw: (c, _w, _h, f) => {
      const cols = ['#FF4D6D', '#2EC4F1', '#FFD23F'];
      c.beginPath();
      c.ellipse(16, 18, 15, 12, 0, 0, Math.PI * 2);
      c.fillStyle = cols[f.x % 3];
      c.fill();
      c.strokeStyle = OL;
      c.lineWidth = 1.5;
      c.stroke();
      c.beginPath();
      c.ellipse(16, 15, 9, 6, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fill();
    },
  },
  recordPlayer: {
    rise: 18,
    draw: (c, w) => {
      box(c, 0, 4, w, T - 6, 18, '#C9A27C', '#8B5E3C', 3);
      rr(c, 6, -12, w - 12, 22, 2, '#3B3D4E');
      rr(c, 6, -26, 14, 14, 1, '#FF4D6D');
      rr(c, 22, -26, 14, 14, 1, '#4D6BFF');
    },
    animate: (c, w, _h, t) => {
      circle(c, w / 2, -1, 9, '#0B0B14');
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.arc(w / 2, -1, 6, t * 4, t * 4 + 1);
      c.stroke();
      circle(c, w / 2, -1, 2, '#FFD23F');
    },
  },
  tree: {
    rise: 64,
    pad: 14,
    draw: (c, w, h) => {
      rr(c, w / 2 - 6, h - 40, 12, 36, 4, '#6E4529');
      const blobs: [number, number, number, string][] = [
        [w / 2, h - 50, 26, '#1F6B3A'],
        [w / 2 - 18, h - 40, 18, '#25804A'],
        [w / 2 + 18, h - 40, 18, '#25804A'],
        [w / 2 - 10, h - 70, 20, '#2E9457'],
        [w / 2 + 12, h - 68, 18, '#2E9457'],
        [w / 2, h - 86, 15, '#3AAE68'],
      ];
      for (const [x, y, r, col] of blobs) circle(c, x, y, r, col, true);
    },
  },
  bonfire: {
    rise: 30,
    draw: (c, w, h) => {
      const cx = w / 2;
      const cy = h / 2 + 6;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        circle(c, cx + Math.cos(a) * 22, cy + Math.sin(a) * 14, 6, '#8C8A93', true);
      }
      c.save();
      c.translate(cx, cy);
      for (const r of [-0.5, 0.5, 0]) {
        c.save();
        c.rotate(r);
        rr(c, -16, -3, 32, 6, 3, '#6E4529');
        c.restore();
      }
      c.restore();
    },
    animate: (c, w, h, t) => {
      flame(c, w / 2 - 6, h / 2 + 6, 1.2, t);
      flame(c, w / 2 + 6, h / 2 + 6, 1.4, t + 0.6);
      for (let i = 0; i < 5; i++) {
        const p = (t * 0.7 + i / 5) % 1;
        c.fillStyle = `rgba(255,${150 + i * 20},60,${1 - p})`;
        c.fillRect(w / 2 + Math.sin(t * 3 + i * 2) * 10, h / 2 - 10 - p * 50, 2, 2);
      }
    },
  },
  lounger: {
    rise: 6,
    layer: 'floor',
    draw: (c, w, h) => {
      rr(c, 2, 4, w - 4, h - 6, 4, '#FFFFFF');
      c.fillStyle = '#2EC4F1';
      for (let y = 8; y < h - 6; y += 8) c.fillRect(4, y, w - 8, 3);
      rr(c, 2, 2, w - 4, 12, 4, '#E8F7FF');
    },
  },
  grill: {
    rise: 24,
    draw: (c, w) => {
      box(c, 4, 6, w - 8, T - 8, 22, '#3B3D4E', '#2B2D3A', 4);
      c.strokeStyle = '#8C8FA8';
      c.lineWidth = 1;
      for (let x = 10; x < w - 10; x += 5) {
        c.beginPath();
        c.moveTo(x, -12);
        c.lineTo(x, 4);
        c.stroke();
      }
      for (let i = 0; i < 4; i++) rr(c, 12 + i * 11, -8, 8, 6, 2, '#8B4A2B');
    },
    animate: (c, w, _h, t) => {
      for (let i = 0; i < 4; i++) {
        const p = (t * 0.5 + i / 4) % 1;
        c.fillStyle = `rgba(230,230,240,${0.35 * (1 - p)})`;
        c.beginPath();
        c.arc(w / 2 + Math.sin(t + i) * 8, -14 - p * 40, 5 + p * 8, 0, Math.PI * 2);
        c.fill();
      }
    },
  },
  picnicTable: {
    rise: 14,
    draw: (c, w, h) => {
      rr(c, 0, -2, w, 8, 2, '#8B5E3C');
      rr(c, 0, h - 8, w, 8, 2, '#8B5E3C');
      box(c, 4, 8, w - 8, h - 18, 14, '#B07A4F', '#8B5E3C', 3);
      rr(c, 20, -6, 30, 20, 2, '#FF4D6D');
      c.fillStyle = 'rgba(255,255,255,0.5)';
      for (let x = 22; x < 48; x += 6) c.fillRect(x, -6, 3, 20);
      circle(c, 80, 0, 7, '#FFFFFF', true);
      circle(c, 80, 0, 4, '#FFB000');
      rr(c, 100, -8, 7, 14, 2, '#3DDC97');
    },
  },
  stringLights: {
    rise: 0,
    layer: 'overhead',
    animate: (c, w, _h, t) => {
      const sag = 14;
      const span = 4 * T;
      c.strokeStyle = 'rgba(40,30,50,0.8)';
      c.lineWidth = 1;
      for (let x0 = 0; x0 < w; x0 += span) {
        c.beginPath();
        c.moveTo(x0, -6);
        c.quadraticCurveTo(x0 + span / 2, -6 + sag * 2, x0 + span, -6);
        c.stroke();
        for (let i = 1; i < 8; i++) {
          const u = i / 8;
          const x = x0 + span * u;
          const y = -6 + sag * 2 * 2 * u * (1 - u);
          const col = ['#FFE14D', '#FF6FA8', '#7CF9FF', '#FFB86B'][(i + x0 / span) % 4];
          c.globalAlpha = 0.75 + Math.sin(t * 2 + i + x0) * 0.25;
          circle(c, x, y + 3, 2.6, col);
          c.globalAlpha = 1;
        }
      }
    },
  },
  flowers: {
    rise: 6,
    layer: 'floor',
    draw: (c, w, h) => {
      rr(c, 0, 4, w, h - 4, 4, '#5A3A2A', false);
      const cols = ['#FF6FA8', '#FFD23F', '#FFFFFF', '#B36BFF', '#FF8A3D'];
      for (let i = 0; i < w / 7; i++) {
        const x = 5 + i * 7;
        const y = 10 + (i % 3) * 4;
        circle(c, x, y + 4, 3, '#2E8B57');
        circle(c, x, y, 3, cols[i % cols.length]);
        circle(c, x, y, 1.2, '#FFB000');
      }
    },
  },
};

function sofaFacingUp(c: Ctx, w: number, col: string) {
  // seat cushions visible from above, back rest toward the viewer
  rr(c, 0, -6, w, T, 8, shade(col, -0.2));
  const n = Math.max(1, Math.round(w / T / 1.4));
  const cw = (w - 16) / n;
  for (let i = 0; i < n; i++) rr(c, 8 + i * cw + 1, -2, cw - 2, T - 14, 6, col);
  // armrests
  rr(c, -2, -10, 12, T + 6, 6, shade(col, -0.1));
  rr(c, w - 10, -10, 12, T + 6, 6, shade(col, -0.1));
  // backrest (front)
  rr(c, 2, T - 14, w - 4, 22, [8, 8, 4, 4], shade(col, -0.05));
  c.fillStyle = 'rgba(255,255,255,0.15)';
  c.fillRect(8, T - 10, w - 16, 3);
  // throw pillows
  rr(c, 12, -4, 14, 12, 4, '#FFD23F');
  rr(c, w - 26, -4, 14, 12, 4, '#FF6FA8');
}

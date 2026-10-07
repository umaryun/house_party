import { FURNITURE, MAP_H, MAP_W, TILE as T, TILES, type TileKind } from '../../shared/map';
import { SPRITES } from './sprites';

// Deterministic pseudo-random so the floor looks the same for everyone.
function rand(x: number, y: number, s = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

const FLOOR: Partial<Record<TileKind, (c: CanvasRenderingContext2D, x: number, y: number) => void>> = {
  wood: (c, x, y) => {
    const px = x * T;
    const py = y * T;
    for (let r = 0; r < 4; r++) {
      const shadeV = 0.9 + rand(x, y * 4 + r) * 0.12;
      c.fillStyle = `rgb(${190 * shadeV | 0},${128 * shadeV | 0},${80 * shadeV | 0})`;
      c.fillRect(px, py + r * 8, T, 8);
      c.fillStyle = 'rgba(70,35,15,0.35)';
      c.fillRect(px, py + r * 8 + 7, T, 1);
      const off = ((y * 4 + r) * 13) % T;
      c.fillRect(px + off, py + r * 8, 1, 7);
    }
  },
  kitchen: (c, x, y) => {
    c.fillStyle = (x + y) % 2 ? '#ECE6DA' : '#D7CFC1';
    c.fillRect(x * T, y * T, T, T);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(x * T + 2, y * T + 2, T - 4, 2);
  },
  dance: (c, x, y) => {
    c.fillStyle = '#1C1530';
    c.fillRect(x * T, y * T, T, T);
    c.fillStyle = '#2A2147';
    c.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
  },
  carpet: (c, x, y) => {
    c.fillStyle = '#2E5E57';
    c.fillRect(x * T, y * T, T, T);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    if ((x + y) % 2) c.fillRect(x * T, y * T, T, T);
    c.fillStyle = 'rgba(255,214,120,0.12)';
    c.fillRect(x * T + 14, y * T + 14, 4, 4);
  },
  lounge: (c, x, y) => {
    c.fillStyle = '#5E3A5C';
    c.fillRect(x * T, y * T, T, T);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgba(255,255,255,${0.03 + rand(x, y, i) * 0.04})`;
      c.fillRect(x * T + rand(x, y, i + 10) * T, y * T + rand(x, y, i + 20) * T, 2, 2);
    }
  },
  patio: (c, x, y) => {
    c.fillStyle = '#8D8A96';
    c.fillRect(x * T, y * T, T, T);
    c.fillStyle = `rgba(255,255,255,${0.05 + rand(x, y) * 0.08})`;
    c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(x * T, y * T + T - 1, T, 1);
    c.fillRect(x * T + T - 1, y * T, 1, T);
  },
  grass: (c, x, y) => {
    const v = rand(x, y);
    c.fillStyle = v > 0.5 ? '#3F8F4F' : '#3A874A';
    c.fillRect(x * T, y * T, T, T);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = rand(x, y, i) > 0.5 ? '#4CA35C' : '#327A41';
      const gx = x * T + rand(x, y, i + 1) * (T - 4);
      const gy = y * T + rand(x, y, i + 7) * (T - 6);
      c.fillRect(gx, gy, 2, 5);
      c.fillRect(gx + 2, gy + 1, 2, 4);
    }
    if (rand(x, y, 99) > 0.93) {
      c.fillStyle = ['#FFFFFF', '#FFD23F', '#FF8FB8'][Math.floor(rand(x, y, 5) * 3)];
      c.beginPath();
      c.arc(x * T + 16, y * T + 16, 2.5, 0, Math.PI * 2);
      c.fill();
    }
  },
  pool: (c, x, y) => {
    c.fillStyle = '#1FA3D8';
    c.fillRect(x * T, y * T, T, T);
  },
  hedge: (c, x, y) => {
    c.fillStyle = '#1E5B33';
    c.fillRect(x * T, y * T, T, T);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? '#2A7343' : '#24683C';
      c.beginPath();
      c.arc(x * T + 8 + (i % 2) * 16, y * T + 8 + Math.floor(i / 2) * 16, 10, 0, Math.PI * 2);
      c.fill();
    }
  },
  void: (c, x, y) => {
    c.fillStyle = '#120D24';
    c.fillRect(x * T, y * T, T, T);
  },
};

const WALLPAPER: Partial<Record<TileKind, [string, string]>> = {
  kitchen: ['#F6E7C8', '#EBD6AE'],
  wood: ['#F3D3C1', '#E9BFA8'],
  carpet: ['#2C4A6B', '#26405D'],
  dance: ['#2A1C4D', '#221640'],
  lounge: ['#7A3E55', '#6A3549'],
  patio: ['#B9694E', '#A85E45'], // exterior brick
  door: ['#F3D3C1', '#E9BFA8'],
};

const tileAt = (x: number, y: number): TileKind => TILES[y]?.[x] ?? 'void';

function floorKindForDoor(x: number, y: number): TileKind {
  // A doorway takes the floor of whichever neighbor room is "inside".
  const order: TileKind[] = ['wood', 'kitchen', 'carpet', 'lounge', 'dance', 'patio'];
  const ns = [tileAt(x - 1, y), tileAt(x + 1, y), tileAt(x, y - 1), tileAt(x, y + 1)];
  for (const k of order) if (ns.includes(k)) return k;
  return 'wood';
}

function drawWall(c: CanvasRenderingContext2D, x: number, y: number) {
  const below = tileAt(x, y + 1);
  const px = x * T;
  const py = y * T;
  if (below !== 'wall' && below !== 'void' && below !== 'hedge') {
    const paper = WALLPAPER[below === 'door' ? floorKindForDoor(x, y + 1) : below] ?? ['#DDD', '#CCC'];
    c.fillStyle = paper[0];
    c.fillRect(px, py, T, T);
    if (below === 'patio') {
      // brick
      c.fillStyle = 'rgba(60,20,10,0.25)';
      for (let r = 0; r < 4; r++) {
        c.fillRect(px, py + 8 + r * 6, T, 1);
        const off = r % 2 ? 0 : 8;
        for (let bx = off; bx < T; bx += 16) c.fillRect(px + bx, py + 8 + r * 6, 1, 6);
      }
    } else {
      c.fillStyle = paper[1];
      for (let sx = 4; sx < T; sx += 10) c.fillRect(px + sx, py + 8, 4, T - 14);
    }
    // top trim + baseboard
    c.fillStyle = '#3B2D52';
    c.fillRect(px, py, T, 7);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(px, py + 7, T, 1);
    c.fillStyle = below === 'patio' ? '#7A3D2B' : '#F7F1E8';
    c.fillRect(px, py + T - 5, T, 5);
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(px, py + T - 5, T, 1);
    // windows on exterior wall + art on interior walls
    if (below === 'patio' && x % 5 === 2 && tileAt(x + 1, y) === 'wall' && tileAt(x + 1, y + 1) === 'patio') {
      c.fillStyle = '#3B2D52';
      c.fillRect(px + 6, py + 9, T * 2 - 12, 17);
      c.fillStyle = '#FFD98A';
      c.fillRect(px + 8, py + 11, T * 2 - 16, 13);
      c.fillStyle = '#3B2D52';
      c.fillRect(px + T - 1, py + 11, 2, 13);
    } else if (below !== 'patio' && (x * 7 + y * 3) % 11 === 0) {
      const cols = ['#FF4D6D', '#2EC4F1', '#FFD23F', '#9B5DE5'];
      c.fillStyle = '#3B2D52';
      c.fillRect(px + 8, py + 10, 16, 13);
      c.fillStyle = cols[(x + y) % 4];
      c.fillRect(px + 10, py + 12, 12, 9);
    }
  } else {
    c.fillStyle = '#3B2D52';
    c.fillRect(px, py, T, T);
    c.fillStyle = '#4A3A66';
    c.fillRect(px + 2, py + 2, T - 4, T - 4);
  }
}

/** Pre-render floors, walls and flat furniture into one big canvas. */
export function buildStaticLayer(scale: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = MAP_W * T * scale;
  cv.height = MAP_H * T * scale;
  const c = cv.getContext('2d')!;
  c.scale(scale, scale);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const k = tileAt(x, y);
      if (k === 'wall') drawWall(c, x, y);
      else if (k === 'door') {
        const fk = floorKindForDoor(x, y);
        FLOOR[fk]?.(c, x, y);
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(x * T, y * T, T, T);
      } else FLOOR[k]?.(c, x, y);
    }
  }
  // pool coping
  c.strokeStyle = '#E9E4DA';
  c.lineWidth = 6;
  c.beginPath();
  c.roundRect(16 * T - 3, 22 * T - 3, 13 * T + 6, 6 * T + 6, 10);
  c.stroke();
  // soft shadow under walls on floor
  for (let y = 1; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (tileAt(x, y - 1) === 'wall' && tileAt(x, y) !== 'wall') {
        const g = c.createLinearGradient(0, y * T, 0, y * T + 10);
        g.addColorStop(0, 'rgba(0,0,0,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x * T, y * T, T, 10);
      }
    }
  for (const f of FURNITURE) {
    const s = SPRITES[f.type];
    if (s?.layer === 'floor' && s.draw) {
      c.save();
      c.translate(f.x * T, f.y * T);
      s.draw(c, f.w * T, f.h * T, f);
      c.restore();
    }
  }
  return cv;
}

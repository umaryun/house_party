// The house. Built procedurally so dimensions stay consistent; shared by client (render, pathing)
// and server (spawn points, validation).

export type TileKind =
  | 'void'
  | 'wall'
  | 'wood' // living room
  | 'kitchen'
  | 'dance'
  | 'carpet' // game room
  | 'lounge'
  | 'door'
  | 'patio'
  | 'grass'
  | 'pool'
  | 'hedge';

export type FurnitureType =
  | 'counter' | 'stove' | 'sink' | 'fridge' | 'island' | 'stool' | 'cooler'
  | 'tv' | 'sofa' | 'armchair' | 'coffeeTable' | 'rug' | 'plant' | 'lamp' | 'piano' | 'bookshelf'
  | 'gameTable' | 'arcade' | 'gameShelf' | 'chair'
  | 'djBooth' | 'speaker' | 'discoBall'
  | 'fireplace' | 'beanbag' | 'recordPlayer' | 'loungeSofa'
  | 'tree' | 'bonfire' | 'lounger' | 'grill' | 'picnicTable' | 'stringLights' | 'flowers' | 'pizza';

export interface Furniture {
  id: string;
  type: FurnitureType;
  x: number; // tile coords (top-left)
  y: number;
  w: number;
  h: number;
  solid: boolean;
  color?: string;
  /** Interaction offered when a player is nearby. */
  interact?: Interaction;
  /** Seat facing direction when the furniture can be sat on. */
  seat?: Dir;
}

export type Interaction = 'games' | 'dj' | 'piano' | 'drink' | 'snack' | 'marshmallow' | 'arcade';

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface Room {
  id: string;
  name: string;
  emoji: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAP_W = 44;
export const MAP_H = 31;
export const TILE = 32;

const tiles: TileKind[][] = Array.from({ length: MAP_H }, () => Array<TileKind>(MAP_W).fill('void'));

function fill(x: number, y: number, w: number, h: number, kind: TileKind) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (tiles[j]?.[i] !== undefined) tiles[j][i] = kind;
}

// Outer shell of the house (rows 0..18) is wall; rooms are carved inside.
fill(0, 0, MAP_W, 19, 'wall');
fill(1, 1, 13, 8, 'kitchen'); // Kitchen
fill(15, 1, 14, 17, 'wood'); // Living room
fill(30, 1, 13, 8, 'carpet'); // Game room
fill(1, 10, 13, 8, 'dance'); // Dance floor
fill(30, 10, 13, 8, 'lounge'); // Lounge
// Backyard
fill(0, 19, MAP_W, 12, 'grass');
fill(1, 19, MAP_W - 2, 2, 'patio');
fill(16, 22, 13, 6, 'pool');
fill(0, 19, 1, 12, 'hedge');
fill(MAP_W - 1, 19, 1, 12, 'hedge');
fill(0, MAP_H - 1, MAP_W, 1, 'hedge');

// Doorways
fill(14, 4, 1, 2, 'door'); // kitchen <-> living
fill(29, 4, 1, 2, 'door'); // game room <-> living
fill(6, 9, 2, 1, 'door'); // kitchen <-> dance
fill(14, 13, 1, 2, 'door'); // dance <-> living
fill(35, 9, 2, 1, 'door'); // game room <-> lounge
fill(29, 13, 1, 2, 'door'); // lounge <-> living
fill(19, 18, 6, 1, 'door'); // living <-> backyard (glass doors)
fill(6, 18, 2, 1, 'door'); // dance <-> backyard
fill(36, 18, 2, 1, 'door'); // lounge <-> backyard

export const TILES = tiles;

export const ROOMS: Room[] = [
  { id: 'kitchen', name: 'Kitchen', emoji: '🍕', x: 1, y: 1, w: 13, h: 8 },
  { id: 'living', name: 'Living Room', emoji: '🛋️', x: 15, y: 1, w: 14, h: 17 },
  { id: 'games', name: 'Game Room', emoji: '🎲', x: 30, y: 1, w: 13, h: 8 },
  { id: 'dance', name: 'Dance Floor', emoji: '🪩', x: 1, y: 10, w: 13, h: 8 },
  { id: 'lounge', name: 'Lounge', emoji: '🔥', x: 30, y: 10, w: 13, h: 8 },
  { id: 'yard', name: 'Backyard', emoji: '🌙', x: 1, y: 19, w: 42, h: 11 },
];

let fid = 0;
const f = (type: FurnitureType, x: number, y: number, w: number, h: number, solid: boolean, extra: Partial<Furniture> = {}): Furniture => ({
  id: `${type}-${fid++}`,
  type,
  x,
  y,
  w,
  h,
  solid,
  ...extra,
});

export const FURNITURE: Furniture[] = [
  // Kitchen
  f('counter', 1, 1, 3, 1, true),
  f('stove', 4, 1, 2, 1, true),
  f('sink', 6, 1, 2, 1, true),
  f('counter', 8, 1, 2, 1, true),
  f('fridge', 10, 1, 2, 1, true, { interact: 'drink' }),
  f('plant', 12, 1, 1, 1, true),
  f('island', 4, 4, 5, 2, true, { interact: 'snack' }),
  f('stool', 4, 6, 1, 1, false, { seat: 'up' }),
  f('stool', 6, 6, 1, 1, false, { seat: 'up' }),
  f('stool', 8, 6, 1, 1, false, { seat: 'up' }),
  f('cooler', 12, 7, 1, 1, true, { interact: 'drink' }),
  f('plant', 1, 8, 1, 1, true),

  // Living room
  f('rug', 17, 3, 10, 6, false),
  f('tv', 19, 1, 6, 1, true),
  f('plant', 15, 1, 1, 1, true),
  f('plant', 28, 1, 1, 1, true),
  f('coffeeTable', 20, 4, 4, 2, true),
  f('armchair', 17, 4, 1, 2, true, { seat: 'right' }),
  f('armchair', 26, 4, 1, 2, true, { seat: 'left' }),
  f('sofa', 18, 7, 8, 1, true, { seat: 'up' }),
  f('lamp', 27, 8, 1, 1, true),
  f('lamp', 16, 8, 1, 1, true),
  f('piano', 15, 11, 2, 2, true, { interact: 'piano' }),
  f('bookshelf', 26, 10, 3, 1, true),
  f('plant', 28, 16, 1, 1, true),
  f('plant', 15, 16, 1, 1, true),

  // Game room
  f('gameShelf', 30, 1, 3, 1, true),
  f('arcade', 39, 1, 2, 1, true, { interact: 'arcade' }),
  f('arcade', 41, 1, 2, 1, true, { interact: 'arcade' }),
  f('gameTable', 33, 4, 6, 2, true, { interact: 'games' }),
  f('chair', 34, 3, 1, 1, false),
  f('chair', 37, 3, 1, 1, false),
  f('chair', 34, 6, 1, 1, false),
  f('chair', 37, 6, 1, 1, false),
  f('plant', 42, 8, 1, 1, true),

  // Dance floor
  f('speaker', 1, 10, 2, 1, true),
  f('djBooth', 5, 10, 4, 1, true, { interact: 'dj' }),
  f('speaker', 11, 10, 2, 1, true),
  f('discoBall', 7, 14, 1, 1, false),

  // Lounge
  f('bookshelf', 30, 10, 3, 1, true),
  f('fireplace', 34, 10, 4, 1, true),
  f('recordPlayer', 41, 10, 2, 1, true, { interact: 'dj' }),
  f('beanbag', 32, 13, 1, 1, false, { seat: 'down' }),
  f('beanbag', 36, 13, 1, 1, false, { seat: 'up' }),
  f('beanbag', 40, 13, 1, 1, false, { seat: 'down' }),
  f('loungeSofa', 33, 16, 6, 1, true, { seat: 'up' }),

  // Backyard
  f('stringLights', 1, 19, 42, 1, false),
  f('tree', 2, 21, 2, 2, true),
  f('tree', 40, 21, 2, 2, true),
  f('tree', 2, 27, 2, 2, true),
  f('tree', 40, 27, 2, 2, true),
  f('bonfire', 7, 24, 2, 2, true, { interact: 'marshmallow' }),
  f('lounger', 12, 23, 1, 2, false, { seat: 'down' }),
  f('lounger', 12, 26, 1, 2, false, { seat: 'down' }),
  f('lounger', 31, 23, 1, 2, false, { seat: 'down' }),
  f('grill', 35, 22, 2, 1, true, { interact: 'snack' }),
  f('picnicTable', 35, 25, 4, 2, true),
  f('flowers', 20, 29, 6, 1, false),
  f('flowers', 10, 29, 4, 1, false),
  f('flowers', 30, 29, 4, 1, false),
];

export const SPAWN = { x: 22, y: 12 };

const blocked: boolean[][] = Array.from({ length: MAP_H }, (_, y) =>
  Array.from({ length: MAP_W }, (_, x) => ['wall', 'void', 'hedge'].includes(tiles[y][x])),
);
for (const it of FURNITURE) {
  if (!it.solid) continue;
  for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) blocked[j][i] = true;
}
export const BLOCKED = blocked;

export function isWalkable(x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  return !blocked[ty][tx];
}

export function roomAt(x: number, y: number): Room | undefined {
  return ROOMS.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/** A* over the walkable grid with 8-way movement (no corner cutting). Returns tile-center waypoints. */
export function findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  const start = { x: Math.floor(sx), y: Math.floor(sy) };
  let goal = { x: Math.floor(tx), y: Math.floor(ty) };
  if (!isWalkable(goal.x, goal.y)) {
    const near = nearestWalkable(goal.x, goal.y);
    if (!near) return null;
    goal = near;
  }
  const key = (x: number, y: number) => y * MAP_W + x;
  const open: { x: number; y: number; f: number; g: number }[] = [{ ...start, g: 0, f: 0 }];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start.x, start.y), 0]]);
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  let guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: { x: number; y: number }[] = [];
      let k: number | undefined = ck;
      while (k !== undefined) {
        path.push({ x: (k % MAP_W) + 0.5, y: Math.floor(k / MAP_W) + 0.5 });
        k = came.get(k);
      }
      path.reverse();
      path.shift(); // current tile
      if (path.length) path[path.length - 1] = { x: goalPointX(tx, goal.x), y: goalPointY(ty, goal.y) };
      return smooth({ x: sx, y: sy }, path);
    }
    if (closed.has(ck)) continue;
    closed.add(ck);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!isWalkable(nx, ny)) continue;
        if (dx && dy && (!isWalkable(cur.x + dx, cur.y) || !isWalkable(cur.x, cur.y + dy))) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const g = cur.g + (dx && dy ? Math.SQRT2 : 1);
        if (g < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, g);
          came.set(nk, ck);
          open.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
        }
      }
    }
  }
  return null;
}

function goalPointX(tx: number, gx: number) {
  return Math.floor(tx) === gx ? Math.min(Math.max(tx, gx + 0.3), gx + 0.7) : gx + 0.5;
}
function goalPointY(ty: number, gy: number) {
  return Math.floor(ty) === gy ? Math.min(Math.max(ty, gy + 0.3), gy + 0.7) : gy + 0.5;
}

/** Drop waypoints that have a clear straight line to a later one, so walking looks natural. */
function smooth(from: { x: number; y: number }, path: { x: number; y: number }[]) {
  const out: { x: number; y: number }[] = [];
  let anchor = from;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !lineClear(anchor, path[j])) j--;
    out.push(path[j]);
    anchor = path[j];
    i = j + 1;
  }
  return out;
}

export function lineClear(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(dist / 0.2);
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    // check the character's footprint, not just its center
    for (const [ox, oy] of [[-0.25, 0], [0.25, 0], [0, -0.15], [0, 0.15]]) if (!isWalkable(x + ox, y + oy)) return false;
  }
  return true;
}

export function nearestWalkable(x: number, y: number): { x: number; y: number } | null {
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

export function randomSpawn(): { x: number; y: number } {
  for (let i = 0; i < 30; i++) {
    const x = SPAWN.x - 3 + Math.random() * 6;
    const y = SPAWN.y - 1 + Math.random() * 4;
    if (isWalkable(x, y)) return { x, y };
  }
  return { x: SPAWN.x + 0.5, y: SPAWN.y + 0.5 };
}

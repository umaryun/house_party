import {
  FURNITURE,
  MAP_H,
  MAP_W,
  TILE as T,
  TILES,
  findPath,
  isWalkable,
  roomAt,
  type Dir,
  type Furniture,
  type Room,
} from '../../shared/map';
import type { Avatar } from '../../shared/avatar';
import { EMOTE_EMOJI, type Emote, type HeldItem, type MoveUpdate, type PlayerAction, type PlayerState } from '../../shared/types';
import { drawAvatar } from './avatarRender';
import { SPRITES } from './sprites';
import { buildStaticLayer } from './tiles';

const SPEED = 4.3; // tiles per second
const AV_SCALE = 0.82;
const SPRITE_SCALE = 2;

interface WP {
  id: string;
  name: string;
  avatar: Avatar;
  x: number; // authoritative/target
  y: number;
  rx: number; // rendered
  ry: number;
  dir: Dir;
  moving: boolean;
  action: PlayerAction;
  danceMove: number;
  held: HeldItem;
  isHost: boolean;
  connected: boolean;
  emote: { name: string; start: number } | null;
  bubble: { text: string; start: number } | null;
  seed: number;
}

export interface WorldCallbacks {
  onMove(m: { x: number; y: number; dir: Dir; moving: boolean }): void;
  onAction(action: PlayerAction, danceMove?: number): void;
  onTapPlayer(id: string): void;
  onNearby(f: Furniture | null): void;
  onInteract(f: Furniture): void;
  onRoom(room: Room | undefined): void;
}

interface SpriteCache {
  canvas: HTMLCanvasElement;
  ox: number; // offset in world px from the footprint's top-left
  oy: number;
}

export class World {
  private c: CanvasRenderingContext2D;
  private players = new Map<string, WP>();
  private staticLayer: HTMLCanvasElement;
  private sprites = new Map<string, SpriteCache>();
  private raf = 0;
  private last = performance.now();
  private t = 0;
  private cam = { x: SPAWN_X(), y: SPAWN_Y() };
  private baseZoom = 2;
  private userZoom = 1;
  private keys = new Set<string>();
  private path: { x: number; y: number }[] = [];
  private pendingInteract: Furniture | null = null;
  private pendingSeat: { f: Furniture; x: number; y: number } | null = null;
  private lastSent = 0;
  private lastSentState = '';
  private nearby: Furniture | null = null;
  private room: Room | undefined;
  private tapMarker: { x: number; y: number; start: number } | null = null;
  keysEnabled = true;
  /** When set, the camera looks at this tile position with a fixed zoom instead of following the player. */
  cinematic: { x: number; y: number; zoom: number } | null = null;
  beat: () => number = () => 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { d: number; zoom: number } | null = null;
  private dpr = 1;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    public selfId: string,
    private cb: WorldCallbacks,
  ) {
    this.c = canvas.getContext('2d')!;
    this.staticLayer = buildStaticLayer(SPRITE_SCALE);
    this.buildSprites();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  // ───────────── state from the network ─────────────

  setPlayers(list: PlayerState[]) {
    this.players.clear();
    for (const p of list) this.addPlayer(p);
    const me = this.players.get(this.selfId);
    if (me) {
      this.cam.x = me.x * T;
      this.cam.y = me.y * T;
    }
  }

  addPlayer(p: PlayerState) {
    this.players.set(p.id, {
      ...p,
      rx: p.x,
      ry: p.y,
      emote: null,
      bubble: null,
      seed: Math.random() * 10,
    });
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  updatePlayer(u: Partial<PlayerState> & { id: string }) {
    const p = this.players.get(u.id);
    if (!p) return;
    const isSelf = u.id === this.selfId;
    for (const [k, v] of Object.entries(u)) {
      if (isSelf && (k === 'x' || k === 'y' || k === 'dir' || k === 'moving' || k === 'action')) continue;
      (p as any)[k] = v;
    }
  }

  applyMoves(list: MoveUpdate[]) {
    for (const m of list) {
      if (m.id === this.selfId) continue;
      const p = this.players.get(m.id);
      if (!p) continue;
      p.x = m.x;
      p.y = m.y;
      p.dir = m.dir;
      p.moving = m.moving;
      if (Math.hypot(p.rx - p.x, p.ry - p.y) > 4) {
        p.rx = p.x;
        p.ry = p.y;
      }
    }
  }

  showEmote(id: string, emote: string) {
    const p = this.players.get(id);
    if (p) p.emote = { name: emote, start: this.t };
  }

  showBubble(id: string, text: string) {
    const p = this.players.get(id);
    if (p) p.bubble = { text, start: this.t };
  }

  self() {
    return this.players.get(this.selfId);
  }

  playerPos(id: string) {
    const p = this.players.get(id);
    return p ? { x: p.rx, y: p.ry } : null;
  }

  setSelfAction(action: PlayerAction, danceMove = 0) {
    const me = this.self();
    if (!me) return;
    me.action = action;
    me.danceMove = danceMove;
    if (action !== 'idle') this.path = [];
    this.cb.onAction(action, danceMove);
  }

  zoomBy(f: number) {
    this.userZoom = Math.min(1.9, Math.max(0.55, this.userZoom * f));
  }

  walkTo(x: number, y: number, then?: Furniture) {
    const me = this.self();
    if (!me) return;
    const path = findPath(me.x, me.y, x, y);
    if (!path) return;
    this.path = path;
    this.pendingInteract = then ?? null;
    this.pendingSeat = null;
    this.standUp();
  }

  // ───────────── input ─────────────

  /** Layout size of the canvas, unaffected by CSS transforms on ancestors. */
  private viewSize() {
    return { width: this.canvas.clientWidth, height: this.canvas.clientHeight };
  }

  private resize = () => {
    const rect = this.viewSize();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    const vw = rect.width;
    const vh = rect.height;
    // Phones see ~8.5 tiles across so characters stay big; desktops see ~26.
    this.baseZoom = Math.max(1.3, Math.min(2.4, Math.min(vw / (T * 8.5), vh / (T * 8))));
    if (vw > 900) this.baseZoom = Math.max(1.2, Math.min(2, vw / (T * 26)));
  };

  private get zoom() {
    return this.cinematic ? this.cinematic.zoom : this.baseZoom * this.userZoom;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.keysEnabled) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();
      this.keys.add(k);
      this.path = [];
      this.pendingInteract = null;
      this.pendingSeat = null;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => this.keys.clear();

  private screenToWorld(sx: number, sy: number) {
    const rect = this.canvas.getBoundingClientRect();
    const z = this.zoom;
    return {
      x: (sx - rect.left - rect.width / 2) / z + this.cam.x,
      y: (sy - rect.top - rect.height / 2) / z + this.cam.y,
    };
  }

  private downAt: { x: number; y: number; time: number } | null = null;

  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.userZoom };
      this.downAt = null;
    } else {
      this.downAt = { x: e.clientX, y: e.clientY, time: performance.now() };
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.userZoom = Math.min(1.9, Math.max(0.55, this.pinchStart.zoom * (d / this.pinchStart.d)));
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    const d = this.downAt;
    this.downAt = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    this.tap(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
  };

  private tap(sx: number, sy: number) {
    const w = this.screenToWorld(sx, sy);
    const tx = w.x / T;
    const ty = w.y / T;
    // 1) players
    let best: WP | null = null;
    let bestD = Infinity;
    for (const p of this.players.values()) {
      if (p.id === this.selfId) continue;
      const inX = Math.abs(tx - p.rx) < 0.55;
      const inY = ty < p.ry + 0.25 && ty > p.ry - 1.7;
      if (inX && inY) {
        const dd = Math.abs(ty - (p.ry - 0.7));
        if (dd < bestD) {
          bestD = dd;
          best = p;
        }
      }
    }
    if (best) return this.cb.onTapPlayer(best.id);
    // 2) furniture (interactive or seats), including the part that rises above its footprint
    const hit = FURNITURE.filter((f) => {
      if (!f.interact && !f.seat) return false;
      const rise = (SPRITES[f.type]?.rise ?? 0) / T;
      return tx >= f.x && tx < f.x + f.w && ty >= f.y - rise && ty < f.y + f.h;
    }).sort((a, b) => b.y + b.h - (a.y + a.h))[0];
    const me = this.self();
    if (!me) return;
    if (hit?.seat) {
      const sx2 = Math.min(hit.x + hit.w - 0.5, Math.max(hit.x + 0.5, Math.floor(tx) + 0.5));
      const sy2 = Math.min(hit.y + hit.h - 0.5, Math.max(hit.y + 0.5, Math.floor(ty) + 0.5));
      const path = findPath(me.x, me.y, sx2, sy2);
      if (!path) return;
      this.path = path;
      this.pendingSeat = { f: hit, x: sx2, y: sy2 };
      this.pendingInteract = null;
      this.standUp();
      this.tapMarker = { x: sx2, y: sy2, start: this.t };
      return;
    }
    if (hit?.interact) {
      if (distToRect(me.x, me.y, hit) < 1.6) {
        this.cb.onInteract(hit);
        return;
      }
      const target = nearestApproach(hit, me.x, me.y);
      this.walkTo(target.x, target.y, hit);
      this.tapMarker = { x: target.x, y: target.y, start: this.t };
      return;
    }
    // 3) walk
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
    this.walkTo(tx, ty);
    this.tapMarker = { x: tx, y: ty, start: this.t };
  }

  private standUp() {
    const me = this.self();
    if (me && me.action !== 'idle') this.setSelfAction('idle');
  }

  // ───────────── simulation ─────────────

  private frame = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private canStand(x: number, y: number) {
    return isWalkable(x - 0.22, y) && isWalkable(x + 0.22, y) && isWalkable(x, y - 0.12) && isWalkable(x, y + 0.12);
  }

  private update(dt: number) {
    const me = this.self();
    if (me) {
      let dx = 0;
      let dy = 0;
      if (this.keysEnabled) {
        if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= 1;
        if (this.keys.has('arrowright') || this.keys.has('d')) dx += 1;
        if (this.keys.has('arrowup') || this.keys.has('w')) dy -= 1;
        if (this.keys.has('arrowdown') || this.keys.has('s')) dy += 1;
      }
      let moving = false;
      if (dx || dy) {
        this.standUp();
        const len = Math.hypot(dx, dy);
        const nx = me.x + (dx / len) * SPEED * dt;
        const ny = me.y + (dy / len) * SPEED * dt;
        if (this.canStand(nx, me.y)) me.x = nx;
        if (this.canStand(me.x, ny)) me.y = ny;
        me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        moving = true;
      } else if (this.path.length) {
        const wp = this.path[0];
        const ddx = wp.x - me.x;
        const ddy = wp.y - me.y;
        const dist = Math.hypot(ddx, ddy);
        const step = SPEED * dt;
        if (dist <= step) {
          me.x = wp.x;
          me.y = wp.y;
          this.path.shift();
        } else {
          me.x += (ddx / dist) * step;
          me.y += (ddy / dist) * step;
        }
        me.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx < 0 ? 'left' : 'right') : ddy < 0 ? 'up' : 'down';
        moving = true;
        if (!this.path.length) this.arrived();
      }
      me.moving = moving;
      me.rx = me.x;
      me.ry = me.y;
      this.maybeSend(me);
      this.checkNearby(me);
    }
    for (const p of this.players.values()) {
      if (p.id === this.selfId) continue;
      const k = Math.min(1, dt * 12);
      p.rx += (p.x - p.rx) * k;
      p.ry += (p.y - p.ry) * k;
    }
    // camera follow (a cinematic camera, used for spectating/trailers, takes priority)
    if (this.cinematic) {
      this.cam.x = this.cinematic.x * T;
      this.cam.y = this.cinematic.y * T;
    } else if (me) {
      const k = Math.min(1, dt * 6);
      this.cam.x += (me.rx * T - this.cam.x) * k;
      this.cam.y += (me.ry * T - 10 - this.cam.y) * k;
    }
    this.clampCamera();
  }

  private arrived() {
    const me = this.self()!;
    if (this.pendingSeat) {
      const s = this.pendingSeat;
      this.pendingSeat = null;
      if (Math.hypot(me.x - s.x, me.y - s.y) < 1.6) {
        me.x = s.x;
        me.y = s.y + 0.1;
        me.dir = s.f.seat ?? 'down';
        this.setSelfAction('sit');
        this.forceSend(me);
      }
    }
    if (this.pendingInteract) {
      const f = this.pendingInteract;
      this.pendingInteract = null;
      if (distToRect(me.x, me.y, f) < 1.8) this.cb.onInteract(f);
    }
  }

  private forceSend(me: WP) {
    this.lastSentState = '';
    this.lastSent = 0;
    this.maybeSend(me);
  }

  private maybeSend(me: WP) {
    const now = performance.now();
    const state = `${me.x.toFixed(2)},${me.y.toFixed(2)},${me.dir},${me.moving}`;
    if (state === this.lastSentState) return;
    if (now - this.lastSent < 66 && me.moving) return;
    this.lastSent = now;
    this.lastSentState = state;
    this.cb.onMove({ x: me.x, y: me.y, dir: me.dir, moving: me.moving });
  }

  private checkNearby(me: WP) {
    let best: Furniture | null = null;
    let bd = 1.5;
    for (const f of FURNITURE) {
      if (!f.interact) continue;
      const d = distToRect(me.x, me.y, f);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    if (best !== this.nearby) {
      this.nearby = best;
      this.cb.onNearby(best);
    }
    const room = roomAt(me.x, me.y);
    if (room !== this.room) {
      this.room = room;
      this.cb.onRoom(room);
    }
  }

  private clampCamera() {
    const rect = this.viewSize();
    const hw = rect.width / 2 / this.zoom;
    const hh = rect.height / 2 / this.zoom;
    const W = MAP_W * T;
    const H = MAP_H * T;
    this.cam.x = W < hw * 2 ? W / 2 : Math.min(W - hw, Math.max(hw, this.cam.x));
    this.cam.y = H + 40 < hh * 2 ? H / 2 : Math.min(H - hh, Math.max(hh - 40, this.cam.y));
  }

  // ───────────── rendering ─────────────

  private buildSprites() {
    for (const f of FURNITURE) {
      const s = SPRITES[f.type];
      if (!s?.draw || s.layer === 'floor' || s.layer === 'overhead') continue;
      const pad = (s.pad ?? 6) + 4;
      const w = f.w * T + pad * 2;
      const h = f.h * T + s.rise + 12;
      const cv = document.createElement('canvas');
      cv.width = w * SPRITE_SCALE;
      cv.height = h * SPRITE_SCALE;
      const c = cv.getContext('2d')!;
      c.scale(SPRITE_SCALE, SPRITE_SCALE);
      c.translate(pad, s.rise + 6);
      s.draw(c, f.w * T, f.h * T, f);
      this.sprites.set(f.id, { canvas: cv, ox: -pad, oy: -(s.rise + 6) });
    }
  }

  private render() {
    const c = this.c;
    const rect = this.viewSize();
    const z = this.zoom * this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0E0A1F';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const camX = this.cam.x - rect.width / 2 / this.zoom;
    const camY = this.cam.y - rect.height / 2 / this.zoom;
    c.setTransform(z, 0, 0, z, -camX * z, -camY * z);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.staticLayer, 0, 0, MAP_W * T, MAP_H * T);
    const beat = this.beat();
    this.drawDanceFloor(c, beat);
    this.drawPool(c);
    this.drawTapMarker(c);

    // y-sorted entities
    type Ent = { y: number; draw: () => void };
    const ents: Ent[] = [];
    for (const f of FURNITURE) {
      const s = SPRITES[f.type];
      if (!s || s.layer === 'floor' || s.layer === 'overhead') continue;
      const sc = this.sprites.get(f.id);
      ents.push({
        y: (f.y + f.h) * T - 1,
        draw: () => {
          if (sc) c.drawImage(sc.canvas, f.x * T + sc.ox, f.y * T + sc.oy, sc.canvas.width / SPRITE_SCALE, sc.canvas.height / SPRITE_SCALE);
          if (s.animate) {
            c.save();
            c.translate(f.x * T, f.y * T);
            s.animate(c, f.w * T, f.h * T, this.t, f, beat);
            c.restore();
          }
        },
      });
    }
    for (const p of this.players.values()) {
      ents.push({ y: p.ry * T + (p.action === 'sit' ? 2 : 0), draw: () => this.drawPlayer(c, p) });
    }
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    for (const f of FURNITURE) {
      const s = SPRITES[f.type];
      if (s?.layer !== 'overhead' || !s.animate) continue;
      c.save();
      c.translate(f.x * T, f.y * T);
      s.animate(c, f.w * T, f.h * T, this.t, f, beat);
      c.restore();
    }
    this.drawLighting(c, beat);
    // labels on top of everything
    for (const p of [...this.players.values()].sort((a, b) => a.ry - b.ry)) this.drawLabels(c, p);
  }

  private drawPlayer(c: CanvasRenderingContext2D, p: WP) {
    const tx = Math.floor(p.rx);
    const ty = Math.floor(p.ry);
    const swimming = TILES[ty]?.[tx] === 'pool';
    const rendMoving = p.id === this.selfId ? p.moving : p.moving || Math.hypot(p.x - p.rx, p.y - p.ry) > 0.05;
    const emoteActive = p.emote && this.t - p.emote.start < 2.4;
    let anim: 'idle' | 'walk' | 'dance' | 'sit' | 'swim' = 'idle';
    if (swimming) anim = 'swim';
    else if (rendMoving) anim = 'walk';
    else if (p.action === 'dance') anim = 'dance';
    else if (p.action === 'sit') anim = 'sit';
    drawAvatar(c, p.avatar, p.rx * T, p.ry * T, AV_SCALE, {
      dir: p.dir,
      anim,
      t: this.t,
      danceMove: p.danceMove,
      emote: emoteActive && !rendMoving ? p.emote!.name : null,
      held: p.held,
      seed: p.seed,
      ghost: !p.connected,
    });
  }

  private drawLabels(c: CanvasRenderingContext2D, p: WP) {
    const x = p.rx * T;
    const sitDrop = p.action === 'sit' ? 6 : 0;
    const headTop = p.ry * T - 54 * AV_SCALE + sitDrop - (p.avatar.hat === 'cowboy' || p.avatar.hat === 'party' ? 6 : 0);
    // name tag
    c.font = '600 7.5px Fredoka, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const label = (p.isHost ? '👑 ' : '') + p.name + (p.connected ? '' : ' 💤');
    const tw = c.measureText(label).width + 10;
    const ny = headTop - 7;
    c.fillStyle = p.id === this.selfId ? 'rgba(255,214,64,0.95)' : 'rgba(20,14,40,0.72)';
    c.beginPath();
    c.roundRect(x - tw / 2, ny - 5.5, tw, 11, 5.5);
    c.fill();
    c.fillStyle = p.id === this.selfId ? '#2A1A00' : '#FFFFFF';
    c.fillText(label, x, ny + 0.5);

    let top = ny - 8;
    // emote pop
    if (p.emote) {
      const e = this.t - p.emote.start;
      if (e < 2.4) {
        const pop = e < 0.25 ? e / 0.25 : 1;
        const s = 0.6 + pop * 0.6 + Math.sin(e * 10) * 0.04;
        c.save();
        c.globalAlpha = e > 1.9 ? Math.max(0, 1 - (e - 1.9) / 0.5) : 1;
        c.font = `${16 * s}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        c.fillText(EMOTE_EMOJI[p.emote.name as Emote] ?? '✨', x, top - 10 - e * 6);
        c.restore();
        top -= 22;
      } else p.emote = null;
    }
    // chat bubble
    if (p.bubble) {
      const e = this.t - p.bubble.start;
      const life = Math.min(9, 3.5 + p.bubble.text.length / 15);
      if (e < life) {
        c.save();
        c.globalAlpha = e > life - 0.5 ? (life - e) / 0.5 : Math.min(1, e / 0.12);
        c.font = '500 8px Fredoka, system-ui, sans-serif';
        const lines = wrap(c, p.bubble.text, 120).slice(0, 4);
        const lh = 10;
        const bw = Math.max(...lines.map((l) => c.measureText(l).width)) + 12;
        const bh = lines.length * lh + 8;
        const by = top - bh - 4 + (e < 0.12 ? (1 - e / 0.12) * 4 : 0);
        c.fillStyle = '#FFFFFF';
        c.strokeStyle = 'rgba(30,20,60,0.25)';
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(x - bw / 2, by, bw, bh, 7);
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(x - 4, by + bh - 0.5);
        c.lineTo(x, by + bh + 4);
        c.lineTo(x + 4, by + bh - 0.5);
        c.fill();
        c.fillStyle = '#1E1A2E';
        lines.forEach((l, i) => c.fillText(l, x, by + 4 + lh / 2 + i * lh));
        c.restore();
      } else p.bubble = null;
    }
  }

  private drawDanceFloor(c: CanvasRenderingContext2D, beat: number) {
    const t = this.t;
    const step = Math.floor(t * 2.07);
    c.save();
    for (let y = 11; y < 18; y++) {
      for (let x = 1; x < 14; x++) {
        if (TILES[y][x] !== 'dance') continue;
        const h = ((x * 37 + y * 53 + step * 71) % 360 + 360) % 360;
        const on = (x + y + step) % 3 === 0 || ((x * y + step) % 5 === 0);
        if (!on) continue;
        c.fillStyle = `hsla(${h},95%,60%,${0.35 + beat * 0.35})`;
        c.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
      }
    }
    // disco ball light flecks
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a = t * 0.6 + i * 2.1;
      const r = 40 + ((i * 37) % 120);
      const fx = 7.5 * T + Math.cos(a) * r * 1.3;
      const fy = 14 * T + Math.sin(a) * r * 0.6;
      if (fx < T || fx > 14 * T || fy < 11 * T || fy > 18 * T) continue;
      c.fillStyle = `hsla(${(i * 47) % 360},100%,75%,0.55)`;
      c.beginPath();
      c.arc(fx, fy, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawPool(c: CanvasRenderingContext2D) {
    const t = this.t;
    c.save();
    c.beginPath();
    c.rect(16 * T, 22 * T, 13 * T, 6 * T);
    c.clip();
    const g = c.createLinearGradient(0, 22 * T, 0, 28 * T);
    g.addColorStop(0, '#36C3F0');
    g.addColorStop(1, '#1582C4');
    c.fillStyle = g;
    c.fillRect(16 * T, 22 * T, 13 * T, 6 * T);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1.5;
    for (let row = 0; row < 14; row++) {
      c.beginPath();
      const yb = 22 * T + 8 + row * 13;
      for (let x = 16 * T; x <= 29 * T; x += 8) {
        const y = yb + Math.sin(x * 0.05 + t * 1.6 + row) * 3 + Math.sin(x * 0.11 - t * 2.2) * 1.5;
        if (x === 16 * T) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    // floatie
    const fx = 20 * T + Math.sin(t * 0.3) * 40;
    const fy = 24 * T + Math.cos(t * 0.25) * 20;
    c.lineWidth = 7;
    c.strokeStyle = '#FF6FA8';
    c.beginPath();
    c.arc(fx, fy, 11, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#FFFFFF';
    c.setLineDash([6, 6]);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  private drawTapMarker(c: CanvasRenderingContext2D) {
    const m = this.tapMarker;
    if (!m) return;
    const e = this.t - m.start;
    if (e > 0.7) {
      this.tapMarker = null;
      return;
    }
    c.save();
    c.strokeStyle = `rgba(255,225,77,${1 - e / 0.7})`;
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(m.x * T, m.y * T, 6 + e * 18, (6 + e * 18) * 0.5, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  private glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private drawLighting(c: CanvasRenderingContext2D, beat: number) {
    const t = this.t;
    c.save();
    // night falls over the backyard
    const g = c.createLinearGradient(0, 18 * T, 0, MAP_H * T);
    g.addColorStop(0, 'rgba(18,14,60,0.28)');
    g.addColorStop(1, 'rgba(10,8,40,0.5)');
    c.fillStyle = g;
    c.fillRect(0, 18.6 * T, MAP_W * T, MAP_H * T);
    // dim the dance room so its lights pop
    c.fillStyle = 'rgba(15,5,40,0.25)';
    c.fillRect(1 * T, 10 * T, 13 * T, 8 * T);
    c.globalCompositeOperation = 'lighter';
    const flick = 0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
    this.glow(c, 8 * T, 25 * T, 130 * flick, 'rgba(255,140,50,0.38)');
    this.glow(c, 36 * T, 11 * T, 90 * flick, 'rgba(255,140,50,0.22)');
    this.glow(c, 22.5 * T, 25 * T, 170, 'rgba(60,200,255,0.15)');
    for (let x = 2; x < 43; x += 4) this.glow(c, x * T, 19.6 * T, 46, 'rgba(255,220,140,0.16)');
    this.glow(c, 16.5 * T, 7.6 * T, 70, 'rgba(255,220,150,0.16)');
    this.glow(c, 27.5 * T, 7.6 * T, 70, 'rgba(255,220,150,0.16)');
    this.glow(c, 22 * T, 0.5 * T, 120, `hsla(${(t * 20) % 360},90%,60%,0.10)`);
    // dance floor beams
    const cols = ['rgba(255,77,184,0.22)', 'rgba(77,242,255,0.2)', 'rgba(255,225,77,0.18)'];
    for (let i = 0; i < 3; i++) {
      const a = t * (0.7 + i * 0.25) + i * 2;
      this.glow(c, (7.5 + Math.cos(a) * 4.2) * T, (14.3 + Math.sin(a * 1.3) * 2.2) * T, 70 + beat * 25, cols[i]);
    }
    this.glow(c, 3 * T, 11.5 * T, 50 + beat * 30, 'rgba(180,90,255,0.2)');
    this.glow(c, 12 * T, 11.5 * T, 50 + beat * 30, 'rgba(180,90,255,0.2)');
    c.restore();
  }
}

function SPAWN_X() {
  return 22 * T;
}
function SPAWN_Y() {
  return 12 * T;
}

export function distToRect(x: number, y: number, f: Furniture) {
  const dx = Math.max(f.x - x, 0, x - (f.x + f.w));
  const dy = Math.max(f.y - y, 0, y - (f.y + f.h));
  return Math.hypot(dx, dy);
}

function nearestApproach(f: Furniture, fromX: number, fromY: number) {
  let best = { x: f.x + f.w / 2, y: f.y + f.h + 0.5 };
  let bd = Infinity;
  for (let y = f.y - 1; y <= f.y + f.h; y++) {
    for (let x = f.x - 1; x <= f.x + f.w; x++) {
      if (!isWalkable(x + 0.5, y + 0.5)) continue;
      const d = Math.hypot(x + 0.5 - fromX, y + 0.5 - fromY);
      if (d < bd) {
        bd = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return best;
}

function wrap(c: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (c.measureText(test).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.map((l) => (c.measureText(l).width > max * 1.4 ? l.slice(0, 22) + '…' : l));
}

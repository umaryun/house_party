import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Avatar } from '../../shared/avatar';
import { avatarPortrait, drawAvatar, type Anim } from '../world/avatarRender';
import type { Dir } from '../../shared/map';
import { serverNow, useStore } from '../store';
import { sound } from '../sound';

export function Portrait({ avatar, size = 96, className, alt = '' }: { avatar: Avatar | null | undefined; size?: number; className?: string; alt?: string }) {
  const src = useMemo(() => (avatar ? avatarPortrait(avatar, size) : ''), [avatar, size]);
  if (!avatar) return <div className={className} style={{ width: size, height: size }} />;
  return <img src={src} className={className} alt={alt} draggable={false} />;
}

/** A live, animated character on its own canvas. */
export function AvatarStage({
  avatar,
  dir = 'down',
  anim = 'idle',
  danceMove = 0,
  emote = null,
  pose = null,
  poseSeq = 0,
  scale = 3,
  footY = 0.86,
}: {
  avatar: Avatar;
  dir?: Dir;
  anim?: Anim;
  danceMove?: number;
  emote?: string | null;
  pose?: string | null;
  poseSeq?: number;
  scale?: number;
  footY?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ avatar, dir, anim, danceMove, emote, pose, scale, footY });
  props.current = { avatar, dir, anim, danceMove, emote, pose, scale, footY };
  const emoteStart = useRef(0);
  const t0 = useRef(performance.now());
  useEffect(() => {
    emoteStart.current = performance.now();
  }, [emote, pose, poseSeq]);

  useEffect(() => {
    const cv = ref.current!;
    const c = cv.getContext('2d')!;
    let raf = 0;
    const loop = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      const p = props.current;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      const s = Math.min(cv.width, cv.height) / 100 * (p.scale / 3) * 1.25;
      const t = (performance.now() - t0.current) / 1000;
      const et = (performance.now() - emoteStart.current) / 1000;
      drawAvatar(c, p.avatar, cv.width / 2, cv.height * p.footY, s, {
        dir: p.dir,
        anim: p.anim,
        t,
        danceMove: p.danceMove,
        emote: p.emote && et < 2.4 ? p.emote : null,
        pose: p.pose,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="close-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="scroll" style={{ minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <div
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => {
        sound.play('click');
        onChange(!on);
      }}
      role="switch"
      aria-checked={on}
    >
      <span className="track" />
      {label}
    </div>
  );
}

export function Timer({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(serverNow());
  const lastSec = useRef(-1);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, deadline - now);
  const secs = Math.ceil(left / 1000);
  useEffect(() => {
    if (secs <= 5 && secs > 0 && secs !== lastSec.current) sound.play('tick');
    lastSec.current = secs;
  }, [secs]);
  const frac = Math.min(1, left / total);
  const r = 21;
  const circ = 2 * Math.PI * r;
  const col = secs <= 5 ? '#FF4D6D' : secs <= 15 ? '#FFD23F' : '#3DDC97';
  return (
    <div className={`timer ${secs <= 5 && secs > 0 ? 'urgent' : ''}`}>
      <svg width="50" height="50">
        <circle cx="25" cy="25" r={r} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
        <circle
          cx="25"
          cy="25"
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="tnum">{secs}</div>
    </div>
  );
}

const CONFETTI_COLORS = ['#FF4D8D', '#FFD23F', '#2EC4F1', '#3DDC97', '#9B5DE5', '#FF8A3D'];
export function Confetti({ count = 26 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: -Math.random() * 12,
        dur: 7 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 0.6 + Math.random() * 0.8,
      })),
    [count],
  );
  return (
    <>
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            transform: `scale(${p.size})`,
          }}
        />
      ))}
    </>
  );
}

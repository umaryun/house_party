import { useEffect, useRef, useState } from 'react';
import type { DrawSegment, GameFeedItem } from '../../shared/types';
import { onDraw } from '../net';
import { useStore } from '../store';
import { Portrait, Timer } from '../ui/common';
import { ActionInput, Feed, ScoreStrip, act } from './GameOverlay';

interface DrawView {
  phase: 'choosing' | 'drawing' | 'reveal';
  round: number;
  rounds: number;
  drawerId: string;
  choices: string[] | null;
  word: string | null;
  hint: string;
  guessed: string[];
  deadline: number;
  scores: { id: string; name: string; score: number }[];
  feed: GameFeedItem[];
}

const W = 800;
const H = 600;
const COLORS = ['#1E1A2E', '#FFFFFF', '#FF4D6D', '#FF8A3D', '#FFD23F', '#3DDC97', '#2EC4F1', '#4D6BFF', '#9B5DE5', '#F15BB5', '#8B5E3C', '#F1C27D'];
const SIZES = [4, 10, 22];

export function DrawGameView({ v, selfId }: { v: DrawView; selfId: string; participants: string[] }) {
  const players = useStore((s) => s.players);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const segs = useRef<DrawSegment[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const isDrawer = v.drawerId === selfId;
  const canDraw = isDrawer && v.phase === 'drawing';
  const drawerName = players[v.drawerId]?.name ?? 'Someone';

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const paint = (s: DrawSegment) => {
    const c = ctx();
    if (!c) return;
    c.strokeStyle = s.color;
    c.lineWidth = s.size;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(s.pts[0] * W, s.pts[1] * H);
    if (s.pts.length === 2) c.lineTo(s.pts[0] * W + 0.1, s.pts[1] * H);
    for (let i = 2; i < s.pts.length; i += 2) c.lineTo(s.pts[i] * W, s.pts[i + 1] * H);
    c.stroke();
  };

  const redraw = () => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, W, H);
    for (const s of segs.current) paint(s);
  };

  useEffect(() => {
    redraw();
    const off = onDraw({
      seg: (s) => {
        segs.current.push(s);
        paint(s);
      },
      full: (all) => {
        segs.current = [...all];
        redraw();
      },
    });
    act({ kind: 'sync' });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───── drawing input ─────
  const stroke = useRef<{ sid: string; pending: number[]; last: [number, number] | null } | null>(null);
  const flushTimer = useRef<number | null>(null);

  const flush = () => {
    const s = stroke.current;
    if (!s || s.pending.length < 2) return;
    const pts = s.last ? [...s.last, ...s.pending] : [...s.pending];
    const seg: DrawSegment = { sid: s.sid, color, size, pts };
    segs.current.push(seg);
    act({ kind: 'seg', seg });
    s.last = [s.pending[s.pending.length - 2], s.pending[s.pending.length - 1]];
    s.pending = [];
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] as [number, number];
  };

  const down = (e: React.PointerEvent) => {
    if (!canDraw) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    stroke.current = { sid: Math.random().toString(36).slice(2, 10), pending: [x, y], last: null };
    const c = ctx()!;
    c.fillStyle = color;
    c.beginPath();
    c.arc(x * W, y * H, size / 2, 0, Math.PI * 2);
    c.fill();
    flushTimer.current = window.setInterval(flush, 45);
  };

  const move = (e: React.PointerEvent) => {
    const s = stroke.current;
    if (!s || !canDraw) return;
    const [x, y] = pos(e);
    const prev = s.pending.length >= 2 ? [s.pending[s.pending.length - 2], s.pending[s.pending.length - 1]] : s.last;
    if (prev && Math.hypot((x - prev[0]) * W, (y - prev[1]) * H) < 1.5) return;
    s.pending.push(x, y);
    if (prev) {
      const c = ctx()!;
      c.strokeStyle = color;
      c.lineWidth = size;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(prev[0] * W, prev[1] * H);
      c.lineTo(x * W, y * H);
      c.stroke();
    }
  };

  const up = () => {
    if (!stroke.current) return;
    if (stroke.current.pending.length === 2 && !stroke.current.last) stroke.current.pending.push(...stroke.current.pending);
    flush();
    stroke.current = null;
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = null;
  };

  useEffect(() => () => {
    if (flushTimer.current) clearInterval(flushTimer.current);
  }, []);

  const total = v.phase === 'choosing' ? 15000 : v.phase === 'drawing' ? 80000 : 6000;
  const wordLine = v.word
    ? v.word
    : v.phase === 'drawing'
      ? v.hint.split('').join(' ').replace(/ {3}/g, '   ')
      : '';

  return (
    <div className="draw-layout">
      <div className="main">
        <div className="row" style={{ width: '100%', maxWidth: 640, justifyContent: 'space-between' }}>
          <span className="pill">
            Round {v.round}/{v.rounds}
          </span>
          <div className={`word-display ${v.word ? 'secret' : ''}`} style={{ flex: 1 }}>
            {wordLine}
            {v.phase === 'drawing' && !v.word && <span className="muted small" style={{ letterSpacing: 0, marginLeft: 8 }}>({v.hint.replace(/ /g, '').length})</span>}
          </div>
          <Timer deadline={v.deadline} total={total} />
        </div>
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ cursor: canDraw ? 'crosshair' : 'default' }}
          />
          {v.phase === 'choosing' && (
            <div className="canvas-cover">
              {isDrawer && v.choices ? (
                <>
                  <h2 style={{ fontSize: 26 }}>Your turn to draw! ✏️</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Pick a word:
                  </p>
                  <div className="choices">
                    {v.choices.map((w, i) => (
                      <button key={w} className="btn yellow" onClick={() => act({ kind: 'choose', index: i })}>
                        {w}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Portrait avatar={players[v.drawerId]?.avatar} size={160} />
                  <h2 style={{ fontSize: 22 }}>{drawerName} is picking a word…</h2>
                </>
              )}
            </div>
          )}
          {v.phase === 'reveal' && (
            <div className="canvas-cover" style={{ background: 'rgba(36,21,71,0.85)' }}>
              <p className="muted" style={{ margin: 0 }}>
                The word was
              </p>
              <h2 style={{ fontSize: 40, color: 'var(--yellow)' }}>{v.word}</h2>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {v.guessed.length ? `${v.guessed.length} ${v.guessed.length === 1 ? 'person' : 'people'} got it! 🎉` : 'Nobody got it 😅'}
              </p>
            </div>
          )}
        </div>
        {canDraw && (
          <div className="tools">
            {COLORS.map((c) => (
              <button key={c} className={`color-dot ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
            {SIZES.map((s) => (
              <button key={s} className={`tool-btn ${size === s ? 'on' : ''}`} onClick={() => setSize(s)} aria-label={`Brush ${s}`}>
                <span style={{ width: Math.max(4, s / 1.6), height: Math.max(4, s / 1.6), borderRadius: '50%', background: '#fff', display: 'block' }} />
              </button>
            ))}
            <button className="tool-btn" onClick={() => act({ kind: 'undo' })} aria-label="Undo">
              ↩️
            </button>
            <button className="tool-btn" onClick={() => act({ kind: 'clear' })} aria-label="Clear">
              🗑️
            </button>
          </div>
        )}
      </div>
      <div className="side">
        <ScoreStrip scores={v.scores} highlight={v.guessed} active={v.drawerId} />
        <Feed items={v.feed} selfId={selfId} />
        <ActionInput
          placeholder={
            isDrawer
              ? 'Chat with people who guessed…'
              : v.guessed.includes(selfId)
                ? 'You got it! Chat with the winners…'
                : 'Type your guess…'
          }
          onSubmit={(text) => act({ kind: 'guess', text })}
          buttonLabel={isDrawer || v.guessed.includes(selfId) ? 'Send' : 'Guess'}
        />
      </div>
    </div>
  );
}

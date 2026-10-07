import { useEffect, useRef, useState } from 'react';
import { GAMES, type GameEnvelope, type GameFeedItem } from '../../shared/types';
import { emit, request } from '../net';
import { toast, useStore } from '../store';
import { sound } from '../sound';
import { Confetti, Portrait } from '../ui/common';
import { DrawGameView } from './DrawGame';
import { MafiaView } from './Mafia';
import { CharadesView } from './Charades';
import { ImposterView } from './Imposter';

export function act(action: Record<string, unknown>) {
  emit('game:action', action);
}

async function cmd(event: string) {
  try {
    await request(event);
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

export function GameOverlay({ onMinimize }: { onMinimize: () => void }) {
  const game = useStore((s) => s.game)!;
  const selfId = useStore((s) => s.party!.selfId);
  const info = GAMES[game.type];
  const isHost = game.hostId === selfId;
  const subtitle =
    game.status === 'lobby'
      ? `Lobby · ${game.participants.length}/${info.maxPlayers} players`
      : game.status === 'playing'
        ? game.participants.includes(selfId)
          ? 'Playing'
          : 'Watching 👀'
        : 'Game over';

  return (
    <div className="game-overlay">
      <div className="game-head" style={{ borderBottom: `3px solid ${info.color}` }}>
        <span style={{ fontSize: 30 }}>{info.emoji}</span>
        <div className="gt">
          <h2>{info.name}</h2>
          <div className="sub">{subtitle}</div>
        </div>
        {game.status === 'playing' && isHost && (
          <button
            className="btn ghost sm"
            onClick={() => {
              if (confirm('End the game for everyone?')) cmd('game:close');
            }}
          >
            End
          </button>
        )}
        <button className="close-x" onClick={onMinimize} aria-label="Back to the party" title="Back to the party">
          🏠
        </button>
      </div>
      <div className="game-body">
        {game.status === 'lobby' && <Lobby game={game} selfId={selfId} />}
        {game.status === 'playing' && <Playing game={game} selfId={selfId} />}
        {game.status === 'ended' && <Results game={game} selfId={selfId} onBack={onMinimize} />}
      </div>
    </div>
  );
}

function Playing({ game, selfId }: { game: GameEnvelope; selfId: string }) {
  if (!game.view) return <div className="lobby"><div className="spinner" /></div>;
  switch (game.type) {
    case 'draw':
      return <DrawGameView v={game.view} selfId={selfId} participants={game.participants} />;
    case 'mafia':
      return <MafiaView v={game.view} selfId={selfId} />;
    case 'charades':
      return <CharadesView v={game.view} selfId={selfId} participants={game.participants} />;
    case 'imposter':
      return <ImposterView v={game.view} selfId={selfId} />;
  }
}

function Lobby({ game, selfId }: { game: GameEnvelope; selfId: string }) {
  const players = useStore((s) => s.players);
  const info = GAMES[game.type];
  const joined = game.participants.includes(selfId);
  const isHost = game.hostId === selfId;
  const need = Math.max(0, info.minPlayers - game.participants.length);
  const emptySeats = Math.max(need, game.participants.length < info.maxPlayers ? 1 : 0);
  return (
    <div className="lobby scroll">
      <div className="big-emoji">{info.emoji}</div>
      <p style={{ margin: 0, fontWeight: 600, maxWidth: 480 }}>{info.tagline}</p>
      <div className="seats">
        {game.participants.map((id) => (
          <div className="seat" key={id}>
            <Portrait avatar={players[id]?.avatar} size={128} />
            <span className="sn">
              {id === game.hostId ? '👑 ' : ''}
              {players[id]?.name ?? '…'}
            </span>
          </div>
        ))}
        {Array.from({ length: emptySeats }, (_, i) => (
          <div className="seat" key={`e${i}`}>
            <div className="empty-seat">?</div>
            <span className="sn muted">waiting…</span>
          </div>
        ))}
      </div>
      {need > 0 ? (
        <div className="pill">
          Need {need} more {need === 1 ? 'player' : 'players'} · invite friends!
        </div>
      ) : (
        <div className="pill live">Ready to go! 🎉</div>
      )}
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        {!joined ? (
          <button className="btn green lg" onClick={() => cmd('game:join')}>
            ✋ I'm in!
          </button>
        ) : (
          <>
            {isHost ? (
              <button
                className="btn yellow lg"
                disabled={need > 0}
                onClick={() => {
                  sound.unlock();
                  cmd('game:start');
                }}
              >
                ▶ Start game
              </button>
            ) : (
              <div className="pill">Waiting for {players[game.hostId]?.name ?? 'the host'} to start…</div>
            )}
            <button className="btn ghost" onClick={() => cmd('game:leave')}>
              Leave
            </button>
          </>
        )}
      </div>
      <div className="howto">
        <h3 style={{ fontSize: 20, textAlign: 'center' }}>How to play</h3>
        <ol>
          {info.howTo.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Results({ game, selfId, onBack }: { game: GameEnvelope; selfId: string; onBack: () => void }) {
  const players = useStore((s) => s.players);
  const r = game.results;
  const won = r?.winners.includes(selfId);
  useEffect(() => {
    if (won) sound.play('win');
  }, [won]);
  if (!r) return null;
  const top = r.ranking.slice(0, 3);
  const podium = [top[1], top[0], top[2]];
  const heights = [90, 130, 70];
  const colors = ['#C9D1E0', '#FFD23F', '#E0955A'];
  const showPodium = game.type === 'draw' || game.type === 'charades';
  return (
    <div className="results scroll" style={{ position: 'relative' }}>
      {won && <Confetti count={40} />}
      <h2>{r.headline}</h2>
      {won ? <div className="pill live">🏆 You won!</div> : <div className="pill">GG! Rematch?</div>}
      {game.type === 'mafia' && game.view && <MafiaView v={game.view} selfId={selfId} compact />}
      {game.type === 'imposter' && game.view && <ImposterView v={game.view} selfId={selfId} compact />}
      {showPodium && (
        <div className="podium">
          {podium.map((p, i) =>
            p ? (
              <div className="pod" key={p.id}>
                <Portrait avatar={players[p.id]?.avatar} size={160} />
                <b style={{ fontSize: 14 }}>{p.name}</b>
                <div className="block" style={{ height: heights[i], background: colors[i], color: '#2a1a00' }}>
                  {i === 1 ? 1 : i === 0 ? 2 : 3}
                </div>
              </div>
            ) : (
              <div className="pod" key={i} />
            ),
          )}
        </div>
      )}
      <div className="rank-list">
        {r.ranking.map((p, i) => (
          <div className="rank-row" key={p.id} style={r.winners.includes(p.id) ? { background: 'rgba(255,210,63,0.15)' } : undefined}>
            <span style={{ width: 22, fontWeight: 700 }}>{i + 1}</span>
            <Portrait avatar={players[p.id]?.avatar} size={72} />
            <span className="grow" style={{ textAlign: 'left' }}>
              {p.name}
            </span>
            <b style={{ color: 'var(--yellow)' }}>{p.score}</b>
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button className="btn yellow lg" onClick={() => cmd('game:rematch')}>
          🔁 Play again
        </button>
        <button
          className="btn ghost lg"
          onClick={onBack}
        >
          🏠 Back to party
        </button>
      </div>
    </div>
  );
}

/** Shared scrolling feed of guesses / chat / system lines. */
export function Feed({ items, selfId }: { items: GameFeedItem[]; selfId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [items.length]);
  return (
    <div className="feed scroll" ref={ref}>
      {items.map((f) => (
        <div key={f.id} className={`feed-item ${f.kind}`}>
          {f.fromName && f.kind !== 'correct' && (
            <b style={{ color: f.from === selfId ? 'var(--yellow)' : undefined }}>
              {f.kind === 'mafia' ? '🔪 ' : f.kind === 'dead' ? '👻 ' : ''}
              {f.fromName}:{' '}
            </b>
          )}
          {f.text}
        </div>
      ))}
    </div>
  );
}

/** A text input that submits a game action. */
export function ActionInput({
  placeholder,
  onSubmit,
  disabled,
  maxLength = 60,
  autoFocus,
  buttonLabel = 'Send',
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  buttonLabel?: string;
}) {
  const [v, setV] = useState('');
  return (
    <form
      className="guess-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim() || disabled) return;
        onSubmit(v.trim());
        setV('');
      }}
    >
      <input
        className="input"
        placeholder={placeholder}
        value={v}
        maxLength={maxLength}
        onChange={(e) => setV(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="send"
      />
      <button className="btn sm" type="submit" disabled={disabled || !v.trim()}>
        {buttonLabel}
      </button>
    </form>
  );
}

export function ScoreStrip({
  scores,
  highlight = [],
  active,
}: {
  scores: { id: string; name: string; score: number }[];
  highlight?: string[];
  active?: string;
}) {
  const players = useStore((s) => s.players);
  return (
    <div className="score-strip">
      {scores.map((s) => (
        <div key={s.id} className={`score-chip ${highlight.includes(s.id) ? 'hl' : ''} ${active === s.id ? 'active' : ''}`}>
          <Portrait avatar={players[s.id]?.avatar} size={60} />
          {active === s.id ? '✏️ ' : highlight.includes(s.id) ? '✅ ' : ''}
          {s.name}
          <b>{s.score}</b>
        </div>
      ))}
    </div>
  );
}

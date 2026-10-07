import type { GameFeedItem } from '../../shared/types';
import { useStore } from '../store';
import { Portrait, Timer } from '../ui/common';
import { ActionInput, Feed, act } from './GameOverlay';

interface ImposterViewData {
  phase: 'reveal' | 'clues' | 'vote' | 'result' | 'lastChance' | 'over';
  narration: string;
  category: string;
  word: string | null;
  amImposter: boolean | null;
  imposterId: string | null;
  order: string[];
  currentCluer: string | null;
  clueRound: number;
  clueRounds: number;
  clues: { pid: string; text: string; round: number }[];
  votes: Record<string, string> | null;
  myVote: string | null;
  accused: string | null;
  imposterGuess: string | null;
  outcome: 'crew' | 'imposter' | null;
  deadline: number;
  feed: GameFeedItem[];
}

const TOTALS: Record<string, number> = { reveal: 9000, clues: 30000, vote: 75000, result: 6000, lastChance: 30000 };

export function ImposterView({ v, selfId, compact }: { v: ImposterViewData; selfId: string; compact?: boolean }) {
  const players = useStore((s) => s.players);
  const myTurn = v.phase === 'clues' && v.currentCluer === selfId;
  const isPlayer = v.amImposter !== null;
  const voteCounts: Record<string, number> = {};
  if (v.votes) for (const t of Object.values(v.votes)) voteCounts[t] = (voteCounts[t] ?? 0) + 1;

  const board = (
    <div className="clue-board">
      {v.order.map((pid) => {
        const mine = v.clues.filter((c) => c.pid === pid);
        return (
          <div key={pid} className={`clue-row ${v.currentCluer === pid ? 'turn' : ''}`}>
            <Portrait avatar={players[pid]?.avatar} size={72} />
            <span className="cn">
              {pid === selfId ? 'You' : players[pid]?.name}
              {v.imposterId === pid && ' 😈'}
            </span>
            <div className="row wrap grow" style={{ gap: 6 }}>
              {mine.map((c, i) => (
                <span key={i} className="clue-word">
                  {c.text}
                </span>
              ))}
              {v.currentCluer === pid && <span className="muted small">thinking… 💭</span>}
            </div>
            {v.phase === 'vote' && pid !== selfId && isPlayer && (
              <button className={`btn sm ${v.myVote === pid ? 'yellow' : 'ghost'}`} onClick={() => act({ kind: 'vote', target: pid })}>
                {v.myVote === pid ? '✔ Voted' : 'Vote'}
              </button>
            )}
            {voteCounts[pid] ? <span className="pill" style={{ background: 'var(--red)' }}>🗳️ {voteCounts[pid]}</span> : null}
          </div>
        );
      })}
    </div>
  );

  if (compact) return <div style={{ width: '100%', maxWidth: 560 }}>{board}</div>;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div className="row" style={{ padding: '10px 12px 0', justifyContent: 'space-between' }}>
          <span className="pill">
            {v.phase === 'clues' ? `Clue round ${Math.min(v.clueRound, v.clueRounds)}/${v.clueRounds}` : v.phase === 'vote' ? '🗳️ Vote' : '👀 Imposter'}
          </span>
          {v.phase !== 'over' && <Timer deadline={v.deadline} total={TOTALS[v.phase] ?? 30000} />}
        </div>
        {isPlayer && (
          <div
            className="secret-card"
            style={{
              background: v.amImposter ? 'linear-gradient(135deg,#FF4D6D,#5a1030)' : 'linear-gradient(135deg,#2EC4F1,#3a2a9c)',
            }}
          >
            {v.amImposter ? (
              <>
                <div style={{ fontWeight: 700 }}>🤫 You are the</div>
                <div className="big">IMPOSTER</div>
                <div style={{ fontWeight: 600 }}>
                  Category: {v.category} · Blend in and figure out the word!
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{v.category} · The secret word is</div>
                <div className="big">{v.word}</div>
                <div style={{ fontWeight: 600 }}>Give clues that prove you know it… without giving it away.</div>
              </>
            )}
          </div>
        )}
        {!isPlayer && (
          <div className="secret-card" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ fontWeight: 700 }}>👀 Spectating · Category: {v.category}</div>
          </div>
        )}
        <div className="narration">{v.narration}</div>
        {board}
      </div>
      {v.phase === 'clues' && myTurn ? (
        <ActionInput placeholder="Your one-word clue…" maxLength={30} autoFocus onSubmit={(text) => act({ kind: 'clue', text })} buttonLabel="Give clue" />
      ) : v.phase === 'lastChance' && v.imposterId === selfId ? (
        <ActionInput placeholder="Guess the secret word!" maxLength={40} autoFocus onSubmit={(text) => act({ kind: 'guessWord', text })} buttonLabel="Guess" />
      ) : (
        <div style={{ height: '28%', minHeight: 130, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--line)' }}>
          <Feed items={v.feed} selfId={selfId} />
          <ActionInput placeholder={v.phase === 'vote' ? 'Who is sus? Discuss…' : 'Chat…'} maxLength={200} onSubmit={(text) => act({ kind: 'chat', text })} />
        </div>
      )}
    </div>
  );
}

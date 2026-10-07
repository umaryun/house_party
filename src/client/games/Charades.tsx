import type { GameFeedItem } from '../../shared/types';
import { useStore } from '../store';
import { AvatarStage, Timer } from '../ui/common';
import { ActionInput, Feed, ScoreStrip, act } from './GameOverlay';

interface CharadesViewData {
  phase: 'acting' | 'reveal';
  actorId: string;
  category: string;
  word: string | null;
  wordShape: string;
  clues: string[];
  pose: string;
  poseSeq: number;
  passesLeft: number;
  guessed: string[];
  deadline: number;
  turn: number;
  totalTurns: number;
  scores: { id: string; name: string; score: number }[];
  feed: GameFeedItem[];
}

const POSES: [string, string][] = [
  ['wave', '👋'], ['dance', '🕺'], ['laugh', '😂'], ['cry', '😭'], ['sleep', '😴'], ['run', '🏃'], ['jump', '🦘'], ['think', '🤔'],
  ['love', '😍'], ['angry', '😡'], ['scared', '😱'], ['eat', '🍔'], ['swim', '🏊'], ['fly', '🕊️'], ['point', '👉'], ['shrug', '🤷'],
];

const EMOJIS =
  '🎬 🎥 🍿 📺 🎵 🎤 🎸 🥁 👑 🦸 🧙 🧛 🧟 👻 🤖 👽 🏴‍☠️ 🚀 🛸 🌍 🌊 🏝️ 🏔️ 🌋 🏜️ 🏙️ 🏠 🏰 ⛪ 🏥 🏫 ✈️ 🚗 🚢 🚂 🚲 🏃 🏊 ⚽ 🏀 🥊 🎿 🏄 🐶 🐱 🦁 🐯 🐻 🐼 🐸 🐵 🐔 🐧 🐍 🦈 🐳 🐙 🐝 🦋 🐴 🦄 🐉 🦖 🍕 🍔 🌮 🍣 🍦 🎂 🍫 🍎 🍌 ☕ 🍷 ❤️ 💔 💍 👰 🤵 👶 👵 💀 🔥 ❄️ ☀️ 🌙 ⭐ 🌈 ⚡ 💧 🎄 🎃 🎁 🎉 💰 💎 🔑 🔪 🔫 💣 🧊 ⏰ 📱 💻 📚 ✏️ 👓 🎩 👗 👟 ➕ ➖ ❌ ✅ ❓ 👆 👇 👈 👉 🔁 1️⃣ 2️⃣ 3️⃣'.split(' ');

export function CharadesView({ v, selfId }: { v: CharadesViewData; selfId: string; participants: string[] }) {
  const players = useStore((s) => s.players);
  const actor = players[v.actorId];
  const isActor = v.actorId === selfId;
  const acting = v.phase === 'acting';

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ padding: '8px 12px 0', justifyContent: 'space-between' }}>
        <span className="pill">
          Turn {Math.min(v.turn, v.totalTurns)}/{v.totalTurns}
        </span>
        <span className="pill" style={{ fontSize: 15 }}>
          {v.category}
        </span>
        <Timer deadline={v.deadline} total={acting ? 75000 : 6000} />
      </div>
      {(isActor || v.word) && (
        <div className="word-display secret" style={{ letterSpacing: 1 }}>
          {isActor && acting ? `Act out: ${v.word}` : v.phase === 'reveal' ? `It was “${v.word}”` : `✅ ${v.word}`}
        </div>
      )}
      {!isActor && !v.word && <div className="word-display">{v.wordShape.split('').join(' ')}</div>}
      <div className="stage-box">
        {actor && <AvatarStage avatar={actor.avatar} pose={acting ? v.pose : 'love'} poseSeq={v.poseSeq} scale={2.4} footY={0.92} />}
        <div className="clue-strip">
          {v.clues.slice(-12).map((c, i) => (
            <span key={`${i}-${c}`}>{c}</span>
          ))}
        </div>
        <div
          style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontWeight: 700, zIndex: 3, textShadow: '0 2px 4px #000' }}
        >
          {isActor ? '🎭 You are on stage!' : `🎭 ${actor?.name ?? 'Someone'} is acting`}
        </div>
      </div>
      {isActor && acting ? (
        <>
          <div className="pose-row">
            {POSES.map(([p, e]) => (
              <button key={p} className={`chip ${v.pose === p ? 'on' : ''}`} onClick={() => act({ kind: 'pose', pose: p })}>
                {e} {p}
              </button>
            ))}
          </div>
          <div className="emoji-pad scroll">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => act({ kind: 'clue', text: e })}>
                {e}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 60, display: 'flex', flexDirection: 'column' }}>
            <Feed items={v.feed} selfId={selfId} />
          </div>
          <div className="row" style={{ padding: '6px 12px', justifyContent: 'center' }}>
            {v.passesLeft > 0 && (
              <button className="btn ghost sm" onClick={() => act({ kind: 'pass' })}>
                ⏭️ Too hard? Pass ({v.passesLeft})
              </button>
            )}
          </div>
          <ActionInput placeholder="Type emojis only… 🤐" maxLength={40} onSubmit={(text) => act({ kind: 'clue', text })} />
        </>
      ) : (
        <>
          <ScoreStrip scores={v.scores} highlight={v.guessed} active={v.actorId} />
          <Feed items={v.feed} selfId={selfId} />
          <ActionInput
            placeholder={v.guessed.includes(selfId) ? 'You got it! 🎉 Chat…' : 'What are they acting? Guess!'}
            onSubmit={(text) => act({ kind: 'guess', text })}
            buttonLabel={v.guessed.includes(selfId) ? 'Send' : 'Guess'}
          />
        </>
      )}
    </div>
  );
}

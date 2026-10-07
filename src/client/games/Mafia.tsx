import { useEffect, useState } from 'react';
import type { GameFeedItem } from '../../shared/types';
import { useStore } from '../store';
import { Portrait, Timer } from '../ui/common';
import { ActionInput, Feed, act } from './GameOverlay';

type Role = 'mafia' | 'doctor' | 'detective' | 'villager';

interface MafiaViewData {
  phase: 'roles' | 'night' | 'morning' | 'day' | 'verdict' | 'over';
  day: number;
  deadline: number;
  narration: string;
  myRole: Role | null;
  alive: string[];
  players: string[];
  knownRoles: Record<string, Role>;
  myPick: string | null;
  mafiaVotes: Record<string, string> | null;
  dayVotes: Record<string, string> | null;
  investigations: { target: string; mafia: boolean }[] | null;
  lastDoctorPick: string | null;
  winner: 'town' | 'mafia' | null;
  feed: GameFeedItem[];
}

const ROLE_INFO: Record<Role, { emoji: string; name: string; color: string; desc: string; action?: string }> = {
  mafia: { emoji: '🔪', name: 'Mafia', color: 'linear-gradient(135deg,#FF4D6D,#7a1030)', desc: 'Pick someone to eliminate each night. Blend in by day.', action: '🔪 Target' },
  doctor: { emoji: '💉', name: 'Doctor', color: 'linear-gradient(135deg,#3DDC97,#14694a)', desc: 'Each night, choose someone to protect (you can pick yourself).', action: '💉 Protect' },
  detective: { emoji: '🔍', name: 'Detective', color: 'linear-gradient(135deg,#2EC4F1,#1b4f9c)', desc: 'Each night, investigate one person to learn if they are Mafia.', action: '🔍 Investigate' },
  villager: { emoji: '🙂', name: 'Villager', color: 'linear-gradient(135deg,#FFD23F,#b5791a)', desc: 'Find the Mafia and vote them out during the day.' },
};

const PHASE_TOTAL: Record<string, number> = { roles: 10000, night: 35000, morning: 7000, day: 100000, verdict: 7000 };

export function MafiaView({ v, selfId, compact }: { v: MafiaViewData; selfId: string; compact?: boolean }) {
  const players = useStore((s) => s.players);
  const [showRole, setShowRole] = useState(v.phase === 'roles');
  useEffect(() => {
    if (v.phase === 'roles') setShowRole(true);
  }, [v.phase]);
  const alive = v.alive.includes(selfId);
  const role = v.myRole;
  const isPlayer = v.players.includes(selfId);
  const night = v.phase === 'night';
  const day = v.phase === 'day';

  const canPick = (target: string) => {
    if (!alive || !v.alive.includes(target)) return false;
    if (night) {
      if (!role || role === 'villager') return false;
      if (role === 'mafia' && v.knownRoles[target] === 'mafia') return false;
      if (role === 'detective' && target === selfId) return false;
      return true;
    }
    if (day) return true;
    return false;
  };

  const voteCounts: Record<string, number> = {};
  const votes = night ? v.mafiaVotes : v.dayVotes;
  if (votes) for (const t of Object.values(votes)) voteCounts[t] = (voteCounts[t] ?? 0) + 1;

  const pick = (target: string) => act(night ? { kind: 'night', target } : { kind: 'vote', target });

  let prompt = '';
  if (!isPlayer) prompt = 'You are watching. Ghosts and spectators can chat with each other.';
  else if (!alive) prompt = "You're a ghost 👻. You can see everything now, but only other ghosts hear you.";
  else if (night) prompt = role === 'villager' ? 'Sleep tight… and hope you wake up. 😴' : `${ROLE_INFO[role!].action}: tap a player.`;
  else if (day) prompt = 'Discuss, then tap someone to vote them out (or skip).';

  const chatAllowed = !night || role === 'mafia' || !alive || !isPlayer;

  if (compact) {
    return (
      <div className="player-grid" style={{ width: '100%', maxWidth: 560 }}>
        {v.players.map((id) => (
          <div key={id} className={`pg-item ${v.alive.includes(id) ? '' : 'dead'}`}>
            <Portrait avatar={players[id]?.avatar} size={116} />
            <span className="nm">{players[id]?.name}</span>
            {v.knownRoles[id] && (
              <span className="rtag">
                {ROLE_INFO[v.knownRoles[id]].emoji} {ROLE_INFO[v.knownRoles[id]].name}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`mafia ${night ? 'night' : day || v.phase === 'morning' || v.phase === 'verdict' ? 'day' : ''}`}>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div className="row" style={{ padding: '10px 12px 0', justifyContent: 'space-between' }}>
          <span className="pill">
            {night ? `🌙 Night ${v.day}` : v.phase === 'roles' ? '🎭 Roles' : `☀️ Day ${v.day}`}
          </span>
          {v.phase !== 'over' && <Timer deadline={v.deadline} total={PHASE_TOTAL[v.phase] ?? 30000} />}
        </div>
        <div className="narration">{v.narration}</div>
        {role && (
          <div
            className={`role-card ${showRole ? '' : 'hidden'}`}
            style={showRole ? { background: ROLE_INFO[role].color } : undefined}
            onClick={() => setShowRole((s) => !s)}
          >
            {showRole ? (
              <>
                <span className="re">{ROLE_INFO[role].emoji}</span>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22 }}>You are the {ROLE_INFO[role].name}</div>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {ROLE_INFO[role].desc}
                  </div>
                  {role === 'mafia' && (
                    <div className="small" style={{ marginTop: 4 }}>
                      Team:{' '}
                      {Object.entries(v.knownRoles)
                        .filter(([, r]) => r === 'mafia')
                        .map(([id]) => players[id]?.name)
                        .join(', ')}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="re">🃏</span>
                <b>Tap to peek at your role (keep it secret!)</b>
              </>
            )}
          </div>
        )}
        {v.investigations && v.investigations.length > 0 && (
          <div className="narration small" style={{ textAlign: 'left' }}>
            🔍 Your findings:{' '}
            {v.investigations.map((i) => `${players[i.target]?.name ?? '?'} ${i.mafia ? '🔪 MAFIA' : '✅ innocent'}`).join(' · ')}
          </div>
        )}
        {prompt && (
          <p className="muted" style={{ textAlign: 'center', margin: '10px 12px 0', fontWeight: 600 }}>
            {prompt}
          </p>
        )}
        <div className="player-grid">
          {v.players.map((id) => {
            const dead = !v.alive.includes(id);
            const known = v.knownRoles[id];
            return (
              <button
                key={id}
                className={`pg-item ${dead ? 'dead' : ''} ${v.myPick === id ? 'picked' : ''}`}
                disabled={!canPick(id)}
                onClick={() => pick(id)}
              >
                {voteCounts[id] ? <span className="votes">{voteCounts[id]}</span> : null}
                <Portrait avatar={players[id]?.avatar} size={116} />
                <span className="nm">
                  {id === selfId ? 'You' : players[id]?.name ?? 'Gone'}
                </span>
                {known && (dead || id !== selfId) && (
                  <span className="rtag">
                    {ROLE_INFO[known].emoji} {ROLE_INFO[known].name}
                  </span>
                )}
                {role === 'doctor' && night && v.lastDoctorPick === id && <span className="rtag">💉 last night</span>}
              </button>
            );
          })}
        </div>
        {day && alive && (
          <div style={{ textAlign: 'center' }}>
            <button className={`btn ${v.myPick === 'skip' ? 'yellow' : 'ghost'} sm`} onClick={() => act({ kind: 'vote', target: 'skip' })}>
              🤷 Skip vote {voteCounts.skip ? `(${voteCounts.skip})` : ''}
            </button>
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>
      <div style={{ height: '30%', minHeight: 140, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--line)' }}>
        <Feed items={v.feed} selfId={selfId} />
        <ActionInput
          placeholder={
            !chatAllowed
              ? 'Shh… it is night 🌙'
              : !alive || !isPlayer
                ? 'Ghost chat 👻'
                : night
                  ? 'Secret Mafia chat 🔪'
                  : 'Make your case…'
          }
          disabled={!chatAllowed}
          maxLength={200}
          onSubmit={(text) => act({ kind: 'chat', text })}
        />
      </div>
    </div>
  );
}

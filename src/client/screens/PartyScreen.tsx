import { useCallback, useEffect, useRef, useState } from 'react';
import type { Furniture, Room } from '../../shared/map';
import { EMOTES, EMOTE_EMOJI, GAMES, MUSIC_TRACKS, type ChatMessage, type Emote, type GameType } from '../../shared/types';
import { World } from '../world/World';
import { bridge, emit, leaveParty, request } from '../net';
import { getState, setState, toast, useStore } from '../store';
import { sound } from '../sound';
import { AvatarStage, Modal, Portrait, Toggle } from '../ui/common';
import { GameOverlay } from '../games/GameOverlay';

const INTERACT_LABEL: Record<string, string> = {
  games: '🎲 Play party games',
  arcade: '🕹️ Play party games',
  dj: '🎧 Be the DJ',
  piano: '🎹 Play the piano',
  drink: '🥤 Grab a drink',
  snack: '🍕 Grab a snack',
  marshmallow: '🔥 Roast a marshmallow',
};

const DANCE_MOVES = ['🕺 Bounce', '🙌 Sway', '🪩 Disco', '🦘 Hype', '🤖 Robot', '💃 Swing'];

export function PartyScreen() {
  const party = useStore((s) => s.party)!;
  const players = useStore((s) => s.players);
  const chat = useStore((s) => s.chat);
  const unread = useStore((s) => s.unread);
  const game = useStore((s) => s.game);
  const connected = useStore((s) => s.connected);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [dmTo, setDmTo] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [tray, setTray] = useState(false);
  const [nearby, setNearby] = useState<Furniture | null>(null);
  const [room, setRoom] = useState<Room | undefined>(undefined);
  const [roomKey, setRoomKey] = useState(0);
  const [modal, setModal] = useState<null | 'invite' | 'people' | 'games' | 'dj' | 'piano' | 'settings'>(null);
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [musicOn, setMusicOn] = useState(sound.musicOn);
  const me = players[party.selfId];
  const isHost = party.hostId === party.selfId;

  // ───── world lifecycle ─────
  useEffect(() => {
    const w = new World(canvasRef.current!, party.selfId, {
      onMove: (m) => emit('move', m),
      onAction: (action, danceMove) => {
        emit('action', { action, danceMove });
        setState((s) => (s.players[s.party!.selfId] ? { players: { ...s.players, [s.party!.selfId]: { ...s.players[s.party!.selfId], action, danceMove: danceMove ?? 0 } } } : {}));
      },
      onTapPlayer: (id) => {
        sound.play('click');
        setCardFor(id);
      },
      onNearby: (f) => setNearby(f),
      onInteract: (f) => interact(f),
      onRoom: (r) => {
        setRoom(r);
        setRoomKey((k) => k + 1);
      },
    });
    w.beat = () => sound.beat();
    worldRef.current = w;
    bridge.world = w;
    w.setPlayers(Object.values(getState().players));
    sound.unlock();
    sound.startMusic(getState().party!.track);
    const vol = setInterval(() => {
      const self = w.self();
      if (!self) return;
      const inDance = self.x >= 1 && self.x < 14 && self.y >= 10 && self.y < 18;
      const d = Math.hypot(self.x - 7.5, self.y - 14);
      sound.setProximity(inDance ? 1 : Math.max(0.12, 0.75 - d / 30));
    }, 300);
    return () => {
      clearInterval(vol);
      w.destroy();
      bridge.world = null;
      worldRef.current = null;
      sound.stopMusic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sound.setTrack(party.track), [party.track]);

  useEffect(() => {
    bridge.chatOpen = chatOpen;
    if (chatOpen) setState({ unread: 0 });
  }, [chatOpen, chat.length]);

  // Auto-open the game when it starts for a participant.
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = game ? `${game.type}:${game.status}` : null;
    if (status !== lastStatus.current) {
      const mine = game?.participants.includes(party.selfId);
      if (game && mine && (game.status === 'playing' || game.status === 'ended')) setGameOpen(true);
      if (game && game.status === 'lobby' && game.hostId === party.selfId) setGameOpen(true);
      if (!game) setGameOpen(false);
      lastStatus.current = status;
    }
  }, [game, party.selfId]);

  // Keyboard: Enter to chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === 'Enter' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !gameOpen && !modal) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameOpen, modal]);

  useEffect(() => {
    if (worldRef.current) worldRef.current.keysEnabled = !gameOpen && !modal;
  }, [gameOpen, modal]);

  const interact = useCallback((f: Furniture) => {
    sound.play('click');
    switch (f.interact) {
      case 'games':
      case 'arcade':
        if (getState().game) setGameOpen(true);
        else setModal('games');
        break;
      case 'dj':
        setModal('dj');
        break;
      case 'piano':
        setModal('piano');
        emit('emote', { emote: 'music' });
        break;
      case 'drink':
        emit('hold', { item: 'drink' });
        emit('emote', { emote: 'cheers' });
        toast('🥤 Cheers! You grabbed a drink.');
        break;
      case 'snack': {
        const item = f.type === 'grill' ? 'burger' : 'pizza';
        emit('hold', { item });
        toast(item === 'burger' ? '🍔 Fresh off the grill!' : '🍕 You grabbed a slice.');
        break;
      }
      case 'marshmallow':
        emit('hold', { item: 'marshmallow' });
        emit('emote', { emote: 'fire' });
        toast('🔥 Toasty marshmallow acquired.');
        break;
    }
  }, []);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await request('chat', { text: t, to: dmTo ?? undefined });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const doEmote = (em: Emote) => {
    sound.play('pop');
    emit('emote', { emote: em });
  };

  const dance = (move?: number) => {
    const w = worldRef.current;
    if (!w) return;
    sound.play('click');
    if (move === undefined && me?.action === 'dance') return w.setSelfAction('idle');
    w.setSelfAction('dance', move ?? Math.floor(Math.random() * 6));
  };

  const createGame = async (type: GameType) => {
    try {
      await request('game:create', { type });
      setModal(null);
      setGameOpen(true);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const shareInvite = async () => {
    const url = `${location.origin}/p/${party.code}`;
    const data = { title: 'House Party', text: `Come hang at ${party.name}! 🎉 Code: ${party.code}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast('Invite link copied! 📋', 'success');
      }
    } catch {
      /* cancelled */
    }
  };

  const gameInfo = game ? GAMES[game.type] : null;
  const inGame = !!game?.participants.includes(party.selfId);
  const playerList = Object.values(players).sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  const card = cardFor ? players[cardFor] : null;

  return (
    <div className="party-screen">
      <canvas ref={canvasRef} className="world" />

      <div className="hud-top">
        <div className="party-chip" onClick={() => setModal('invite')}>
          <span className="pname">{party.name}</span>
          <span className="pcode">
            {party.code} <span style={{ fontFamily: 'var(--font)', letterSpacing: 0, color: 'var(--muted)', fontSize: 12 }}>· invite</span>
          </span>
        </div>
        <div className="hud-right">
          <button className="icon-btn" onClick={() => setModal('people')} aria-label="People">
            👥<span className="badge" style={{ background: 'var(--green)', color: '#06301c' }}>{playerList.filter((p) => p.connected).length}</span>
          </button>
          <button
            className="icon-btn"
            aria-label="Music"
            onClick={() => {
              sound.unlock();
              sound.setMusicOn(!musicOn);
              setMusicOn(!musicOn);
            }}
          >
            {musicOn ? '🔊' : '🔇'}
          </button>
          <button className="icon-btn" onClick={() => setModal('settings')} aria-label="Menu">
            ☰
          </button>
        </div>
      </div>

      {room && (
        <div key={roomKey} className="room-label">
          {room.emoji} {room.name}
        </div>
      )}
      {!connected && <div className="reconnecting">Reconnecting…</div>}

      {chatOpen && (
        <ChatDrawer
          chat={chat}
          selfId={party.selfId}
          players={players}
          onClose={() => setChatOpen(false)}
          onTapName={(id) => id !== party.selfId && setCardFor(id)}
        />
      )}

      <div className="hud-bottom">
        {game && !gameOpen && gameInfo && (
          <div className="game-banner">
            <span className="gb-emoji">{gameInfo.emoji}</span>
            <div className="gb-text">
              {game.status === 'lobby' && (
                <>
                  <b>{players[game.hostId]?.name ?? 'Someone'}</b> is starting <b>{gameInfo.name}</b>
                  <div className="muted small">
                    {game.participants.length}/{gameInfo.maxPlayers} joined
                  </div>
                </>
              )}
              {game.status === 'playing' && (
                <>
                  <b>{gameInfo.name}</b> is on!
                  <div className="muted small">{inGame ? 'Tap to get back in' : `${game.participants.length} playing · watch along`}</div>
                </>
              )}
              {game.status === 'ended' && (
                <>
                  <b>{gameInfo.name}</b> just ended
                  <div className="muted small">{game.results?.headline}</div>
                </>
              )}
            </div>
            {game.status === 'lobby' && !inGame ? (
              <button
                className="btn green sm"
                onClick={async () => {
                  try {
                    await request('game:join');
                    setGameOpen(true);
                  } catch (err) {
                    toast((err as Error).message, 'error');
                  }
                }}
              >
                Join!
              </button>
            ) : (
              <button className="btn yellow sm" onClick={() => setGameOpen(true)}>
                {game.status === 'playing' && !inGame ? 'Watch' : 'Open'}
              </button>
            )}
          </div>
        )}

        {nearby && !tray && (
          <button className="btn cyan interact-btn" onClick={() => interact(nearby)}>
            {INTERACT_LABEL[nearby.interact!]}
          </button>
        )}

        {me && me.held !== 'none' && !tray && (
          <button className="chip" style={{ alignSelf: 'flex-start', background: 'var(--panel-solid)' }} onClick={() => emit('hold', { item: 'none' })}>
            {{ drink: '🥤', pizza: '🍕', burger: '🍔', marshmallow: '🍡', none: '' }[me.held]} Holding · tap to put down
          </button>
        )}

        {tray && (
          <div className="tray" style={{ alignSelf: 'flex-start' }}>
            <div className="tray-label">Emotes</div>
            {EMOTES.filter((e) => e !== 'music').map((e) => (
              <button key={e} onClick={() => doEmote(e)} aria-label={e}>
                {EMOTE_EMOJI[e]}
              </button>
            ))}
            <div className="tray-label">Dance moves</div>
            {DANCE_MOVES.map((m, i) => (
              <button key={m} onClick={() => dance(i)} aria-label={m} title={m}>
                {m.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        <div className="hud-row">
          <form className="chat-pill" onSubmit={send}>
            <button
              type="button"
              className="pill-icon"
              onClick={() => {
                setChatOpen((o) => !o);
                setTray(false);
              }}
              aria-label="Chat history"
            >
              💬{unread > 0 && !chatOpen && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {dmTo && (
              <span className="pill" style={{ background: 'var(--purple)', flexShrink: 0 }} onClick={() => setDmTo(null)}>
                → {players[dmTo]?.name ?? '?'} ✕
              </span>
            )}
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={dmTo ? 'Whisper…' : 'Say something…'}
              maxLength={280}
              enterKeyHint="send"
              onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLInputElement).blur()}
            />
            {text && (
              <button className="send-btn" type="submit" aria-label="Send">
                ➤
              </button>
            )}
          </form>
          <button className={`icon-btn ${tray ? 'active' : ''}`} onClick={() => setTray((t) => !t)} aria-label="Emotes">
            😀
          </button>
          <button className={`icon-btn ${me?.action === 'dance' ? 'active' : ''}`} onClick={() => dance()} aria-label="Dance">
            🕺
          </button>
          <button className="games-btn" onClick={() => (game ? setGameOpen(true) : setModal('games'))}>
            🎲<span className="hide-sm">Games</span>
          </button>
        </div>
      </div>

      {modal === 'invite' && (
        <Modal title="Invite friends" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              Share this code. Friends can join from anywhere in the world.
            </p>
            <div className="logo" style={{ fontSize: 64, letterSpacing: 10, transform: 'none' }}>
              {party.code}
            </div>
            <button className="btn yellow lg block" onClick={shareInvite}>
              📤 Share invite link
            </button>
            {isHost && (
              <div className="card" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', padding: 16 }}>
                <b>Host settings 👑</b>
                <PartyNameEditor current={party.name} />
                <Toggle
                  on={party.isPublic}
                  onChange={(v) => emit('party:settings', { isPublic: v })}
                  label={party.isPublic ? '🌍 Listed in public parties' : '🔒 Invite only'}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal === 'people' && (
        <Modal title={`At the party (${playerList.filter((p) => p.connected).length})`} onClose={() => setModal(null)}>
          <div className="people">
            {playerList.map((p) => (
              <div
                key={p.id}
                className="person"
                onClick={() => {
                  setModal(null);
                  if (p.id !== party.selfId) setCardFor(p.id);
                }}
                style={{ opacity: p.connected ? 1 : 0.5 }}
              >
                <Portrait avatar={p.avatar} size={96} />
                <span className="pn">
                  {p.name} {p.id === party.selfId && <span className="muted">(you)</span>}
                </span>
                {p.isHost && <span className="pill">👑 Host</span>}
                {game?.participants.includes(p.id) && <span className="pill">{GAMES[game.type].emoji}</span>}
                {p.action === 'dance' && <span>🕺</span>}
                {!p.connected && <span className="pill">💤 away</span>}
              </div>
            ))}
          </div>
          <button className="btn yellow block" style={{ marginTop: 14 }} onClick={() => setModal('invite')}>
            ➕ Invite more friends
          </button>
        </Modal>
      )}

      {modal === 'games' && (
        <Modal title="Game night 🎲" onClose={() => setModal(null)} wide>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick a game. Everyone at the party gets an invite to jump in.
          </p>
          <div className="game-picker">
            {(Object.keys(GAMES) as GameType[]).map((g) => {
              const info = GAMES[g];
              return (
                <button key={g} className="game-card" style={{ background: `linear-gradient(140deg, ${info.color}, #2a1a55 140%)` }} onClick={() => createGame(g)}>
                  <span className="ge">{info.emoji}</span>
                  <h3>{info.name}</h3>
                  <p>{info.tagline}</p>
                  <span className="gp">
                    👥 {info.minPlayers}–{info.maxPlayers} players
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {modal === 'dj' && (
        <Modal title="🎧 DJ booth" onClose={() => setModal(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick the vibe for the whole party. It's loudest on the dance floor.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MUSIC_TRACKS.map((t) => (
              <button
                key={t}
                className={`btn ${party.track === t ? 'yellow' : 'ghost'} block`}
                onClick={() => {
                  emit('dj', { track: t });
                  if (!musicOn) {
                    sound.setMusicOn(true);
                    setMusicOn(true);
                  }
                }}
              >
                {party.track === t ? '▶️ ' : ''}
                {t}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label className="muted small">Your music volume</label>
            <input
              type="range"
              className="slider"
              min={0}
              max={1}
              step={0.05}
              defaultValue={sound.musicVolume}
              onChange={(e) => sound.setMusicVolume(+e.target.value)}
            />
          </div>
        </Modal>
      )}

      {modal === 'piano' && (
        <Modal title="🎹 Piano" onClose={() => setModal(null)}>
          <Piano />
        </Modal>
      )}

      {modal === 'settings' && (
        <Modal title="Menu" onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              className="btn purple block"
              onClick={() => {
                setModal(null);
                setState({ screen: 'creator' });
              }}
            >
              🎨 Change my look
            </button>
            <Toggle
              on={musicOn}
              onChange={(v) => {
                sound.setMusicOn(v);
                setMusicOn(v);
              }}
              label="Music"
            />
            <SfxToggle />
            <div className="muted small">
              Tip: tap anywhere to walk, tap furniture to use it, tap people to say hi. On a keyboard use WASD or arrows, and Enter to chat.
            </div>
            <button
              className="btn ghost block"
              onClick={() => {
                setModal(null);
                leaveParty();
              }}
            >
              🚪 Leave party
            </button>
          </div>
        </Modal>
      )}

      {card && (
        <Modal title={card.name} onClose={() => setCardFor(null)}>
          <div className="player-card">
            <div style={{ width: 180, height: 180 }}>
              <AvatarStage avatar={card.avatar} anim={card.action === 'dance' ? 'dance' : 'idle'} danceMove={card.danceMove} emote="wave" scale={2.6} />
            </div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              {card.isHost && <span className="pill">👑 Host</span>}
              {!card.connected && <span className="pill">💤 Away</span>}
              {card.held !== 'none' && <span className="pill">Holding {{ drink: '🥤', pizza: '🍕', burger: '🍔', marshmallow: '🍡', none: '' }[card.held]}</span>}
            </div>
            <div className="action-grid">
              <button
                className="btn yellow"
                onClick={() => {
                  doEmote('wave');
                  setCardFor(null);
                }}
              >
                👋 Wave
              </button>
              <button
                className="btn purple"
                onClick={() => {
                  setDmTo(card.id);
                  setCardFor(null);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                💬 Whisper
              </button>
              <button
                className="btn cyan"
                onClick={() => {
                  const pos = worldRef.current?.playerPos(card.id);
                  if (pos) worldRef.current?.walkTo(pos.x + 0.9, pos.y);
                  setCardFor(null);
                }}
              >
                🚶 Go to
              </button>
              <button
                className="btn green"
                onClick={() => {
                  dance(card.action === 'dance' ? card.danceMove : undefined);
                  setCardFor(null);
                }}
              >
                🕺 Dance
              </button>
              {isHost && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (confirm(`Remove ${card.name} from the party?`)) emit('party:kick', { id: card.id });
                    setCardFor(null);
                  }}
                >
                  🚪 Remove
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {game && gameOpen && <GameOverlay onMinimize={() => setGameOpen(false)} />}
    </div>
  );
}

function PartyNameEditor({ current }: { current: string }) {
  const [v, setV] = useState(current);
  return (
    <div className="row">
      <input className="input" value={v} maxLength={32} onChange={(e) => setV(e.target.value)} />
      <button className="btn sm" disabled={v.trim() === current || !v.trim()} onClick={() => emit('party:settings', { name: v })}>
        Rename
      </button>
    </div>
  );
}

function SfxToggle() {
  const [on, setOn] = useState(sound.sfxOn);
  return (
    <Toggle
      on={on}
      onChange={(v) => {
        sound.setSfxOn(v);
        setOn(v);
      }}
      label="Sound effects"
    />
  );
}

function Piano() {
  const keys = [
    ['C', 60],
    ['D', 62],
    ['E', 64],
    ['F', 65],
    ['G', 67],
    ['A', 69],
    ['B', 71],
    ['C', 72],
  ] as const;
  const [hit, setHit] = useState<number | null>(null);
  return (
    <>
      <div className="piano">
        {keys.map(([n, m]) => (
          <button
            key={m}
            className={hit === m ? 'hit' : ''}
            onPointerDown={() => {
              sound.unlock();
              sound.note(m);
              setHit(m);
              setTimeout(() => setHit((h) => (h === m ? null : h)), 150);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Try: E D C D E E E 🎶
      </p>
    </>
  );
}

function ChatDrawer({
  chat,
  selfId,
  players,
  onClose,
  onTapName,
}: {
  chat: ChatMessage[];
  selfId: string;
  players: Record<string, { avatar: any; name: string }>;
  onClose: () => void;
  onTapName: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);
  return (
    <div className="chat-drawer">
      <header>
        <span>💬 Party chat</span>
        <button className="close-x" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </header>
      <div className="chat-list scroll" ref={listRef}>
        {chat.map((m) =>
          m.kind === 'system' ? (
            <div key={m.id} className="msg system">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`msg ${m.from === selfId ? 'me' : ''} ${m.kind === 'dm' ? 'dm' : ''}`}>
              <span onClick={() => onTapName(m.from)}>
                <Portrait avatar={players[m.from]?.avatar} size={64} />
              </span>
              <div style={{ minWidth: 0 }}>
                {m.from !== selfId && <div className="who">{m.fromName}</div>}
                <div className="bubble">
                  {m.kind === 'dm' && (
                    <div className="small" style={{ opacity: 0.8, fontWeight: 700 }}>
                      🤫 {m.from === selfId ? `to ${m.toName}` : 'whispered to you'}
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            </div>
          ),
        )}
        {chat.length === 0 && <div className="msg system">Say hi to everyone! 👋</div>}
      </div>
    </div>
  );
}


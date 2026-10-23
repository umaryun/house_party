import { useEffect, useState } from 'react';
import { GAMES, type PartySummary } from '../../shared/types';
import { api, setToken } from '../api';
import { disconnectSocket, request } from '../net';
import { setState, toast, useStore } from '../store';
import { sound } from '../sound';
import { Confetti, Modal, Portrait, Toggle } from '../ui/common';

/** via says how they found the party, for analytics: an invite link, a typed code, or the public list. */
export async function joinParty(code: string, via: 'invite' | 'code' | 'public') {
  sound.unlock();
  try {
    await request('party:join', { code: code.trim().toUpperCase(), via });
    setState({ pendingCode: null });
  } catch (err) {
    setState({ pendingCode: null });
    toast((err as Error).message, 'error');
  }
}

export function Home() {
  const user = useStore((s) => s.user)!;
  const connected = useStore((s) => s.connected);
  const pending = useStore((s) => s.pendingCode);
  const [partyName, setPartyName] = useState(`${user.displayName}'s House Party`);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState('');
  const [parties, setParties] = useState<PartySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [claim, setClaim] = useState(false);

  useEffect(() => {
    if (pending && connected) joinParty(pending, 'invite');
  }, [pending, connected]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/parties')
        .then((r) => r.json())
        .then((d) => alive && setParties(d.parties ?? []))
        .catch(() => alive && setParties([]));
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const host = async () => {
    sound.unlock();
    setBusy(true);
    try {
      await request('party:create', { name: partyName, isPublic });
      sound.play('start');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const join = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.trim().length < 4) return toast('Party codes are 5 characters, like K7XQ2', 'error');
    setBusy(true);
    await joinParty(code, 'code');
    setBusy(false);
  };

  const logout = () => {
    setToken(null);
    disconnectSocket();
    setState({ user: null, screen: 'landing', party: null });
  };

  return (
    <div className="party-bg">
      <Confetti count={10} />
      <div className="home">
        <div className="home-inner">
          <div className="topbar">
            <h1 className="logo" style={{ fontSize: 34, transform: 'rotate(-2deg)', textAlign: 'left' }}>
              HOUSE<span style={{ display: 'inline', marginLeft: 6 }}>PARTY</span>
            </h1>
            <div className="me-chip" onClick={() => setMenu(true)}>
              <Portrait avatar={user.avatar} size={88} />
              <b>{user.displayName}</b>
            </div>
          </div>

          <div className="hero">
            <div className="big-action host">
              <div className="deco">🎉</div>
              <div>
                <h2>Throw a party</h2>
                <p style={{ margin: '4px 0 0', fontWeight: 500 }}>Open the house and invite your friends with a code.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  className="input"
                  value={partyName}
                  maxLength={32}
                  onChange={(e) => setPartyName(e.target.value)}
                  aria-label="Party name"
                  style={{ background: 'rgba(0,0,0,0.25)' }}
                />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Toggle on={isPublic} onChange={setIsPublic} label={isPublic ? '🌍 Public' : '🔒 Friends only'} />
                  <button className="btn yellow" disabled={busy || !connected} onClick={host}>
                    Start party →
                  </button>
                </div>
              </div>
            </div>

            <form className="big-action join" onSubmit={join}>
              <div className="deco">🎟️</div>
              <div>
                <h2>Got a code?</h2>
                <p style={{ margin: '4px 0 0', fontWeight: 500 }}>Pop in the party code your friend sent you.</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="input code"
                  placeholder="CODE"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  aria-label="Party code"
                  autoCapitalize="characters"
                  style={{ background: 'rgba(0,0,0,0.25)' }}
                />
                <button className="btn yellow" disabled={busy || !connected} type="submit">
                  Join
                </button>
              </div>
            </form>
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 24 }}>🌍 Public parties</h2>
            <span className="pill live">● {parties?.length ?? 0} live</span>
          </div>
          {parties === null ? (
            <div className="empty">Looking for parties…</div>
          ) : parties.length === 0 ? (
            <div className="empty">
              No public parties right now. <b>Be the legend who starts one!</b> 🥳
            </div>
          ) : (
            <div className="party-list">
              {parties.map((p) => (
                <div key={p.code} className="party-tile" onClick={() => joinParty(p.code, 'public')}>
                  <div className="name">{p.name}</div>
                  <div className="muted small">Hosted by {p.hostName}</div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="pill live">
                      👥 {p.playerCount}/{p.maxPlayers}
                    </span>
                    <span className="pill">🎵 {p.vibe}</span>
                    {p.activeGame && (
                      <span className="pill">
                        {GAMES[p.activeGame].emoji} {GAMES[p.activeGame].name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 24 }}>🏆 Your party record</h2>
          <div className="stats">
            <div className="stat">
              <b>{user.stats.parties}</b>
              <span className="muted small">parties</span>
            </div>
            <div className="stat">
              <b>{user.stats.gamesPlayed}</b>
              <span className="muted small">games played</span>
            </div>
            <div className="stat">
              <b>{user.stats.wins}</b>
              <span className="muted small">wins</span>
            </div>
          </div>
          {!connected && <div className="muted small">Connecting to the party server…</div>}
        </div>
      </div>

      {menu && (
        <Modal title="You" onClose={() => setMenu(false)}>
          <div className="player-card">
            <Portrait avatar={user.avatar} size={140} className="portrait" />
            <h2>{user.displayName}</h2>
            {user.guest ? <span className="pill">Guest account</span> : <span className="pill">@{user.username}</span>}
            <div className="action-grid">
              <button className="btn purple" onClick={() => setState({ screen: 'creator' })}>
                🎨 Edit character
              </button>
              {user.guest && (
                <button className="btn cyan" onClick={() => setClaim(true)}>
                  💾 Save account
                </button>
              )}
              <button className="btn ghost" onClick={logout}>
                Log out
              </button>
            </div>
            {user.guest && <p className="muted small">Guest accounts live on this device. Save it to log in anywhere.</p>}
          </div>
        </Modal>
      )}
      {claim && <ClaimModal onClose={() => setClaim(false)} />}
    </div>
  );
}

function ClaimModal({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { user } = await api.claim(username, password);
      setState({ user });
      toast('Account saved! 🎉', 'success');
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  };
  return (
    <Modal title="Save your account" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label>Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="error-text">{err}</div>
        <button className="btn yellow block" type="submit">
          Save
        </button>
      </form>
    </Modal>
  );
}

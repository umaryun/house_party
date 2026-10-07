import { useEffect, useMemo, useRef, useState } from 'react';
import { randomAvatar } from '../../shared/avatar';
import type { PublicUser } from '../../shared/types';
import { api, setToken } from '../api';
import { drawAvatar } from '../world/avatarRender';
import { Confetti } from '../ui/common';
import { setState, useStore } from '../store';
import { sound } from '../sound';
import { connectSocket } from '../net';

export function onAuthed(token: string, user: PublicUser) {
  setToken(token);
  setState({ user, screen: user.avatar ? 'home' : 'creator' });
  connectSocket();
}

function DanceStage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const crew = useMemo(() => Array.from({ length: 5 }, () => randomAvatar()), []);
  useEffect(() => {
    const cv = ref.current!;
    const c = cv.getContext('2d')!;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * dpr)) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      c.clearRect(0, 0, cv.width, cv.height);
      const t = (performance.now() - t0) / 1000;
      const s = (cv.height / 70) * 0.95;
      crew.forEach((a, i) => {
        const x = cv.width * (0.1 + i * 0.2);
        const y = cv.height * 0.93 - (i % 2 ? 0 : 6 * dpr);
        drawAvatar(c, a, x, y, s * (i === 2 ? 1.08 : 1), { dir: 'down', anim: 'dance', t: t + i * 0.3, danceMove: i, seed: i });
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [crew]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}

export function Landing() {
  const [tab, setTab] = useState<'quick' | 'signup' | 'login'>('quick');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useStore((s) => s.pendingCode);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    sound.unlock();
    setError('');
    setBusy(true);
    try {
      let res;
      if (tab === 'quick') {
        if (!name.trim()) throw new Error('What should we call you? 🙂');
        res = await api.guest(name.trim());
      } else if (tab === 'signup') res = await api.signup(username.trim(), password, name.trim() || username.trim());
      else res = await api.login(username.trim(), password);
      onAuthed(res.token, res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="party-bg">
      <Confetti />
      <div className="center-screen">
        <h1 className="logo">
          HOUSE<span>PARTY</span>
        </h1>
        <p className="muted" style={{ margin: 0, textAlign: 'center', fontWeight: 600, maxWidth: 360 }}>
          Your friends are everywhere. The party is right here. 🏠🎉
        </p>
        <div className="landing-stage">
          <DanceStage />
        </div>
        <form className="card landing-card" onSubmit={submit}>
          {pending && (
            <div className="pill live" style={{ alignSelf: 'center' }}>
              🎟️ You're invited to party <b>{pending}</b>
            </div>
          )}
          <div className="tabs" role="tablist">
            <button type="button" className={tab === 'quick' ? 'on' : ''} onClick={() => setTab('quick')}>
              ⚡ Quick play
            </button>
            <button type="button" className={tab === 'signup' ? 'on' : ''} onClick={() => setTab('signup')}>
              Sign up
            </button>
            <button type="button" className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>
              Log in
            </button>
          </div>
          {tab !== 'login' && (
            <div className="field">
              <label htmlFor="nm">Your name</label>
              <input
                id="nm"
                className="input"
                placeholder="e.g. Umar"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </div>
          )}
          {tab !== 'quick' && (
            <>
              <div className="field">
                <label htmlFor="un">Username</label>
                <input
                  id="un"
                  className="input"
                  placeholder="letters, numbers, _"
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                />
              </div>
              <div className="field">
                <label htmlFor="pw">Password</label>
                <input
                  id="pw"
                  className="input"
                  type="password"
                  placeholder="6+ characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
            </>
          )}
          <div className="error-text">{error}</div>
          <button className="btn yellow lg block" disabled={busy} type="submit">
            {busy ? 'Opening the door…' : tab === 'login' ? 'Welcome back! →' : "Let's party! 🎉"}
          </button>
          {tab === 'quick' && (
            <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
              No password needed. You can save your account later.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

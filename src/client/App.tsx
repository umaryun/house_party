import { useEffect } from 'react';
import { api, getToken, setToken } from './api';
import { connectSocket } from './net';
import { setState, useStore } from './store';
import { sound } from './sound';
import { Toasts } from './ui/common';
import { Landing } from './screens/Landing';
import { Creator } from './screens/Creator';
import { Home } from './screens/Home';
import { PartyScreen } from './screens/PartyScreen';

export function App() {
  const screen = useStore((s) => s.screen);

  useEffect(() => {
    const m = location.pathname.match(/^\/p\/([A-Za-z0-9]{4,6})/);
    if (m) setState({ pendingCode: m[1].toUpperCase() });
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    if (!getToken()) {
      setState({ screen: 'landing' });
      return;
    }
    api
      .me()
      .then(({ user }) => {
        setState({ user, screen: user.avatar ? 'home' : 'creator' });
        connectSocket();
      })
      .catch(() => {
        setToken(null);
        setState({ screen: 'landing' });
      });
  }, []);

  return (
    <>
      {screen === 'loading' && (
        <div className="party-bg">
          <div className="center-screen">
            <h1 className="logo">
              HOUSE<span>PARTY</span>
            </h1>
            <div className="spinner" />
          </div>
        </div>
      )}
      {screen === 'landing' && <Landing />}
      {screen === 'creator' && <Creator />}
      {screen === 'home' && <Home />}
      {screen === 'party' && <PartyScreen />}
      <Toasts />
    </>
  );
}

// Owner-only analytics page at /admin. Reads /api/admin/stats with the ADMIN_KEY set on the server.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DailyPoint, StatsReport } from '../../shared/analytics';
import { GAMES, type GameType } from '../../shared/types';

const KEY_STORE = 'hp_admin_key';
const RANGES = [7, 30, 90] as const;
const METRICS: { key: keyof Omit<DailyPoint, 'date'>; label: string }[] = [
  { key: 'players', label: 'Active players' },
  { key: 'visitors', label: 'Visitors' },
  { key: 'signups', label: 'Sign-ups' },
  { key: 'games', label: 'Games played' },
  { key: 'chats', label: 'Chat messages' },
];
const JOIN_LABELS: Record<string, string> = {
  invite: 'Invite link',
  code: 'Typed a code',
  public: 'Public party list',
  host: 'Started the party',
};

const fmt = (n: number) => n.toLocaleString();
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function readKey() {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

export default function AdminDashboard() {
  const [key, setKey] = useState(readKey);
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('players');
  const [data, setData] = useState<StatsReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stats?days=${days}`, { headers: { Authorization: `Bearer ${key}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          try {
            localStorage.removeItem(KEY_STORE);
          } catch {
            /* ignore */
          }
          setKey('');
        }
        throw new Error(body.error || 'Could not load stats.');
      }
      setData(body as StatsReport);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [key, days]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    document.title = 'House Party · Analytics';
  }, []);

  if (!key) return <KeyForm error={error} onKey={setKey} />;

  return (
    <div className="party-bg admin">
      <div className="admin-inner">
        <header className="admin-head">
          <div>
            <h1 style={{ fontSize: 30 }}>📊 House Party analytics</h1>
            <div className="muted small">
              {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString()} · refreshes every 30s` : loading ? 'Loading…' : ''}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="seg" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r} className={days === r ? 'on' : ''} onClick={() => setDays(r)}>
                  {r} days
                </button>
              ))}
            </div>
            <button
              className="btn ghost sm"
              onClick={() => {
                try {
                  localStorage.removeItem(KEY_STORE);
                } catch {
                  /* ignore */
                }
                setKey('');
                setData(null);
              }}
            >
              Log out
            </button>
          </div>
        </header>
        {error && <div className="error-text">{error}</div>}
        {data && <Report data={data} metric={metric} setMetric={setMetric} />}
      </div>
    </div>
  );
}

function KeyForm({ error, onKey }: { error: string; onKey: (k: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="party-bg">
      <div className="center-screen">
        <form
          className="card landing-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.trim()) return;
            try {
              localStorage.setItem(KEY_STORE, v.trim());
            } catch {
              /* ignore */
            }
            onKey(v.trim());
          }}
        >
          <h1 style={{ fontSize: 28 }}>📊 Analytics</h1>
          <p className="muted" style={{ margin: 0 }}>
            Enter the admin key you set as <code>ADMIN_KEY</code> on the server.
          </p>
          <input className="input" type="password" placeholder="Admin key" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
          <div className="error-text">{error}</div>
          <button className="btn yellow block" type="submit">
            Open dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

function Report({ data, metric, setMetric }: { data: StatsReport; metric: (typeof METRICS)[number]['key']; setMetric: (m: (typeof METRICS)[number]['key']) => void }) {
  const t = data.totals;
  const [showTable, setShowTable] = useState(false);
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;
  const empty = t.visitors === 0 && t.signups === 0 && t.activePlayers === 0;
  return (
    <>
      <section>
        <h2 className="admin-h">Right now</h2>
        <div className="tiles">
          <Tile label="Players online" value={data.live.playersOnline} live />
          <Tile label="Parties going" value={data.live.partiesLive} live />
          <Tile label="Games in progress" value={data.live.gamesRunning} live />
        </div>
      </section>

      <section>
        <h2 className="admin-h">Last {data.days} days</h2>
        <div className="tiles">
          <Tile label="Visitors" value={t.visitors} />
          <Tile label="Sign-ups" value={t.signups} sub={`${pct(t.signups, t.visitors)} of visitors · ${fmt(t.guestSignups)} quick play`} />
          <Tile label="Active players" value={t.activePlayers} sub="joined a party or played" />
          <Tile label="Came back" value={t.returningPlayers} sub={`${pct(t.returningPlayers, t.activePlayers)} played on 2+ days`} />
          <Tile label="Games played" value={t.gamesPlayed} sub={`${t.avgPlayersPerGame || '–'} players per game`} />
          <Tile label="Parties started" value={t.partiesCreated} sub={`${fmt(t.chatMessages)} chat ${t.chatMessages === 1 ? 'message' : 'messages'}`} />
        </div>
        {empty && (
          <p className="muted" style={{ marginTop: 12 }}>
            No activity recorded yet. Numbers appear as people visit and play. Tip: add <code>?ref=tiktok</code> (or <code>?ref=x</code>, <code>?ref=youtube</code>)
            to the links you post so you can see which platform sends people.
          </p>
        )}
      </section>

      <section className="card admin-card">
        <div className="admin-card-head">
          <h3>{metricLabel} per day</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            <div className="seg" role="tablist" aria-label="Metric">
              {METRICS.map((m) => (
                <button key={m.key} className={metric === m.key ? 'on' : ''} onClick={() => setMetric(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
            <button className="chip" onClick={() => setShowTable((s) => !s)}>
              {showTable ? '📈 Chart' : '🔢 Table'}
            </button>
          </div>
        </div>
        {showTable ? (
          <DailyTable rows={data.daily} />
        ) : (
          <ColumnChart points={data.daily.map((d) => ({ label: d.date, value: d[metric] }))} unit={metricLabel.toLowerCase()} />
        )}
      </section>

      <div className="admin-grid">
        <section className="card admin-card">
          <h3>Where people drop off</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            People who signed up in this period, and how far they got.
          </p>
          <BarList
            rows={data.funnel.map((f, i) => ({
              label: f.step,
              value: f.count,
              note: i === 0 ? '' : `${pct(f.count, data.funnel[i - 1].count)} of previous`,
            }))}
          />
        </section>

        <section className="card admin-card">
          <h3>Games played</h3>
          {data.games.length ? (
            <BarList
              rows={data.games.map((g) => {
                const info = GAMES[g.type as GameType];
                return {
                  label: info ? `${info.emoji} ${info.name}` : g.type,
                  value: g.started,
                  note: `${pct(g.finished, g.started)} finished · ${g.avgPlayers} players avg`,
                };
              })}
            />
          ) : (
            <p className="muted">No games yet.</p>
          )}
        </section>

        <section className="card admin-card">
          <h3>How people join parties</h3>
          {data.joins.length ? (
            <BarList rows={data.joins.map((j) => ({ label: JOIN_LABELS[j.via] ?? j.via, value: j.count, note: '' }))} />
          ) : (
            <p className="muted">No parties joined yet.</p>
          )}
        </section>

        <section className="card admin-card">
          <h3>Where visitors come from</h3>
          {data.sources.length ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Visitors</th>
                  <th>Sign-ups</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source}>
                    <td>{s.source === 'direct' ? 'Direct / unknown' : s.source}</td>
                    <td>{fmt(s.visitors)}</td>
                    <td>{fmt(s.signups)}</td>
                    <td>{pct(s.signups, s.visitors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No visits yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Tile({ label, value, sub, live }: { label: string; value: number; sub?: string; live?: boolean }) {
  return (
    <div className="tile">
      <div className="tile-label">
        {live && <span className="live-dot" aria-hidden />}
        {label}
      </div>
      <div className="tile-value">{fmt(value)}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number; note: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div className="barlist-row" key={r.label}>
          <div className="barlist-top">
            <span>{r.label}</span>
            <b>{fmt(r.value)}</b>
          </div>
          <div className="barlist-track">
            <div className="barlist-bar" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.note && <div className="tile-sub">{r.note}</div>}
        </div>
      ))}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Single-series daily column chart with a hover tooltip. */
function ColumnChart({ points, unit }: { points: { label: string; value: number }[]; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const plotW = Math.max(10, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const step = plotW / Math.max(1, points.length);
  const gap = Math.min(6, Math.max(2, step * 0.25));
  const barW = Math.max(2, step - gap);
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(plotW / 64)));
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={`${unit} per day`}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={pad.l} x2={width - pad.r} y1={y(tv)} y2={y(tv)} className="grid" />
            <text x={pad.l - 8} y={y(tv) + 4} textAnchor="end" className="axis">
              {fmt(Math.round(tv))}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = pad.l + i * step + gap / 2;
          const top = y(p.value);
          const h = pad.t + plotH - top;
          const r = Math.min(4, barW / 2, h);
          const d =
            h <= 0
              ? ''
              : `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
          return (
            <g key={p.label}>
              {d && <path d={d} className={`bar ${hover === i ? 'hl' : ''}`} />}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="axis">
                  {shortDate(p.label)}
                </text>
              )}
              <rect
                x={pad.l + i * step}
                y={pad.t}
                width={step}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h2) => (h2 === i ? null : h2))}
              />
            </g>
          );
        })}
      </svg>
      {hp && hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(width - 130, Math.max(0, pad.l + hover * step + step / 2 - 65)), top: Math.max(0, y(hp.value) - 54) }}>
          <div className="muted small">{shortDate(hp.label)}</div>
          <b>{fmt(hp.value)}</b> {unit}
        </div>
      )}
    </div>
  );
}

function DailyTable({ rows }: { rows: DailyPoint[] }) {
  return (
    <div className="scroll" style={{ maxHeight: 260 }}>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Day</th>
            {METRICS.map((m) => (
              <th key={m.key}>{m.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.date}>
              <td>{shortDate(r.date)}</td>
              {METRICS.map((m) => (
                <td key={m.key}>{fmt(r[m.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 4-player run through Mafia, Emoji Charades and Imposter screens.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = 'screenshots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
async function guest(name, viewport = { width: 390, height: 844 }) {
  const r = await fetch(`${BASE}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name }) }).then((r) => r.json());
  await fetch(`${BASE}/api/auth/me`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${r.token}` }, body: JSON.stringify({ avatar: {} }) });
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: viewport.width < 600 });
  await ctx.addInitScript((t) => localStorage.setItem('hp_token', t), r.token);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.name = name;
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const ps = [await guest('Umar'), await guest('Zara'), await guest('Leo'), await guest('Amaka')];
const [A] = ps;
await A.goto(BASE);
await A.click('text=Start party →');
await A.waitForSelector('canvas.world');
const code = (await A.locator('.pcode').innerText()).slice(0, 5);
for (const p of ps.slice(1)) {
  await p.goto(`${BASE}/p/${code}`);
  await p.waitForSelector('canvas.world');
}
await A.waitForTimeout(800);
await shot(A, '20-party-4');

async function startGame(name) {
  await A.click('.games-btn');
  await A.click(`.game-card:has-text("${name}")`);
  await A.waitForSelector('text=Start game');
  for (const p of ps.slice(1)) {
    await p.waitForSelector('.game-banner >> text=Join!');
    await p.click('.game-banner >> text=Join!');
  }
  await A.waitForTimeout(400);
  await A.click('text=▶ Start game');
  await A.waitForTimeout(800);
}
async function endGame() {
  A.once('dialog', (d) => d.accept());
  await A.click('.game-head >> text=End');
  await A.waitForTimeout(500);
}

// ── Mafia
await startGame('Mafia');
await shot(A, '21-mafia-roles');
// fast-forward visually: wait for night (10s)
await A.waitForTimeout(10500);
for (const p of ps) {
  const txt = await p.locator('.role-card').innerText();
  if (/Mafia/.test(txt)) {
    const btns = p.locator('.pg-item:not([disabled])');
    if (await btns.count()) await btns.first().click();
    await p.waitForTimeout(300);
    await shot(p, '22-mafia-night-mafia');
  }
}
await shot(ps[1], '23-mafia-night-other');
await endGame();

// ── Charades
await startGame('Emoji Charades');
let actor = null;
for (const p of ps) if (await p.locator('text=You are on stage').count()) actor = p;
await actor.click('.pose-row >> text=dance');
await actor.click('.emoji-pad button >> nth=5');
await actor.click('.emoji-pad button >> nth=40');
await actor.waitForTimeout(600);
await shot(actor, '24-charades-actor');
const watcher = ps.find((p) => p !== actor);
await watcher.fill('.guess-bar input', 'is it a movie');
await watcher.press('.guess-bar input', 'Enter');
await watcher.waitForTimeout(400);
await shot(watcher, '25-charades-guesser');
await endGame();

// ── Imposter
await startGame("Imposter");
await shot(A, '26-imposter-card');
await A.waitForTimeout(9500);
for (let i = 0; i < 8; i++) {
  for (const p of ps) {
    if (await p.locator('.guess-bar input[placeholder="Your one-word clue…"]').count()) {
      await p.fill('.guess-bar input', ['crunchy', 'hot', 'yum', 'party', 'cheesy', 'round', 'late', 'night'][i]);
      await p.press('.guess-bar input', 'Enter');
      await p.waitForTimeout(250);
      break;
    }
  }
}
await A.waitForTimeout(500);
await shot(A, '27-imposter-vote');
for (const p of ps) {
  const btn = p.locator('.clue-row button').first();
  if (await btn.count()) await btn.click();
}
await A.waitForTimeout(9500);
await shot(A, '28-imposter-end');
await A.waitForTimeout(31000);
await shot(A, '29-results');
console.log('errors:', errors.length ? errors : 'none');
await b.close();

// Multi-user smoke test: sign up, create characters, host + join a party, chat, then play a game.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5173';
const OUT = process.env.OUT || 'screenshots';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const errors = [];
async function user(name, viewport) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(`${name} console: ${m.text()}`));
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

const A = await user('A', { width: 390, height: 844 });
await A.goto(BASE);
await A.waitForSelector('text=Quick play');
await shot(A, '01-landing');
await A.fill('#nm', 'Umar');
await A.click('button[type=submit]');
await A.waitForSelector('text=Create your character');
await A.waitForTimeout(500);
await shot(A, '02-creator');
await A.click('text=💇 Hair');
await A.waitForTimeout(300);
await shot(A, '03-creator-hair');
await A.click("text=I'm ready to party!");
await A.waitForSelector('text=Throw a party');
await A.waitForTimeout(400);
await shot(A, '04-home');
await A.click('text=Start party →');
await A.waitForSelector('canvas.world');
await A.waitForTimeout(1200);
await shot(A, '05-party-mobile');
const code = (await A.locator('.pcode').innerText()).slice(0, 5);
console.log('party code', code);

const B = await user('B', { width: 1280, height: 800 });
await B.goto(`${BASE}/p/${code}`);
await B.fill('#nm', 'Zara');
await B.click('button[type=submit]');
await B.waitForSelector('text=Create your character');
await B.click('text=🎲 Surprise me');
await B.click("text=I'm ready to party!");
await B.waitForSelector('canvas.world', { timeout: 10000 });
await B.waitForTimeout(800);

const C = await user('C', { width: 1280, height: 800 });
await C.goto(`${BASE}/p/${code}`);
await C.fill('#nm', 'Leo');
await C.click('button[type=submit]');
await C.click("text=I'm ready to party!");
await C.waitForSelector('canvas.world', { timeout: 10000 });

// walk B around with the keyboard and chat
await B.keyboard.down('ArrowLeft');
await B.waitForTimeout(700);
await B.keyboard.up('ArrowLeft');
await B.fill('.chat-pill input', 'heyyy this house is sick 🎉');
await B.press('.chat-pill input', 'Enter');
await C.click('button[aria-label=Dance]');
await A.waitForTimeout(1200);
await shot(A, '06-party-chat-mobile');
await shot(B, '07-party-desktop');

// emote tray on mobile
await A.click('button[aria-label=Emotes]');
await A.waitForTimeout(300);
await shot(A, '08-emote-tray');
await A.click('button[aria-label=laugh]');
await A.click('button[aria-label=Emotes]');

// Game: A opens picker and starts Sketch & Guess
await A.click('.games-btn');
await A.waitForSelector('text=Game night');
await A.waitForTimeout(300);
await shot(A, '09-game-picker');
await A.click('text=Sketch & Guess');
await A.waitForSelector('text=Start game');
await B.waitForSelector('.game-banner');
await shot(B, '10-game-banner');
await B.click('.game-banner >> text=Join!');
await C.click('.game-banner >> text=Join!');
await A.waitForTimeout(500);
await shot(A, '11-lobby');
await A.click('text=▶ Start game');
await A.waitForTimeout(1200);
// whoever is drawing picks the first word
const pages = { A, B, C };
let drawer = null;
for (const [n, p] of Object.entries(pages)) if (await p.locator('text=Your turn to draw').count()) drawer = n;
console.log('drawer', drawer);
const D = pages[drawer];
await shot(D, '12-choose-word');
await D.locator('.choices button').first().click();
await D.waitForTimeout(500);
const word = (await D.locator('.word-display').innerText()).trim();
console.log('word', word);
// draw a squiggle
const box = await D.locator('.canvas-wrap canvas').boundingBox();
await D.mouse.move(box.x + 40, box.y + 40);
await D.mouse.down();
for (let i = 0; i < 30; i++) await D.mouse.move(box.x + 40 + i * 8, box.y + 60 + Math.sin(i / 3) * 40, { steps: 2 });
await D.mouse.up();
await D.waitForTimeout(600);
const guessers = Object.entries(pages).filter(([n]) => n !== drawer).map(([, p]) => p);
await guessers[0].fill('.guess-bar input', 'banana?');
await guessers[0].press('.guess-bar input', 'Enter');
await guessers[0].fill('.guess-bar input', word);
await guessers[0].press('.guess-bar input', 'Enter');
await guessers[0].waitForTimeout(800);
await shot(guessers[0], '13-draw-guesser');
await shot(D, '14-draw-drawer');
await guessers[1].fill('.guess-bar input', word);
await guessers[1].press('.guess-bar input', 'Enter');
await guessers[1].waitForTimeout(1500);
await shot(guessers[1], '15-draw-reveal');

// End game, try Mafia lobby with 3 (needs 4) then imposter
await A.click('text=End');
A.once('dialog', () => {});
await A.waitForTimeout(300);
console.log('errors:', errors.length ? errors : 'none');
await b.close();

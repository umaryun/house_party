// Renders the launch video: captures every frame from the composition page and encodes MP4.
// Usage: node video/render.mjs [--comp gameplay] [--format landscape] [--fps 30] [--from 0] [--to 40] [--stills 1,5.5,12] [--out video/out/house-party-launch.mp4]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const LAND = args.format === 'landscape';
// --comp gameplay renders the gameplay clip (video/gameplay.html); default is the launch video.
const COMP = args.comp === 'gameplay' ? 'gameplay' : 'index';
const BASE = (args.base || `http://localhost:5173/video/${COMP}.html`) + (LAND ? '?format=landscape' : '');
const [VW, VH] = LAND ? [1920, 1080] : [1080, 1920];
const FPS = +(args.fps || 30);
const OUT =
  args.out ||
  (COMP === 'gameplay'
    ? 'video/out/house-party-gameplay.mp4'
    : LAND
      ? 'video/out/house-party-launch-16x9.mp4'
      : 'video/out/house-party-launch.mp4');
fs.mkdirSync('video/out', { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
await page.goto(BASE);
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => window.__ready);
const duration = args.to ? +args.to : await page.evaluate(() => window.__duration);
const from = +(args.from || 0);

if (args.stills) {
  const times = args.stills.split(',').map(Number).sort((a, b) => a - b);
  let t = 0;
  for (const target of times) {
    // step through every frame so time-based state builds up exactly as in the real render
    while (t < target - 1e-6) {
      await page.evaluate((x) => window.__renderFrame(x), t);
      t += 1 / FPS;
    }
    await page.evaluate((x) => window.__renderFrame(x), target);
    await page.screenshot({ path: `video/out/still-${COMP === 'gameplay' ? 'g' : LAND ? 'l' : 'v'}-${target.toFixed(2)}.jpg`, type: 'jpeg', quality: 88 });
    console.log('still', target);
  }
  await browser.close();
  process.exit(0);
}

// audio
if (args.audio) {
  const b64 = await page.evaluate(() => window.__audio());
  fs.writeFileSync(`video/out/soundtrack-${COMP}.wav`, Buffer.from(b64, 'base64'));
  await browser.close();
  console.log('soundtrack only');
  process.exit(0);
}
const wavB64 = await page.evaluate(() => window.__audio());
const WAV = `video/out/soundtrack-${COMP}.wav`;
fs.writeFileSync(WAV, Buffer.from(wavB64, 'base64'));
console.log('soundtrack rendered');

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-ss', String(from), '-i', WAV,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
  OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round((duration - from) * FPS);
// warm up state from t=0 if starting mid-way
for (let t = 0; t < from - 1e-6; t += 1 / FPS) await page.evaluate((x) => window.__renderFrame(x), t);
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = from + i / FPS;
  await page.evaluate((x) => window.__renderFrame(x), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0) console.log(`frame ${i}/${total}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('wrote', OUT);

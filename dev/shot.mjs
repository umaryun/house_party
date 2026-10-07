import { chromium } from 'playwright';
const [,, url, out, w='1200', h='700'] = process.argv;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', m => console.log('console:', m.text()));
p.on('pageerror', e => console.log('pageerror:', e.message));
await p.goto(url); await p.waitForTimeout(1500);
await p.screenshot({ path: out });
await b.close();

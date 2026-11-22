// Dev aid: capture a fighter's frames in the running game (localhost:5174) as one contact-sheet PNG.
// node tools/contact-sheet.mjs <out.png> [walk|ride] [pid] [query]
import { chromium } from 'playwright-core';
const [out, kind = 'walk', pid = '0', q = ''] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`http://127.0.0.1:5174/?pause=1&seed=3${q}`);
await page.waitForFunction(() => window.__game?.art?.ready !== false, null, { timeout: 15000 });
await page.waitForTimeout(2500);
const png = await page.evaluate(async ({ kind, pid }) => {
  const d = window.__game.debug, cv = document.getElementById('screen'), P = +pid;
  d.start({ mode: '2p', chars: window.__chars || undefined });
  d.set(1 - P, { x: 100, y: 60 }); d.set(P, { x: -80, y: 0 });
  if (kind === 'ride') { const m = d.match(); const { findBoon } = await import('/src/chars/gods.js'); const b = findBoon('peacock'); m.players[P].boon = { move: b, name: b.name, god: 'Murugan', godId: 'murugan', tier: 'small' }; d.setInput(P, { s1: true, s2: true }); d.step(2); d.clearInput(); d.step(60); }
  d.setInput(P, { mx: 1 }); d.step(8);
  const W = 230, H = 260, out = document.createElement('canvas'); out.width = W * 6; out.height = H * 2; const g = out.getContext('2d');
  for (let i = 0; i < 12; i++) {
    d.step(3); const p = d.match().players[P];
    const sx = 960 * (0.5 + p.x / 300) * 2, sy = 1080 * 0.45 + 120 - (kind === 'ride' ? 70 : 0);
    g.drawImage(cv, sx - W / 2, sy - H * 0.62, W, H, (i % 6) * W, Math.floor(i / 6) * H, W, H);
  }
  return out.toDataURL('image/png');
}, { kind, pid });
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
await browser.close();
console.log('saved', out);

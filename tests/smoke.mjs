// Browser smoke test: serves the game, opens it in headless Chrome and plays through it with fake
// gamepads, the keyboard and the window.__game.debug API. Fails on any wrong state, page error or
// console error. Run with `npm run smoke`. Uses the installed Google Chrome (or CHROME_PATH).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = join(ROOT, 'test-results');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  if (req.url === '/favicon.ico') return res.writeHead(204).end();
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => { // fake gamepads: __pad(index, button, on) / __axis(index, axis, value)
  const pads = [];
  const make = (index) => ({ index, id: 'fake pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  const get = (i) => { while (pads.length <= i) pads.push(make(pads.length)); return pads[i]; };
  window.__pad = (i, b, on) => { get(i).buttons[b] = { pressed: on, value: on ? 1 : 0 }; };
  window.__axis = (i, a, v) => { get(i).axes[a] = v; };
  navigator.getGamepads = () => pads;
});
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push(`console error: ${m.text()}`); });
await mkdir(SHOTS, { recursive: true });

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); await page.screenshot({ path: join(SHOTS, `fail-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {}); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
async function open(query = '') {
  await page.goto(base + query);
  await page.waitForFunction(() => window.__game?.debug, null, { timeout: 10000 });
}
const game = (fn, arg) => page.evaluate(fn, arg);

console.log('Myth Fighter smoke test');

await check('title screen loads and shows the controls', async () => {
  await open();
  await page.waitForTimeout(400);
  expect(await game(() => window.__game.screen) === 'title', 'not on the title screen');
  await page.screenshot({ path: join(SHOTS, 'title.png') });
});

await check('menus: pick a 7 minute match and start it', async () => {
  const s = await game(() => {
    const d = window.__game.debug;
    d.pause(); d.press('confirm'); d.step(1);
    const setup = d.snapshot().screen;
    d.press('right'); d.step(1); d.press('right', 1); d.step(1);
    d.press('confirm'); d.step(1);
    return { setup, snap: d.snapshot() };
  });
  expect(s.setup === 'setup', `expected setup, got ${s.setup}`);
  expect(s.snap.screen === 'fight' && s.snap.match.duration === 420, `expected a 7 minute fight, got ${s.snap.screen} ${s.snap.match?.duration}`);
});

await check('a gamepad moves Krishna and fires the flute (P1 pad)', async () => {
  await open('?seed=4&pause=1');
  const s = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 5 });
    const x0 = d.snapshot().match.players[0].x;
    window.__axis(0, 0, 1); d.step(30); window.__axis(0, 0, 0);
    const x1 = d.snapshot().match.players[0].x;
    window.__pad(0, 0, true); d.step(2); window.__pad(0, 0, false); d.step(15);
    return { x0, x1, proj: d.snapshot().match.projectiles };
  });
  expect(s.x1 > s.x0 + 10, `Krishna did not move: ${s.x0} -> ${s.x1}`);
  expect(s.proj >= 1, 'no flute note in the air');
});

await check('the keyboard moves Raja Raja Chola and he blocks (P2 keys)', async () => {
  await open('?seed=4&pause=1');
  await game(() => window.__game.debug.start({ minutes: 5 }));
  await page.keyboard.down('ArrowUp');
  await game(() => window.__game.debug.step(30));
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Semicolon');
  const s = await game(() => { window.__game.debug.step(10); return window.__game.debug.snapshot().match.players[1]; });
  await page.keyboard.up('Semicolon');
  expect(s.y < -10, `did not move up: y=${s.y}`);
  expect(s.block, 'not blocking');
  await page.screenshot({ path: join(SHOTS, 'block.png') });
});

await check('meditation grants a boon and both players see the banner', async () => {
  await open('?seed=9&pause=1');
  const s = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 5 });
    d.set(0, { x: -100, y: 0 }); d.set(1, { x: 100, y: 0 });
    d.setInput(1, { s1: true, my: 1 }); d.step(1); d.setInput(1, {}); d.step(60 * 5 + 20);
    return d.snapshot();
  });
  expect(s.match.players[1].boons.length === 1, 'no boon');
  expect(/GOT/.test(s.banner || ''), `no banner: ${s.banner}`);
  await page.screenshot({ path: join(SHOTS, 'boon.png') });
});

await check('a signature move plays its scene, pauses the game, then lands', async () => {
  await open('?seed=2&pause=1');
  const s = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 5 });
    d.set(0, { x: -60, y: 0, power: 100 }); d.set(1, { x: 80, y: 0 });
    d.setInput(0, { s1: true, s2: true, s3: true }); d.step(1); d.setInput(0, {}); d.step(60 * 4 + 5);
    const during = d.snapshot();
    d.setInput(1, { mx: -1 }); d.step(30);
    const still = d.snapshot();
    d.setInput(1, {}); d.step(60 * 3);
    return { during, still, after: d.snapshot() };
  });
  expect(s.during.match.scene === 'Vishwaroopam', `no scene: ${s.during.match.scene}`);
  expect(s.still.match.players[1].x === s.during.match.players[1].x, 'the game did not pause during the scene');
  expect(s.after.match.players[1].hp === 70, `Vishwaroopam did not land: hp ${s.after.match.players[1].hp}`);
});

await check('every move draws without errors', async () => {
  await open('?seed=3&pause=1');
  const errs = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 5 });
    const slots = ['a1', 'a2', 's1', 's2', 's3', 'block'];
    for (const s of slots) for (const pid of [0, 1]) {
      d.set(0, { x: -30, y: 0, power: 100 }); d.set(1, { x: 25, y: 0, power: 100 });
      d.setInput(pid, { [s]: true }); d.step(3); d.setInput(pid, {}); d.step(40);
    }
    d.set(0, { x: -15, y: 0, power: 100 }); d.set(1, { x: 15, y: 0 });
    d.setInput(0, { a2: true, trapWater: true }); d.step(2); d.setInput(0, {}); d.step(20);
    d.unit({ owner: 0, x: 0, y: 40 }); d.step(5);
    return window.__game.errors;
  });
  expect(errs.length === 0, errs.join('\n'));
  await page.screenshot({ path: join(SHOTS, 'moves.png') });
});

await check('time-up shows the result, and rematch starts a new match', async () => {
  await open('?seed=5&pause=1');
  const s = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 1 });
    d.set(0, { hp: 80 }); d.match().timeLeft = 0.5; d.step(40);
    const res = d.snapshot().match.result;
    d.resume(); return res;
  });
  expect(s && s.winner === 1 && s.reason === 'time', `bad result ${JSON.stringify(s)}`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, 'result.png') });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const after = await game(() => window.__game.debug.snapshot().match);
  expect(after.phase === 'fight' && after.timeLeft > 50, `no rematch: ${after.phase}`);
});

await check('pause menu (Escape) stops the clock', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const a = await game(() => window.__game.debug.snapshot());
  await page.waitForTimeout(400);
  const b = await game(() => window.__game.debug.snapshot());
  expect(a.paused && b.match.timeLeft === a.match.timeLeft, 'clock kept running while paused');
  await page.keyboard.press('Escape');
});

await check('no page or console errors', async () => {
  const errs = await game(() => window.__game.errors);
  expect(problems.length === 0 && errs.length === 0, [...problems, ...errs].join('\n'));
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} smoke check(s) failed` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);

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

console.log('Porkalam smoke test');

await check('title screen loads and shows the controls', async () => {
  await open();
  await page.waitForTimeout(400);
  expect(await game(() => window.__game.screen) === 'title', 'not on the title screen');
  await page.screenshot({ path: join(SHOTS, 'title.png') });
});

await check('menus: pick a 7 minute match, choose a fighter on the select screen and start it', async () => {
  const s = await game(() => {
    const d = window.__game.debug;
    d.pause(); d.press('confirm'); d.step(1);
    const setup = d.snapshot().screen;
    // rows (1 player): players, cpu level, length
    d.press('down'); d.step(1); d.press('right'); d.step(1);          // CPU level normal -> hard
    d.press('down'); d.step(1); d.press('right'); d.step(1); d.press('right', 1); d.step(1); // 5 -> 7 minutes
    d.press('confirm'); d.step(1);
    const select = d.snapshot().screen;
    d.press('down'); d.step(1); const boons = window.__game.boonsPage; d.press('up'); d.step(1); // the boons page opens and closes
    d.press('right'); d.step(1);                                       // choose Veeran
    d.press('confirm'); d.step(1);
    return { setup, select, boons, snap: d.snapshot() };
  });
  expect(s.setup === 'setup' && s.select === 'select', `expected setup then select, got ${s.setup} ${s.select}`);
  expect(s.boons === true, 'the boons page did not open');
  expect(s.snap.screen === 'fight' && s.snap.match.duration === 420, `expected a 7 minute fight, got ${s.snap.screen} ${s.snap.match?.duration}`);
  expect(s.snap.mode === '1p' && s.snap.level === 'hard' && s.snap.cpu === 1, `expected 1 player vs a hard CPU: ${JSON.stringify(s.snap)}`);
  expect(s.snap.match.players[0].name === 'Veeran' && s.snap.match.players[1].name === 'Siddhan', `expected you as Veeran vs a CPU Siddhan: ${s.snap.match.players.map((p) => p.name)}`);
});

await check('1 player: the computer fights back and either key set moves you', async () => {
  await open('?seed=5&pause=1');
  await game(() => window.__game.debug.start({ minutes: 2, mode: '1p', side: 0, level: 'hard' }));
  await page.keyboard.down('ArrowRight'); // P2 keys also move the 1-player fighter
  const x = await game(() => { const d = window.__game.debug, x0 = d.snapshot().match.players[0].x; d.step(30); return [x0, d.snapshot().match.players[0].x]; });
  await page.keyboard.up('ArrowRight');
  expect(x[1] > x[0] + 10, `arrow keys did not move Siddhan: ${x}`);
  const s = await game(() => { const d = window.__game.debug; d.step(60 * 20); return d.snapshot().match; });
  expect(s.players[0].hp < 100 || s.players[1].devotion > 0, `the CPU did nothing in 20 s (no hit, no meditation): ${JSON.stringify(s.players)}`);
  await page.screenshot({ path: join(SHOTS, 'cpu.png') });
});

await check('a gamepad moves Siddhan and fires a mantra bolt (P1 pad)', async () => {
  await open('?seed=4&pause=1');
  const s = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 5 });
    const x0 = d.snapshot().match.players[0].x;
    window.__axis(0, 0, 1); d.step(30); window.__axis(0, 0, 0);
    const x1 = d.snapshot().match.players[0].x;
    window.__pad(0, 0, true); d.step(2); window.__pad(0, 0, false); d.step(15);
    return { x0, x1, proj: d.snapshot().match.projectiles };
  });
  expect(s.x1 > s.x0 + 10, `Siddhan did not move: ${s.x0} -> ${s.x1}`);
  expect(s.proj >= 1, 'no mantra bolt in the air');
});

await check('the keyboard moves Veeran and he blocks (P2 keys)', async () => {
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

await check('meditation fills devotion behind a barrier, and spending it shows the boon to both players', async () => {
  await open('?seed=9&pause=1');
  const s = await game(() => {
    const d = window.__game.debug; d.start({ minutes: 5 });
    d.set(0, { x: -100, y: 0 }); d.set(1, { x: 100, y: 0 });
    d.setInput(1, { s1: true, my: 1 }); d.step(1); d.setInput(1, {}); d.step(60 * 8);
    const med = d.snapshot();
    d.setInput(1, { block: true }); d.step(2); d.setInput(1, {}); d.step(5); // stop meditating
    d.setInput(1, { s1: true, s2: true }); d.step(1); d.setInput(1, {}); d.step(10); // spend
    return { med, after: d.snapshot() };
  });
  const p = s.med.match.players[1];
  expect(p.med && p.barrier > 0 && p.devotion === 3, `meditating with a barrier, 3 segments: ${JSON.stringify(p)}`);
  expect(s.after.match.players[1].devotion === 0, `devotion not spent: ${s.after.match.players[1].devotion}`);
  expect(s.after.match.players[1].boon, `no held boon: ${JSON.stringify(s.after.match.players[1])}`);
  const snd = await game(() => window.__game.sounds);
  expect(['meditate', 'devotion', 'boon'].every((n) => snd.includes(n)), `divine sounds not played: ${snd.join(',')}`);
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
  expect(s.during.match.scene === 'Thousand-Arm Form', `no scene: ${s.during.match.scene}`);
  expect(s.still.match.players[1].x === s.during.match.players[1].x, 'the game did not pause during the scene');
  expect(s.after.match.players[1].hp === 65, `Thousand-Arm Form did not land: hp ${s.after.match.players[1].hp}`);
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
    d.set(0, { x: -100, y: 0 }); d.set(1, { x: 100, y: 0 }); // meditation with its barrier, hit
    d.setInput(1, { s1: true, my: 1 }); d.step(2); d.setInput(1, {}); d.step(30);
    d.setInput(0, { a1: true }); d.step(3); d.setInput(0, {}); d.step(60);
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
  await page.waitForTimeout(2000); // the knockout / TIME! call plays first
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

await check('the fight pauses itself when the window loses focus (so it never crawls in the background)', async () => {
  await open('?seed=3');
  const s = await game(async () => {
    const d = window.__game.debug; d.start({ minutes: 2 });
    await new Promise((r) => setTimeout(r, 300));
    const before = d.snapshot().paused;
    window.dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 100));
    return { before, after: d.snapshot().paused };
  });
  expect(s.before === false, 'paused before losing focus');
  expect(s.after === true, 'did not pause when the window lost focus');
});

await check('the Codex art loads: arena plus 8 frames for each fighter, and ?grey=1 still runs', async () => {
  await open('?seed=6&pause=1');
  await page.waitForFunction(() => window.__game.art.ready, null, { timeout: 10000 });
  const a = await game(() => window.__game.art);
  expect(a.arena, 'arena.png did not load');
  expect(a.frames.siddhan === 8 && a.frames.veeran === 8 && a.actions.siddhan === 8 && a.actions.veeran === 8, `frames: ${JSON.stringify(a)}`);
  expect(a.fx === 17, `expected 17 effect sprites (two sheets of 8 + the war elephant), got ${a.fx}`);
  expect(a.scenes >= 5, `expected the power-up sky paintings, got ${a.scenes}`);
  expect(a.gods === 4, `expected the 4 boon gods, got ${a.gods}`);
  expect(a.sceneLayers >= 2, `expected the spirit-form layers for both signatures, got ${a.sceneLayers}`);
  await game(() => { const d = window.__game.debug; d.start({ minutes: 5 }); d.setInput(0, { mx: 1 }); d.step(30); });
  await page.screenshot({ path: join(SHOTS, 'art.png') });
  await open('?seed=6&pause=1&grey=1');
  const errs = await game(() => { const d = window.__game.debug; d.start({ minutes: 5 }); d.step(30); return window.__game.errors; });
  expect(errs.length === 0, errs.join('\n'));
});

// UI layout: render every menu page and fail if any two pieces of text overlap or text leaves the screen.
await check('a special or signature never shows the hurt pose (paying a health cost is not a hit)', async () => {
  await open('?seed=3&pause=1');
  await page.waitForFunction(() => window.__game.art.ready, null, { timeout: 10000 });
  const hurtFrames = await game(() => {
    const d = window.__game.debug; let n = 0;
    for (const inp of [{ s1: true }, { s2: true }, { s3: true }, { s1: true, s2: true, s3: true }]) for (const pid of [0, 1]) {
      d.start({ seed: 3 }); d.set(0, { x: -60, power: 100 }); d.set(1, { x: 60, power: 100 });
      for (let i = 0; i < 30; i++) d.step(1); // mid-match, like real play
      d.setInput(pid, inp); d.step(1); d.step(1); d.setInput(pid, {});
      for (let i = 0; i < 60; i++) { d.step(1); if (window.__game.hurt(pid)) n++; }
    }
    return n;
  });
  expect(hurtFrames === 0, `the caster showed the hurt pose for ${hurtFrames} frames`);
});

await check('no text overlaps or runs off screen on any menu page', async () => {
  await open('?seed=3&pause=1');
  await page.waitForFunction(() => window.__game.art.ready, null, { timeout: 10000 });
  const problems = await game(() => {
    const d = window.__game.debug, out = [];
    const shot = (name) => { // render one frame with the text log on, then check every pair of boxes
      window.__textLog = []; d.step(1);
      const boxes = window.__textLog.filter((b) => b.a > 0.05 && b.s.trim()); window.__textLog = null;
      for (const b of boxes) if (b.x0 < -0.5 || b.x1 > 480.5 || b.y0 < -0.5 || b.y1 > 270.5) out.push(`${name}: "${b.s}" runs off screen`);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 0.6 && Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 0.6) out.push(`${name}: "${a.s}" overlaps "${c.s}"`);
      }
    };
    shot('title');
    d.press('confirm'); d.step(1); shot('setup 1P');
    d.press('right'); d.step(1); shot('setup 2P'); d.press('left'); d.step(1); // back to 1 player
    d.press('confirm'); d.step(1);
    shot('select: Siddhan'); d.press('right'); d.step(1); shot('select: Veeran');
    d.press('down'); d.step(1); shot('boons page'); d.press('up'); d.step(1);
    d.press('up'); d.step(1); shot('controls page'); d.press('up'); d.step(1);
    d.press('confirm'); d.step(1); // into the fight (Veeran vs CPU Siddhan)
    d.step(30); shot('fight HUD');
    const m = d.match(); m.players[0].devotion = 10; d.setInput(0, { s1: true, s2: true }); d.step(1); d.setInput(0, {}); d.step(40); shot('boon card + held boon tag');
    d.press('pause'); d.step(1); shot('pause menu');
    d.press('down'); d.step(1); d.press('confirm'); d.step(1);
    for (const pg of ['P1 page', 'P2 page', 'boons page (pause)', 'controls page (pause)']) { shot(pg); d.press('right'); d.step(1); }
    return out;
  });
  expect(problems.length === 0, problems.slice(0, 12).join('\n       '));
});

await check('no page or console errors', async () => {
  const errs = await game(() => window.__game.errors);
  expect(problems.length === 0 && errs.length === 0, [...problems, ...errs].join('\n'));
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} smoke check(s) failed` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);

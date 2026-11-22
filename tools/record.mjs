// Records gameplay to an MP4 for sharing: the real game in headless Chrome, both fighters played by the
// computer. The recorder owns the page's frame loop (requestAnimationFrame) and steps it exactly 1/60 s at a time, so
// the video plays at real game speed whatever the machine's speed (a screenshot no longer lets frames slip through).
// A timeline hands out boons and power so the big moments happen inside a short clip.
// Usage: node tools/record.mjs [out.mp4] [seconds-of-fight] [seed] [speed]   (needs ffmpeg and Google Chrome)
// speed < 1 records in slow motion (0.8 = each video second shows 0.8 s of game), still 30 smooth frames a second.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] || join(ROOT, 'gameplay.mp4'), FIGHT = +process.argv[3] || 60, SEED = +process.argv[4] || 7, SPEED = +process.argv[5] || 1;
const FPS = 30, W = 1280, H = 720;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.addInitScript(() => { // our own frame loop: frames only happen when __advance() is called
  let q = [], ts = null;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__advance = (ms) => {
    if (ts == null) ts = performance.now();
    for (let i = 0, n = Math.round(ms / (1000 / 60)); i < n; i++) { ts += 1000 / 60; const run = q; q = []; for (const cb of run) cb(ts); }
  };
});
await page.goto(base);
for (let i = 0; i < 40 && !(await page.evaluate(() => !!window.__game?.debug && window.__game.art.ready)); i++) await page.waitForTimeout(250);
await page.evaluate(() => window.__advance(100));

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
let frames = 0;
async function shoot(seconds) {
  for (let i = 0; i < Math.round((seconds / SPEED) * FPS); i++) {
    await page.evaluate((ms) => window.__advance(ms), (1000 / FPS) * SPEED);
    const img = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
    if (++frames % 150 === 0) console.log(`${frames / FPS} s recorded`);
  }
}

await shoot(2.5); // the title screen

// The fight: both sides played by the hard computer, plus a timeline of gifts (match seconds)
await page.evaluate(async ({ seed }) => {
  const d = window.__game.debug, { createCpu, cpuInput } = await import('/src/ai.js'), { findBoon } = await import('/src/chars/gods.js');
  d.start({ minutes: 2, mode: '2p', seed, chars: ['siddhan', 'veeran'] });
  const m = d.match(), cpus = [createCpu(0, 'hard', seed * 3), createCpu(1, 'hard', seed * 5)];
  const give = (pid, id, god, godId, tier) => { const b = findBoon(id); m.players[pid].boon = { move: b, name: b.name, god, godId, tier }; };
  // Health is topped up between the big moments so the fight lasts to the finale (it's a showreel, not a match).
  // [match second, what happens]. press(pid, buttons, name): that fighter drops what it's doing and presses those
  // buttons (tapping, so a combo counts) until `name` starts; still(pid, s): that fighter stands still for s seconds
  const tasks = [null, null], quiet = [0, 0];
  const press = (pid, buttons, name, quietFor = 2) => { // the opponent's shots in the air are cleared and they hold still, so the cast isn't broken
    const p = m.players[pid]; p.cast = null; p.med = null; p.block = null; p.air = null; p.recover = 0; tasks[pid] = { buttons, name, until: m.t + 3 };
    const o = m.players[1 - pid]; o.cast = null; o.block = null; m.projectiles = m.projectiles.filter((pr) => pr.owner === pid); m.strikes = m.strikes.filter((x) => x.owner === pid); m.areas = m.areas.filter((a) => a.owner === pid); quiet[1 - pid] = m.t + quietFor;
  };
  const still = (pid, s) => { quiet[pid] = m.t + s; };
  const BOON = { s1: true, s2: true }, SIG = { s1: true, s2: true, s3: true };
  const plan = [ // mostly normal play: two big moments
    [6, () => { give(0, 'tandava', 'Shiva', 'shiva', 'small'); press(0, BOON, "Shiva's Tandava"); }],
    [15, () => { m.players[1].power = 100; m.players[1].hp = Math.max(m.players[1].hp, 40); press(1, SIG, 'Gaja Arrow', 3); }],
    // both call the Brahmastra, one just after the other: Shiva takes both back, and the fight goes on
    [24, () => { for (const p of m.players) p.hp = Math.max(p.hp, 50); give(0, 'brahmastra', 'Brahma', 'brahma', 'divine'); give(1, 'brahmastra', 'Brahma', 'brahma', 'divine'); press(0, BOON, 'Brahmastra', 4); }],
    [24.6, () => { const p = m.players[1]; p.block = null; p.air = null; p.recover = 0; tasks[1] = { buttons: BOON, name: 'Brahmastra', until: m.t + 3 }; }],
  ];
  let lastT = -1, step = 0;
  const tick = () => {
    if (m.t !== lastT) { // one computer decision per game step
      lastT = m.t; step++;
      while (plan.length && m.t >= plan[0][0]) plan.shift()[1]();
      for (const i of [0, 1]) {
        if (!tasks[i] && m.players[i].power > 55) m.players[i].power = 55; // signatures only when the timeline says
        const t = tasks[i], p = m.players[i], ai = m.phase === 'fight' ? cpuInput(m, cpus[i], 1 / 60) : {};
        if (t && (p.cast?.move.name === t.name || m.scene?.name === t.name || m.t > t.until)) tasks[i] = null;
        const inp = m.phase !== 'fight' ? {} : tasks[i] ? (step % 12 < 6 ? tasks[i].buttons : {}) : m.t < quiet[i] ? {} : ai;
        d.setInput(i, inp);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, { seed: SEED });
await shoot(FIGHT);
const result = await page.evaluate(() => { const m = window.__game.debug.match(); return { phase: m.phase, result: m.result, hp: m.players.map((p) => Math.round(p.hp)) }; });
console.log('match:', JSON.stringify(result));

ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close(); server.close();
console.log(`wrote ${OUT}: ${frames} frames, ${(frames / FPS).toFixed(1)} s`);

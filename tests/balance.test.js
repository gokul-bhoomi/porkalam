// Ground rule 16 (owner, 2026-11-13): every fighter about equally strong, no spamming, no one-button win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, recoveryOf } from '../src/sim.js';
import { createCpu, cpuInput } from '../src/ai.js';
import { TUNE, STEP } from '../src/config.js';
import { CHARS } from '../src/chars/index.js';
import { match, run, tap, events, K, R } from './helpers.js';

const mage = CHARS.siddhan, warrior = CHARS.veeran;

test('rule 16: after an attack its user recovers before starting any move (not a cooldown: every move waits)', () => {
  const m = match({ k: { x: -20, power: 100 }, r: { x: 20 } });
  tap(m, K, 'a2'); run(m, [{}, {}], mage.moves.a2.cast + 0.05);
  assert.ok(m.players[K].recover > 0, 'recovering after the palm push');
  tap(m, K, 'a2'); tap(m, K, 'a1');
  assert.equal(events(m, 'cast').filter((e) => e.pid === K).length, 1, 'no second move while recovering');
  const x0 = m.players[K].x; run(m, [{ mx: -1 }, {}], 0.1);
  assert.ok(m.players[K].x < x0, 'can still walk while recovering');
  run(m, [{}, {}], TUNE.recover.basic);
  tap(m, K, 'a1');
  assert.equal(events(m, 'cast').filter((e) => e.pid === K).length, 2, 'free again once recovered');
});

test('rule 16: specials recover longer than basic attacks; blink and meditation are not attacks', () => {
  for (const c of [mage, warrior]) {
    for (const s of ['a1', 'a2']) assert.equal(recoveryOf(c.moves[s]), TUNE.recover.basic, `${c.moves[s].name}`);
    for (const s of ['s1', 's2', 'sig']) if (!['blink', 'fly', 'jump'].includes(c.moves[s].kind)) assert.equal(recoveryOf(c.moves[s]), TUNE.recover.special, `${c.moves[s].name}`);
    assert.equal(recoveryOf(c.moves.cls), 0);
    for (const s of ['s1', 's2', 's3']) if (['fly', 'jump'].includes(c.moves[s].kind)) assert.equal(recoveryOf(c.moves[s]), 0, `${c.moves[s].name} is not an attack (its landing pause is rule 17)`);
  }
  assert.equal(recoveryOf(mage.moves.s3), 0, 'blink');
  assert.ok(TUNE.recover.special > TUNE.recover.basic);
});

// A one-button player walks at the opponent and presses one basic attack as fast as the game allows.
// Against the hard computer, using every move, it must lose almost always (it once won 18 of 20 with the knife).
function spamMatch(spam, slot, seed) {
  const m = createMatch({ seed, time: 300 }), cpu = createCpu(1 - spam, 'hard', seed);
  for (let f = 0; m.phase === 'fight' && f < 330 / STEP; f++) {
    const p = m.players[spam], o = m.players[1 - spam], dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
    const b = d > (slot === 'a2' ? 30 : 60) ? { mx: dx / d, my: dy / d } : {};
    if (f % 2 === 0) b[slot] = true;
    const inp = []; inp[spam] = b; inp[1 - spam] = cpuInput(m, cpu, STEP);
    stepMatch(m, inp);
  }
  return m.result?.winner === spam;
}
test('rule 16: no one-button win: spamming any basic attack loses to the hard computer', () => {
  for (const spam of [K, R]) for (const slot of ['a1', 'a2']) {
    let wins = 0;
    for (let seed = 1; seed <= 12; seed++) wins += spamMatch(spam, slot, seed) ? 1 : 0;
    const mv = [mage, warrior][spam].moves[slot];
    assert.ok(wins <= 2, `${[mage, warrior][spam].name} spamming ${mv.name} won ${wins} of 12`);
  }
});

// A smarter melee-only player, like a person would play it (owner, 2026-11-13: still beat the hard computer with
// only the knife): sidesteps incoming shots and arrow rain, closes in, swings the moment it's in reach and recovered.
function meleeOnly(m, pid, f) {
  const p = m.players[pid], o = m.players[1 - pid], dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d; let mx = ux, my = uy;
  for (const pr of m.projectiles) {
    if (pr.owner === pid) continue;
    const rx = p.x - pr.x, ry = p.y - pr.y, v2 = pr.vx ** 2 + pr.vy ** 2;
    const t = v2 ? (rx * pr.vx + ry * pr.vy) / v2 : -1;
    if (t < 0 || t > 0.6) continue;
    const cx = pr.x + pr.vx * t - p.x, cy = pr.y + pr.vy * t - p.y;
    if (Math.hypot(cx, cy) < pr.r + 14) { const s = cx * -uy + cy * ux > 0 ? -1 : 1; mx = -uy * s + ux * 0.3; my = ux * s + uy * 0.3; }
  }
  for (const a of m.areas) if (a.owner !== pid && Math.hypot(p.x - a.x, p.y - a.y) < a.r + 8) { mx = p.x - a.x; my = p.y - a.y; }
  const b = d < 36 ? {} : { mx, my };
  if (d < 44 && !p.recover && !p.cast && f % 2 === 0) b.a2 = true;
  return b;
}
test('rule 16: a melee-only player who dodges like a person still loses to the hard computer', () => {
  for (const pid of [K, R]) {
    let wins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = createMatch({ seed, time: 300 }), cpu = createCpu(1 - pid, 'hard', seed);
      for (let f = 0; m.phase === 'fight' && f < 330 / STEP; f++) { const inp = []; inp[pid] = meleeOnly(m, pid, f); inp[1 - pid] = cpuInput(m, cpu, STEP); stepMatch(m, inp); }
      if (m.result?.winner === pid) wins++;
    }
    assert.ok(wins <= 2, `${[mage, warrior][pid].name} melee-only won ${wins} of 12 against the hard computer`);
  }
});

test('rule 16: every fighter card spends the same budget across range, speed, defence, control and burst', () => {
  const keys = ['range', 'speed', 'defence', 'control', 'burst'], sums = new Set();
  for (const c of Object.values(CHARS)) {
    assert.deepEqual(Object.keys(c.traits).sort(), [...keys].sort(), c.name);
    for (const k of keys) assert.ok(Number.isInteger(c.traits[k]) && c.traits[k] >= 1 && c.traits[k] <= 5, `${c.name} ${k}`);
    assert.ok(c.strong && c.weak, `${c.name} says what it is strong and weak at`);
    sums.add(keys.reduce((a, k) => a + c.traits[k], 0));
  }
  assert.equal(sums.size, 1, `same total for everyone (${[...sums]})`);
});

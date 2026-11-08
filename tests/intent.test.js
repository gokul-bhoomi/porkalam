// Design-intent tests: the owner's decisions, written down as tests so a later change can't quietly
// drift away from them. One block per ground rule (GROUND-RULES.md, locked 2026-11-07), then the class
// rules (CLASS-RULES.md) and the agreed character rules (CHARACTERS.md).
//
// If one of these fails, your change goes against a design decision. Don't edit the test to make it
// pass: stop and ask the owner. Change the test only once they agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatch, stepMatch, whyNot, applyEffect, spawnUnit, startArenaChange, BUTTONS, rangeOK } from '../src/sim.js';
import { ARENA, TUNE, POWER, STEP, RANGES } from '../src/config.js';
import { CHARS } from '../src/chars/index.js';
import { GODS, findBoon } from '../src/chars/gods.js';
import { ACTIONS, PAD, KEYS } from '../src/input.js';
import { match, run, tap, useBoon, events, steps, K, R } from './helpers.js';

const mage = CHARS.siddhan, warrior = CHARS.veeran; // P1 = Mage (Siddhan), P2 = Warrior (Veeran)
const allMoves = () => [mage, warrior].flatMap((c) => Object.values(c.moves))
  .concat(Object.values(GODS).flatMap((g) => g.tiers.flat()));
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

// ---------- 1. Health ----------
test('rule 1: health starts at 100%, which is also the maximum; healing never goes above it', () => {
  const m = match();
  for (const p of m.players) assert.equal(p.hp, 100);
  m.players[R].hp = 95; // Kamandalu restores 10%, but never above 100%
  m.players[R].cast = { move: findBoon('kamandalu'), slot: 'boon', t: 0, dir: null };
  run(m, [{}, {}], 1);
  assert.equal(m.players[R].hp, 100);
});

test('rule 1: health never refills on its own, only certain moves restore it', () => {
  const m = match({ k: { hp: 40 }, r: { hp: 55 } });
  run(m, [{}, {}], 30);
  assert.deepEqual(m.players.map((p) => p.hp), [40, 55]);
  const healers = allMoves().filter((mv) => mv.heal);
  assert.ok(healers.length > 0 && healers.every((mv) => mv.kind === 'heal'), 'healing only comes from a healing move');
});

test('rule 1: 0 health = loss', () => {
  const m = match({ k: { hp: 0.5 }, r: { x: 0, y: 0 } });
  m.players[K].x = -50;
  m.players[R].x = 10; m.players[R].y = 0; m.players[K].x = -15;
  tap(m, R, 'a2'); run(m, [{}, {}], 0.3);
  assert.equal(m.phase, 'done');
  assert.deepEqual(m.result, { winner: R, reason: 'ko' });
});

// ---------- 2. Power ----------
test('rule 2: power refills at a constant rate, the same at any health level', () => {
  const a = match({ k: { power: 0 } }), b = match({ k: { power: 0, hp: 3 } });
  run(a, [{}, {}], 2); const p1 = a.players[K].power;
  run(a, [{}, {}], 2); const p2 = a.players[K].power;
  run(b, [{}, {}], 4);
  assert.ok(Math.abs(p1 - 2 * mage.power.refill) < 1e-6, 'constant rate');
  assert.ok(Math.abs(p2 - 2 * p1) < 1e-6, 'same rate later on');
  assert.ok(Math.abs(b.players[K].power - p2) < 1e-6, 'same rate at low health');
});

// ---------- 3. Match ----------
test('rule 3: 5 minutes by default, adjustable up to 10', () => {
  assert.equal(createMatch().duration, 300);
  assert.equal(createMatch({ time: 600 }).duration, 600);
  assert.equal(createMatch({ time: 900 }).duration, 600);
});

test('rule 3: at time-up higher health wins, equal health is a draw', () => {
  const a = match({ time: 60, k: { hp: 60 }, r: { hp: 70 } });
  run(a, [{}, {}], 61);
  assert.deepEqual(a.result, { winner: R, reason: 'time' });
  const b = match({ time: 60, k: { hp: 70 }, r: { hp: 70 } });
  run(b, [{}, {}], 61);
  assert.deepEqual(b.result, { winner: null, reason: 'time' });
});

test('rule 3: both fighters reaching 0 at the same moment is a draw', () => {
  // two arrows/notes landing in the same instant
  const m = match({ k: { hp: 2 }, r: { hp: 2 } });
  m.hits.push({ target: m.players[K], dmg: 4, kb: 0, from: null }, { target: m.players[R], dmg: 4, kb: 0, from: null });
  stepMatch(m);
  assert.equal(m.phase, 'done');
  assert.equal(m.result.winner, null);
});

test('rule 3: start on opposite sides, full health, half power', () => {
  const m = createMatch(), [k, r] = m.players;
  assert.ok(k.x < 0 && r.x > 0 && Math.abs(k.x + r.x) < 1e-9 && k.y === r.y);
  for (const p of m.players) { assert.equal(p.hp, 100); assert.equal(p.power, p.ch.power.size / 2); }
});

// ---------- 4. Moves ----------
test('rule 4: every move has a cost, requirements, a range, a cast time, damage and knockback', () => {
  for (const mv of allMoves()) {
    assert.ok(mv.cost && 'power' in mv.cost, `${mv.name} cost`);
    assert.ok(Object.keys(mv.cost).every((k) => k === 'power' || k === 'health'), `${mv.name}: power only, or power + health`);
    assert.ok(mv.req, `${mv.name} requirements`);
    assert.ok(mv.range in RANGES, `${mv.name} range`);
    assert.ok(typeof mv.cast === 'number' && typeof mv.damage === 'number' && typeof mv.knockback === 'number', mv.name);
  }
  for (const c of [mage, warrior]) {
    for (const s of ['a1', 'a2']) assert.ok(c.moves[s].cost.power <= 3, `${c.moves[s].name} is a basic move and costs very little power`);
    assert.ok(c.defence.cost <= 3, 'block is a basic move too');
  }
});

test('rule 4: long-distance special moves have no distance requirement', () => {
  for (const mv of allMoves().filter((x) => x.special && (x.range === 'long' || x.range === 'midlong'))) {
    assert.ok(rangeOK(mv, 0) && rangeOK(mv, 1000), mv.name);
  }
  assert.ok(!rangeOK(mage.moves.s2, 200), 'a mid-range special still needs its distance');
  assert.equal(whyNot(match({ k: { x: -100 }, r: { x: 100 } }), match().players[K], mage.moves.a1), null, 'basic attacks always go off; their range is their reach (owner, 2026-11-08)');
});

test('rule 4: no cooldowns (a move can be used again as soon as the last one ends)', () => {
  const m = match({ k: { x: -60, power: 50 }, r: { x: 60 } });
  for (let i = 0; i < 3; i++) { tap(m, K, 'a1'); run(m, [{}, {}], mage.moves.a1.cast); }
  assert.equal(events(m, 'release').filter((e) => e.pid === K).length, 3);
});

test('rule 4: a move only brings its own user to 0 health if it says so', () => {
  const m = match({ k: { hp: 10, power: 100 } });
  assert.equal(whyNot(m, m.players[K], mage.moves.sig), 'NO HEALTH');
  for (const mv of allMoves()) if (mv.selfKO) assert.equal(mv.kind, 'brahmastra');
  m.players[K].hp = 3;
  assert.equal(whyNot(m, m.players[K], findBoon('brahmastra')), null, 'Brahmastra says so');
});

test('rule 4: attacks turn toward the opponent automatically', () => {
  const m = match({ k: { x: -60, y: -40 }, r: { x: 50, y: 40 } });
  run(m, [{ mx: -1 }, { mx: 1 }], 0.2);
  for (const p of m.players) {
    const o = m.players[1 - p.id], d = Math.hypot(o.x - p.x, o.y - p.y);
    assert.ok(Math.abs(p.face.x - (o.x - p.x) / d) < 1e-6 && Math.abs(p.face.y - (o.y - p.y) / d) < 1e-6);
  }
});

test('rule 4: projectiles fly in a straight line and can be dodged by moving', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 90, y: 0 } });
  tap(m, R, 'a1'); run(m, [{}, {}], warrior.moves.a1.cast);
  const pr = m.projectiles[0], v = [pr.vx, pr.vy];
  let lastAngle = null;
  for (let i = 0; i < 60 && m.projectiles.length; i++) {
    stepMatch(m, [{ my: 1 }, {}]);
    for (const p of m.projectiles) if (!p.legs) { assert.deepEqual([p.vx, p.vy], v); lastAngle = Math.atan2(p.vy, p.vx); }
  }
  assert.ok(lastAngle !== null);
  assert.equal(m.players[K].hp, 100, 'Krishna stepped out of the arrow\'s line');
  // the chakra re-aims between legs, but every leg is a straight line
  const c = match({ k: { x: -60, power: 100 }, r: { x: 80 } });
  tap(c, K, 's1'); run(c, [{}, {}], mage.moves.s1.cast);
  let turns = 0, prev = null;
  for (let i = 0; i < steps(2) && c.projectiles.length; i++) {
    stepMatch(c, [{}, { my: -1 }]);
    const p = c.projectiles[0];
    if (p && prev && (p.vx !== prev[0] || p.vy !== prev[1])) { turns++; assert.ok(p.lt === 0, 'turns only between legs'); }
    if (p) prev = [p.vx, p.vy];
  }
  assert.ok(turns <= mage.moves.s1.legs - 1);
});

test('rule 4: power moves get a short dramatic scene, and the game pauses for both players', () => {
  const m = match({ k: { x: -60 }, r: { x: 80, power: 100 } });
  tap(m, R, 'sig'); run(m, [{}, {}], warrior.moves.sig.cast);
  assert.equal(m.scene?.name, 'Gaja Arrow');
  const before = JSON.stringify({ k: [m.players[K].x, m.players[K].power], r: m.players[R].power, t: m.timeLeft });
  run(m, [{ mx: 1, a1: true }, { mx: -1 }], TUNE.scene * 0.9);
  assert.equal(JSON.stringify({ k: [m.players[K].x, m.players[K].power], r: m.players[R].power, t: m.timeLeft }), before, 'nothing moves during the scene');
  for (const c of [mage, warrior]) assert.ok(c.moves.sig.scene, `${c.moves.sig.name} has a scene`);
  for (const id of ['pashupatastra', 'shakti', 'brahmastra']) assert.ok(findBoon(id).scene, `${id} has a scene`);
});

// ---------- 5. Defence ----------
test('rule 5: holding block reduces damage', () => {
  const hit = (block) => {
    const m = match({ k: { x: -20, y: 0 }, r: { x: 15, y: 0 } });
    stepMatch(m, [{ block }, {}]);
    stepMatch(m, [{ block }, { a2: true }]);
    for (let i = 0; i < steps(0.3); i++) stepMatch(m, [{ block }, {}]);
    return 100 - m.players[K].hp;
  };
  assert.ok(hit(false) > 0);
  assert.ok(hit(true) < hit(false));
});

test('rule 5: holding block longer while the opponent prepares an attack makes it stronger', () => {
  const capAfter = (oppCasting) => {
    const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 100 } });
    const inp = [{ block: true }, { a1: oppCasting }]; // Raja Raja Chola holds a charged shot
    run(m, inp, 0.5); const c1 = m.players[K].block.cap;
    run(m, inp, 0.5); const c2 = m.players[K].block.cap;
    return [c1, c2];
  };
  const [idle1, idle2] = capAfter(false), [prep1, prep2] = capAfter(true);
  assert.ok(idle2 > idle1, 'longer = stronger');
  assert.ok(prep2 > idle2, 'stronger again while the opponent prepares');
});

test('rule 5: each character has a defence strength and type; barriers absorb a set amount', () => {
  for (const c of [mage, warrior]) {
    assert.ok(c.defence.type && c.defence.strength > 0 && c.defence.max >= c.defence.strength);
  }
  const m = match({ k: { x: -20, y: 0 }, r: { x: 20, y: 0 } });
  stepMatch(m, [{ block: true }, {}]);
  const cap = m.players[K].block.cap;
  m.hits.push({ target: m.players[K], dmg: 50, kb: 0, from: { x: 20, y: 0 } });
  stepMatch(m, [{ block: true }, {}]);
  assert.ok(Math.abs(m.players[K].hp - (100 - (50 - cap))) < 0.2, 'absorbs its amount, the rest goes through');
  assert.equal(m.walls.length, 0, 'used up, so it is gone');
});

test('rule 5: block builds a wall; let go and it stays in place at that size for 3 s, then disappears (owner change 2026-11-07)', () => {
  assert.equal(TUNE.block.standTime, 3);
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  run(m, [{ block: true }, {}], 1);
  const w = m.walls[0], cap = w.cap, at = [w.x, w.y];
  stepMatch(m, [{}, {}]); // let go
  assert.equal(m.players[K].block, null);
  run(m, [{ my: 1 }, {}], 1.5); // walk away
  assert.ok(m.players[K].y > 30, 'the fighter is free to move');
  assert.equal(m.walls.length, 1, 'the wall stays');
  assert.deepEqual([w.x, w.y, w.cap], [...at, cap], 'in place, at the size it was left');
  run(m, [{}, {}], 1.4);
  assert.equal(m.walls.length, 1, 'still there just before 3 s');
  run(m, [{}, {}], 0.2);
  assert.equal(m.walls.length, 0, 'gone after 3 s');
});

test('rule 5: a wall only protects what is behind it', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  run(m, [{ block: true }, {}], 0.5); stepMatch(m, [{}, {}]);
  m.hits.push({ target: m.players[K], dmg: 3, kb: 0, from: { x: 60, y: 0 } }); stepMatch(m);
  assert.equal(m.players[K].hp, 100, 'behind the wall: absorbed');
  run(m, [{ my: 1 }, {}], 1);
  m.hits.push({ target: m.players[K], dmg: 3, kb: 0, from: { x: 60, y: m.players[K].y } }); stepMatch(m);
  assert.equal(m.players[K].hp, 97, 'walked out from behind it: not protected');
});

test('rule 5: building stops after 3 s and the wall stands; let go before building another', () => {
  assert.equal(TUNE.block.buildTime, 3);
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  run(m, [{ block: true }, {}], 3.1);
  assert.equal(m.players[K].block, null);
  assert.ok(m.walls[0]?.standing, 'erected by itself');
  run(m, [{ block: true }, {}], 1);
  assert.equal(m.players[K].block, null, 'holding on does not start a new one');
  stepMatch(m, [{}, {}]); stepMatch(m, [{ block: true }, {}]);
  assert.ok(m.players[K].block, 'a new press builds a new one');
  assert.equal(m.walls.length, 2, 'the first wall still stands while a second is built elsewhere (owner, 2026-11-08)');
  run(m, [{}, {}], TUNE.block.standTime + 0.1);
  assert.ok(m.walls.every((w) => w !== m.walls[0] || w.standing), 'each wall lasts its own time');
  const n = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  for (let i = 0; i < 5; i++) { stepMatch(n, [{ block: true }, {}]); stepMatch(n, [{ block: true }, {}]); stepMatch(n, [{}, {}]); }
  assert.ok(n.walls.filter((w) => w.owner === K).length <= TUNE.block.maxWalls, `at most ${TUNE.block.maxWalls} walls at once`);
});

// ---------- 6. Clashes ----------
test('rule 6: moves collide only when they touch on screen', () => {
  const m = match({ k: { x: -80, y: -50 }, r: { x: 80, y: 50 } });
  m.projectiles.push({ id: 1, owner: K, x: 0, y: 0, vx: 0, vy: 0, r: 3, dmg: 5, kb: 0, life: 5, legs: 0, lt: 0, hitUnits: [] });
  m.projectiles.push({ id: 2, owner: R, x: 7, y: 0, vx: 0, vy: 0, r: 3, dmg: 5, kb: 0, life: 5, legs: 0, lt: 0, hitUnits: [] });
  stepMatch(m);
  assert.equal(m.projectiles.length, 2, '1px apart: no clash');
  m.projectiles[1].x = 6; stepMatch(m);
  assert.equal(m.projectiles.length, 0);
});

test('rule 6: higher damage wins and still hits, reduced by the weaker move; equal damage cancels both', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  m.projectiles.push({ id: 1, owner: K, x: 0, y: 0, vx: 0, vy: 0, r: 3, dmg: 12, kb: 0, life: 5, legs: 0, lt: 0, hitUnits: [] });
  m.projectiles.push({ id: 2, owner: R, x: 4, y: 0, vx: 0, vy: 0, r: 3, dmg: 4, kb: 0, life: 5, legs: 0, lt: 0, hitUnits: [] });
  stepMatch(m);
  assert.equal(m.projectiles.length, 1);
  assert.equal(m.projectiles[0].owner, K);
  assert.equal(m.projectiles[0].dmg, 8);
  m.projectiles[0].x = 78; stepMatch(m);
  assert.equal(m.players[R].hp, 92, 'the winner still hits for the reduced damage');
});

test('rule 6: both fighters always pay their full cost in a clash', () => {
  const m = match({ k: { x: -60, y: 0, power: 50 }, r: { x: 60, y: 0, power: 50 } });
  stepMatch(m, [{ a1: true }, { a1: true }]);
  const paid = m.players.map((p) => 50 + POWER.refill * STEP - p.power);
  run(m, [{}, {}], 1);
  assert.ok(events(m, 'clash').length >= 1);
  assert.ok(Math.abs(paid[K] - mage.moves.a1.cost.power) < 1e-6 && Math.abs(paid[R] - warrior.moves.a1.cost.power) < 1e-6);
});

// ---------- 7. Interruption ----------
test('rule 7: any hit breaks casting, and the cost is still spent; meditation is protected by its barrier (owner change 2026-11-08)', () => {
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0 } });
  tap(m, K, 's2'); run(m, [{}, {}], 0.5);
  const spent = 100 - m.players[K].power;
  m.hits.push({ target: m.players[K], dmg: 1, kb: 0, from: null });
  stepMatch(m);
  assert.equal(m.players[K].cast, null, 'cast broken');
  assert.ok(spent >= mage.moves.s2.cost.power - 3);
  assert.equal(events(m, 'release').filter((e) => e.pid === K).length, 0);

  const n = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(n, R, 'cls'); run(n, [{}, {}], 1);
  assert.ok(n.players[R].med);
  n.hits.push({ target: n.players[R], dmg: 5, kb: 0, from: null }); stepMatch(n);
  assert.ok(n.players[R].med, 'an ordinary hit lands on the barrier and does not break meditation');
  assert.equal(n.players[R].hp, 100);
  n.hits.push({ target: n.players[R], dmg: 5, kb: 0, from: null, divine: true }); stepMatch(n);
  assert.equal(n.players[R].med, null, 'a divine weapon goes through the barrier and breaks meditation');
  assert.equal(n.players[R].hp, 95);
});

// ---------- 8. Order within one instant ----------
test('rule 8: damage and healing apply together, then 0 health is checked', () => {
  const m = match({ r: { hp: 5 } });
  m.hits.push({ target: m.players[R], dmg: 8, kb: 0, from: null }, { target: m.players[R], heal: 10 });
  stepMatch(m);
  assert.equal(m.players[R].hp, 7, 'not knocked out first and then healed');
  assert.equal(m.phase, 'fight');
});

test('rule 8: movement comes before new moves, which come before clashes', () => {
  // A fighter that walks into close range and presses the close attack in the same instant gets the attack.
  const m = match({ k: { x: -40.5, y: 0 }, r: { x: 0, y: 0 } });
  stepMatch(m, [{ mx: 1, a2: true }, {}]);
  assert.equal(m.players[K].cast?.move.name, 'Palm push');
});

// ---------- 9. Temporary effects ----------
test('rule 9: effects have a set duration, the same kind does not stack, the strongest counts', () => {
  const m = match(), p = m.players[R];
  applyEffect(p, 'slow', 2, 0.3); applyEffect(p, 'slow', 2, 0.6); applyEffect(p, 'slow', 3, 0.4);
  assert.equal(p.effects.slow.mag, 0.6);
  applyEffect(p, 'hold', 1.5); applyEffect(p, 'hold', 3); applyEffect(p, 'hold', 1);
  assert.equal(p.effects.hold.t, 3);
  run(m, [{}, {}], 3.1);
  assert.deepEqual(Object.keys(p.effects), [], 'all run out');
});

test('rule 9: effects are visible on the fighter', () => {
  const r = src('render.js');
  for (const k of ['SLOW', 'HELD', 'STUN']) assert.ok(r.includes(`'${k}'`), `${k} label drawn`);
});

// ---------- 10. Traps (removed by the owner, 2026-11-08) ----------
test('rule 10: there are no traps: no trap buttons, no traps, floor marks or water patches (owner change 2026-11-08)', () => {
  assert.ok(!BUTTONS.some((b) => /trap/i.test(b)) && !ACTIONS.some((b) => /trap/i.test(b)));
  const m = match();
  assert.ok(!('traps' in m) && !('marks' in m) && !('waters' in m));
  assert.ok(!('trap' in TUNE));
});

// ---------- 11. Meditation, devotion and boons (owner change 2026-11-08) ----------
const M = TUNE.meditate;
test('rule 11: meditating fills a 10-segment devotion bar; only full segments count', () => {
  assert.equal(M.segments, 10);
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, R, 'cls'); run(m, [{}, {}], M.segTime * 3.5);
  assert.equal(m.players[R].devotion, 3);
  assert.ok(m.players[R].med.meter > 0, 'a fourth segment is part-filled');
  tap(m, R, 'block'); run(m, [{}, {}], 0.1);
  assert.equal(m.players[R].med, null, 'stopped');
  assert.equal(m.players[R].devotion, 3, 'the part-filled segment is lost, full ones are kept');
  tap(m, R, 'cls'); run(m, [{}, {}], M.segTime * 0.8);
  assert.equal(m.players[R].devotion, 3, 'a new meditation starts the next segment from empty');
  run(m, [{}, {}], M.segTime * 10);
  assert.equal(m.players[R].devotion, M.segments, 'the bar tops out at 10');
  assert.equal(m.players[R].med, null, 'meditation ends when the bar is full');
});

test('rule 11: two specials spend devotion: 3 = small boon, 6 = medium, 10 = divine weapon; random god; both players see it', () => {
  assert.deepEqual(M.tiers, [3, 6, 10]);
  assert.ok(!BUTTONS.includes('boon') && !ACTIONS.includes('boon'));
  for (const [have, tier, left] of [[3, 'small', 0], [5, 'small', 2], [6, 'medium', 0], [9, 'medium', 3], [10, 'divine', 0]]) {
    const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
    m.players[R].devotion = have;
    useBoon(m, R);
    const e = events(m, 'boon')[0];
    assert.ok(e && e.tier === tier && e.god && e.name, `${have} segments buy a ${tier} boon`);
    assert.equal(m.players[R].devotion, left);
  }
  for (const [a, b] of [['s1', 's2'], ['s2', 's3'], ['s1', 's3']]) {
    const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
    m.players[R].devotion = 3; useBoon(m, R, a, b);
    assert.equal(events(m, 'boon').length, 1, `${a}+${b}`);
  }
  // with less than 3 banked, two specials don't buy anything, and one special alone is just that special
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  m.players[R].devotion = 2;
  tap(m, R, 's1'); run(m, [{}, {}], TUNE.chord + 0.05);
  assert.equal(events(m, 'cast').filter((e) => e.pid === R)[0]?.name, 'Split shot');
  assert.equal(m.players[R].devotion, 2);
  assert.ok(src('main.js').includes("e.type === 'boon'"), 'the boon is announced on the shared screen');
});

test('rule 11: the meditation barrier soaks damage instead of health; breaking it ends meditation', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, R, 'cls'); run(m, [{}, {}], 0.5);
  assert.equal(m.players[R].med.barrier, M.barrier);
  m.hits.push({ target: m.players[R], dmg: M.barrier - 5, kb: 0, from: null }); stepMatch(m);
  assert.ok(m.players[R].med && m.players[R].hp === 100);
  m.hits.push({ target: m.players[R], dmg: 8, kb: 0, from: null }); stepMatch(m);
  assert.equal(m.players[R].med, null, 'barrier broken');
  assert.equal(m.players[R].hp, 97, 'what the barrier could not hold gets through');
  for (const id of ['pashupatastra', 'shakti', 'brahmastra']) assert.ok(findBoon(id).divine, `${id} is a divine weapon`);
  assert.equal(GODS.shiva.tiers[2].concat(GODS.murugan.tiers[2], GODS.brahma.tiers[2]).filter((b) => !b.divine).length, 0, 'every top-tier boon is divine');
});

// ---------- 12. Extra units and arena changes ----------
test('rule 12: helpers have their own health, can be hit, and disappear when their timer ends', () => {
  const m = match({ k: { x: -90 }, r: { x: 90 } });
  const u = spawnUnit(m, { owner: K, x: 0, y: 0, hp: 20, time: 3 });
  m.hits.push({ target: u, dmg: 5, kb: 0, from: null }); stepMatch(m);
  assert.equal(u.hp, 15);
  run(m, [{}, {}], 3);
  assert.equal(m.units.length, 0);
});

test('rule 12: only one arena change at a time, always with an end time', () => {
  const m = match();
  assert.equal(startArenaChange(m, { name: 'flood', time: Infinity }), false);
  assert.equal(startArenaChange(m, { name: 'flood', time: 5 }), true);
  assert.equal(startArenaChange(m, { name: 'maya', time: 5 }), false);
  run(m, [{}, {}], 5.1);
  assert.equal(m.arenaChange, null);
});

// ---------- 13. Arena ----------
test('rule 13: nobody leaves the round arena, it never grows, and being knocked into the edge costs health', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  run(m, [{ mx: -1, my: 1 }, { mx: 1, my: -1 }], 6);
  for (const p of m.players) assert.ok(Math.hypot(p.x, p.y) <= ARENA.r + 1e-6);
  assert.equal(m.players[K].hp, 100, 'walking into the edge is free');
  const n = match({ k: { x: ARENA.r - 50, y: 0 }, r: { x: ARENA.r - 30, y: 0 } }); // close to the edge
  tap(n, K, 'a2'); run(n, [{}, {}], 1);
  assert.ok(events(n, 'wall').length === 1);
  assert.ok(n.players[R].hp <= 100 - mage.moves.a2.damage - TUNE.wallDmg + 1e-6);
  assert.ok(!/ARENA\.r\s*[+\-*]?=/.test(src('sim.js')), 'the arena never grows');
});

// ---------- 14. Screen and controls ----------
test('rule 14: every fighter uses the same button layout, fully playable on a controller', () => {
  assert.deepEqual(ACTIONS, BUTTONS);
  for (const a of ACTIONS) { assert.ok(Number.isInteger(PAD[a]), `${a} on the pad`); for (const k of KEYS) assert.ok(k[a]?.length, `${a} on the keyboard`); }
  assert.equal(new Set(ACTIONS.map((a) => PAD[a])).size, ACTIONS.length, 'no two actions share a pad button');
  for (const c of [mage, warrior]) assert.deepEqual(Object.keys(c.moves).sort(), ['a1', 'a2', 'cls', 's1', 's2', 's3', 'sig']);
});

test('controls (owner, 2026-11-07/08): signature = all 3 specials together, meditate = down + special 1, no extra buttons', () => {
  assert.deepEqual(BUTTONS, ['a1', 'a2', 'block', 's1', 's2', 's3']);
  for (const [c, pid] of [[mage, K], [warrior, R]]) {
    const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0, power: 100 } });
    stepMatch(m, pid === K ? [{ s2: true }, {}] : [{}, { s2: true }]); // pressed a frame or two apart still counts
    stepMatch(m, pid === K ? [{ s1: true, s2: true, s3: true }, {}] : [{}, { s1: true, s2: true, s3: true }]);
    assert.equal(m.players[pid].cast?.move.name, c.moves.sig.name);
    const n = match({ k: { x: -90, y: 0, power: 100 }, r: { x: 90, y: 0 } });
    tap(n, pid, 's1', { my: 1 });
    assert.equal(events(n, 'meditate').filter((e) => e.pid === pid).length, 1);
    assert.ok(n.players[pid].med, `${c.name} meditates`);
  }
});

test('rule 14: one shared screen; both power bars are visible', () => {
  const r = src('render.js');
  assert.ok(/for \(const p of m\.players\)[\s\S]{0,600}p\.power \/ p\.ch\.power\.size/.test(r), 'the HUD draws a power bar for each player');
});

// ---------- 15. Character sheet ----------
test('rule 15: every fighter is defined by the same character sheet', () => {
  for (const c of [mage, warrior]) {
    assert.equal(c.health, 100);
    assert.ok(c.power.size > 0 && c.power.refill > 0 && c.speed > 0);
    assert.ok(c.defence.strength > 0 && c.defence.type);
    for (const s of ['a1', 'a2']) assert.ok(c.moves[s].range);
    assert.ok(c.moves.s1 && c.moves.sig?.signature && c.moves.cls);
  }
});

// ================= class rules =================
test('class: power bar size and refill speed are the same for every class', () => {
  assert.deepEqual(mage.power, warrior.power);
});

test('class: every character has 2 basic attacks + 1 block, each with their own special block', () => {
  for (const c of [mage, warrior]) assert.ok(c.moves.a1 && c.moves.a2 && c.defence);
  assert.notEqual(mage.defence.name, warrior.defence.name);
});

test('classes (owner, 2026-11-08): two classes, Mages and Warriors, and no Monsters', () => {
  assert.deepEqual(Object.values(CHARS).map((c) => c.cls).sort(), ['mage', 'warrior']);
  assert.ok(!Object.values(CHARS).some((c) => /monster|god|king/.test(c.cls)));
});

test('theme (owner, 2026-11-08): inspired by Hindu mythology; the fighters are original, the real gods only grant boons', () => {
  for (const c of Object.values(CHARS)) assert.ok(!/krishna|raja|chola|shiva|murugan|brahma|vishnu/i.test(`${c.id} ${c.name}`), c.name);
  assert.deepEqual(Object.keys(GODS).sort(), ['brahma', 'krishna', 'murugan', 'shiva']); // Krishna joined as a boon god (owner, 2026-11-08)
  assert.ok(src('render.js').includes('INSPIRED BY HINDU MYTHOLOGY'));
});

test('class: Mages are slow and can\'t run, but can blink for power; Warriors are fast', () => {
  assert.ok(mage.speed < warrior.speed);
  assert.ok(!BUTTONS.includes('run'));
  const blink = mage.moves.s3;
  assert.equal(blink.kind, 'blink'); assert.ok(blink.cost.power > 0);
  const m = match({ k: { x: -40, y: 0, power: 50 }, r: { x: 80 } });
  tap(m, K, 's3', { mx: 0, my: 1 });
  assert.ok(m.players[K].y > blink.distance - 2, 'blinked');
});

test('class: Mage basic moves are mostly mid/long range, weak up close', () => {
  assert.equal(mage.moves.a1.range, 'mid');
  assert.ok(mage.moves.a2.damage <= warrior.moves.a2.damage);
});

test('class: Brahmastra is a divine-weapon boon either class can earn; both fighters reach 0 = draw (owner change 2026-11-08)', () => {
  const b = findBoon('brahmastra');
  assert.ok(b.divine && b.selfKO && b.cast >= 4.5 && b.cast <= 5.5);
  for (const c of [mage, warrior]) assert.equal(c.moves.cls.kind, 'meditate', `${c.name}'s class move is meditation`);
  const m = match({ k: { x: -90 }, r: { x: 90 } });
  m.players[K].cast = { move: b, slot: 'boon', t: 0, dir: null };
  run(m, [{}, {}], b.cast + TUNE.scene + 0.2);
  assert.deepEqual(m.result, { winner: null, reason: 'brahmastra' });
});

test('class: a Warrior has one weapon, and his basic and special moves come from it', () => {
  assert.equal(warrior.weapon, 'bow');
  for (const s of ['a1', 'a2', 's1', 's2', 's3', 'sig']) assert.equal(warrior.moves[s].weapon, 'bow');
});

test('class: both classes meditate; it fills wherever the opponent is (owner, 2026-11-08), and the fighter can\'t move', () => {
  for (const [c, pid] of [[mage, K], [warrior, R]]) {
    const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
    tap(m, pid, 'cls');
    run(m, pid === K ? [{ mx: 1 }, {}] : [{}, { mx: -1 }], 2);
    assert.equal(m.players[pid].x, pid === K ? -100 : 100, `${c.name} can't move while meditating`);
    const filled = m.players[pid].med.meter, dv = m.players[pid].devotion;
    m.players[1 - pid].x = m.players[pid].x + (pid === K ? 1 : -1) * (M.dist - 5);
    run(m, [{}, {}], 1);
    assert.ok(m.players[pid].med.meter > filled || m.players[pid].devotion > dv, 'still fills with the opponent close by');
  }
});

test('class: the god who answers is random; nobody picks one (owner change 2026-11-07)', () => {
  assert.ok(!BUTTONS.includes('god'));
  const gods = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const m = match({ seed, k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
    m.players[R].devotion = 3; useBoon(m, R);
    gods.add(events(m, 'boon')[0].god);
  }
  assert.equal(gods.size, Object.keys(GODS).length, 'every god answers sometimes');
});

test('class: Brahmastra (a draw) is rare at good health and likely near the end of the health bar (owner, 2026-11-08)', () => {
  const rate = (hp) => {
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const m = match({ seed, k: { x: -60, y: 0 }, r: { x: 60, y: 0, hp } });
      m.players[R].devotion = 10; useBoon(m, R);
      if (events(m, 'boon')[0]?.name === 'Brahmastra') n++;
    }
    return n / 400;
  };
  const high = rate(90), low = rate(10);
  assert.ok(high < 0.1, `at 90% health Brahmastra came ${Math.round(high * 100)}% of the time`);
  assert.ok(low > 0.35, `at 10% health Brahmastra came only ${Math.round(low * 100)}% of the time`);
});

test('class: boons are strictly single-use: each one is paid for with devotion', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  m.players[R].devotion = 3;
  useBoon(m, R); run(m, [{}, {}], 0.5);
  useBoon(m, R); run(m, [{}, {}], 0.5);
  assert.equal(events(m, 'boon').length, 1);
  assert.equal(m.players[R].devotion, 0);
});

test('class: Brahmastra as a boon only ever comes from Brahma', () => {
  for (const [id, g] of Object.entries(GODS)) {
    const has = g.tiers.flat().some((b) => b.kind === 'brahmastra');
    assert.equal(has, id === 'brahma', id);
  }
});

test('class: Warriors make no arena changes', () => {
  assert.ok(!Object.values(warrior.moves).some((mv) => mv.kind === 'arena'));
});

// ================= character rules (CHARACTERS.md) =================
test('characters: signature moves have a ~4 s cast; no moving or blocking; a hit breaks it, the cost stays spent', () => {
  for (const c of [mage, warrior]) assert.ok(c.moves.sig.cast >= 3.5 && c.moves.sig.cast <= 4.5, c.name);
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0 } });
  tap(m, K, 'sig');
  run(m, [{ mx: 1, block: true }, {}], 2);
  assert.equal(m.players[K].x, -60); assert.equal(m.players[K].block, null);
  m.hits.push({ target: m.players[K], dmg: 1, kb: 0, from: null }); stepMatch(m);
  assert.equal(m.players[K].cast, null);
  assert.ok(m.players[K].power < 50 && m.players[K].hp < 90, 'power and health cost spent');
});

test('characters: the binding chant has a 2 s cast and then the opponent is held still for 3 s', () => {
  const v = mage.moves.s2;
  assert.equal(v.cast, 2); assert.deepEqual(v.effect, { kind: 'hold', time: 3 });
});

test('characters: Gaja Arrow pierces blocks', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 80, y: 0, power: 100 } });
  tap(m, R, 'sig');
  run(m, [{ block: true }, {}], warrior.moves.sig.cast + TUNE.scene + 1);
  assert.ok(m.players[K].hp <= 100 - warrior.moves.sig.damage + 1e-6);
});

test('characters: Brahma\'s boons are Kamandalu (10% health), Lotus seat (2x meditation) and Brahmastra', () => {
  assert.deepEqual(GODS.brahma.tiers.map((t) => t[0].id), ['kamandalu', 'lotus', 'brahmastra']);
  assert.equal(findBoon('kamandalu').heal, 10);
});

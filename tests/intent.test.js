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

const krishna = CHARS.krishna, raja = CHARS.rajaraja;
const allMoves = () => [krishna, raja].flatMap((c) => Object.values(c.moves))
  .concat(Object.values(GODS).flatMap((g) => g.tiers.flat()));
const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

// ---------- 1. Health ----------
test('rule 1: health starts at 100%, which is also the maximum; healing never goes above it', () => {
  const m = match();
  for (const p of m.players) assert.equal(p.hp, 100);
  m.players[R].hp = 95; m.players[R].boons = [{ id: 'kamandalu', name: 'Kamandalu', god: 'Brahma' }];
  useBoon(m, R); run(m, [{}, {}], 1);
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
  assert.ok(Math.abs(p1 - 2 * krishna.power.refill) < 1e-6, 'constant rate');
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
  for (const c of [krishna, raja]) {
    for (const s of ['a1', 'a2']) assert.ok(c.moves[s].cost.power <= 3, `${c.moves[s].name} is a basic move and costs very little power`);
    assert.ok(c.defence.cost <= 3, 'block is a basic move too');
  }
});

test('rule 4: long-distance special moves have no distance requirement', () => {
  for (const mv of allMoves().filter((x) => x.special && (x.range === 'long' || x.range === 'midlong'))) {
    assert.ok(rangeOK(mv, 0) && rangeOK(mv, 1000), mv.name);
  }
  assert.ok(!rangeOK(raja.moves.a1, 5), 'a basic mid/long move still needs distance');
});

test('rule 4: no cooldowns (a move can be used again as soon as the last one ends)', () => {
  const m = match({ k: { x: -60, power: 50 }, r: { x: 60 } });
  for (let i = 0; i < 3; i++) { tap(m, K, 'a1'); run(m, [{}, {}], krishna.moves.a1.cast); }
  assert.equal(events(m, 'release').filter((e) => e.pid === K).length, 3);
});

test('rule 4: a move only brings its own user to 0 health if it says so', () => {
  const m = match({ k: { hp: 10, power: 100 } });
  assert.equal(whyNot(m, m.players[K], krishna.moves.sig), 'NO HEALTH');
  for (const mv of allMoves()) if (mv.selfKO) assert.equal(mv.kind, 'brahmastra');
  m.players[K].hp = 3;
  assert.equal(whyNot(m, m.players[K], krishna.moves.cls), null, 'Brahmastra says so');
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
  tap(m, R, 'a1'); run(m, [{}, {}], raja.moves.a1.cast);
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
  tap(c, K, 's1'); run(c, [{}, {}], krishna.moves.s1.cast);
  let turns = 0, prev = null;
  for (let i = 0; i < steps(2) && c.projectiles.length; i++) {
    stepMatch(c, [{}, { my: -1 }]);
    const p = c.projectiles[0];
    if (p && prev && (p.vx !== prev[0] || p.vy !== prev[1])) { turns++; assert.ok(p.lt === 0, 'turns only between legs'); }
    if (p) prev = [p.vx, p.vy];
  }
  assert.ok(turns <= krishna.moves.s1.legs - 1);
});

test('rule 4: power moves get a short dramatic scene, and the game pauses for both players', () => {
  const m = match({ k: { x: -60 }, r: { x: 80, power: 100 } });
  tap(m, R, 'sig'); run(m, [{}, {}], raja.moves.sig.cast);
  assert.equal(m.scene?.name, 'Tiger Arrow');
  const before = JSON.stringify({ k: [m.players[K].x, m.players[K].power], r: m.players[R].power, t: m.timeLeft });
  run(m, [{ mx: 1, a1: true }, { mx: -1 }], TUNE.scene * 0.9);
  assert.equal(JSON.stringify({ k: [m.players[K].x, m.players[K].power], r: m.players[R].power, t: m.timeLeft }), before, 'nothing moves during the scene');
  for (const c of [krishna, raja]) assert.ok(c.moves.sig.scene, `${c.moves.sig.name} has a scene`);
  assert.ok(krishna.moves.cls.scene && findBoon('brahmastra').scene);
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
  for (const c of [krishna, raja]) {
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
  assert.equal(m.walls.length, 1, 'one wall per fighter: the new one replaces the old');
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
  assert.ok(Math.abs(paid[K] - krishna.moves.a1.cost.power) < 1e-6 && Math.abs(paid[R] - raja.moves.a1.cost.power) < 1e-6);
});

// ---------- 7. Interruption ----------
test('rule 7: any hit breaks casting and meditation, and the cost is still spent', () => {
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0 } });
  tap(m, K, 's2'); run(m, [{}, {}], 0.5);
  const spent = 100 - m.players[K].power;
  m.hits.push({ target: m.players[K], dmg: 1, kb: 0, from: null });
  stepMatch(m);
  assert.equal(m.players[K].cast, null, 'cast broken');
  assert.ok(spent >= krishna.moves.s2.cost.power - 3);
  assert.equal(events(m, 'release').filter((e) => e.pid === K).length, 0);

  const n = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(n, R, 'cls'); run(n, [{}, {}], 1);
  assert.ok(n.players[R].med);
  n.hits.push({ target: n.players[R], dmg: 1, kb: 0, from: null }); stepMatch(n);
  assert.equal(n.players[R].med, null, 'meditation broken');
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

// ---------- 10. Traps ----------
const trapMatch = () => match({ k: { x: -15, y: 0, power: 100 }, r: { x: 15, y: 0, power: 100 } });
const setTrap = (m, pid, kind = 'trapPlant') => {
  tap(m, pid, 'a2', { [kind]: true }); run(m, [{}, {}], 0.3);
  Object.assign(m.players[K], { x: -15, y: 0, kvx: 0, kvy: 0 }); Object.assign(m.players[R], { x: 15, y: 0, kvx: 0, kvy: 0 }); // back to close range
};

test('rule 10: up to 3 active traps per fighter; one comes back when one goes off', () => {
  const m = trapMatch();
  for (let i = 0; i < 5; i++) { setTrap(m, K); m.players[K].power = 100; }
  assert.equal(m.traps.filter((t) => t.owner === K).length, 3);
  m.traps.sort((a, b) => a.t - b.t);
  m.traps[0].t = STEP; m.players[R].x = 80; m.players[K].x = -80;
  stepMatch(m);
  assert.equal(m.players[K].trapsActive, 2);
  m.players[K].x = -15; m.players[R].x = 15;
  setTrap(m, K);
  assert.equal(m.traps.filter((t) => t.owner === K).length, 3);
});

test('rule 10: a planted trap can only be set close to the opponent', () => {
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0 } });
  setTrap(m, K);
  assert.equal(m.traps.length, 0);
});

test('rule 10: traps go off after a random 5-30 s and hurt anyone on them, including the setter', () => {
  const delays = [];
  for (let seed = 1; seed < 40; seed++) {
    const m = trapMatch(); m.rand = createMatch({ seed }).rand;
    setTrap(m, K); delays.push(m.traps[0].t + 0.3 - 0.12);
  }
  assert.ok(delays.every((d) => d >= 5 - 0.01 && d <= 30 + 0.01), 'between 5 and 30 s');
  assert.ok(new Set(delays.map((d) => Math.round(d))).size > 5, 'random');
  const m = trapMatch(); setTrap(m, K);
  const tr = m.traps[0]; m.players[K].x = tr.x; m.players[K].y = tr.y; m.players[R].x = 80;
  const hp = m.players[K].hp; tr.t = STEP; stepMatch(m);
  assert.ok(m.players[K].hp < hp, 'the setter is hurt');
});

test('rule 10: a water trap turns ground to water and slows anyone in it', () => {
  const m = trapMatch(); setTrap(m, R, 'trapWater');
  const tr = m.traps[0]; tr.t = STEP;
  m.players[R].x = tr.x; m.players[R].y = tr.y; m.players[K].x = -80;
  stepMatch(m); stepMatch(m);
  assert.equal(m.waters.length, 1);
  assert.ok(m.players[R].effects.slow, 'the setter is slowed too');
});

test('rule 10: the trap cost is paid normally, when the trap is set', () => {
  const m = trapMatch(); m.players[K].power = 50;
  stepMatch(m, [{ a2: true, trapPlant: true }, {}]);
  assert.ok(Math.abs(50 + POWER.refill * STEP - m.players[K].power - (krishna.moves.a2.cost.power + TUNE.trap.cost)) < 1e-6);
});

test('rule 10: a trap is set with the normal close attack and its mark looks exactly like a floor scuff', () => {
  const a = trapMatch(), b = trapMatch();
  setTrap(a, K); tap(b, K, 'a2'); run(b, [{}, {}], 0.3);
  assert.equal(a.traps.length, 1); assert.equal(b.traps.length, 0);
  assert.deepEqual(events(a, 'cast').map((e) => e.slot), events(b, 'cast').map((e) => e.slot), 'same move, same swing');
  assert.equal(a.marks.length, 1); assert.equal(b.marks.length, 1);
  assert.deepEqual(Object.keys(a.marks[0]).sort(), Object.keys(b.marks[0]).sort());
  assert.ok(!/\.traps\b/.test(src('render.js')), 'the renderer never looks at hidden traps');
});

test('rule 10: no controller vibration', () => {
  for (const f of ['input.js', 'main.js', 'render.js', 'sim.js']) assert.ok(!/vibrat|rumble|haptic/i.test(src(f).replace(/\/\/.*$/gm, '')), f);
});

// ---------- 11. Boons ----------
test('rule 11: 1 boon at a time, and both players see which boon was granted (owner change 2026-11-07)', () => {
  assert.equal(TUNE.maxBoons, 1);
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, R, 'cls'); run(m, [{}, {}], 10.5);
  assert.equal(m.players[R].boons.length, 1);
  tap(m, R, 'cls'); run(m, [{}, {}], 10.5);
  assert.equal(m.players[R].boons.length, 1, 'can\'t get a second boon while holding one');
  assert.equal(m.players[R].meditations, 1);
  const grants = events(m, 'boon');
  assert.equal(grants.length, 1);
  assert.ok(grants.every((e) => e.name && e.god));
  assert.ok(src('main.js').includes("e.type === 'boon'"), 'the boon is announced on the shared screen');
});

test('rule 11: a boon is used by pressing two special buttons together; there is no boon button', () => {
  assert.ok(!BUTTONS.includes('boon') && !ACTIONS.includes('boon'));
  for (const [a, b] of [['s1', 's2'], ['s2', 's3'], ['s1', 's3']]) {
    const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
    m.players[R].boons = [{ id: 'vel', name: 'Vel throw', god: 'Murugan' }];
    useBoon(m, R, a, b);
    assert.equal(m.players[R].boons.length, 0, `${a}+${b}`);
    assert.equal(m.players[R].cast?.move.name, 'Vel throw');
  }
  // one special alone still fires the special (after a short wait for a second button)
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  m.players[R].boons = [{ id: 'vel', name: 'Vel throw', god: 'Murugan' }];
  tap(m, R, 's1'); run(m, [{}, {}], TUNE.chord + 0.05);
  assert.equal(m.players[R].boons.length, 1);
  assert.equal(events(m, 'cast').filter((e) => e.pid === R)[0]?.name, 'Split shot');
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
  const n = match({ k: { x: 60, y: 0 }, r: { x: 80, y: 0 } });
  tap(n, K, 'a2'); run(n, [{}, {}], 1);
  assert.ok(events(n, 'wall').length === 1);
  assert.ok(n.players[R].hp <= 100 - krishna.moves.a2.damage - TUNE.wallDmg + 1e-6);
  assert.ok(!/ARENA\.r\s*[+\-*]?=/.test(src('sim.js')), 'the arena never grows');
});

// ---------- 14. Screen and controls ----------
test('rule 14: every fighter uses the same button layout, fully playable on a controller', () => {
  assert.deepEqual(ACTIONS, BUTTONS);
  for (const a of ACTIONS) { assert.ok(Number.isInteger(PAD[a]), `${a} on the pad`); for (const k of KEYS) assert.ok(k[a]?.length, `${a} on the keyboard`); }
  assert.equal(new Set(ACTIONS.map((a) => PAD[a])).size, ACTIONS.length, 'no two actions share a pad button');
  for (const c of [krishna, raja]) assert.deepEqual(Object.keys(c.moves).sort(), ['a1', 'a2', 'cls', 's1', 's2', 's3', 'sig']);
});

test('controls (owner, 2026-11-07): signature = all 3 specials together, class move = down + special 1, no extra buttons', () => {
  assert.deepEqual(BUTTONS, ['a1', 'a2', 'block', 'trapPlant', 'trapWater', 's1', 's2', 's3']);
  for (const [c, pid] of [[krishna, K], [raja, R]]) {
    const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0, power: 100 } });
    stepMatch(m, pid === K ? [{ s2: true }, {}] : [{}, { s2: true }]); // pressed a frame or two apart still counts
    stepMatch(m, pid === K ? [{ s1: true, s2: true, s3: true }, {}] : [{}, { s1: true, s2: true, s3: true }]);
    assert.equal(m.players[pid].cast?.move.name, c.moves.sig.name);
    const n = match({ k: { x: -90, y: 0, power: 100, hp: 4 }, r: { x: 90, y: 0 } });
    tap(n, pid, 's1', { my: 1 });
    const started = events(n, 'cast').concat(events(n, 'meditate')).filter((e) => e.pid === pid);
    assert.equal(started.length, 1);
    assert.ok(pid === K ? started[0].name === 'Brahmastra' : n.players[R].med, c.moves.cls.name);
  }
});

test('rule 14: one shared screen; both power bars are visible', () => {
  const r = src('render.js');
  assert.ok(/for \(const p of m\.players\)[\s\S]{0,600}p\.power \/ p\.ch\.power\.size/.test(r), 'the HUD draws a power bar for each player');
});

// ---------- 15. Character sheet ----------
test('rule 15: every fighter is defined by the same character sheet', () => {
  for (const c of [krishna, raja]) {
    assert.equal(c.health, 100);
    assert.ok(c.power.size > 0 && c.power.refill > 0 && c.speed > 0);
    assert.ok(c.defence.strength > 0 && c.defence.type);
    for (const s of ['a1', 'a2']) assert.ok(c.moves[s].range);
    assert.ok(c.moves.s1 && c.moves.sig?.signature && c.moves.cls);
  }
});

// ================= class rules =================
test('class: power bar size and refill speed are the same for every class', () => {
  assert.deepEqual(krishna.power, raja.power);
});

test('class: every character has 2 basic attacks + 1 block, each with their own special block', () => {
  for (const c of [krishna, raja]) assert.ok(c.moves.a1 && c.moves.a2 && c.defence);
  assert.notEqual(krishna.defence.name, raja.defence.name);
});

test('class: Gods are slow and can\'t run, but can blink for power; Kings are fast', () => {
  assert.ok(krishna.speed < raja.speed);
  assert.ok(!BUTTONS.includes('run'));
  const blink = krishna.moves.s3;
  assert.equal(blink.kind, 'blink'); assert.ok(blink.cost.power > 0);
  const m = match({ k: { x: -40, y: 0, power: 50 }, r: { x: 80 } });
  tap(m, K, 's3', { mx: 0, my: 1 });
  assert.ok(m.players[K].y > blink.distance - 2, 'blinked');
});

test('class: God basic moves are mostly mid/long range, weak up close', () => {
  assert.equal(krishna.moves.a1.range, 'mid');
  assert.ok(krishna.moves.a2.damage <= raja.moves.a2.damage);
});

test('class: Brahmastra needs health below 5% plus all power; a long chant; both reach 0 = draw', () => {
  const b = krishna.moves.cls;
  assert.ok(b.cast >= 4.5 && b.cast <= 5.5);
  const m = match({ k: { x: -90, hp: 6, power: 100 }, r: { x: 90 } });
  assert.ok(whyNot(m, m.players[K], b));
  m.players[K].hp = 4; m.players[K].power = 99;
  assert.ok(whyNot(m, m.players[K], b));
  m.players[K].power = 100;
  assert.equal(whyNot(m, m.players[K], b), null);
  tap(m, K, 'cls');
  assert.ok(m.players[K].power < 0.1, 'all power spent');
  run(m, [{}, {}], b.cast + TUNE.scene + 0.2);
  assert.deepEqual(m.result, { winner: null, reason: 'brahmastra' });
});

test('class: a King has one weapon, and his basic and special moves come from it', () => {
  assert.equal(raja.weapon, 'bow');
  for (const s of ['a1', 'a2', 's1', 's2', 's3', 'sig']) assert.equal(raja.moves[s].weapon, 'bow');
});

test('class: meditation fills only while the opponent is far, the King can\'t move, 5-10 s', () => {
  for (const t of TUNE.meditate.times) assert.ok(t >= 5 && t <= 10);
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, R, 'cls');
  run(m, [{}, { mx: -1 }], 2);
  assert.equal(m.players[R].x, 100, 'can\'t move while meditating');
  const filled = m.players[R].med.meter;
  m.players[K].x = 100 - TUNE.meditate.dist + 5;
  run(m, [{}, {}], 1);
  assert.equal(m.players[R].med.meter, filled, 'no progress while the opponent is close');
});

const tierOf = (id) => Object.values(GODS).map((g) => g.tiers.findIndex((t) => t.some((b) => b.id === id))).find((i) => i >= 0);

test('class: a hit loses only that attempt; completed meditations always count; boons get bigger', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, R, 'cls'); run(m, [{}, {}], TUNE.meditate.times[0] + 0.1);
  assert.equal(m.players[R].meditations, 1);
  assert.equal(tierOf(m.players[R].boons[0].id), 0, '1st = small');
  m.players[R].boons = []; // used
  tap(m, R, 'cls'); run(m, [{}, {}], 2);
  m.hits.push({ target: m.players[R], dmg: 1, kb: 0, from: null }); stepMatch(m);
  assert.equal(m.players[R].meditations, 1, 'not reset by the hit');
  tap(m, R, 'cls'); run(m, [{}, {}], TUNE.meditate.times[1] + 0.1);
  assert.equal(m.players[R].meditations, 2);
  assert.equal(tierOf(m.players[R].boons[0].id), 1, '2nd = medium');
});

test('class: the god who answers a meditation is random; the King does not pick one (owner change 2026-11-07)', () => {
  assert.ok(!BUTTONS.includes('god'));
  const gods = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const m = match({ seed, k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
    tap(m, R, 'cls'); run(m, [{}, {}], TUNE.meditate.times[0] + 0.1);
    gods.add(events(m, 'boon')[0].god);
  }
  assert.equal(gods.size, raja.gods.length, 'every god answers sometimes');
});

test('class: boons are strictly single-use', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  m.players[R].boons = [{ id: 'vel', name: 'Vel throw', god: 'Murugan' }];
  useBoon(m, R); run(m, [{}, {}], 0.5);
  assert.equal(m.players[R].boons.length, 0);
  useBoon(m, R); run(m, [{}, {}], 0.5);
  assert.equal(events(m, 'release').filter((e) => e.name === 'Vel throw').length, 1);
});

test('class: Brahmastra as a boon only ever comes from Brahma', () => {
  for (const [id, g] of Object.entries(GODS)) {
    const has = g.tiers.flat().some((b) => b.kind === 'brahmastra');
    assert.equal(has, id === 'brahma', id);
  }
});

test('class: Kings make no arena changes', () => {
  assert.ok(!Object.values(raja.moves).some((mv) => mv.kind === 'arena'));
});

// ================= character rules (CHARACTERS.md) =================
test('characters: signature moves have a ~4 s cast; no moving or blocking; a hit breaks it, the cost stays spent', () => {
  for (const c of [krishna, raja]) assert.ok(c.moves.sig.cast >= 3.5 && c.moves.sig.cast <= 4.5, c.name);
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 60, y: 0 } });
  tap(m, K, 'sig');
  run(m, [{ mx: 1, block: true }, {}], 2);
  assert.equal(m.players[K].x, -60); assert.equal(m.players[K].block, null);
  m.hits.push({ target: m.players[K], dmg: 1, kb: 0, from: null }); stepMatch(m);
  assert.equal(m.players[K].cast, null);
  assert.ok(m.players[K].power < 50 && m.players[K].hp < 90, 'power and health cost spent');
});

test('characters: Venu Ganam has a 2 s cast and then the King is held still for 3 s', () => {
  const v = krishna.moves.s2;
  assert.equal(v.cast, 2); assert.deepEqual(v.effect, { kind: 'hold', time: 3 });
});

test('characters: Tiger Arrow pierces blocks', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 80, y: 0, power: 100 } });
  tap(m, R, 'sig');
  run(m, [{ block: true }, {}], raja.moves.sig.cast + TUNE.scene + 1);
  assert.ok(m.players[K].hp <= 100 - raja.moves.sig.damage + 1e-6);
});

test('characters: Brahma\'s boons are Kamandalu (10% health), Lotus seat (2x meditation) and Brahmastra', () => {
  assert.deepEqual(GODS.brahma.tiers.map((t) => t[0].id), ['kamandalu', 'lotus', 'brahmastra']);
  assert.equal(findBoon('kamandalu').heal, 10);
  assert.ok(!Object.keys(GODS).includes('krishna'), 'praying to Krishna is left out for now');
});

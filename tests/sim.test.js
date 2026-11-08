// Mechanics: every move does what its data says. (The owner's rules are in intent.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch } from '../src/sim.js';
import { TUNE } from '../src/config.js';
import { CHARS } from '../src/chars/index.js';
import { findBoon } from '../src/chars/gods.js';
import { rng } from '../src/util.js';
import { match, run, tap, useBoon, events, K, R } from './helpers.js';

const mage = CHARS.siddhan, warrior = CHARS.veeran;
// start casting a boon move directly (normally bought with devotion)
const castBoon = (m, pid, id) => { m.players[pid].cast = { move: findBoon(id), slot: 'boon', t: 0, dir: null }; };

test('flute note travels and hits for its damage', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 40, y: 0 } });
  tap(m, K, 'a1'); run(m, [{}, {}], 1);
  assert.equal(m.players[R].hp, 100 - mage.moves.a1.damage);
});

test('a charged shot does more damage than a tapped one', () => {
  const dmg = (hold) => {
    const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
    run(m, [{}, { a1: true }], hold); run(m, [{}, {}], 1);
    return 100 - m.players[K].hp;
  };
  assert.ok(Math.abs(dmg(0.05) - warrior.moves.a1.damage) < 0.2, 'a tap is the small damage');
  assert.equal(dmg(warrior.moves.a1.charge.max + 0.5), warrior.moves.a1.charge.damage);
  assert.ok(dmg(0.6) > dmg(0.05) && dmg(0.6) < dmg(2));
});

test('basic attacks are refused out of range', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  tap(m, K, 'a2');
  assert.equal(m.players[K].cast, null);
  assert.equal(m.players[K].msg.text, 'TOO FAR');
  m.players[R].x = -45; tap(m, K, 'a1');
  assert.equal(m.players[K].msg.text, 'TOO CLOSE');
});

test('palm push knocks back hard', () => {
  const m = match({ k: { x: -20, y: 0 }, r: { x: 0, y: 0 } });
  tap(m, K, 'a2'); run(m, [{}, {}], 1);
  assert.ok(m.players[R].x > 30);
});

test('Sudarshana Chakra re-aims and catches a fighter who sidesteps once', () => {
  const m = match({ k: { x: -80, y: 0, power: 100 }, r: { x: 60, y: 0 } });
  tap(m, K, 's1'); run(m, [{}, {}], mage.moves.s1.cast);
  run(m, [{}, { my: 1 }], 0.4); run(m, [{}, {}], 3);
  assert.equal(m.players[R].hp, 100 - mage.moves.s1.damage);
});

test('the binding chant holds the Warrior still for 3 s (he can still act)', () => {
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 40, y: 0 } });
  tap(m, K, 's2'); run(m, [{}, {}], 2 + 1);
  assert.ok(m.players[R].effects.hold);
  const x = m.players[R].x; run(m, [{}, { mx: 1 }], 1);
  assert.ok(Math.abs(m.players[R].x - x) < 1);
  run(m, [{}, {}], 2); run(m, [{}, { mx: 1 }], 0.5);
  assert.ok(m.players[R].x > x + 10, 'free again');
});

test('a block stops the binding chant\'s hold', () => {
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 40, y: 0 } });
  tap(m, K, 's2'); run(m, [{}, { block: true }], 3);
  assert.ok(!m.players[R].effects.hold);
});

test('blink with no direction goes away from the opponent and stays inside the arena', () => {
  const m = match({ k: { x: -90, y: 0, power: 50 }, r: { x: 0, y: 0 } });
  tap(m, K, 's3');
  assert.ok(m.players[K].x < -90 && Math.hypot(m.players[K].x, m.players[K].y) <= 110);
});

test('Thousand-Arm Form hits across the whole arena after its scene', () => {
  const m = match({ k: { x: -100, y: 0, power: 100 }, r: { x: 100, y: 0 } });
  tap(m, K, 'sig'); run(m, [{}, {}], mage.moves.sig.cast + TUNE.scene + 0.1);
  assert.equal(m.players[R].hp, 100 - mage.moves.sig.damage);
  assert.equal(m.players[K].hp, 100 - mage.moves.sig.cost.health);
});

test('split shot fires 3 arrows in a fan', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  tap(m, R, 's1'); run(m, [{}, {}], warrior.moves.s1.cast);
  assert.equal(m.projectiles.length, 3);
  assert.equal(new Set(m.projectiles.map((p) => p.vy.toFixed(2))).size, 3);
});

test('pinning arrow pins for ~1.5 s from any distance', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0, power: 50 } });
  tap(m, R, 's2'); run(m, [{}, {}], 1.3);
  assert.ok(m.players[K].effects.hold && m.players[K].effects.hold.t <= 1.5);
});

test('arrow rain lands on the opponent\'s spot after a warning, and can be walked out of', () => {
  const hitAfter = (walk) => {
    const m = match({ k: { x: -40, y: 0 }, r: { x: 60, y: 0, power: 50 } });
    tap(m, R, 's3'); run(m, [{}, {}], warrior.moves.s3.cast);
    assert.equal(m.areas.length, 1);
    run(m, [walk ? { my: 1 } : {}, {}], 1);
    return 100 - m.players[K].hp;
  };
  assert.equal(hitAfter(false), warrior.moves.s3.damage);
  assert.equal(hitAfter(true), 0);
});

test('boons: Damaru stuns (no moves, no block), Peacock dash can\'t be hit, Shakti Vel pierces block', () => {
  const m = match({ k: { x: -40, y: 0 }, r: { x: 40, y: 0 } });
  castBoon(m, R, 'damaru'); run(m, [{}, {}], 0.8);
  assert.ok(m.players[K].effects.stun);
  stepMatch(m, [{ a1: true, block: true }, {}]);
  assert.equal(m.players[K].cast, null); assert.equal(m.players[K].block, null);

  const d = match({ k: { x: -40, y: 0 }, r: { x: 40, y: 0 } });
  castBoon(d, R, 'peacock'); stepMatch(d);
  d.hits.push({ target: d.players[R], dmg: 10, kb: 0, from: null }); stepMatch(d);
  assert.equal(d.players[R].hp, 100);
  run(d, [{}, {}], 0.2);
  assert.ok(d.players[R].x > 60, 'dashed away');

  const s = match({ k: { x: -40, y: 0 }, r: { x: 60, y: 0 } });
  castBoon(s, R, 'shakti'); run(s, [{ block: true }, {}], findBoon('shakti').cast + TUNE.scene + 1); // a divine weapon: its scene plays first
  assert.equal(s.players[K].hp, 100 - findBoon('shakti').damage);
});

test('Lotus seat makes the next meditation twice as fast, then it is used up', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  castBoon(m, R, 'lotus'); run(m, [{}, {}], 0.5);
  assert.ok(m.players[R].lotus);
  tap(m, R, 'cls'); run(m, [{}, {}], (TUNE.meditate.segTime / 2) * 3 + 0.05);
  assert.equal(m.players[R].devotion, 3, 'segments fill twice as fast');
  tap(m, R, 'block'); run(m, [{}, {}], 0.1);
  assert.equal(m.players[R].lotus, false, 'used up when that meditation ends');
});

test('pressing a move while meditating stops the meditation', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, R, 'cls'); run(m, [{}, {}], 1); tap(m, R, 'a1');
  assert.equal(m.players[R].med, null);
});

test('meditation is refused when the devotion bar is already full', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  m.players[R].devotion = TUNE.meditate.segments;
  tap(m, R, 'cls');
  assert.equal(m.players[R].med, null); assert.equal(m.players[R].msg.text, 'DEVOTION FULL');
});

test('two specials pressed a few frames apart still count as the boon chord', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  m.players[R].devotion = 3;
  run(m, [{}, { s2: true }], 0.05); run(m, [{}, { s2: true, s3: true }], 0.05); run(m, [{}, {}], 0.1);
  assert.equal(m.players[R].devotion, 0, 'devotion spent');
  const boon = events(m, 'boon')[0];
  assert.ok(boon, 'a boon was bought');
  assert.ok(!events(m, 'cast').some((e) => e.pid === R && ['Split shot', 'Pinning arrow', 'Arrow rain'].includes(e.name)), 'no special went off');
});

test('a special goes off after the short combo wait', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  stepMatch(m, [{}, { s1: true }]);
  assert.equal(m.players[R].cast, null, 'waiting to see if more specials join');
  run(m, [{}, {}], TUNE.chord);
  assert.equal(m.players[R].cast?.move.name, 'Split shot');
});

test('two specials with less than 3 devotion just fire the first one', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  tap(m, R, 's1', { s2: true });
  assert.equal(m.players[R].cast?.move.name, 'Split shot');
});

test('special 1 while moving sideways is still special 1 (only a clear down is the class move)', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  tap(m, R, 's1', { mx: 1, my: 0.3 });
  assert.equal(m.players[R].cast?.move.name, 'Split shot');
});

test('fighters never overlap', () => {
  const m = match({ k: { x: -30, y: 0 }, r: { x: 30, y: 0 } });
  run(m, [{ mx: 1 }, { mx: -1 }], 2);
  assert.ok(Math.hypot(m.players[0].x - m.players[1].x, m.players[0].y - m.players[1].y) >= TUNE.fighterR * 2 - 1e-6);
});

// A random mash of buttons for a whole match: no crash, numbers stay sane, and the same seed replays exactly.
function mash(seed, seconds) {
  const m = createMatch({ seed, time: 60 }), r = rng(seed * 7 + 1);
  const keys = ['a1', 'a2', 'block', 's1', 's2', 's3'];
  let inp = [{}, {}];
  for (let i = 0; i < seconds * 60 && m.phase === 'fight'; i++) {
    if (i % 12 === 0) inp = [0, 1].map(() => { const o = { mx: r() * 2 - 1, my: r() * 2 - 1 }; for (const k of keys) o[k] = r() < 0.12; return o; });
    stepMatch(m, inp);
    for (const p of m.players) {
      assert.ok(p.hp >= 0 && p.hp <= 100 && p.power >= 0 && p.power <= 100, 'bars stay in range');
      assert.ok(Math.hypot(p.x, p.y) <= 110 + 1e-6, 'inside the arena');
      assert.ok(p.devotion >= 0 && p.devotion <= TUNE.meditate.segments, 'devotion stays in range');
    }
  }
  return m;
}

test('a random button-mash match runs to the end and replays identically from its seed', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const a = mash(seed, 70), b = mash(seed, 70);
    assert.equal(a.phase, 'done', `seed ${seed} finished`);
    assert.deepEqual(a.players.map((p) => [p.x, p.y, p.hp, p.power]), b.players.map((p) => [p.x, p.y, p.hp, p.power]));
  }
});

// The small boons added on 2026-11-21 (owner): Narada's Mischief and Murugan's Peacock Ride.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findBoon } from '../src/chars/gods.js';
import { airborne, scramble } from '../src/sim.js';
import { match, run, useBoon, events, K, R } from './helpers.js';

const give = (m, pid, id, god) => { const b = findBoon(id); m.players[pid].boon = { move: b, name: b.name, god, godId: god.toLowerCase(), tier: 'small' }; useBoon(m, pid); return b; };

test('Vel throw is gone', () => assert.equal(findBoon('vel'), null));

test("Narada's Mischief scrambles all the opponent's controls at random for 4 s, then they come back", () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  const b = give(m, K, 'narada', 'Narada');
  run(m, [{}, {}], b.cast + 0.1);
  const c = m.players[R].effects.confuse;
  assert.ok(c && c.map, 'the opponent is under it, with a scramble');
  assert.equal(events(m, 'confuse').length, 1);
  const btn = ['a1', 'a2', 'block', 's1', 's2', 's3'];
  assert.deepEqual(Object.values(c.map.buttons).sort(), [...btn].sort(), 'every button still does something');
  assert.ok(btn.every((k) => c.map.buttons[k] !== k), 'no button keeps its own job');
  const out = scramble({ mx: 1, my: 0 }, c.map);
  assert.ok(!(out.mx === 1 && out.my === 0), 'the stick does not point where it is pushed');
  const p = m.players[R], x0 = p.x, y0 = p.y; run(m, [{}, { mx: 1 }], 0.4);
  assert.ok(Math.sign(Math.round(p.x - x0)) === Math.sign(out.mx) && Math.sign(Math.round(p.y - y0)) === Math.sign(out.my), 'they walk the scrambled way');
  run(m, [{}, {}], b.time);
  assert.equal(m.players[R].effects.confuse, undefined, 'it wears off');
  const x1 = m.players[R].x; run(m, [{}, { mx: -1 }], 0.3);
  assert.ok(m.players[R].x < x1, 'left is left again');
});

test("Narada's Mischief: a different scramble from a different match seed", () => {
  const maps = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    const m = match({ seed, k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
    const b = give(m, K, 'narada', 'Narada'); run(m, [{}, {}], b.cast + 0.1);
    maps.add(JSON.stringify(m.players[R].effects.confuse.map));
  }
  assert.ok(maps.size > 1, 'not always the same scramble');
});

test("Narada's Mischief ends early when a hit gets through", () => {
  const m = match({ k: { x: -30, y: 0, power: 100 }, r: { x: 30, y: 0 } });
  const b = give(m, K, 'narada', 'Narada');
  run(m, [{}, {}], b.cast + 0.1);
  assert.ok(m.players[R].effects.confuse);
  m.hits.push({ target: m.players[R], dmg: 3, kb: 0, hit: true, from: null, src: 'test', by: K });
  run(m, [{}, {}], 0.05);
  assert.equal(m.players[R].effects.confuse, undefined);
});

test('Peacock Ride: flies fast for 5 s with no power cost, any fighter, then lands', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  const b = give(m, R, 'peacock', 'Murugan'); // the warrior, who can't fly on his own
  run(m, [{}, {}], b.cast + b.lift + 0.1);
  const p = m.players[R];
  assert.ok(airborne(p), 'up in the air');
  const pw = p.power; run(m, [{}, {}], 1);
  assert.ok(p.power >= pw, 'riding costs no power');
  const y0 = p.y; run(m, [{}, { my: 1 }], 0.5);
  assert.ok(p.y - y0 > b.speed * 0.5 * 0.5, 'and it is fast');
  run(m, [{}, {}], b.time);
  assert.equal(p.air, null, 'set down when the time is up');
  assert.equal(p.effects.ride, undefined);
});

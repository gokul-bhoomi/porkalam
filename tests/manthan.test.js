// Samudra Manthan, Krishna's churning of the ocean (owner, 2026-11-22). An arena change (ground rule 12) that works
// on any arena: the island spins (everyone on the ground slides, the caster too), Halahala poison drifts at the
// opponent and marks him, one treasure rises for whoever touches it first, then Shiva drinks the poison and every
// mark bursts. Mount Mandara stands solid in the middle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, whyNot, startArenaChange, churnSpin } from '../src/sim.js';
import { ARENA, TUNE } from '../src/config.js';
import { GODS, findBoon } from '../src/chars/gods.js';
import { match, run, events, K, R } from './helpers.js';

const MV = findBoon('manthan');
const cast = (m, pid = K) => { m.players[pid].cast = { move: MV, slot: 'boon', t: MV.cast, done: true }; stepMatch(m, [{}, {}]); };
const until = (m, e, inputs = [{}, {}]) => { while (m.arenaChange && m.arenaChange.e < e - 1e-9) stepMatch(m, inputs); };
const stopBubbles = (m) => { m.arenaChange.nextBubble = Infinity; };

test('Samudra Manthan is a divine weapon Krishna gives, and an arena change with an end time', () => {
  assert.ok(GODS.krishna.tiers[1].includes(MV) && MV.divine && MV.scene);
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(m);
  assert.equal(m.arenaChange?.kind, 'churn');
  assert.ok(m.arenaChange.t > MV.time - 0.1 && m.arenaChange.t <= MV.time, 'it lasts its time');
  assert.equal(startArenaChange(m, { kind: 'chasm', time: 3 }), false, 'only one arena change at a time');
  assert.equal(whyNot(m, m.players[R], { ...MV, range: 'anywhere' }), 'ARENA BUSY');
  run(m, [{}, {}], MV.time + MV.drink + 0.1); // (Shiva's scene pauses the game for `drink` s)
  assert.equal(m.arenaChange, null, 'the arena comes back');
});

test('the island spins, switching direction: everyone slides round, the caster too; jumping or flying is no escape', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(m); stopBubbles(m);
  until(m, MV.spin.from + 0.05);
  const c = m.arenaChange, w1 = churnSpin(c);
  until(m, MV.spin.from + MV.spin.flip + 0.05);
  assert.ok(w1 !== 0 && Math.sign(churnSpin(c)) === -Math.sign(w1), 'it turns, then turns back');
  const a0 = m.players.map((p) => Math.atan2(p.y, p.x)), r0 = m.players.map((p) => Math.hypot(p.x, p.y));
  run(m, [{}, {}], 0.5);
  m.players.forEach((p, i) => {
    const da = Math.atan2(Math.sin(Math.atan2(p.y, p.x) - a0[i]), Math.cos(Math.atan2(p.y, p.x) - a0[i]));
    assert.ok(Math.abs(da) > 0.15, `fighter ${i} slid round`);
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - r0[i]) < 0.5, 'round the middle, not outward');
  });
  const n = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(n); stopBubbles(n); until(n, MV.spin.from + 0.05);
  n.players[R].air = { kind: 'fly', t: 1, lift: 0, drain: 0, speed: 0 }; n.players[R].power = 100;
  const x = n.players[R].x, y = n.players[R].y;
  run(n, [{}, {}], 0.3);
  assert.ok(Math.hypot(n.players[R].x - x, n.players[R].y - y) > 5, 'flying, he slides too');
});

test('Mount Mandara in the middle is solid on the ground', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(m); stopBubbles(m);
  run(m, [{}, { mx: -1 }], 3);
  assert.ok(Math.hypot(m.players[R].x, m.players[R].y) >= MV.mountain + 9.9, 'he walks into it and stops');
});

test('poison drifts straight at the opponent: a hit is 3% and a mark; Shiva drinks it (a paused scene), then 30% sure and 3% more per mark', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(m);
  m.arenaChange.treasure.taken = -1; // keep the treasure out of it
  until(m, MV.bubbles.from + 0.05);
  const b = m.projectiles.find((pr) => pr.poison);
  assert.ok(b && b.owner === K && !b.seek, 'a bubble, not homing');
  while (!m.scene) stepMatch(m, [{}, {}]);
  assert.equal(m.scene.name, 'Neelakantha', "Shiva's scene: the game pauses");
  const marks = m.players[R].poison, hp = m.players[R].hp, x = m.players[R].x;
  run(m, [{}, { mx: -1 }], MV.drink - 0.1);
  assert.equal(m.players[R].x, x, 'nothing moves while he drinks');
  assert.ok(marks >= 3, `standing still, he is marked (${marks})`);
  assert.ok(Math.abs(hp - (100 - marks * MV.damage)) < 1e-6);
  run(m, [{}, {}], 0.3);
  assert.equal(m.players[R].hp, hp, 'he pours it down first: nothing yet');
  run(m, [{}, {}], MV.burst.pour);
  assert.ok(Math.abs(m.players[R].hp - (hp - MV.burst.sure)) < 1e-6, `it strikes: 30% sure (${m.players[R].hp})`);
  run(m, [{}, {}], MV.burst.gap * (marks + 1));
  assert.ok(Math.abs(m.players[R].hp - (hp - MV.burst.sure - marks * MV.burst.per)) < 1e-6, `then the marks burst one by one (${m.players[R].hp})`);
  assert.equal(events(m, 'markBurst').length, marks);
  assert.equal(m.players[R].poison, 0);
  assert.ok(!m.projectiles.some((pr) => pr.poison), 'no poison is left drifting');
  assert.equal(m.players[K].hp, 100, 'the caster is never poisoned');
  assert.equal(events(m, 'shivaDrinks').length, 1);
});

test('the sure burst reaches him anywhere: behind a wall, in the air', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0, power: 100 } });
  cast(m); stopBubbles(m); m.arenaChange.treasure.taken = -1;
  while (!m.scene) stepMatch(m, [{}, { block: true }]);
  m.players[R].air = { kind: 'fly', t: 1, lift: 0, drain: 0, speed: 0 };
  run(m, [{}, {}], MV.drink + MV.burst.pour + 0.2);
  assert.ok(Math.abs(m.players[R].hp - (100 - MV.burst.sure)) < 1e-6, `${m.players[R].hp}`);
});
test('jumping does not get under the poison', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(m); m.arenaChange.treasure.taken = -1;
  until(m, MV.bubbles.from + 0.05);
  const b = m.projectiles.find((pr) => pr.poison), o = m.players[R];
  b.x = o.x - 3; b.y = o.y; o.air = { kind: 'jump', t: 0, dur: 0.5, vx: 0, vy: 0 };
  stepMatch(m, [{}, {}]);
  assert.equal(o.poison, 1);
});
test('the poison can be shot down (rule 6)', () => {
  const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
  cast(m);
  until(m, MV.bubbles.from + 0.05);
  const b = m.projectiles.find((pr) => pr.poison);
  // a shot of the Warrior's right in front of it
  m.projectiles.push({ ...b, id: 999, owner: R, poison: false, dmg: 5, vx: -b.vx, vy: -b.vy, x: b.x + 2, y: b.y });
  stepMatch(m, [{}, {}]);
  assert.ok(!m.projectiles.some((pr) => pr.id === b.id), 'the bubble is gone');
});

test('treasures spawn on either flank, clear of Mandara and inside both arenas', () => {
  const pickupReach = MV.treasure.grab + TUNE.fighterR;
  for (const [arena, radius] of Object.entries(ARENA.sizes)) {
    const flanks = new Set();
    for (let seed = 1; seed <= 64; seed++) {
      const m = createMatch({ arena, seed });
      cast(m);
      const { x, y } = m.arenaChange.treasure;
      assert.ok(Math.abs(x) >= MV.mountain + pickupReach + 16, `${arena}: clear of the mountain art and collision`);
      assert.ok(Math.hypot(x, y) + pickupReach < radius, `${arena}: pickup area inside the edge`);
      flanks.add(Math.sign(x));
    }
    assert.deepEqual(flanks, new Set([-1, 1]), arena);
  }
});

test('the treasure works once, whoever grabs it (the caster too): Airavata charges just once', () => {
  for (const grabber of [K, R]) {
    const m = match({ k: { x: -80, y: 0 }, r: { x: 80, y: 0 } });
    cast(m); stopBubbles(m);
    const tr = m.arenaChange.treasure; tr.kind = 'airavata';
    until(m, MV.treasure.at - 0.05);
    m.players[grabber].x = tr.x; m.players[grabber].y = tr.y;
    run(m, [{}, {}], 2);
    assert.equal(tr.taken, grabber);
    assert.equal(events(m, 'treasure').length, 1);
    assert.ok(m.players[1 - grabber].hp >= 100 - MV.treasure.charge - 4.01, `one charge only (${m.players[1 - grabber].hp})`); // (and maybe the edge)
  }
});
test('one treasure rises; whoever touches it first gets it', () => {
  for (const kind of ['kamadhenu', 'airavata', 'amrit']) {
    const m = match({ k: { x: -80, y: 0, hp: 50 }, r: { x: 80, y: 0 } });
    cast(m); stopBubbles(m);
    const tr = m.arenaChange.treasure; tr.kind = kind;
    until(m, MV.treasure.at - 0.1);
    m.players[R].x = tr.x; m.players[R].y = tr.y; // the opponent grabs it (the caster has no say)
    m.players[R].hp = 60;
    run(m, [{}, {}], 0.2);
    assert.equal(tr.taken, R, kind);
    const P = m.players;
    if (kind === 'kamadhenu') assert.ok(Math.abs(P[R].hp - (60 + MV.treasure.heal)) < 1e-6, 'Kamadhenu heals');
    if (kind === 'airavata') assert.ok(Math.abs(P[K].hp - (50 - MV.treasure.charge)) < 1e-6, 'Airavata charges the other');
    if (kind === 'amrit') {
      assert.ok(P[R].effects.amrit, 'the Amrit pot is a visible timed effect');
      m.hits.push({ target: P[R], dmg: 10, kb: 0, from: null, src: 'test' }); m.hits.push({ target: P[R], dmg: 4, kb: 0, from: null, src: 'test2' });
      const hp = P[R].hp; stepMatch(m, [{}, {}]);
      assert.ok(Math.abs(P[R].hp - (hp - 4)) < 1e-6 && !P[R].effects.amrit, 'it cancels the next hit only');
    }
    assert.equal(events(m, 'treasure').length, 1);
  }
});

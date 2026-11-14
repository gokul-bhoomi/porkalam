// Mechanics: every move does what its data says. (The owner's rules are in intent.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, airborne } from '../src/sim.js';
import { TUNE, ARENA } from '../src/config.js';
import { CHARS } from '../src/chars/index.js';
import { findBoon } from '../src/chars/gods.js';
import { rng } from '../src/util.js';
import { match, run, tap, useBoon, events, K, R } from './helpers.js';

const mage = CHARS.siddhan, warrior = CHARS.veeran;
// start casting a boon move directly (normally bought with devotion)
const castBoon = (m, pid, id) => { m.players[pid].cast = { move: findBoon(id), slot: 'boon', t: 0, dir: null }; };

test('flute note travels and hits for its damage', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 10, y: 0 } });
  tap(m, K, 'a1'); run(m, [{}, {}], 1);
  assert.equal(m.players[R].hp, 100 - mage.moves.a1.damage);
});

test('a charged shot does more damage than a tapped one', () => {
  const dmg = (hold) => {
    const m = match({ k: { x: -30, y: 0 }, r: { x: 50, y: 0 } }); // within the arrow's full-strength distance
    run(m, [{}, { a1: true }], hold); run(m, [{}, {}], 1);
    return 100 - m.players[K].hp;
  };
  assert.ok(Math.abs(dmg(0.05) - warrior.moves.a1.damage) < 0.2, 'a tap is the small damage');
  assert.equal(dmg(warrior.moves.a1.charge.max + 0.5), warrior.moves.a1.charge.damage);
  assert.ok(dmg(0.6) > dmg(0.05) && dmg(0.6) < dmg(2));
});

test('basic attacks always go off; out of range they just fall short (owner, 2026-11-08)', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0 } });
  tap(m, K, 'a2'); run(m, [{}, {}], 0.6); // swing, then recover (rule 16)
  assert.equal(events(m, 'swing').length, 1, 'the palm push swings');
  assert.equal(m.players[R].hp, 100, 'and misses');
  tap(m, K, 'a1'); run(m, [{}, {}], 3);
  assert.equal(events(m, 'release').filter((e) => e.name === 'Mantra bolt').length, 1, 'the bolt is fired from 200 away');
  assert.equal(m.players[R].hp, 100, 'but fades before it reaches');
  assert.equal(m.projectiles.length, 0);
  const n = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0, power: 50 } });
  tap(n, R, 's3'); // arrow rain: a mid-range special
  assert.equal(n.players[R].msg?.text, 'TOO FAR', 'specials still need their range');
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

test('fly: press to take off, press again to land; fast in the air, and it costs power while up (owner, 2026-11-14)', () => {
  const m = match({ k: { x: -60, y: 0, power: 100 }, r: { x: 100, y: 0 } });
  tap(m, K, 's2'); run(m, [{}, {}], mage.moves.s2.lift + 0.05);
  assert.ok(airborne(m.players[K]), 'off the ground after the lift-off');
  const x0 = m.players[K].x; run(m, [{ mx: 1 }, {}], 0.5);
  assert.ok(m.players[K].x - x0 > mage.speed * TUNE.pace.move * 0.5 * 1.5, 'much faster than walking');
  const p0 = m.players[K].power; run(m, [{}, {}], 1);
  assert.ok(m.players[K].power < p0, 'flying drains power faster than it refills');
  tap(m, K, 'a1'); run(m, [{}, {}], 0.3);
  assert.ok(events(m, 'release').some((e) => e.pid === K && e.name === 'Mantra bolt'), 'attacks while flying');
  run(m, [{}, {}], 0.5); tap(m, K, 's2');
  assert.equal(m.players[K].air, null, 'landed');
  const n = match({ k: { x: -60, y: 0, power: 30 } });
  tap(n, K, 's2'); run(n, [{}, {}], 10);
  assert.equal(n.players[K].air, null, 'out of power: lands by itself');
});

test('blink with no direction goes away from the opponent and stays inside the arena', () => {
  const m = match({ k: { x: -90, y: 0, power: 50 }, r: { x: 0, y: 0 } });
  tap(m, K, 's3');
  assert.ok(m.players[K].x < -90 && Math.hypot(m.players[K].x, m.players[K].y) <= ARENA.r);
});

test('Thousand-Arm Form hits across the whole arena after its scene', () => {
  const m = match({ k: { x: -100, y: 0, power: 100 }, r: { x: 100, y: 0 } });
  tap(m, K, 'sig'); run(m, [{}, {}], mage.moves.sig.cast + TUNE.scene + 0.1);
  assert.equal(m.players[R].hp, 100, 'not yet: the arms are still reaching');
  run(m, [{}, {}], mage.moves.sig.strikeDelay);
  assert.equal(m.players[R].hp, 100 - mage.moves.sig.damage, 'the arms land');
  assert.equal(m.players[K].hp, 100 - mage.moves.sig.cost.health);
});

test('jump: a short hop the way you hold; then a landing pause (owner, 2026-11-14)', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  tap(m, R, 's2', { my: 1 });
  assert.equal(m.players[R].air?.kind, 'jump');
  run(m, [{}, {}], warrior.moves.s2.time);
  assert.equal(m.players[R].air, null);
  assert.ok(m.players[R].y > warrior.moves.s2.distance * 0.8, 'moved about its distance');
  assert.ok(m.players[R].recover > 0, 'landing pause');
});

test('Veeran can shoot in the middle of a jump (owner, 2026-11-14)', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  tap(m, R, 's2', { my: 1 }); run(m, [{}, {}], 0.1);
  const before = m.projectiles.length;
  tap(m, R, 'a1');
  assert.equal(m.players[R].air?.kind, 'jump', 'still in the air');
  assert.ok(m.projectiles.length > before || m.players[R].cast, 'the arrow goes (or starts drawing) mid-jump');
});

test('pinning arrow pins for ~1.5 s from any distance', () => {
  const m = match({ k: { x: -100, y: 0 }, r: { x: 100, y: 0, power: 50 } });
  tap(m, R, 's1'); run(m, [{}, {}], 1.5); // the arrow is slower at the new pace
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

test('Tandava: the opponent\'s half is lava (2% a second on the ground there); the caster\'s half and the air are safe; it never breaks a cast (owner, 2026-11-14)', () => {
  const tv = findBoon('tandava'), m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 100 } });
  castBoon(m, R, 'tandava'); run(m, [{}, {}], tv.cast + TUNE.scene + 0.05);
  const k0 = m.players[K].hp, r0 = m.players[R].hp;
  run(m, [{}, {}], 2);
  assert.ok(Math.abs(k0 - m.players[K].hp - 2 * tv.lava) < 1e-6, 'two seconds in the lava cost 4%');
  assert.equal(m.players[R].hp, r0, 'the caster\'s raised half is safe');
  m.players[K].power = 100; tap(m, K, 's2'); run(m, [{}, {}], mage.moves.s2.lift + 0.05);
  const k1 = m.players[K].hp; run(m, [{}, {}], 1);
  assert.equal(m.players[K].hp, k1, 'flying over it is safe');
  tap(m, K, 's2'); run(m, [{}, {}], 1); tap(m, K, 'cls'); run(m, [{}, {}], 1.2);
  assert.ok(m.players[K].med, 'the burn does not break meditation');
});

test('a wall stays standing for as long as its builder meditates; hits still wear it down (owner, 2026-11-14)', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 100 } });
  run(m, [{ block: true }, {}], 1); run(m, [{}, {}], 0.05);
  assert.equal(m.walls.filter((w) => w.owner === K && w.standing).length, 1);
  tap(m, K, 'cls'); run(m, [{}, {}], TUNE.block.standTime + 2);
  assert.ok(m.players[K].med && m.walls.some((w) => w.owner === K), 'still up after its usual time');
  tap(m, K, 'block'); run(m, [{}, {}], TUNE.block.standTime + 0.2);
  assert.ok(!m.walls.some((w) => w.owner === K && w.standing && w.t <= 0), 'once he stands up, the clock runs again');
});

test('boons: Shiva\'s Tandava splits the island (nobody walks across, jump or fly over), Shakti Vel pierces block', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 100 } });
  castBoon(m, R, 'tandava'); run(m, [{}, {}], findBoon('tandava').cast + TUNE.scene + 0.2);
  assert.equal(m.arenaChange?.kind, 'chasm');
  assert.equal(m.players[K].hp, 100 - findBoon('tandava').damage);
  run(m, [{ mx: 1 }, {}], 3);
  assert.ok(m.players[K].x < -findBoon('tandava').width / 2, 'walking stops at the chasm');
  m.players[R].x = 30; tap(m, R, 's2', { mx: -1 }); run(m, [{}, {}], 0.6);
  assert.ok(m.players[R].x < 0, 'a jump crosses it');
  run(m, [{}, {}], findBoon('tandava').time);
  assert.equal(m.arenaChange, null, 'it closes again');

  const s = match({ k: { x: -40, y: 0 }, r: { x: 60, y: 0 } });
  castBoon(s, R, 'shakti'); run(s, [{ block: true }, {}], findBoon('shakti').cast + TUNE.scene + 1); // a divine weapon: its scene plays first
  assert.equal(s.players[K].hp, 100 - findBoon('shakti').damage);
});

test('two specials while meditating get up and spend the devotion straight away (bug fix 2026-11-08)', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0 } });
  tap(m, R, 'cls'); run(m, [{}, {}], TUNE.meditate.segTime * 4 + 0.2);
  assert.ok(m.players[R].med && m.players[R].devotion === 4);
  useBoon(m, R);
  assert.equal(m.players[R].med, null);
  assert.equal(events(m, 'boon').length, 1, 'the boon was invoked');
  assert.equal(m.players[R].devotion, 0);
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
  m.players[R].devotion = 4;
  run(m, [{}, { s1: true }], 0.05); run(m, [{}, { s1: true, s3: true }], 0.05); run(m, [{}, {}], 0.1);
  assert.equal(m.players[R].devotion, 0, 'devotion spent');
  const boon = events(m, 'boon')[0];
  assert.ok(boon, 'a boon was bought');
  assert.ok(!events(m, 'cast').some((e) => e.pid === R && ['Jump', 'Pinning arrow', 'Arrow rain'].includes(e.name)), 'no special went off');
});

test('a special goes off after the short combo wait', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  stepMatch(m, [{}, { s1: true }]);
  assert.equal(m.players[R].cast, null, 'waiting to see if more specials join');
  run(m, [{}, {}], TUNE.chord);
  assert.equal(m.players[R].cast?.move.name, 'Pinning arrow');
});

test('two specials with less than 3 devotion just fire the first one', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  tap(m, R, 's1', { s3: true });
  assert.equal(m.players[R].cast?.move.name, 'Pinning arrow');
});

test('special 1 while moving sideways is still special 1 (only a clear down is the class move)', () => {
  const m = match({ k: { x: -60, y: 0 }, r: { x: 60, y: 0, power: 50 } });
  m.players[K].power = 50;
  tap(m, K, 's1', { mx: 1, my: 0.3 });
  assert.equal(m.players[K].cast?.move.name, 'Spinning chakra');
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
      assert.ok(Math.hypot(p.x, p.y) <= ARENA.r + 1e-6, 'inside the arena');
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

// The computer opponent (1-player mode). It must play by the same rules as a person: it only gives button states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch } from '../src/sim.js';
import { createCpu, cpuInput, LEVEL_IDS } from '../src/ai.js';
import { STEP } from '../src/config.js';

function cpuMatch(levels, seed, seconds = 180) {
  const m = createMatch({ seed, time: seconds });
  const cpus = levels.map((lv, i) => (lv ? createCpu(i, lv, seed) : null));
  const used = [new Set(), new Set()];
  for (let i = 0; i < seconds / STEP + 600 && m.phase === 'fight'; i++) {
    const inp = cpus.map((c) => (c ? cpuInput(m, c, STEP) : {}));
    inp.forEach((b, k) => Object.keys(b).forEach((a) => b[a] === true && used[k].add(a)));
    stepMatch(m, inp);
  }
  return { m, used };
}

test('computer vs computer finishes a match at every level, with real fighting', () => {
  for (const lv of LEVEL_IDS) {
    const { m, used } = cpuMatch([lv, lv], 11, 120);
    assert.equal(m.phase, 'done', `${lv}: match did not end`);
    const dealt = m.players.map((p) => p.stats.dealt);
    assert.ok(dealt[0] > 10 && dealt[1] > 10, `${lv}: too little damage ${dealt}`);
    for (const k of [0, 1]) for (const b of lv === 'easy' ? ['a1'] : ['a1', 'block']) assert.ok(used[k].has(b), `${lv}: P${k + 1} never used ${b}`);
  }
});

test('the computer uses its specials, walls and (as the King) meditation', () => {
  const seen = { s: [0, 0], wall: [0, 0], med: 0, boon: 0 };
  for (const seed of [1, 2, 3]) {
    const m = createMatch({ seed, time: 180 });
    const cpus = [createCpu(0, 'hard', seed), createCpu(1, 'hard', seed)];
    for (let i = 0; i < 180 / STEP && m.phase === 'fight'; i++) {
      stepMatch(m, cpus.map((c) => cpuInput(m, c, STEP)));
      for (const e of m.events.splice(0)) {
        if (e.type === 'cast' && /^s[123]$/.test(e.slot)) seen.s[e.pid]++;
        if (e.type === 'wallUp') seen.wall[e.pid]++;
        if (e.type === 'meditate') seen.med++;
        if (e.type === 'boonUsed') seen.boon++;
      }
    }
  }
  assert.ok(seen.s[0] > 2 && seen.s[1] > 2, `specials ${seen.s}`);
  assert.ok(seen.wall[0] > 0 && seen.wall[1] > 0, `walls ${seen.wall}`);
  assert.ok(seen.med > 0, 'the King never meditated');
});

test('a harder computer beats an easier one more often than not', () => {
  let hard = 0, easy = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const side = seed % 2; // swap sides so the fighter doesn't decide it
    const lv = side ? ['easy', 'hard'] : ['hard', 'easy'];
    const { m } = cpuMatch(lv, seed, 120);
    const w = m.result?.winner;
    if (w == null) continue;
    if (lv[w] === 'hard') hard++; else easy++;
  }
  assert.ok(hard > easy, `hard ${hard} vs easy ${easy}`);
});

test('the computer is deterministic: same seed, same match', () => {
  const a = cpuMatch(['normal', 'normal'], 5, 60).m, b = cpuMatch(['normal', 'normal'], 5, 60).m;
  assert.deepEqual(a.players.map((p) => [p.hp, p.x, p.y]), b.players.map((p) => [p.hp, p.x, p.y]));
});

test('a human-controlled side gets no computer input', () => {
  const { m } = cpuMatch([null, 'normal'], 3, 60);
  assert.equal(m.players[0].stats.dealt, 0, 'P1 had no input but dealt damage');
});

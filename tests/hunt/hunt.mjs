// Exploit hunter (ground rule 16: no simple plan should win). Two parts:
//  1. Known plans (tests/hunt/players.mjs PLANS): each plays both fighters against the computer.
//  2. Random search: invents plans by turning the knobs at random, keeps the best few and re-checks them with
//     more matches, so a lucky streak doesn't count.
// A simple plan may win at most LIMIT of its matches against a level. Anything above is an exploit: either the
// game (a move too strong) or the computer (a hole in how it plays) needs fixing.
// Usage: npm run hunt [-- --quick] [-- --search N] [-- --seed S]
import { PLANS, randomPlan, describe, playMatch } from './players.mjs';
import { CHARS } from '../../src/chars/index.js';
import { rng } from '../../src/util.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const quick = args.includes('--quick');
const LIMIT = { hard: 0.2, normal: 0.5 };          // most a simple plan may win against each level
const N = quick ? 10 : 24;                          // matches per plan, per fighter, per level
const SEARCH = opt('--search', quick ? 40 : 120);   // random plans to try
const SEARCH_N = 6, CONFIRM_N = 30, KEEP = 6;
const ids = Object.keys(CHARS), sides = [0, 1];     // P1 = Siddhan, P2 = Veeran
const name = (pid) => CHARS[ids[pid]].name;

function score(plan, pid, level, n, seed0 = 1) {
  let w = 0;
  for (let s = seed0; s < seed0 + n; s++) w += playMatch(plan, pid, level, s).win ? 1 : 0;
  return w / n;
}

const found = [];
const t0 = Date.now();
console.log(`Known plans (${N} matches each; limit: hard ${LIMIT.hard * 100}%, normal ${LIMIT.normal * 100}%)\n`);
console.log(`${'plan'.padEnd(22)}${sides.map((p) => `${name(p)} vs normal`.padEnd(22) + `${name(p)} vs hard`.padEnd(20)).join('')}`);
for (const [pname, plan] of Object.entries(PLANS)) {
  let line = pname.padEnd(22);
  for (const pid of sides) for (const level of ['normal', 'hard']) {
    const r = score(plan, pid, level, N), bad = r > LIMIT[level];
    if (bad) found.push({ what: pname, plan, pid, level, r });
    line += `${Math.round(r * 100)}%${bad ? ' EXPLOIT' : ''}`.padEnd(level === 'normal' ? 22 : 20);
  }
  console.log(line);
}

console.log(`\nRandom search: ${SEARCH} plans x both fighters vs hard (${SEARCH_N} matches), best ${KEEP} re-checked with ${CONFIRM_N}\n`);
const r = rng(opt('--seed', 7));
const tried = [];
for (let i = 0; i < SEARCH; i++) {
  const plan = randomPlan(r);
  for (const pid of sides) tried.push({ plan, pid, r: score(plan, pid, 'hard', SEARCH_N, 1000 + i * 10) });
}
tried.sort((a, b) => b.r - a.r);
for (const t of tried.slice(0, KEEP)) {
  const c = score(t.plan, t.pid, 'hard', CONFIRM_N, 5000);
  const bad = c > LIMIT.hard;
  console.log(`${name(t.pid).padEnd(9)} ${`${Math.round(t.r * 100)}% -> ${Math.round(c * 100)}%`.padEnd(13)}${bad ? 'EXPLOIT ' : ''}${describe(t.plan)}`);
  if (bad) found.push({ what: 'search', plan: t.plan, pid: t.pid, level: 'hard', r: c });
}

console.log(`\n${found.length ? `${found.length} exploit(s) found` : 'no exploits found'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
for (const f of found) console.log(`  ${name(f.pid)} vs ${f.level}: ${f.what} wins ${Math.round(f.r * 100)}%  [${describe(f.plan)}]`);
process.exitCode = found.length ? 1 : 0;

// Ground rule 16: computer vs computer at EQUAL skill (no per-fighter adjustment), every pair of fighters.
// Fails outside 45-55%, warns outside 47-53%. Not part of `npm run verify` yet: the computer player still has
// hand-written tactics per fighter, so these numbers measure the computer's play as much as the characters.
// Usage: npm run balance [-- matches-per-skill]
import { createMatch, stepMatch } from '../src/sim.js';
import { createCpu, cpuInput } from '../src/ai.js';
import { STEP } from '../src/config.js';
import { CHARS } from '../src/chars/index.js';
const CHAR_IDS = Object.keys(CHARS);

const n = +process.argv[2] || 200, time = 300, skills = [0.3, 0.6, 1];
let bad = 0;
for (let i = 0; i < CHAR_IDS.length; i++) for (let j = i + 1; j < CHAR_IDS.length; j++) {
  const ids = [CHAR_IDS[i], CHAR_IDS[j]];
  for (const skill of skills) {
    let a = 0;
    for (let s = 1; s <= n; s++) {
      const side = s % 2, chars = side ? [ids[1], ids[0]] : ids; // swap sides every match
      const m = createMatch({ seed: s, time, chars }), c = [createCpu(0, 'hard', s * 3, skill), createCpu(1, 'hard', s * 5, skill)];
      for (let f = 0; f < (time + 30) / STEP && m.phase === 'fight'; f++) stepMatch(m, c.map((x) => cpuInput(m, x, STEP)));
      const w = m.result?.winner, aSide = side ? 1 : 0;
      a += w == null ? 0.5 : w === aSide ? 1 : 0;
    }
    const pct = (100 * a) / n, mark = pct < 45 || pct > 55 ? 'FAIL' : pct < 47 || pct > 53 ? 'warn' : 'ok';
    if (mark === 'FAIL') bad++;
    console.log(`${CHARS[ids[0]].name} vs ${CHARS[ids[1]].name}, skill ${skill}: ${CHARS[ids[0]].name} wins ${pct.toFixed(1)}%  ${mark}`);
  }
}
process.exitCode = bad ? 1 : 0;

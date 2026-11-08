import { createMatch, stepMatch } from '../src/sim.js';
import { STEP } from '../src/config.js';

export const K = 0, R = 1; // P1 = Siddhan (Mage), P2 = Veeran (Warrior)

// A match with the fighters placed where a test wants them.
export function match(o = {}) {
  const m = createMatch({ seed: o.seed ?? 1, time: o.time });
  const [k, r] = m.players;
  if (o.k) Object.assign(k, o.k);
  if (o.r) Object.assign(r, o.r);
  return m;
}
export const steps = (s) => Math.round(s / STEP);
// run for s seconds with the same held inputs
export function run(m, inputs = [{}, {}], s = STEP) { for (let i = 0; i < steps(s); i++) stepMatch(m, inputs); }
// The combos (owner, 2026-11-07): 'sig' = all 3 specials, 'cls' = down + special 1.
export const COMBO = { sig: { s1: true, s2: true, s3: true }, cls: { s1: true, my: 1 } };
// press a button (or combo) for one step, then release it; specials also wait out the combo window
export function tap(m, pid, button, extra = {}) {
  const a = [{}, {}], b = [{}, {}];
  a[pid] = { ...(COMBO[button] || { [button]: true }), ...extra }; b[pid] = { ...extra };
  if (b[pid].my === 1 && button === 'cls') delete b[pid].my;
  stepMatch(m, a); stepMatch(m, b);
  for (let i = 0; i < 30 && m.players[pid].chord; i++) stepMatch(m, b);
}
// spend devotion on a boon: two special buttons pressed together
export function useBoon(m, pid, a = 's1', b = 's2') { tap(m, pid, a, { [b]: true }); }
// collect every event of a type over a run
export function events(m, type) { return m.events.filter((e) => e.type === type); }
export const far = { x: -90, y: 0 }, farR = { x: 90, y: 0 };

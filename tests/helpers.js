import { createMatch, stepMatch } from '../src/sim.js';
import { STEP } from '../src/config.js';

export const K = 0, R = 1; // Krishna is P1, Raja Raja Chola is P2

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
// press a button for one step (then release it for one step)
export function tap(m, pid, button, extra = {}) {
  const a = [{}, {}], b = [{}, {}];
  a[pid] = { [button]: true, ...extra }; b[pid] = { ...extra };
  stepMatch(m, a); stepMatch(m, b);
}
// use the held boon: two special buttons pressed together
export function useBoon(m, pid, a = 's1', b = 's2') { tap(m, pid, a, { [b]: true }); }
// collect every event of a type over a run
export function events(m, type) { return m.events.filter((e) => e.type === type); }
export const far = { x: -90, y: 0 }, farR = { x: 90, y: 0 };

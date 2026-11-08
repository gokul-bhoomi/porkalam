// Computer opponent for 1-player mode. It only reads the match and returns the same button state a
// player would give (mx, my, a1, a2, block, s1-s3), so it plays by exactly the same rules.
// It has its own random numbers, so it never changes the match's random draws.
import { ARENA, TUNE, RANGES } from './config.js';
import { rng, dist } from './util.js';
import { whyNot, opponent } from './sim.js';

// How a computer fighter plays, from a beginner (skill 0) to an expert (skill 1). Every value is blended
// between these two ends, so a higher skill is always a stronger player.
// react: seconds between decisions; aggr: chance to attack when it can; block / dodge: chance to defend
// against an attack it sees coming; reserve: power it keeps back; sig: chance to try the signature;
// charge: how long it dares to charge a bow shot; minCharge: the shortest charge (a little charge out-damages
// a mantra bolt in a clash); punish: chance to break a slow cast with a quick hit; plan: chance to play its
// fighter's own game plan (see tactics); kite: how hard the fast Warrior keeps his distance.
const NOVICE = { react: 0.5, aggr: 0.6, block: 0.2, dodge: 0.15, reserve: 24, sig: 0.1, rest: [0.4, 1.0], charge: 0.2, minCharge: 0, punish: 0.05, plan: 0.2, kite: 0 };
const EXPERT = { react: 0.1, aggr: 0.98, block: 0.8, dodge: 0.85, reserve: 6, sig: 0.85, rest: [0.03, 0.18], charge: 0.85, minCharge: 0.3, punish: 0.85, plan: 0.95, kite: 1 };
export function skillParams(k) {
  const mix = (a, b) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * k) : a + (b - a) * k);
  return Object.fromEntries(Object.keys(NOVICE).map((key) => [key, mix(NOVICE[key], EXPERT[key])]));
}
export const LEVELS = {
  easy: { name: 'EASY', skill: 0.15 },
  normal: { name: 'NORMAL', skill: 0.6 },
  hard: { name: 'HARD', skill: 0.9 },
};
// Per-fighter adjustment, measured so that at each level the computer Mage and the computer Warrior are
// about equally strong (CPU vs CPU near 50/50). Without it the Warrior's computer is much stronger at low skill
// and the Mage's at high skill. Re-measure with tests/ai.test.js if moves change.
export const SKILL_ADJUST = {
  siddhan: { easy: 0.39, normal: -0.04, hard: -0.22 }, // skill 0.54 / 0.56 / 0.68
  veeran: { easy: -0.15, normal: 0, hard: 0.1 },      // skill 0.00 / 0.60 / 1.00
};
export const LEVEL_IDS = Object.keys(LEVELS);

export function createCpu(pid, level = 'normal', seed = 1) {
  return {
    pid, level: LEVELS[level] ? level : 'normal', L: null, r: rng((seed * 7919 + pid * 104729) | 0),
    think: 0, rest: 1, hold: {}, holdT: 0, gap: 0, strafe: 1, strafeT: 0, dodge: null, dodgeT: 0, medWait: 0, wasMed: false, medProg: null, medStuck: 0,
  };
}

const COMBO = { sig: { s1: true, s2: true, s3: true }, boon: { s1: true, s2: true }, cls: { s1: true, my: 1 } };

export function cpuInput(m, cpu, dt) {
  const p = m.players[cpu.pid], o = opponent(m, p), R = cpu.r;
  if (!cpu.L) { // settle the skill once we know which fighter it plays
    const k = LEVELS[cpu.level].skill + (SKILL_ADJUST[p.ch.id]?.[cpu.level] || 0);
    cpu.L = skillParams(Math.max(0, Math.min(1, k)));
  }
  const L = cpu.L;
  const out = { mx: 0, my: 0 };
  if (m.phase !== 'fight' || m.scene) return out;
  const d = dist(p, o);

  // keep holding whatever an earlier decision pressed (block, a charged shot, a combo)
  if (cpu.holdT > 0) {
    cpu.holdT -= dt;
    Object.assign(out, cpu.hold);
    if (cpu.holdT <= 0) { cpu.hold = {}; cpu.gap = 3 * dt; } // let go for a moment so the next press counts
    if (!out.mx && !out.my) Object.assign(out, steer(m, cpu, p, o, d, dt));
    return out;
  }
  if (cpu.gap > 0) { cpu.gap -= dt; return Object.assign(out, steer(m, cpu, p, o, d, dt)); }

  cpu.think -= dt; cpu.rest -= dt; cpu.medWait -= dt;
  if (cpu.wasMed && !p.med && p.devotion < TUNE.meditate.segments) cpu.medWait = 8; // meditation was broken off: don't try again straight away
  cpu.wasMed = !!p.med;
  if (cpu.think <= 0) {
    cpu.think = L.react * (0.7 + R() * 0.6);
    const press = decide(m, cpu, p, o, d);
    if (press) {
      cpu.hold = press.buttons; cpu.holdT = press.time;
      Object.assign(out, press.buttons);
      if (!press.buttons.mx && !press.buttons.my) Object.assign(out, steer(m, cpu, p, o, d, dt));
      return out;
    }
  }
  return Object.assign(out, steer(m, cpu, p, o, d, dt));
}

// What to press now, or null. Returns { buttons, time } (time = how long to hold them).
function decide(m, cpu, p, o, d) {
  const L = cpu.L, R = cpu.r, mv = p.ch.moves, can = (move, extra) => move && !whyNot(m, p, move, extra);
  if (p.cast || p.block || p.effects.stun) return null;

  // meditating: the barrier soaks hits, so only stop when it's nearly gone or the opponent has come close
  // (pressing block ends meditation; holding it on builds a wall)
  // and get up when it isn't working: no progress for a while (opponent too close), or the opponent is
  // meditating too (then go and hit them instead)
  if (p.med) {
    const prog = p.devotion * 100 + p.med.meter;
    if (cpu.medProg == null || prog > cpu.medProg + 1e-6) { cpu.medProg = prog; cpu.medStuck = 0; }
    else cpu.medStuck += L.react;
    const stop = { buttons: { block: true }, time: 0.05 };
    if (p.med.barrier < 8 && incoming(m, p) && R() < L.block) return { buttons: { block: true }, time: 0.7 };
    if (cpu.medStuck > 1.2 || (o.med && R() < 0.5 + L.plan * 0.5)) { cpu.medProg = null; return stop; }
    return null;
  }
  cpu.medProg = null;

  // defence: an attack is on its way
  // the slow Mage can't sidestep well, so he raises his earth wall against any shot
  const threat = incoming(m, p), big = threat && (threat.dmg >= 6 || threat.r >= 6 || p.ch.id === 'siddhan');
  const bigCast = o.cast && !o.cast.done && o.cast.move.cast >= 0.5 && o.cast.t < o.cast.move.cast;
  if ((threat || bigCast) && p.power >= p.ch.defence.cost) {
    if (R() < (big || bigCast ? L.block : L.block * 0.25)) { // small pokes aren't worth stopping for
      const left = bigCast ? o.cast.move.cast - o.cast.t + 0.3 : 0.5;
      return { buttons: { block: true }, time: Math.min(TUNE.block.buildTime - 0.1, Math.max(0.35, left)) };
    }
    if (threat && R() < L.dodge) { // sidestep across the shot's path
      const l = Math.hypot(threat.vx, threat.vy) || 1, side = R() < 0.5 ? 1 : -1;
      cpu.dodge = { x: (-threat.vy / l) * side, y: (threat.vx / l) * side }; cpu.dodgeT = 0.45;
      if (p.ch.id === 'siddhan' && can(mv.s3) && R() < 0.5) return { buttons: { s3: true, mx: cpu.dodge.x, my: cpu.dodge.y }, time: 0.05 }; // blink away
      return null;
    }
  }

  // boons: spend devotion. A beginner cashes in at once; a better player saves up for the divine weapon
  const M = TUNE.meditate, dv = p.devotion;
  if (dv >= M.tiers[0]) {
    const want = L.plan > 0.7 ? M.tiers[2] : L.plan > 0.4 ? M.tiers[1] : M.tiers[0];
    if ((dv >= want || (o.hp < 20 && R() < 0.5)) && R() < 0.7) return { buttons: COMBO.boon, time: 0.05 };
  }
  // meditate when the opponent is far and nothing is on its way (both classes)
  if (dv < M.segments && can(mv.cls) && cpu.medWait <= 0 && !o.med && !o.chord && d > M.dist + 30 && !o.cast && !threat && R() < 0.5) {
    return { buttons: COMBO.cls, time: 0.05 };
  }

  const done = (b) => { cpu.rest = L.rest[0] + R() * (L.rest[1] - L.rest[0]); return b; };
  const plan = tactics(m, cpu, p, o, d, can, threat);
  if (plan) return done(plan);
  if (cpu.rest > 0 && !(o.med && R() < L.plan)) return null; // a meditating opponent is an open target: press it

  // signature move when there's power to spare
  if (can(mv.sig) && p.hp > 20 && R() < L.sig * 0.5) return done({ buttons: COMBO.sig, time: 0.05 });

  // too close: shove them away
  if (d < 38 && can(mv.a2)) {
    if (p.ch.id === 'siddhan' && can(mv.s3) && R() < 0.25) { // or blink away
      const l = d || 1;
      return done({ buttons: { s3: true, mx: (p.x - o.x) / l, my: (p.y - o.y) / l }, time: 0.05 });
    }
    return done({ buttons: { a2: true }, time: 0.05 });
  }

  if (R() > L.aggr) return null;
  // a special, if the power is there and the move fits the distance
  const spare = p.power - L.reserve;
  const specials = ['s1', 's2', 's3'].filter((s) => mv[s] && mv[s].kind !== 'blink' && can(mv[s]) && (mv[s].cost?.power || 0) <= spare);
  if (specials.length && R() < 0.45) {
    const s = specials[Math.floor(R() * specials.length)];
    if (!(s === 's2' && p.ch.id === 'siddhan' && d < 60)) return done({ buttons: { [s]: true }, time: 0.05 }); // the binding chant is slow: not up close
  }
  // the Mage holds back mantra bolts while he isn't saving up for the chakra
  if (p.ch.id === 'siddhan' && p.power - (mv.a1.cost?.power || 0) < mv.s1.cost.power && R() < L.plan * 0.5) return null;
  const reach = RANGES[mv.a1.range]?.[1] ?? Infinity;
  if (can(mv.a1) && d < reach + 10) { // basics always fire, but don't waste one that would fall short
    const safe = !m.projectiles.some((pr) => pr.owner !== p.id) && d > 70; // charging can be interrupted: only when nothing is coming
    // the slow Mage only charges when the Warrior can't punish it (busy meditating, held, stunned or casting)
    const busy = !!(o.med || o.effects.hold || o.effects.stun || (o.cast && !o.cast.done && !o.cast.move.charge && o.cast.move.cast - o.cast.t > 0.8)); // a long cast, not a quick shot
    const canCharge = p.ch.weapon === 'bow' ? safe : safe && busy;
    const charge = mv.a1.charge ? mv.a1.cast + (canCharge ? L.minCharge + R() * mv.a1.charge.max * L.charge : 0) : 0.05; // hold a bow shot to charge it
    return done({ buttons: { a1: true }, time: charge });
  }
  return null;
}

// Each fighter's own game plan, on top of the shared basics. Returns a press or null.
//  - Both: break the opponent's slow casts with a quick hit (ground rule 7), and cash in when they're held.
//  - Mage (slow, strong magic): the chakra reaches anywhere, the binding chant and Thousand-Arm Form when the Warrior
//    is busy, blink in when the Warrior is out of bolt range.
//  - Warrior (fast, bow): pin then charge a full shot, rain arrows on a fighter standing still, Gaja Arrow from afar.
function tactics(m, cpu, p, o, d, can, threat) {
  const L = cpu.L, R = cpu.r, mv = p.ch.moves, K = p.ch.id === 'siddhan';
  const oc = o.cast && !o.cast.done ? o.cast : null;
  const oLeft = oc ? (oc.move.charge ? oc.move.charge.max + oc.move.cast - oc.t : oc.move.cast - oc.t) : 0;
  const busy = !!(o.med || o.block || o.effects.hold || o.effects.stun || (oc && oLeft > 0.8)); // can't dodge right now
  const tap = (slot, extra = {}) => ({ buttons: { [slot]: true, ...extra }, time: 0.05 });
  const shotTime = (move) => (move.cast || 0) + d / (move.speed || 1e9);

  // punish: a quick shot that lands before their cast goes off
  if (oc && oLeft > 0.3 && R() < L.punish) {
    for (const s of ['a1', 's1']) {
      const mvq = mv[s];
      if (mvq && mvq.kind === 'projectile' && can(mvq) && shotTime(mvq) < oLeft && !(K && s === 's1')) return tap(s);
    }
  }
  if (R() > L.plan) return null;

  if (K) {
    if (can(mv.sig) && p.hp > 20 && (o.med || o.effects.stun || (o.effects.hold && o.effects.hold.t > 2))) return { buttons: { s1: true, s2: true, s3: true }, time: 0.05 };
    if (can(mv.s2) && d > 55 && d < 135 && busy && !o.effects.hold) return tap('s2'); // binding chant
    if (can(mv.s1) && (busy || d > 150 || R() < 0.15)) return tap('s1');             // chakra
    if (d > 150 && can(mv.s3) && p.power > mv.s3.cost.power + mv.s1.cost.power * 0.5 && R() < 0.4) {
      return tap('s3', { mx: (o.x - p.x) / d, my: (o.y - p.y) / d });                  // blink in
    }
    return null;
  }
  // Warrior
  if (o.effects.hold && o.effects.hold.t > mv.a1.cast + mv.a1.charge.max * 0.8 && can(mv.a1) && !threat) {
    return { buttons: { a1: true }, time: mv.a1.cast + mv.a1.charge.max };            // free full charge
  }
  if (can(mv.s3) && busy && p.power > mv.s3.cost.power + L.reserve) return tap('s3'); // arrow rain on a sitting target
  if (can(mv.s2) && !o.effects.hold && p.power > mv.s2.cost.power + mv.a1.cost.power * 3 && R() < 0.3) return tap('s2'); // pin
  if (can(mv.sig) && p.hp > 25 && d > 150 && !threat && (!oc && o.power < 30)) return { buttons: { s1: true, s2: true, s3: true }, time: 0.05 };
  if (can(mv.s1) && d < 110 && R() < 0.3) return tap('s1');                         // split shot up close
  return null;
}

// The opponent's wall standing between us, or null (a wall only protects what's behind it).
function wallBetween(m, p, o) {
  const cr = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (const w of m.walls) {
    if (w.owner !== o.id || w.dead) continue;
    const e1 = { x: w.x - w.ny * w.hw, y: w.y + w.nx * w.hw }, e2 = { x: w.x + w.ny * w.hw, y: w.y - w.nx * w.hw };
    if (cr(e1, e2, p) * cr(e1, e2, o) < 0 && cr(p, o, e1) * cr(p, o, e2) < 0) return { w, e1, e2 };
  }
  return null;
}

// The nearest enemy shot that will pass close by, or null.
function incoming(m, p) {
  let best = null, bt = Infinity;
  for (const pr of m.projectiles) {
    if (pr.owner === p.id) continue;
    const rx = p.x - pr.x, ry = p.y - pr.y, v2 = pr.vx * pr.vx + pr.vy * pr.vy;
    if (!v2) continue;
    const t = (rx * pr.vx + ry * pr.vy) / v2; // time until closest approach
    if (t < 0 || t > 0.8) continue;
    const mx = pr.x + pr.vx * t - p.x, my = pr.y + pr.vy * t - p.y;
    if (Math.hypot(mx, my) < pr.r + TUNE.fighterR + 6 && t < bt) { best = pr; bt = t; }
  }
  return best;
}

// Movement: keep a good fighting distance, circle the opponent, stay off the edge and out of danger.
function steer(m, cpu, p, o, d, dt) {
  const R = cpu.r;
  let x = 0, y = 0;
  if (cpu.dodgeT > 0) { cpu.dodgeT -= dt; x += cpu.dodge.x * 2; y += cpu.dodge.y * 2; }
  // the Warrior uses his speed to stay out of bolt range (kite); the Mage wants to close in.
  // Against a meditating opponent, close in: meditation only fills while you keep away, and the barrier has to be broken.
  // (a Warrior against a short-range basic attack stays just beyond its reach)
  const outReach = RANGES[o.ch.moves.a1.range]?.[1] ?? Infinity;
  const kiteTo = Number.isFinite(outReach) ? outReach + 12 : 95 + cpu.L.kite * 65; // even a beginner backs off out of reach
  const want = o.med ? 30 + 40 * (1 - cpu.L.plan) : p.ch.id === 'siddhan' ? 80 : kiteTo;
  const ux = d ? (o.x - p.x) / d : 1, uy = d ? (o.y - p.y) / d : 0;
  const push = Math.max(-1, Math.min(1, (d - want) / 30));
  x += ux * push; y += uy * push;
  cpu.strafeT -= dt;
  if (cpu.strafeT <= 0) { cpu.strafe = R() < 0.5 ? -1 : 1; cpu.strafeT = 1 + R() * 2; }
  x += -uy * cpu.strafe * 0.6; y += ux * cpu.strafe * 0.6;
  // a Warrior hoping to meditate keeps away (meditation only fills while the opponent is far)
  if (p.ch.cls === 'warrior' && p.devotion < TUNE.meditate.segments && d < TUNE.meditate.dist + 30 && p.power > 10) { x -= ux * 0.8; y -= uy * 0.8; }
  // a wall in the way: run round its nearer end to shoot past it (the fast Warrior does this best)
  const wb = cpu.L.plan > 0.4 ? wallBetween(m, p, o) : null;
  if (wb) {
    const end = Math.hypot(wb.e1.x - p.x, wb.e1.y - p.y) < Math.hypot(wb.e2.x - p.x, wb.e2.y - p.y) ? wb.e1 : wb.e2;
    const ex = end.x + (end.x - wb.w.x) * 0.6 - p.x, ey = end.y + (end.y - wb.w.y) * 0.6 - p.y, el = Math.hypot(ex, ey) || 1;
    x += (ex / el) * 2; y += (ey / el) * 2;
  }
  // stay off the edge
  const r = Math.hypot(p.x, p.y);
  const edge = p.ch.id === 'siddhan' ? 0.7 : 0.7 + 0.15 * cpu.L.kite; // a kiting Warrior uses more of the floor
  if (r > ARENA.r * edge) { const k = (r - ARENA.r * edge) / (ARENA.r * (1 - edge)) * 2.5; x -= (p.x / r) * k; y -= (p.y / r) * k; }
  // step out of arrow-rain circles
  for (const a of m.areas.filter((a) => a.owner !== p.id)) {
    const ad = Math.hypot(p.x - a.x, p.y - a.y);
    if (ad < a.r + 6) { const l = ad || 1; x += ((p.x - a.x) / l) * 2; y += ((p.y - a.y) / l) * 2; }
  }
  const l = Math.hypot(x, y);
  return l > 1 ? { mx: x / l, my: y / l } : l < 0.15 ? { mx: 0, my: 0 } : { mx: x, my: y };
}

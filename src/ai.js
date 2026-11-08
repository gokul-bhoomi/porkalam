// Computer opponent for 1-player mode. It only reads the match and returns the same button state a
// player would give (mx, my, a1, a2, block, trap modifiers, s1-s3), so it plays by exactly the same rules.
// It has its own random numbers, so it never changes the match's random draws.
import { ARENA, TUNE } from './config.js';
import { rng, dist } from './util.js';
import { whyNot, opponent } from './sim.js';
import { findBoon } from './chars/gods.js';

// react: seconds between decisions; aggr: chance to attack when it can; block / dodge: chance to defend
// against an attack it sees coming; reserve: power it keeps back for defence; sig: chance to try the signature.
export const LEVELS = {
  easy: { name: 'EASY', react: 0.4, aggr: 0.7, block: 0.3, dodge: 0.25, reserve: 20, sig: 0.2, rest: [0.3, 0.8], charge: 0.3 },
  normal: { name: 'NORMAL', react: 0.25, aggr: 0.85, block: 0.5, dodge: 0.5, reserve: 12, sig: 0.4, rest: [0.12, 0.45], charge: 0.5 },
  hard: { name: 'HARD', react: 0.12, aggr: 0.97, block: 0.75, dodge: 0.8, reserve: 8, sig: 0.8, rest: [0.04, 0.22], charge: 0.8 },
};
export const LEVEL_IDS = Object.keys(LEVELS);

export function createCpu(pid, level = 'normal', seed = 1) {
  return {
    pid, level, L: LEVELS[level] || LEVELS.normal, r: rng((seed * 7919 + pid * 104729) | 0),
    think: 0, rest: 1, hold: {}, holdT: 0, gap: 0, strafe: 1, strafeT: 0, dodge: null, dodgeT: 0, medWait: 0, wasMed: false,
  };
}

const COMBO = { sig: { s1: true, s2: true, s3: true }, boon: { s1: true, s2: true }, cls: { s1: true, my: 1 } };

export function cpuInput(m, cpu, dt) {
  const p = m.players[cpu.pid], o = opponent(m, p), L = cpu.L, R = cpu.r;
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
  if (cpu.wasMed && !p.med && !p.boons.length) cpu.medWait = 10; // meditation was broken off: don't try again straight away
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

  // meditating: only stop if the opponent is coming close
  // (pressing block ends meditation; holding it on builds a wall against a shot on its way)
  if (p.med) {
    if (incoming(m, p) && R() < L.block) return { buttons: { block: true }, time: 0.7 };
    return d < TUNE.meditate.dist * 0.6 && R() < 0.5 ? { buttons: { block: true }, time: 0.05 } : null;
  }

  // defence: an attack is on its way
  const threat = incoming(m, p), big = threat && (threat.dmg >= 6 || threat.r >= 6);
  const bigCast = o.cast && !o.cast.done && o.cast.move.cast >= 0.5 && o.cast.t < o.cast.move.cast;
  if ((threat || bigCast) && p.power >= p.ch.defence.cost) {
    if (R() < (big || bigCast ? L.block : L.block * 0.25)) { // small pokes aren't worth stopping for
      const left = bigCast ? o.cast.move.cast - o.cast.t + 0.3 : 0.5;
      return { buttons: { block: true }, time: Math.min(TUNE.block.buildTime - 0.1, Math.max(0.35, left)) };
    }
    if (threat && R() < L.dodge) { // sidestep across the shot's path
      const l = Math.hypot(threat.vx, threat.vy) || 1, side = R() < 0.5 ? 1 : -1;
      cpu.dodge = { x: (-threat.vy / l) * side, y: (threat.vx / l) * side }; cpu.dodgeT = 0.45;
      if (p.ch.id === 'krishna' && can(mv.s3) && R() < 0.5) return { buttons: { s3: true, mx: cpu.dodge.x, my: cpu.dodge.y }, time: 0.05 }; // blink away
      return null;
    }
  }

  // last resort: Brahmastra (the god's class move) when it's allowed
  if (p.ch.cls === 'god' && can(mv.cls)) return { buttons: COMBO.cls, time: 0.05 };

  // King: use the boon, or meditate for one when the opponent is far away
  if (p.boons.length) {
    const b = findBoon(p.boons[0].id);
    if (can(b) && R() < 0.7) return { buttons: COMBO.boon, time: 0.05 };
  } else if (p.ch.gods && can(mv.cls) && cpu.medWait <= 0 && d > TUNE.meditate.dist + 40 && !o.cast && !threat
    && !m.projectiles.some((pr) => pr.owner !== p.id) && R() < 0.5) {
    return { buttons: COMBO.cls, time: 0.05 };
  }

  if (cpu.rest > 0) return null;
  const done = (b) => { cpu.rest = L.rest[0] + R() * (L.rest[1] - L.rest[0]); return b; };

  // signature move when there's power to spare
  if (can(mv.sig) && p.hp > 20 && R() < L.sig * 0.5) return done({ buttons: COMBO.sig, time: 0.05 });

  // too close: shove them away (sometimes with a trap hidden in the swing)
  if (d < 38 && can(mv.a2)) {
    const trap = p.trapsActive < TUNE.trap.max && can(mv.a2, TUNE.trap.cost) && R() < 0.2 ? (R() < 0.5 ? { trapPlant: true } : { trapWater: true }) : {};
    if (p.ch.id === 'krishna' && can(mv.s3) && R() < 0.25) { // or blink away
      const l = d || 1;
      return done({ buttons: { s3: true, mx: (p.x - o.x) / l, my: (p.y - o.y) / l }, time: 0.05 });
    }
    return done({ buttons: { a2: true, ...trap }, time: 0.05 });
  }

  if (R() > L.aggr) return null;
  // a special, if the power is there and the move fits the distance
  const spare = p.power - L.reserve;
  const specials = ['s1', 's2', 's3'].filter((s) => mv[s] && mv[s].kind !== 'blink' && can(mv[s]) && (mv[s].cost?.power || 0) <= spare);
  if (specials.length && R() < 0.45) {
    const s = specials[Math.floor(R() * specials.length)];
    if (!(s === 's2' && p.ch.id === 'krishna' && d < 60)) return done({ buttons: { [s]: true }, time: 0.05 }); // Venu Ganam is slow: not up close
  }
  if (can(mv.a1)) {
    const safe = !m.projectiles.some((pr) => pr.owner !== p.id) && d > 70; // charging can be interrupted: only when nothing is coming
    const charge = mv.a1.charge ? mv.a1.cast + (safe ? R() * mv.a1.charge.max * L.charge : 0.02) : 0.05; // hold a bow shot to charge it
    return done({ buttons: { a1: true }, time: charge });
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
  const want = p.boons.length || !p.ch.gods ? 85 : 95; // a King without a boon stays a bit further out
  const ux = d ? (o.x - p.x) / d : 1, uy = d ? (o.y - p.y) / d : 0;
  const push = Math.max(-1, Math.min(1, (d - want) / 30));
  x += ux * push; y += uy * push;
  cpu.strafeT -= dt;
  if (cpu.strafeT <= 0) { cpu.strafe = R() < 0.5 ? -1 : 1; cpu.strafeT = 1 + R() * 2; }
  x += -uy * cpu.strafe * 0.6; y += ux * cpu.strafe * 0.6;
  // meditating King keeps away (meditation only fills while the opponent is far)
  if (p.ch.gods && !p.boons.length && d < TUNE.meditate.dist + 30 && p.power > 10) { x -= ux * 0.8; y -= uy * 0.8; }
  // stay off the edge
  const r = Math.hypot(p.x, p.y);
  if (r > ARENA.r * 0.7) { const k = (r - ARENA.r * 0.7) / (ARENA.r * 0.3) * 2.5; x -= (p.x / r) * k; y -= (p.y / r) * k; }
  // step out of arrow-rain circles and water
  for (const a of [...m.areas.filter((a) => a.owner !== p.id), ...m.waters]) {
    const ad = Math.hypot(p.x - a.x, p.y - a.y);
    if (ad < a.r + 6) { const l = ad || 1; x += ((p.x - a.x) / l) * 2; y += ((p.y - a.y) / l) * 2; }
  }
  const l = Math.hypot(x, y);
  return l > 1 ? { mx: x / l, my: y / l } : l < 0.15 ? { mx: 0, my: 0 } : { mx: x, my: y };
}

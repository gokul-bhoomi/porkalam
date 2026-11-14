// Exploit hunter: test players that each follow one simple plan (ground rule 16: no simple plan should win).
// A plan is a "genome" of a few knobs, so the same player code can play any fighter (it reads the move data,
// never the fighter's name) and the random search can invent new plans by turning the knobs.
import { whyNot, recoveryOf, airborne } from '../../src/sim.js';
import { RANGES, TUNE, ARENA } from '../../src/config.js';
import { rng } from '../../src/util.js';

// Knobs:
//  want     distance to keep: a number, or 'reach' (inside my own melee reach)
//  moves    weights for which attack to pick: a1 a2 s1 s2 s3 sig
//  aggro    chance to attack at each decision when an attack fits
//  dodge    sidestep incoming shots and arrow-rain circles
//  bait     out of my reach but inside theirs: back off until they commit (recovering, casting, meditating, held)
//  block    chance to wall up against an incoming shot or a swing in reach
//  charge   share of the full charge to hold on a chargeable basic
//  blinkOut chance to blink away when rushed (if the fighter has a blink)
//  air      chance to leave the ground (rule 17): take off when rushed (Fly), hop over a shot (Jump)
//  med      meditate when far away, then spend devotion on boons (save up to this many segments)
//  timeout  once ahead on health, run and keep away until time is up
//  react    seconds between decisions (0.2 s or slower: a person's reaction time, so no plan wins on reflexes)
export const BASE = { want: 80, moves: { a1: 1 }, aggro: 1, dodge: 0, bait: 0, block: 0, charge: 0, blinkOut: 0, air: 0, med: 0, timeout: 0, react: 0.2 };

export const PLANS = {
  'naive basic spam':  { want: 50, moves: { a1: 1 } },
  'naive melee spam':  { want: 'reach', moves: { a2: 1 } },
  'dodging melee rush': { want: 'reach', moves: { a2: 1 }, dodge: 1 },
  'baiting melee':     { want: 'reach', moves: { a2: 1 }, dodge: 1, bait: 1 },
  'kiting shooter':    { want: 'range', moves: { a1: 1 }, dodge: 1, charge: 1 },
  'hit and run':       { want: 70, moves: { a1: 1, a2: 1 }, dodge: 1, bait: 1, blinkOut: 1 },
  'air fighter':       { want: 70, moves: { a1: 1, a2: 1 }, dodge: 1, air: 1 },
  'turtle':            { want: 60, moves: { a1: 1, a2: 1 }, block: 0.9, bait: 1 },
  'specials only':     { want: 70, moves: { s1: 1, s2: 1, s3: 1 }, dodge: 1 },
  'signature saver':   { want: 120, moves: { sig: 3, a1: 1 }, dodge: 1 },
  'meditate for boons': { want: 160, moves: { a1: 1 }, dodge: 1, med: 10 },
  'run out the clock': { want: 70, moves: { a1: 1 }, dodge: 1, timeout: 1 },
};

const COMBO = { sig: { s1: true, s2: true, s3: true }, boon: { s1: true, s2: true }, cls: { s1: true, my: 1 } };

// A random plan for the search: every knob drawn at random.
export function randomPlan(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const moves = {};
  for (const s of ['a1', 'a2', 's1', 's2', 's3', 'sig']) if (r() < 0.5) moves[s] = Math.round(r() * 3 * 10) / 10;
  if (!Object.keys(moves).length) moves.a2 = 1;
  return {
    want: pick(['reach', 'range', 40, 60, 80, 110, 150]), moves, aggro: pick([0.3, 0.6, 1]), dodge: pick([0, 1]), bait: pick([0, 1]),
    block: pick([0, 0.3, 0.8]), charge: pick([0, 0.5, 1]), blinkOut: pick([0, 0.5, 1]), air: pick([0, 0.5, 1]), med: pick([0, 0, 3, 6, 10]), timeout: pick([0, 0, 1]), react: pick([0.2, 0.25, 0.3]),
  };
}

export function describe(plan) {
  const g = { ...BASE, ...plan }, on = (k) => (g[k] ? k : null);
  const mv = Object.entries(g.moves).map(([k, v]) => `${k}x${v}`).join(' ');
  return [`keep ${g.want}`, mv, `aggro ${g.aggro}`, on('dodge'), on('bait'), g.block && `block ${g.block}`, g.charge && `charge ${g.charge}`,
    g.blinkOut && `blinkOut ${g.blinkOut}`, g.air && `air ${g.air}`, g.med && `med ${g.med}`, on('timeout'), `react ${g.react}`].filter(Boolean).join(', ');
}

export function createPlayer(pid, plan, seed = 1) {
  const g = { ...BASE, ...plan }; g.react = Math.max(0.2, g.react);
  const r = rng((seed * 48271 + pid * 7) | 0);
  const st = { hold: null, holdT: 0, gap: 0, think: 0, strafe: 1, strafeT: 0 };
  return (m, dt) => {
    const p = m.players[pid], o = m.players[1 - pid], mv = p.ch.moves;
    const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (m.phase !== 'fight' || m.scene) return {};
    const myReach = mv.a2.reach || 46, oReach = o.ch.moves.a2.reach || 46;
    const a1Reach = RANGES[mv.a1.range]?.[1] ?? 150;

    // movement: toward the distance it wants, strafing, dodging
    let want = g.want === 'reach' ? myReach - 10 : g.want === 'range' ? Math.min(a1Reach - 15, 200) : g.want;
    const open = o.recover > 0.1 || (o.cast && !o.cast.done && o.cast.move.cast > 0.25) || o.med || o.effects.hold || o.effects.stun;
    const ahead = p.hp > o.hp + 1;
    if (g.timeout && ahead) want = 250;
    if (g.bait && !open && d > myReach && d < oReach + 25) want = oReach + 30;
    const push = Math.max(-1, Math.min(1, (d - want) / 25));
    let mx = ux * push, my = uy * push;
    st.strafeT -= dt;
    if (st.strafeT <= 0) { st.strafe = r() < 0.5 ? -1 : 1; st.strafeT = 0.8 + r() * 1.5; }
    mx += -uy * st.strafe * 0.5; my += ux * st.strafe * 0.5;
    const rr = Math.hypot(p.x, p.y);
    if (rr > ARENA.r * 0.75) { mx -= (p.x / rr) * 1.5; my -= (p.y / rr) * 1.5; }
    let threat = null;
    for (const pr of m.projectiles) {
      if (pr.owner === pid) continue;
      if (pr.flown < Math.hypot(pr.vx, pr.vy) * g.react) continue; // a person only sees a shot after reacting to it
      const rx = p.x - pr.x, ry = p.y - pr.y, v2 = pr.vx ** 2 + pr.vy ** 2;
      const t = v2 ? (rx * pr.vx + ry * pr.vy) / v2 : -1;
      if (t < 0 || t > 0.6) continue;
      const cx = pr.x + pr.vx * t - p.x, cy = pr.y + pr.vy * t - p.y;
      if (Math.hypot(cx, cy) < pr.r + 14) {
        threat = pr;
        if (g.dodge) { const s = cx * -uy + cy * ux > 0 ? -1 : 1; mx = -uy * s * 2 + mx * 0.3; my = ux * s * 2 + my * 0.3; }
      }
    }
    if (g.dodge) for (const a of m.areas) if (a.owner !== pid && Math.hypot(p.x - a.x, p.y - a.y) < a.r + 8) { mx = p.x - a.x; my = p.y - a.y; }
    const ml = Math.hypot(mx, my), move = ml > 1 ? { mx: mx / ml, my: my / ml } : { mx, my };

    // keep holding an earlier press (charge, block, combo); then let go for one step so the next press counts
    if (st.holdT > 0) { st.holdT -= dt; const out = { ...st.hold }; if (st.holdT <= 0) st.gap = 2 * dt; return out.mx != null || out.my != null ? out : { ...move, ...out }; }
    if (st.gap > 0) { st.gap -= dt; return move; }
    st.think -= dt;
    if (st.think > 0) return move;
    st.think = g.react;
    const press = (buttons, time = 0.05) => { st.hold = buttons; st.holdT = time; return buttons.mx != null || buttons.my != null ? buttons : { ...move, ...buttons }; };
    if (p.cast || p.recover > 0 || p.effects.stun) return move;

    // meditating: sit until devotion reaches the target (or the barrier is nearly gone), then get up
    if (p.med) return (p.devotion >= g.med || p.med.barrier < 6 || d < 40) ? press({ block: true }) : {};
    // boons
    if (p.boon && !whyNot(m, p, { ...p.boon.move, range: 'anywhere' })) return press(COMBO.boon);
    if (!p.boon && g.med && p.devotion >= Math.min(g.med, TUNE.meditate.segments)) return press(COMBO.boon);
    if (g.med && p.devotion < g.med && d > 110 && !threat && !o.cast && !whyNot(m, p, mv.cls)) return press(COMBO.cls);

    // defence
    const swing = o.cast && !o.cast.done && o.cast.move.kind === 'melee' && d < oReach + 6;
    if ((threat || swing) && !p.air && g.block && r() < g.block && p.power >= p.ch.defence.cost) return press({ block: true }, 0.4);
    const slotOf = (kind) => ['s1', 's2', 's3'].find((sl) => mv[sl]?.kind === kind), flyS = slotOf('fly'), jumpS = slotOf('jump');
    if (flyS && p.air?.kind === 'fly' && airborne(p) && (p.power < 10 || d > oReach + 70)) return press({ [flyS]: true }); // land when safe
    if (g.air && flyS && !p.air && d < oReach + 6 && p.power > 20 && r() < g.air && !whyNot(m, p, mv[flyS])) return press({ [flyS]: true });
    if (g.air && jumpS && threat && r() < g.air && !whyNot(m, p, mv[jumpS])) {
      const l = Math.hypot(threat.vx, threat.vy) || 1, s = r() < 0.5 ? 1 : -1;
      return press({ [jumpS]: true, mx: (-threat.vy / l) * s, my: (threat.vx / l) * s });
    }
    const blink = ['s1', 's2', 's3'].find((s) => mv[s]?.kind === 'blink');
    if (blink && d < oReach + 4 && g.blinkOut && r() < g.blinkOut && !whyNot(m, p, mv[blink])) {
      const ax = -ux - p.x / ARENA.r, ay = -uy - p.y / ARENA.r, al = Math.hypot(ax, ay) || 1;
      return press({ [blink]: true, mx: ax / al, my: ay / al });
    }

    // attack
    if (g.timeout && ahead) return move;
    if (g.bait && !open && d > myReach) return move;
    if (r() > g.aggro) return move;
    const opts = Object.entries(g.moves).filter(([s, w]) => {
      const x = mv[s];
      if (!x || w <= 0 || ['blink', 'meditate', 'fly', 'jump'].includes(x.kind) || whyNot(m, p, x)) return false;
      if (s === 'a2') return d < myReach - 2 && !airborne(o);
      if (s === 'a1') return d < a1Reach + 5;
      return true;
    });
    if (!opts.length) return move;
    let k = r() * opts.reduce((a, [, w]) => a + w, 0), slot = opts[0][0];
    for (const [s, w] of opts) if ((k -= w) < 0) { slot = s; break; }
    if (slot === 'sig') return press(COMBO.sig);
    const x = mv[slot];
    const hold = x.charge ? x.cast + g.charge * (x.charge.max - x.cast) : 0.05;
    return press({ [slot]: true }, Math.max(0.05, hold));
  };
}

// Play one match: the plan's player on side pid, the computer at `level` on the other side.
import { createMatch, stepMatch } from '../../src/sim.js';
import { createCpu, cpuInput } from '../../src/ai.js';
import { STEP } from '../../src/config.js';
export function playMatch(plan, pid, level, seed, chars = ['siddhan', 'veeran'], time = 300) {
  const m = createMatch({ seed, time, chars }), me = createPlayer(pid, plan, seed), cpu = createCpu(1 - pid, level, seed);
  for (let f = 0; m.phase === 'fight' && f < (time + 30) / STEP; f++) {
    const inp = [];
    inp[pid] = me(m, STEP); inp[1 - pid] = cpuInput(m, cpu, STEP);
    stepMatch(m, inp);
  }
  const w = m.result?.winner;
  return { win: w === pid, draw: w == null, reason: m.result?.reason, hp: m.players.map((p) => p.hp) };
}
export { recoveryOf };

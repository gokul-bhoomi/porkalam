// Computer opponent for 1-player mode. It only reads the match and returns the same button state a
// player would give (mx, my, a1, a2, block, s1-s3), so it plays by exactly the same rules.
// It has its own random numbers, so it never changes the match's random draws.
import { ARENA, TUNE, RANGES } from './config.js';
import { rng, dist } from './util.js';
import { whyNot, opponent, airborne } from './sim.js';

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
  siddhan: { easy: 0.05, normal: 0.1, hard: -0.1 }, // skill 0.20 / 0.70 / 0.80 (re-measured 2026-11-14 after quick shots stopped clashing)
  veeran: { easy: -0.15, normal: 0, hard: 0.1 },      // skill 0.00 / 0.60 / 1.00
};
export const LEVEL_IDS = Object.keys(LEVELS);

// skill: a fixed skill (0-1) for both fighters, without SKILL_ADJUST. The balance tests use it to compare the
// characters themselves at equal skill (ground rule 16).
export function createCpu(pid, level = 'normal', seed = 1, skill = null) {
  return {
    pid, level: LEVELS[level] ? level : 'normal', skill, L: null, r: rng((seed * 7919 + pid * 104729) | 0),
    think: 0, rest: 1, hold: {}, holdT: 0, gap: 0, strafe: 1, strafeT: 0, dodge: null, dodgeT: 0, medWait: 0, wasMed: false, medProg: null, medStuck: 0,
  };
}

const COMBO = { sig: { s1: true, s2: true, s3: true }, boon: { s1: true, s2: true }, cls: { s1: true, my: 1 } };

export function cpuInput(m, cpu, dt) {
  const p = m.players[cpu.pid], o = opponent(m, p), R = cpu.r;
  if (!cpu.L) { // settle the skill once we know which fighter it plays
    const k = cpu.skill ?? LEVELS[cpu.level].skill + (SKILL_ADJUST[p.ch.id]?.[cpu.level] || 0);
    cpu.L = skillParams(Math.max(0, Math.min(1, k)));
  }
  const L = cpu.L;
  const out = { mx: 0, my: 0 };
  if (m.phase !== 'fight' || m.scene) return out;
  const d = dist(p, o);
  // notice my shots dying in mid-air (cancelled by the opponent's in a clash, rule 6): a fast fighter whose arrows
  // keep losing to a stream of shots stops trading and uses his speed to close in (the slow fighter is weak up close)
  if (p.ch.speed > o.ch.speed * 1.3) {
    const mine = new Map(m.projectiles.filter((pr) => pr.owner === p.id).map((pr) => [pr.id, pr]));
    for (const [id, pr] of cpu.shots || []) if (!mine.has(id) && Math.hypot(pr.x - o.x, pr.y - o.y) > TUNE.fighterR + 25) cpu.lost = (cpu.lost || 0) + 1;
    cpu.shots = new Map([...mine].map(([id, pr]) => [id, { x: pr.x, y: pr.y }]));
    cpu.lost = Math.max(0, (cpu.lost || 0) - dt * 0.4);
    if (cpu.lost >= 3 && R() < L.plan) { cpu.rushT = 4 + 2 * R(); cpu.lost = 0; }
  }
  cpu.rushT = Math.max(0, (cpu.rushT || 0) - dt);

  // keep holding whatever an earlier decision pressed (block, a charged shot, a combo)
  if (cpu.holdT > 0) {
    // charging a shot roots you: a good player lets it fly early and sidesteps when a shot is coming
    if (cpu.hold.a1 && p.cast && p.cast.t >= p.cast.move.cast && cpu.L.dodge > 0.5) {
      const th = incoming(m, p);
      if (th && cpu.r() < cpu.L.dodge) { cpu.hold = {}; cpu.holdT = 0; cpu.gap = 3 * dt; cpu.dodge = dodgeDir(p, th, cpu.r, cpu.L); cpu.dodgeT = 0.45; return Object.assign(out, steer(m, cpu, p, o, d, dt)); }
    }
    // a wall is no use against a move that goes through any block: stop building it and deal with the draw instead
    if (cpu.hold.block && o.cast && !o.cast.done && o.cast.move.pierceBlock && cpu.r() < 0.3 + 0.7 * cpu.L.plan) { cpu.hold = {}; cpu.holdT = 0; cpu.think = 0; return Object.assign(out, steer(m, cpu, p, o, d, dt)); }
    cpu.holdT -= dt;
    Object.assign(out, cpu.hold);
    if (cpu.holdT <= 0) { cpu.hold = {}; cpu.gap = 3 * dt; } // let go for a moment so the next press counts
    if (!out.mx && !out.my) Object.assign(out, steer(m, cpu, p, o, d, dt));
    return out;
  }
  if (cpu.gap > 0) { cpu.gap -= dt; return Object.assign(out, steer(m, cpu, p, o, d, dt)); }

  cpu.think -= dt; cpu.rest -= dt; cpu.medWait -= dt; cpu.wallMedT = (cpu.wallMedT || 0) - dt;
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
    if (cpu.medHp == null) cpu.medHp = p.hp;
    // some of every hit leaks through the barrier (rule 11): sitting under fire costs health, so get up and fight
    if (p.hp < cpu.medHp - 3 - 4 * (1 - L.plan)) { cpu.medProg = cpu.medHp = null; cpu.medWait = 4; return stop; }
    if (cpu.medStuck > 1.2 || (o.med && R() < 0.5 + L.plan * 0.5)) { cpu.medProg = cpu.medHp = null; return stop; }
    // a big draw that goes through any block (the Gaja Arrow) only half-hits the barrier: get up and break it, or move
    if (o.cast && !o.cast.done && o.cast.move.pierceBlock && o.cast.move.cast >= 0.5 && R() < 0.3 + 0.7 * L.plan) {
      cpu.medProg = cpu.medHp = null; cpu.medWait = 3;
      const homing = ['s1', 's2', 's3'].find((sl) => mv[sl]?.legs && can(mv[sl]));
      if (homing) return { buttons: { [homing]: true }, time: 0.05 }; // a move gets up and goes off at once
      if (can(mv.a1)) return { buttons: { a1: true }, time: 0.05 };
      return stop;
    }
    return null;
  }
  cpu.medProg = cpu.medHp = null;

  // defence: an attack is on its way
  // the slow Mage can't sidestep well, so he raises his earth wall against any shot
  const threat = incoming(m, p), big = threat && (threat.dmg >= 6 || threat.r >= 6 || p.ch.id === 'siddhan');
  // ground rule 17: the moves that leave the ground (Fly, Jump), wherever a fighter has them
  const slotOf = (kind) => ['s1', 's2', 's3'].find((sl) => mv[sl]?.kind === kind), flyS = slotOf('fly'), jumpS = slotOf('jump');
  const oReach = o.ch.moves.a2.reach || 46;
  if (flyS && p.air?.kind === 'fly' && airborne(p)) { // flying: come down when it's safe again, or the power runs low
    if (p.power < 10 || (d > oReach + 70 && R() < 0.3)) return { buttons: { [flyS]: true }, time: 0.05 };
  }
  // Shiva's Tandava: standing in the lava on the sunk half hurts, so jump or fly across (the only way over)
  const ch = m.arenaChange;
  const sunk = ch?.kind === 'chasm' && ch.lava && !p.air ? (p.x - ch.x) * ch.nx + (p.y - ch.y) * ch.ny : 0;
  if (sunk > 0 && R() < 0.3 + 0.7 * L.plan) {
    const across = { mx: -ch.nx, my: -ch.ny };
    if (jumpS && sunk > ch.w / 2 + TUNE.fighterR + 30) return { buttons: across, time: 0.3 }; // walk to the edge first
    if (jumpS && can(mv[jumpS])) { cpu.dodge = { x: -ch.nx, y: -ch.ny }; cpu.dodgeT = 0.6; return { buttons: { [jumpS]: true, ...across }, time: 0.05 }; }
    if (flyS && can(mv[flyS])) return { buttons: { [flyS]: true }, time: 0.05 };
  }
  const bigCast = o.cast && !o.cast.done && o.cast.move.cast >= 0.5 && o.cast.t < o.cast.move.cast;
  // a move that goes through any block (the Gaja Arrow): a wall is no use. Break the draw with a hit if one can
  // land in time (ground rule 7), otherwise get out of its line as it leaves: blink, jump or sidestep
  const pierceCast = bigCast && o.cast.move.pierceBlock, pierceShot = threat && threat.pierceBlock;
  if (pierceCast || pierceShot) {
    const left = pierceCast ? o.cast.move.cast - o.cast.t : 0;
    if (pierceCast && R() < 0.3 + 0.7 * L.plan) {
      const homing = ['s1', 's2', 's3'].find((sl) => mv[sl]?.legs && can(mv[sl]));
      if (homing && mv[homing].cast + d / mv[homing].speed < left - 0.1) return { buttons: { [homing]: true }, time: 0.05 };
      if (can(mv.a1) && d < (RANGES[mv.a1.range]?.[1] ?? 150) - 5 && mv.a1.cast + d / (mv.a1.speed || 1e9) < left - 0.1) return { buttons: { a1: true }, time: 0.05 };
      if (d < (mv.a2.reach || 46) - 2 && can(mv.a2)) return { buttons: { a2: true }, time: 0.05 };
    }
    if (pierceShot || left < 0.35) {
      const l0 = Math.hypot(o.x - p.x, o.y - p.y) || 1, u = { x: (o.x - p.x) / l0, y: (o.y - p.y) / l0 }, side = R() < 0.5 ? 1 : -1, away = { x: -u.y * side, y: u.x * side };
      cpu.dodge = away; cpu.dodgeT = 0.6;
      const blinkS = ['s1', 's2', 's3'].find((sl) => mv[sl]?.kind === 'blink');
      if (R() < 0.35 + 0.6 * L.dodge) {
        if (blinkS && can(mv[blinkS])) return { buttons: { [blinkS]: true, mx: away.x, my: away.y }, time: 0.05 };
        if (jumpS && can(mv[jumpS])) return { buttons: { [jumpS]: true, mx: away.x, my: away.y }, time: 0.05 };
      }
      return null;
    }
  }
  if ((threat || bigCast) && p.power >= p.ch.defence.cost && !pierceCast && !pierceShot) {
    if (!p.air && R() < (big || bigCast ? L.block : L.block * 0.25)) { // small pokes aren't worth stopping for (no block in the air)
      const left = bigCast ? o.cast.move.cast - o.cast.t + 0.3 : 0.5;
      return { buttons: { block: true }, time: Math.min(TUNE.block.buildTime - 0.1, Math.max(0.35, left)) };
    }
    if (threat && R() < L.dodge) { // sidestep across the shot's path
      cpu.dodge = dodgeDir(p, threat, R, L); cpu.dodgeT = 0.45;
      // hop over it only when a sidestep won't make it in time, or it's a big hit (a jump costs power and a landing pause)
      const tHit = Math.hypot(threat.x - p.x, threat.y - p.y) / (Math.hypot(threat.vx, threat.vy) || 1);
      if (jumpS && can(mv[jumpS]) && (tHit < 0.3 || threat.dmg >= 8) && R() < L.dodge) return { buttons: { [jumpS]: true, mx: cpu.dodge.x, my: cpu.dodge.y }, time: 0.05 };
      if (p.ch.id === 'siddhan' && can(mv.s3) && R() < 0.5) return { buttons: { s3: true, mx: cpu.dodge.x, my: cpu.dodge.y }, time: 0.05 }; // blink away
      return null;
    }
  }

  // boons: spend devotion. A beginner cashes in at once; a better player saves up for the divine weapon
  const M = TUNE.meditate, dv = p.devotion;
  if (p.boon) { // a held boon always finds its target; use it when nothing of theirs is in the air to meet it
    const bm = { ...p.boon.move, range: 'anywhere' }, ready = can(bm) && !m.projectiles.some((pr) => pr.owner !== p.id);
    if (ready && R() < 0.6) return { buttons: COMBO.boon, time: 0.05 };
  } else if (dv >= M.tiers[0]) {
    const want = L.plan > 0.85 ? M.tiers[1] : M.tiers[0];
    if ((dv >= want || (o.hp < 20 && R() < 0.5)) && R() < 0.7) return { buttons: COMBO.boon, time: 0.05 };
  }
  // meditate when the opponent is far and nothing is on its way (both classes).
  // Against a faster opponent who keeps poking from range, the barrier is the answer: meditate at mid range too
  // (shots then hit the barrier instead of health, and the boons that come out always find their target).
  const kited = o.ch.speed > p.ch.speed * 1.3 && d > (o.ch.moves.a2.reach || 46) + 40 && R() < L.plan;
  if (dv < M.segments && can(mv.cls) && cpu.medWait <= 0 && !o.med && !o.chord && (d > M.dist + 30 || kited || cpu.wallMedT > 0) && !o.cast && !threat && (cpu.wallMedT > 0 || R() < 0.5)) {
    // a wall stands for as long as its builder meditates (rule 11): put one up between you first
    const walled = m.walls.some((w) => w.owner === p.id && w.standing && (w.x - p.x) * (o.x - p.x) + (w.y - p.y) * (o.y - p.y) > 0 && w.cap > 6);
    if (!walled && !(cpu.wallMedT > 0) && p.power >= p.ch.defence.cost + mv.cls.cost.power && R() < 0.3 + 0.7 * L.plan) {
      cpu.wallMedT = 2.5;
      return { buttons: { block: true }, time: 0.9 + 0.8 * L.plan };
    }
    cpu.wallMedT = 0;
    return { buttons: COMBO.cls, time: 0.05 };
  }

  const done = (b) => { cpu.rest = L.rest[0] + R() * (L.rest[1] - L.rest[0]); return b; };
  // a meditating opponent can't hit back: break the barrier as fast as possible (ground rule 11 counter-play).
  // Specials first, then shoves/slashes up close, then fully charged shots (nothing can interrupt them).
  if (o.med && !threat && R() < 0.4 + 0.6 * L.plan) {
    const big = ['s1', 's2', 's3'].filter((s) => mv[s] && mv[s].damage >= 8 && can(mv[s]) && (mv[s].cost?.power || 0) <= p.power - 3);
    if (big.length) return done({ buttons: { [big[0]]: true }, time: 0.05 });
    if (d < (mv.a2.reach || 46) - 2 && can(mv.a2) && !airborne(o)) return done({ buttons: { a2: true }, time: 0.05 });
    if (can(mv.a1) && d < (RANGES[mv.a1.range]?.[1] ?? 150)) return done({ buttons: { a1: true }, time: mv.a1.charge ? mv.a1.charge.max + 0.05 : 0.05 });
  }
  const plan = tactics(m, cpu, p, o, d, can, threat);
  if (plan) return done(plan);
  if (cpu.rest > 0 && !(o.med && R() < L.plan)) return null; // a meditating opponent is an open target: press it

  // signature move when there's power to spare
  if (can(mv.sig) && p.hp > 20 && R() < L.sig * 0.5) return done({ buttons: COMBO.sig, time: 0.05 });

  // rushed up close (ground rule 16: every fighter has an answer). Within the opponent's melee reach:
  // a good player blinks out toward the middle, walls up against a swing that's coming, or shoves first.
  const rushed = d < oReach + 6 && !airborne(p);
  if (rushed && p.recover <= 0) {
    if (flyS && !p.air && can(mv[flyS]) && p.power > 20 && R() < 0.3 + 0.5 * L.plan) return done({ buttons: { [flyS]: true }, time: 0.05 }); // take off: the knife can't follow
    if (p.ch.id === 'siddhan' && can(mv.s3) && R() < 0.25 + 0.5 * L.plan) { // blink away, toward the middle of the arena
      const l = d || 1, ax = (p.x - o.x) / l - p.x / ARENA.r, ay = (p.y - o.y) / l - p.y / ARENA.r, al = Math.hypot(ax, ay) || 1;
      return done({ buttons: { s3: true, mx: ax / al, my: ay / al }, time: 0.05 });
    }
    const swing = o.cast && !o.cast.done && o.cast.move.kind === 'melee';
    if ((swing || o.recover <= 0) && p.ch.id === 'siddhan' && p.power >= p.ch.defence.cost && R() < L.block * 0.6) {
      return { buttons: { block: true }, time: 0.35 + R() * 0.3 }; // the earth wall stops the knife
    }
    if (d < (mv.a2.reach || 46) && can(mv.a2) && !airborne(o)) return done({ buttons: { a2: true }, time: 0.05 });
  }

  if (R() > L.aggr) return null;
  // a special, if the power is there and the move fits the distance
  const spare = p.power - L.reserve;
  const specials = ['s1', 's2', 's3'].filter((s) => mv[s] && !['blink', 'fly', 'jump'].includes(mv[s].kind) && can(mv[s]) && (mv[s].cost?.power || 0) <= spare);
  if (specials.length && R() < 0.45) {
    const s = specials[Math.floor(R() * specials.length)];
    return done({ buttons: { [s]: true }, time: 0.05 });
  }
  // the Mage holds back mantra bolts while he isn't saving up for the chakra
  if (p.ch.id === 'siddhan' && p.power - (mv.a1.cost?.power || 0) < mv.s1.cost.power && R() < L.plan * 0.5) return null;
  const reach = RANGES[mv.a1.range]?.[1] ?? Infinity;
  if (can(mv.a1) && d < reach + 10) { // basics always fire, but don't waste one that would fall short
    const safe = !m.projectiles.some((pr) => pr.owner !== p.id) && d > 70; // charging can be interrupted: only when nothing is coming
    // the slow Mage only charges when the Warrior can't punish it (busy meditating, held, stunned or casting)
    const busy = !!(o.med || o.effects.hold || o.effects.stun || (o.cast && !o.cast.done && !o.cast.move.charge && o.cast.move.cast - o.cast.t > 0.8)); // a long cast, not a quick shot
    // a stream of weak shots coming straight back would cancel every quick arrow (rule 6): charge just enough to beat
    // the next one in the clash, if there's time before it arrives (the counter to a bolt wall)
    if (mv.a1.charge && p.ch.weapon === 'bow' && R() < L.plan) {
      const C = mv.a1.charge, pr = m.projectiles.find((q) => q.owner !== p.id && !q.seek && (q.vx * (p.x - q.x) + q.vy * (p.y - q.y)) > 0);
      if (pr) {
        const v = Math.hypot(pr.vx, pr.vy) || 1, tHit = Math.hypot(p.x - pr.x, p.y - pr.y) / v;
        const k = Math.max(0, Math.min(1, (pr.dmg + 1.5 - mv.a1.damage) / (C.damage - mv.a1.damage)));
        const tNeed = mv.a1.cast + k * C.max;
        if (tHit > tNeed + 0.08) return done({ buttons: { a1: true }, time: tNeed + 0.02 });
        if (k > 0) return null; // too close to out-charge it: a quick arrow would only die in the clash, so wait for a gap
      }
    }
    const canCharge = p.ch.weapon === 'bow' ? safe : safe && busy;
    const charge = mv.a1.charge ? mv.a1.cast + (canCharge ? L.minCharge + R() * mv.a1.charge.max * L.charge : 0) : 0.05; // hold a bow shot to charge it
    return done({ buttons: { a1: true }, time: charge });
  }
  return null;
}

// Each fighter's own game plan, on top of the shared basics. Returns a press or null.
//  - Both: break the opponent's slow casts with a quick hit (ground rule 7), and cash in when they're held.
//  - Mage (slow, strong magic): the chakra reaches anywhere, Thousand-Arm Form when the Warrior
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
  const pin = ['s1', 's2', 's3'].find((sl) => mv[sl]?.effect?.kind === 'hold');
  if (pin && can(mv[pin]) && !o.effects.hold && p.power > mv[pin].cost.power + mv.a1.cost.power * 3 && R() < 0.3) return tap(pin); // pin
  if (can(mv.sig) && p.hp > 25 && d > 150 && !threat && (!oc && o.power < 30)) return { buttons: { s1: true, s2: true, s3: true }, time: 0.05 };
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

// Which way to sidestep a shot: across its path, toward the middle of the arena (a good player doesn't dodge into
// the edge, where the invisible wall stops them); a beginner picks a side at random.
function dodgeDir(p, threat, R, L) {
  const l = Math.hypot(threat.vx, threat.vy) || 1, sx = -threat.vy / l, sy = threat.vx / l;
  const inward = sx * -p.x + sy * -p.y >= 0 ? 1 : -1;
  const side = R() < L.plan ? inward : R() < 0.5 ? 1 : -1;
  return { x: sx * side, y: sy * side };
}

// Movement: keep a good fighting distance, circle the opponent, stay off the edge and out of danger.
function steer(m, cpu, p, o, d, dt) {
  const R = cpu.r;
  let x = 0, y = 0;
  if (cpu.dodgeT > 0) { cpu.dodgeT -= dt; x += cpu.dodge.x * 3.5; y += cpu.dodge.y * 3.5; } // dodging outweighs everything else
  // the Warrior uses his speed to stay out of bolt range (kite); the Mage wants to close in.
  // Against a meditating opponent, close in: meditation only fills while you keep away, and the barrier has to be broken.
  // (a Warrior against a short-range basic attack stays just beyond its reach)
  const outReach = RANGES[o.ch.moves.a1.range]?.[1] ?? Infinity;
  let kiteTo = Number.isFinite(outReach) ? outReach + 12 : 95 + cpu.L.kite * 65; // even a beginner backs off out of reach
  // shots weaken past their full-strength distance (rule 4): a good player fights from inside it, even if that is in reach
  const full = p.ch.moves.a1.falloff?.full;
  if (full && kiteTo > full + 15) kiteTo += (full + 10 - kiteTo) * cpu.L.plan;
  const want = o.med ? 30 + 40 * (1 - cpu.L.plan) : cpu.rushT > 0 ? (p.ch.moves.a2.reach || 46) - 12 : p.ch.id === 'siddhan' ? 80 : kiteTo;
  const ux = d ? (o.x - p.x) / d : 1, uy = d ? (o.y - p.y) / d : 0;
  const push = Math.max(-1, Math.min(1, (d - want) / 30));
  x += ux * push; y += uy * push;
  cpu.strafeT -= dt;
  if (cpu.strafeT <= 0) { cpu.strafe = R() < 0.5 ? -1 : 1; cpu.strafeT = 1 + R() * 2; }
  x += -uy * cpu.strafe * 0.6; y += ux * cpu.strafe * 0.6;
  // a Warrior hoping to meditate keeps away (meditation only fills while the opponent is far)
  if (p.ch.cls === 'warrior' && !o.med && !(cpu.rushT > 0) && p.devotion < TUNE.meditate.segments && d < TUNE.meditate.dist + 30 && p.power > 10) { x -= ux * 0.8; y -= uy * 0.8; }
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

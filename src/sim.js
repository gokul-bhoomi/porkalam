// Fight rules. Pure and deterministic with a fixed 1/60 s step.
// Input: both players' button states. Output: the match state (read by the renderer, never written by it).
// Every amount is a percentage of a 100% bar; every time is in seconds.
import { STEP, ARENA, RANGES, TUNE } from './config.js';
import { rng, clamp, dist } from './util.js';
import { CHARS } from './chars/index.js';
import { GODS, findBoon } from './chars/gods.js';

// Same button layout for every fighter (ground rule 14).
export const BUTTONS = ['a1', 'a2', 'block', 'trapPlant', 'trapWater', 's1', 's2', 's3', 'sig', 'cls', 'boon', 'god', 'boonNext'];
const ACTS = ['sig', 'cls', 's1', 's2', 's3', 'a2', 'a1', 'boon']; // if several are pressed in one step, the first wins

export function createMatch({ seed = 1, time = TUNE.match.default, chars = ['krishna', 'rajaraja'] } = {}) {
  const duration = clamp(time, TUNE.match.min, TUNE.match.max);
  return {
    seed, rand: rng(seed), t: 0, duration, timeLeft: duration, phase: 'fight', result: null, scene: null,
    players: chars.map((id, i) => makeFighter(CHARS[id], i)),
    projectiles: [], strikes: [], areas: [], traps: [], marks: [], waters: [], units: [], arenaChange: null,
    hits: [], events: [], prev: [{}, {}], nid: 1,
  };
}

function makeFighter(ch, i) {
  return {
    id: i, ch, x: i === 0 ? -TUNE.startX : TUNE.startX, y: 0, face: { x: i === 0 ? 1 : -1, y: 0 },
    hp: ch.health, power: ch.power.size * TUNE.startPower, kvx: 0, kvy: 0,
    cast: null, block: null, med: null, dash: null, effects: {}, boons: [], boonSel: 0, god: 0, meditations: 0, lotus: false,
    trapsActive: 0, msg: null, stats: { dealt: 0, taken: 0 },
  };
}

export const opponent = (m, p) => m.players[1 - p.id];
const ev = (m, type, o = {}) => { m.events.push({ type, t: m.t, ...o }); if (m.events.length > 400) m.events.splice(0, 100); };
const say = (p, text) => { p.msg = { text, t: 1.2 }; };

// Ground rule 4: long-distance special moves have no distance requirement.
export function rangeOf(move) {
  return move.special && (move.range === 'long' || move.range === 'midlong') ? 'anywhere' : move.range;
}
export function rangeOK(move, d) { const [lo, hi] = RANGES[rangeOf(move)]; return d >= lo && d <= hi; }

// Why a move can't start right now (null = it can).
export function whyNot(m, p, move, extraPower = 0) {
  if (p.effects.stun) return 'STUNNED';
  const d = dist(p, opponent(m, p)), [lo] = RANGES[rangeOf(move)];
  if (!rangeOK(move, d)) return d < lo ? 'TOO CLOSE' : 'TOO FAR';
  const r = move.req || {}, c = move.cost || {};
  const pw = (c.power === 'all' ? 0 : c.power || 0) + extraPower;
  if (p.power + 1e-9 < Math.max(pw, r.minPower || 0)) return 'NO POWER';
  if (r.fullPower && p.power < p.ch.power.size - 1e-6) return 'NEEDS FULL POWER';
  if (r.maxHealth != null && !(p.hp < r.maxHealth)) return `HEALTH UNDER ${r.maxHealth}% ONLY`;
  if (r.minHealth != null && p.hp < r.minHealth) return 'NO HEALTH';
  if (r.maxBoons != null && p.boons.length >= r.maxBoons) return 'BOONS FULL';
  // Ground rule 4: a move can bring its user to 0 health only if it says so.
  if (c.health && !move.selfKO && p.hp - c.health <= 0) return 'NO HEALTH';
  return null;
}

function pay(p, move, extraPower = 0) {
  const c = move.cost || {};
  p.power = c.power === 'all' ? 0 : Math.max(0, p.power - (c.power || 0) - extraPower);
  if (c.health) p.hp = Math.max(move.selfKO ? 0 : 0.01, p.hp - c.health);
}

// Temporary effects (ground rule 9): set duration, the same kind doesn't stack, the strongest counts.
export function applyEffect(p, kind, time, mag = 1) {
  const cur = p.effects[kind], str = (e) => (kind === 'slow' ? e.mag : e.t);
  const next = { t: time, mag };
  if (!cur || str(next) > str(cur)) p.effects[kind] = next;
  else if (str(next) === str(cur)) cur.t = Math.max(cur.t, time);
}

// Extra units (ground rule 12): own health, can be hit, gone when their timer ends.
export function spawnUnit(m, { owner, x, y, hp = 20, time = 15, r = 7, name = 'helper' }) {
  const u = { id: m.nid++, owner, x, y, hp, t: time, r, name };
  m.units.push(u);
  return u;
}
// Arena changes (ground rule 12): only one at a time, always with an end time.
export function startArenaChange(m, change) {
  if (m.arenaChange || !(change.time > 0) || !Number.isFinite(change.time)) return false;
  m.arenaChange = { ...change, t: change.time };
  return true;
}

// how charged a hold-to-charge move is (0 = tapped, 1 = full)
export const chargeOf = (c) => clamp((c.t - c.move.cast) / (c.move.charge.max - c.move.cast), 0, 1);
const canMove = (p) => !p.cast && !p.block && !p.med && !p.dash && !p.effects.hold && !p.effects.stun;
const unitDir = (dx, dy) => { const l = Math.hypot(dx, dy); return l > 1e-9 ? { x: dx / l, y: dy / l } : { x: 0, y: 0 }; };

// ---------------------------------------------------------------------------------------------
export function stepMatch(m, inputs = [{}, {}], dt = STEP) {
  if (m.phase === 'done') return m;
  inputs = [inputs[0] || {}, inputs[1] || {}];
  if (m.scene) { // a power move's dramatic scene: the game pauses for both players
    m.scene.t += dt;
    if (m.scene.t >= m.scene.dur - 1e-9) { ev(m, 'sceneEnd', { name: m.scene.name }); m.scene = null; }
    m.prev = inputs.map((i) => ({ ...i }));
    return m;
  }
  m.t += dt;
  m.timeLeft = Math.max(0, m.timeLeft - dt);
  m.strikes = [];

  movement(m, inputs, dt);        // 1. movement (and timers)
  newMoves(m, inputs, dt);        // 2. new moves start, casts finish
  clashes(m);                     // 3. clashes are decided
  collectHits(m);
  applyHits(m);                   // 4. all damage and healing apply together
  checkEnd(m);                    // 5. check for 0 health (and time-up)

  m.prev = inputs.map((i) => ({ ...i }));
  return m;
}

// ---------- 1. movement ----------
function movement(m, inputs, dt) {
  const R = ARENA.r - TUNE.fighterR;
  for (const p of m.players) {
    const inp = inputs[p.id];
    for (const k of Object.keys(p.effects)) if ((p.effects[k].t -= dt) <= 0) delete p.effects[k];
    if (p.msg && (p.msg.t -= dt) <= 0) p.msg = null;
    p.power = Math.min(p.ch.power.size, p.power + p.ch.power.refill * dt); // ground rule 2: constant rate
    if (p.dash) {
      p.x += p.dash.vx * dt; p.y += p.dash.vy * dt;
      if ((p.dash.t -= dt) <= 0) p.dash = null;
    } else if (canMove(p)) {
      let mx = +inp.mx || 0, my = +inp.my || 0;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      const sp = p.ch.speed * (1 - (p.effects.slow?.mag || 0));
      p.x += mx * sp * dt; p.y += my * sp * dt;
    }
    p.x += p.kvx * dt; p.y += p.kvy * dt;
    const f = Math.exp(-TUNE.kbFriction * dt);
    p.kvx *= f; p.kvy *= f;
    if (Math.hypot(p.kvx, p.kvy) < 1) p.kvx = p.kvy = 0;
    // ground rule 13: the edge is an invisible wall; getting knocked into it costs health
    const d = Math.hypot(p.x, p.y);
    if (d > R) {
      const n = { x: p.x / d, y: p.y / d }, vn = p.kvx * n.x + p.kvy * n.y;
      if (vn > TUNE.wallKb) { m.hits.push({ target: p, dmg: TUNE.wallDmg, kb: 0, src: 'wall', from: null }); ev(m, 'wall', { pid: p.id, x: p.x, y: p.y }); }
      if (vn > 0) { p.kvx -= 1.3 * vn * n.x; p.kvy -= 1.3 * vn * n.y; }
      p.x = n.x * R; p.y = n.y * R;
    }
  }
  // fighters can't overlap
  const [a, b] = m.players, dd = dist(a, b), min = TUNE.fighterR * 2;
  if (dd < min) {
    const n = dd > 1e-6 ? unitDir(b.x - a.x, b.y - a.y) : { x: 1, y: 0 }, push = (min - dd) / 2;
    a.x -= n.x * push; a.y -= n.y * push; b.x += n.x * push; b.y += n.y * push;
  }
  for (const p of m.players) { // ground rule 4: attacks turn toward the opponent
    const o = opponent(m, p), fd = unitDir(o.x - p.x, o.y - p.y);
    if (fd.x || fd.y) p.face = fd;
  }

  for (const pr of m.projectiles) {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt; pr.lt += dt;
    if (pr.legs > 0 && pr.lt >= pr.legTime) { // a chakra flies in straight legs and re-aims between them
      const o = m.players[1 - pr.owner], sp = Math.hypot(pr.vx, pr.vy), u = unitDir(o.x - pr.x, o.y - pr.y);
      pr.vx = u.x * sp; pr.vy = u.y * sp; pr.legs--; pr.lt = 0;
    }
    if (pr.life <= 0 || Math.hypot(pr.x, pr.y) > ARENA.r + 12) pr.dead = true;
  }
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);

  for (const a of m.areas) a.t -= dt;
  for (const u of m.units) u.t -= dt;
  m.units = m.units.filter((u) => u.t > 0);
  if (m.arenaChange && (m.arenaChange.t -= dt) <= 0) m.arenaChange = null;
  for (const mk of m.marks) mk.t -= dt;
  m.marks = m.marks.filter((mk) => mk.t > 0);

  // traps: go off after their random delay and hurt anyone on them, the setter included
  for (const tr of m.traps) {
    if ((tr.t -= dt) > 0) continue;
    tr.dead = true;
    m.players[tr.owner].trapsActive--;
    ev(m, 'trap', { kind: tr.kind, x: tr.x, y: tr.y, owner: tr.owner });
    if (tr.kind === 'planted') {
      for (const p of m.players) if (Math.hypot(p.x - tr.x, p.y - tr.y) <= TUNE.trap.plantedR + TUNE.fighterR)
        m.hits.push({ target: p, dmg: TUNE.trap.plantedDmg, kb: TUNE.trap.plantedKb, from: { x: tr.x, y: tr.y }, src: 'trap' });
      for (const u of m.units) if (Math.hypot(u.x - tr.x, u.y - tr.y) <= TUNE.trap.plantedR + u.r)
        m.hits.push({ target: u, dmg: TUNE.trap.plantedDmg, kb: 0, from: tr, src: 'trap' });
    } else m.waters.push({ x: tr.x, y: tr.y, r: TUNE.trap.waterR, t: TUNE.trap.waterTime });
  }
  m.traps = m.traps.filter((tr) => !tr.dead);
  for (const w of m.waters) {
    w.t -= dt;
    for (const p of m.players) if (Math.hypot(p.x - w.x, p.y - w.y) <= w.r) applyEffect(p, 'slow', 0.2, TUNE.trap.waterSlow);
  }
  m.waters = m.waters.filter((w) => w.t > 0);
}

// ---------- 2. new moves ----------
function newMoves(m, inputs, dt) {
  for (const p of m.players) {
    const inp = inputs[p.id], prev = m.prev[p.id] || {}, pr = (b) => !!inp[b] && !prev[b];
    if (p.cast?.done) { const c = p.cast; p.cast = null; release(m, p, c); } // after the scene
    if (p.ch.gods && pr('god') && !p.med) p.god = (p.god + 1) % p.ch.gods.length;
    if (pr('boonNext') && p.boons.length) p.boonSel = (p.boonSel + 1) % p.boons.length;
    const act = ACTS.find(pr);
    if (p.cast) progressCast(m, p, inp, dt);
    else if (p.med) {
      if (act || pr('block')) stopMed(m, p, 'MEDITATION STOPPED');
      else progressMed(m, p, dt);
    } else if (act && !p.block && !p.effects.stun) tryAct(m, p, act, inp);
    handleBlock(m, p, inp, dt);
  }
}

function tryAct(m, p, slot, inp) {
  let move, extra = 0;
  const opts = {};
  if (slot === 'boon') {
    const b = p.boons[p.boonSel];
    if (!b) return;
    move = findBoon(b.id); opts.boon = b;
  } else move = p.ch.moves[slot];
  if (!move) return;
  // ground rule 10: a trap is set during a normal close-range attack, with the same swing
  if (slot === 'a2' && (inp.trapPlant || inp.trapWater) && p.trapsActive < TUNE.trap.max) {
    opts.trap = inp.trapPlant ? 'planted' : 'water'; extra = TUNE.trap.cost;
  }
  const why = whyNot(m, p, move, extra);
  if (why) { say(p, why); return; }
  if (opts.boon) { // boons are single-use: gone as soon as the cast starts
    p.boons.splice(p.boonSel, 1);
    p.boonSel = Math.max(0, Math.min(p.boonSel, p.boons.length - 1));
    ev(m, 'boonUsed', { pid: p.id, name: move.name });
  }
  pay(p, move, extra);
  if (move.kind === 'meditate') {
    const lvl = Math.min(p.meditations, TUNE.meditate.times.length - 1);
    p.med = { meter: 0, need: TUNE.meditate.times[lvl], god: p.ch.gods[p.god], fast: p.lotus };
    ev(m, 'meditate', { pid: p.id, god: p.med.god });
    return;
  }
  const l = Math.hypot(+inp.mx || 0, +inp.my || 0);
  p.cast = { move, slot, t: 0, trap: opts.trap || null, dir: l > 0.3 ? { x: inp.mx / l, y: inp.my / l } : null };
  ev(m, 'cast', { pid: p.id, name: move.name, slot });
  if (move.cast <= 0 && !move.charge) finishCast(m, p);
}

function progressCast(m, p, inp, dt) {
  const c = p.cast, mv = c.move;
  c.t += dt;
  if (mv.charge ? !inp[c.slot] && c.t >= mv.cast - 1e-9 : c.t >= mv.cast - 1e-9) finishCast(m, p);
}

function finishCast(m, p) {
  const c = p.cast;
  if (c.move.scene) { // power move: the scene plays first, then the move goes off
    c.done = true;
    m.scene = { pid: p.id, name: c.move.name, t: 0, dur: TUNE.scene };
    ev(m, 'scene', { pid: p.id, name: c.move.name });
    return;
  }
  p.cast = null;
  release(m, p, c);
}

function release(m, p, c) {
  const mv = c.move, o = opponent(m, p);
  ev(m, 'release', { pid: p.id, name: mv.name });
  switch (mv.kind) {
    case 'projectile': {
      const n = mv.count || 1, base = Math.atan2(o.y - p.y, o.x - p.x);
      const dmg = mv.charge ? mv.damage + (mv.charge.damage - mv.damage) * chargeOf(c) : mv.damage;
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i - (n - 1) / 2) * mv.spread : 0), cx = Math.cos(a), cy = Math.sin(a);
        m.projectiles.push({
          id: m.nid++, owner: p.id, name: mv.name, shape: mv.shape, x: p.x + cx * TUNE.fighterR, y: p.y + cy * TUNE.fighterR,
          vx: cx * mv.speed, vy: cy * mv.speed, r: mv.radius, dmg, kb: mv.knockback, life: mv.life, legs: mv.legs ? mv.legs - 1 : 0,
          legTime: mv.legTime || 0, lt: 0, effect: mv.effect || null, pierceBlock: !!mv.pierceBlock, pierceUnits: !!mv.pierceUnits, hitUnits: [],
        });
      }
      break;
    }
    case 'melee': {
      m.strikes.push({ id: m.nid++, owner: p.id, name: mv.name, x: p.x + p.face.x * 18, y: p.y + p.face.y * 18, r: 20, dmg: mv.damage,
        kb: mv.knockback, reach: mv.reach, from: { x: p.x, y: p.y } });
      ev(m, 'swing', { pid: p.id, x: p.x + p.face.x * 18, y: p.y + p.face.y * 18 });
      floorMark(m, p, c.trap);
      break;
    }
    case 'area':
      m.areas.push({ id: m.nid++, owner: p.id, x: o.x, y: o.y, r: mv.radius, t: mv.delay, delay: mv.delay, dmg: mv.damage, kb: mv.knockback });
      break;
    case 'global': // across the whole arena
      for (const t of [o, ...m.units.filter((u) => u.owner !== p.id)]) m.hits.push({ target: t, dmg: mv.damage, kb: mv.knockback, from: { x: p.x, y: p.y }, src: mv.name });
      break;
    case 'brahmastra': // both fighters reach 0 health at once: a draw
      for (const t of m.players) m.hits.push({ target: t, dmg: Infinity, kb: 0, absolute: true, from: null, src: 'Brahmastra' });
      m.brahmastra = true;
      break;
    case 'blink': {
      const d = c.dir || unitDir(p.x - o.x, p.y - o.y), R = ARENA.r - TUNE.fighterR;
      let x = p.x + d.x * mv.distance, y = p.y + d.y * mv.distance;
      const l = Math.hypot(x, y);
      if (l > R) { x *= R / l; y *= R / l; }
      ev(m, 'blink', { pid: p.id, x0: p.x, y0: p.y, x, y });
      p.x = x; p.y = y;
      break;
    }
    case 'heal': m.hits.push({ target: p, heal: mv.heal, src: mv.name }); break;
    case 'lotus': p.lotus = true; break;
    case 'dash': {
      const d = c.dir || unitDir(p.x - o.x, p.y - o.y);
      p.dash = { vx: d.x * mv.speed, vy: d.y * mv.speed, t: mv.time };
      applyEffect(p, 'invuln', mv.invuln);
      break;
    }
  }
}

// Every close attack leaves a floor mark. A trap's mark is made the same way, so they look identical.
function floorMark(m, p, trap) {
  const T = TUNE.mark, r = m.rand;
  const x = p.x + p.face.x * T.offset, y = p.y + p.face.y * T.offset;
  const life = TUNE.trap.delay[0] + r() * (TUNE.trap.delay[1] - TUNE.trap.delay[0]); // scuffs and traps share one lifetime range
  const mark = { id: m.nid++, x, y, rot: r() * Math.PI, size: 3 + Math.floor(r() * 3), t: life };
  m.marks.push(mark);
  if (trap) {
    m.traps.push({ id: m.nid++, owner: p.id, kind: trap, x, y, t: life, mark: mark.id });
    p.trapsActive++;
  }
  const traps = new Set(m.traps.map((t) => t.mark));
  while (m.marks.length > T.max) { const i = m.marks.findIndex((mk) => !traps.has(mk.id)); if (i < 0) break; m.marks.splice(i, 1); }
}

function progressMed(m, p, dt) {
  const o = opponent(m, p);
  if (dist(p, o) > TUNE.meditate.dist) p.med.meter += dt * (p.med.fast ? 2 : 1); // only fills while the opponent is far away
  if (p.med.meter < p.med.need - 1e-9) return;
  const god = GODS[p.med.god], tier = god.tiers[Math.min(p.meditations, god.tiers.length - 1)];
  const boon = tier[Math.floor(m.rand() * tier.length)];
  p.meditations++; // completed meditations always count
  if (p.med.fast) p.lotus = false;
  p.med = null;
  if (p.boons.length < 3) { // ground rule 11: up to 3 boons at a time
    p.boons.push({ id: boon.id, name: boon.name, god: god.name });
    ev(m, 'boon', { pid: p.id, name: boon.name, god: god.name }); // both players see which boon it was
  }
}
function stopMed(m, p, why) { p.med = null; say(p, why); ev(m, 'medStop', { pid: p.id }); }

function handleBlock(m, p, inp, dt) {
  const def = p.ch.defence, o = opponent(m, p);
  if (!inp.block) { p.block = null; return; }
  if (!p.block) {
    if (p.cast || p.med || p.dash || p.effects.stun || p.power + 1e-9 < def.cost) return;
    p.power -= def.cost;
    p.block = { cap: def.strength, held: 0, broken: false };
    return;
  }
  if (p.effects.stun) { p.block = null; return; }
  p.block.held += dt;
  if (p.block.broken) return;
  // ground rule 5: holding block longer while the opponent prepares an attack makes it stronger
  const preparing = (o.cast && !o.cast.done) || false;
  p.block.cap = Math.min(def.max, p.block.cap + def.growth * dt * (preparing ? TUNE.block.prepMult : 1));
}

// ---------- 3. clashes ----------
function clashes(m) {
  const bodies = [...m.projectiles, ...m.strikes];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (a.owner === b.owner || a.dead || b.dead || Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r) continue; // only when they touch
    ev(m, 'clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a: a.name, b: b.name });
    if (a.dmg > b.dmg) { a.dmg -= b.dmg; b.dead = true; }
    else if (b.dmg > a.dmg) { b.dmg -= a.dmg; a.dead = true; }
    else { a.dead = b.dead = true; }
  }
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);
}

function collectHits(m) {
  const FR = TUNE.fighterR;
  for (const pr of m.projectiles) {
    const o = m.players[1 - pr.owner];
    for (const u of m.units) {
      if (u.owner === pr.owner || pr.hitUnits.includes(u.id) || Math.hypot(u.x - pr.x, u.y - pr.y) > u.r + pr.r) continue;
      m.hits.push({ target: u, dmg: pr.dmg, kb: 0, from: pr, src: pr.name });
      if (pr.pierceUnits) pr.hitUnits.push(u.id); else { pr.dead = true; break; }
    }
    if (pr.dead || o.effects.invuln || Math.hypot(o.x - pr.x, o.y - pr.y) > FR + pr.r) continue;
    const d = unitDir(pr.vx, pr.vy);
    m.hits.push({ target: o, dmg: pr.dmg, kb: pr.kb, dir: d, from: { x: pr.x - d.x * 20, y: pr.y - d.y * 20 }, effect: pr.effect, pierceBlock: pr.pierceBlock, src: pr.name, by: pr.owner });
    pr.dead = true;
  }
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);
  for (const s of m.strikes) {
    if (s.dead) continue;
    const p = m.players[s.owner], o = opponent(m, p);
    for (const u of m.units) if (u.owner !== s.owner && Math.hypot(u.x - p.x, u.y - p.y) <= s.reach) m.hits.push({ target: u, dmg: s.dmg, kb: 0, from: s.from, src: s.name });
    if (!o.effects.invuln && dist(p, o) <= s.reach) m.hits.push({ target: o, dmg: s.dmg, kb: s.kb, from: s.from, src: s.name, by: s.owner });
  }
  for (const a of m.areas) {
    if (a.t > 0) continue;
    a.dead = true;
    ev(m, 'rain', { x: a.x, y: a.y, r: a.r });
    const o = m.players[1 - a.owner];
    if (!o.effects.invuln && Math.hypot(o.x - a.x, o.y - a.y) <= a.r + FR) m.hits.push({ target: o, dmg: a.dmg, kb: a.kb, from: { x: a.x, y: a.y }, src: 'Arrow rain', by: a.owner });
    for (const u of m.units) if (u.owner !== a.owner && Math.hypot(u.x - a.x, u.y - a.y) <= a.r + u.r) m.hits.push({ target: u, dmg: a.dmg, kb: 0, from: a, src: 'Arrow rain' });
  }
  m.areas = m.areas.filter((a) => !a.dead);
}

// ---------- 4. damage and healing, all together ----------
function fromFront(t, h) {
  if (!h.from) return false;
  const d = unitDir(h.from.x - t.x, h.from.y - t.y);
  if (!d.x && !d.y) return false;
  return t.face.x * d.x + t.face.y * d.y > TUNE.frontDot;
}

function applyHits(m) {
  const net = new Map();
  for (const h of m.hits) {
    const t = h.target;
    if (!net.has(t)) net.set(t, { dmg: 0, heal: 0, hit: false, srcs: [] });
    const n = net.get(t);
    if (h.heal) { n.heal += h.heal; continue; }
    if (t.effects?.invuln && !h.absolute) continue;
    let dmg = h.dmg;
    if (t.block && !t.block.broken && !h.pierceBlock && !h.absolute && fromFront(t, h)) {
      const a = Math.min(t.block.cap, dmg);
      t.block.cap -= a; dmg -= a;
      ev(m, 'blocked', { pid: t.id, amount: a, x: t.x, y: t.y });
      if (t.block.cap <= 1e-9) { t.block.broken = true; ev(m, 'blockBreak', { pid: t.id }); }
    }
    if (!(dmg > 0)) continue;
    n.dmg += dmg; n.hit = true; n.srcs.push(h.src);
    if (h.by != null && m.players[h.by]) m.players[h.by].stats.dealt += Number.isFinite(dmg) ? dmg : 0;
    if (t.kvx != null && h.kb) {
      const k = Number.isFinite(h.dmg) && h.dmg > 0 ? dmg / h.dmg : 1;
      let d = h.from ? unitDir(t.x - h.from.x, t.y - h.from.y) : { x: 0, y: 0 };
      if (!d.x && !d.y) d = h.dir || { x: 0, y: 0 };
      t.kvx += d.x * h.kb * k; t.kvy += d.y * h.kb * k;
    }
    if (h.effect && t.effects) applyEffect(t, h.effect.kind, h.effect.time, h.effect.mag ?? 1);
  }
  for (const [t, n] of net) {
    if (t.ch) { // a fighter
      const before = t.hp;
      t.hp = clamp(t.hp - n.dmg + n.heal, 0, t.ch.health); // healing never goes above 100%
      if (n.dmg > 0) t.stats.taken += Number.isFinite(n.dmg) ? n.dmg : before;
      if (n.dmg > 0 || n.heal > 0) ev(m, 'hp', { pid: t.id, dmg: n.dmg, heal: n.heal, x: t.x, y: t.y, srcs: n.srcs });
      if (n.hit) { // ground rule 7: any hit breaks casting and meditation; the cost stays spent
        if (t.cast && !t.cast.done) { ev(m, 'broken', { pid: t.id, name: t.cast.move.name }); say(t, `${t.cast.move.name.toUpperCase()} BROKEN`); t.cast = null; }
        if (t.med) stopMed(m, t, 'MEDITATION BROKEN');
      }
    } else t.hp -= n.dmg;
  }
  m.units = m.units.filter((u) => u.hp > 0);
  m.hits = [];
}

// ---------- 5. 0 health and time-up ----------
function checkEnd(m) {
  const [a, b] = m.players, dead = m.players.filter((p) => p.hp <= 0);
  if (dead.length === 2) return end(m, null, m.brahmastra ? 'brahmastra' : 'double');
  if (dead.length === 1) return end(m, dead[0] === a ? 1 : 0, 'ko');
  if (m.timeLeft <= 0) {
    const ha = Math.round(a.hp * 100), hb = Math.round(b.hp * 100);
    end(m, ha === hb ? null : ha > hb ? 0 : 1, 'time');
  }
}
function end(m, winner, reason) {
  m.phase = 'done';
  m.result = { winner, reason };
  ev(m, 'end', m.result);
}

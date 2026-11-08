// Fight rules. Pure and deterministic with a fixed 1/60 s step.
// Input: both players' button states. Output: the match state (read by the renderer, never written by it).
// Every amount is a percentage of a 100% bar; every time is in seconds.
import { STEP, ARENA, RANGES, TUNE } from './config.js';
import { rng, clamp, dist } from './util.js';
import { CHARS } from './chars/index.js';
import { GODS, findBoon } from './chars/gods.js';

// Same button layout for every fighter (ground rule 14).
// Combos instead of extra buttons (owner, 2026-11-07):
//   all three special buttons together = signature move
//   two special buttons together       = spend devotion on a boon
//   down + special 1                   = meditate (both classes)
// Traps were removed by the owner on 2026-11-08.
export const BUTTONS = ['a1', 'a2', 'block', 's1', 's2', 's3'];
const ACTS = ['s1', 's2', 's3', 'a2', 'a1']; // if several are pressed in one step, the first wins
const SPECIALS = ['s1', 's2', 's3'];

export function createMatch({ seed = 1, time = TUNE.match.default, chars = ['siddhan', 'veeran'] } = {}) {
  const duration = clamp(time, TUNE.match.min, TUNE.match.max);
  return {
    seed, rand: rng(seed), t: 0, duration, timeLeft: duration, phase: 'fight', result: null, scene: null,
    players: chars.map((id, i) => makeFighter(CHARS[id], i)),
    projectiles: [], strikes: [], areas: [], units: [], walls: [], arenaChange: null,
    hits: [], events: [], prev: [{}, {}], nid: 1,
  };
}

function makeFighter(ch, i) {
  return {
    id: i, ch, x: i === 0 ? -TUNE.startX : TUNE.startX, y: 0, face: { x: i === 0 ? 1 : -1, y: 0 },
    hp: ch.health, power: ch.power.size * TUNE.startPower, kvx: 0, kvy: 0,
    cast: null, block: null, med: null, dash: null, effects: {}, chord: null, lotus: false,
    devotion: 0, // full devotion segments, earned by meditating and spent on boons (ground rule 11)
    msg: null, stats: { dealt: 0, taken: 0 },
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

  for (const w of m.walls) if (w.standing && (w.t -= dt) <= 0) w.dead = true;
  m.walls = m.walls.filter((w) => !w.dead);
  for (const a of m.areas) a.t -= dt;
  for (const u of m.units) u.t -= dt;
  m.units = m.units.filter((u) => u.t > 0);
  if (m.arenaChange && (m.arenaChange.t -= dt) <= 0) m.arenaChange = null;
}

// ---------- 2. new moves ----------
function newMoves(m, inputs, dt) {
  for (const p of m.players) {
    const inp = inputs[p.id], prev = m.prev[p.id] || {}, pr = (b) => !!inp[b] && !prev[b];
    if (p.cast?.done) { const c = p.cast; p.cast = null; release(m, p, c); } // after the scene
    const act = chord(p, inp, ACTS.find(pr), dt);
    if (p.cast) progressCast(m, p, inp, dt);
    else if (p.med) {
      if (act || pr('block')) stopMed(m, p, 'MEDITATION STOPPED');
      else progressMed(m, p, dt);
    } else if (act && !p.block && !p.effects.stun) tryAct(m, p, act, inp);
    handleBlock(m, p, inp, dt);
  }
}

// A special press waits a moment (TUNE.chord) to see which other special buttons join it:
// 3 = signature, 2 = boon (if one is held), 1 = that special, or the class move if the stick is held down.
const isDown = (inp) => (+inp.my || 0) > 0.6 && Math.abs(+inp.mx || 0) < 0.6;
function chord(p, inp, act, dt) {
  const held = SPECIALS.filter((b) => inp[b]);
  if (p.chord) {
    p.chord.t += dt;
    for (const b of held) if (!p.chord.seen.includes(b)) p.chord.seen.push(b);
  } else {
    if (!SPECIALS.includes(act)) return act;
    p.chord = { slot: act, t: 0, seen: held, down: isDown(inp) };
  }
  const c = p.chord;
  if (c.seen.length >= 3) { p.chord = null; return 'sig'; }
  if (c.t < TUNE.chord - 1e-9) return null;
  p.chord = null;
  if (c.seen.length === 2 && p.devotion >= TUNE.meditate.tiers[0]) return 'boon';
  if (c.slot === 's1' && c.down) return 'cls';
  return c.slot;
}

function tryAct(m, p, slot, inp) {
  let move;
  if (slot === 'boon') { // spend devotion: the biggest tier it pays for, from a random god
    move = pickBoon(m, p);
    if (!move) return;
  } else move = p.ch.moves[slot];
  if (!move) return;
  const why = whyNot(m, p, move);
  if (why) { say(p, why); return; }
  if (slot === 'boon') {
    p.devotion -= move.devotionCost;
    ev(m, 'boon', { pid: p.id, name: move.name, god: move.god, godId: move.godId, tier: move.tier }); // both players see which boon it was
    move = move.boon;
  }
  pay(p, move);
  if (move.kind === 'meditate') {
    const M = TUNE.meditate;
    if (p.devotion >= M.segments) { say(p, 'DEVOTION FULL'); return; }
    p.med = { meter: 0, barrier: M.barrier, fast: p.lotus }; // the barrier goes up by itself
    ev(m, 'meditate', { pid: p.id });
    return;
  }
  const l = Math.hypot(+inp.mx || 0, +inp.my || 0);
  p.cast = { move, slot, t: 0, dir: l > 0.3 ? { x: inp.mx / l, y: inp.my / l } : null };
  ev(m, 'cast', { pid: p.id, name: move.name, slot });
  if (move.cast <= 0 && !move.charge) finishCast(m, p);
}

// Which boon spending devotion buys right now: tier by how much is banked (3 / 6 / 10 segments), then a random
// boon of that tier that can be used from here, from any god (Brahmastra weighted by health, see TUNE).
// Null (and nothing spent) if none fits.
const GOD_IDS = Object.keys(GODS);
const TIER_NAMES = ['small', 'medium', 'divine'];
function pickBoon(m, p) {
  const tiers = TUNE.meditate.tiers;
  let ti = -1;
  for (let i = tiers.length - 1; i >= 0; i--) if (p.devotion >= tiers[i]) { ti = i; break; }
  if (ti < 0) return null;
  // every usable boon of that tier, from every god, weighted: Brahmastra is rare unless the caster's health is low
  const opts = [];
  for (const g of GOD_IDS) for (const boon of GODS[g].tiers[ti]) {
    if (whyNot(m, p, boon)) continue;
    const w = boon.kind === 'brahmastra' ? TUNE.brahmastraOdds.find((o) => p.hp <= o.hp).w : 1;
    opts.push({ boon, god: GODS[g].name, godId: g, w });
  }
  if (!opts.length) { say(p, 'NO BOON FITS HERE'); return null; }
  let r = m.rand() * opts.reduce((a, o) => a + o.w, 0), pick = opts[opts.length - 1];
  for (const o of opts) { if ((r -= o.w) < 0) { pick = o; break; } }
  return { boon: pick.boon, name: pick.boon.name, god: pick.god, godId: pick.godId, tier: TIER_NAMES[ti], devotionCost: tiers[ti], cost: {}, range: 'anywhere' };
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
          legTime: mv.legTime || 0, lt: 0, effect: mv.effect || null, divine: !!mv.divine, pierceBlock: !!mv.pierceBlock, pierceUnits: !!mv.pierceUnits, hitUnits: [], hitWalls: [],
        });
      }
      break;
    }
    case 'melee': {
      m.strikes.push({ id: m.nid++, owner: p.id, name: mv.name, x: p.x + p.face.x * 18, y: p.y + p.face.y * 18, r: 20, dmg: mv.damage,
        kb: mv.knockback, reach: mv.reach, from: { x: p.x, y: p.y } });
      ev(m, 'swing', { pid: p.id, x: p.x + p.face.x * 18, y: p.y + p.face.y * 18 });
      break;
    }
    case 'area':
      m.areas.push({ id: m.nid++, owner: p.id, x: o.x, y: o.y, r: mv.radius, t: mv.delay, delay: mv.delay, dmg: mv.damage, kb: mv.knockback });
      break;
    case 'global': // across the whole arena
      for (const t of [o, ...m.units.filter((u) => u.owner !== p.id)]) m.hits.push({ target: t, dmg: mv.damage, kb: mv.knockback, from: { x: p.x, y: p.y }, src: mv.name, divine: !!mv.divine, by: p.id });
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

// Meditation fills the devotion bar one segment at a time, wherever the opponent is (owner, 2026-11-08: the
// barrier is the defence, so a nearby opponent can't stall it).
// Only full segments count: stopping (or having the barrier broken) loses the part-filled one.
function progressMed(m, p, dt) {
  const M = TUNE.meditate;
  p.med.meter += dt * (p.med.fast ? 2 : 1);
  if (p.med.meter < M.segTime - 1e-9) return;
  p.med.meter = 0;
  p.devotion = Math.min(M.segments, p.devotion + 1);
  ev(m, 'devotion', { pid: p.id, devotion: p.devotion });
  if (p.devotion >= M.segments) { endMed(p); ev(m, 'medFull', { pid: p.id }); say(p, 'DEVOTION FULL'); }
}
function endMed(p) { if (p.med?.fast) p.lotus = false; p.med = null; } // a Lotus seat speeds up one meditation
function stopMed(m, p, why) { endMed(p); say(p, why); ev(m, 'medStop', { pid: p.id }); }

// Block = build a wall (owner, 2026-11-07). While block is held the fighter stands still and the wall in
// front of him grows. Let go (or reach buildTime) and the wall stays in place, at that size, for standTime s.
// p.block is the wall being built right now; m.walls holds every wall, built or standing.
function placeWall(p, w) {
  const B = TUNE.block, k = w.cap / w.max;
  w.hw = Math.max(w.hw || 0, B.halfWidth[0] + (B.halfWidth[1] - B.halfWidth[0]) * k); // it only ever grows wider
  w.x = p.x + p.face.x * B.gap; w.y = p.y + p.face.y * B.gap; w.nx = p.face.x; w.ny = p.face.y;
}
function erect(m, p) {
  const w = p.block;
  p.block = null;
  if (w.dead) return;
  w.standing = true; w.t = TUNE.block.standTime;
  ev(m, 'wallUp', { pid: p.id, x: w.x, y: w.y });
}
function handleBlock(m, p, inp, dt) {
  const def = p.ch.defence, o = opponent(m, p), B = TUNE.block;
  if (p.block && (p.block.dead || !inp.block || p.effects.stun || p.block.held >= B.buildTime - 1e-9)) {
    if (inp.block) p.blockDone = true; // must let go before building another
    erect(m, p);
  }
  if (!inp.block) { p.blockDone = false; return; }
  if (!p.block) {
    if (p.blockDone || p.cast || p.med || p.dash || p.effects.stun || p.power + 1e-9 < def.cost) return;
    p.power -= def.cost;
    m.walls = m.walls.filter((w) => w.owner !== p.id); // one wall per fighter: a new one replaces the old
    p.block = { id: m.nid++, owner: p.id, look: def.look, cap: def.strength, max: def.max, held: 0, t: B.standTime, standing: false };
    placeWall(p, p.block);
    m.walls.push(p.block);
    return;
  }
  p.block.held += dt;
  // ground rule 5: holding block longer while the opponent prepares an attack makes it stronger
  const preparing = (o.cast && !o.cast.done) || false;
  p.block.cap = Math.min(def.max, p.block.cap + def.growth * dt * (preparing ? B.prepMult : 1));
  placeWall(p, p.block);
}

const wallEnds = (w) => [{ x: w.x - w.ny * w.hw, y: w.y + w.nx * w.hw }, { x: w.x + w.ny * w.hw, y: w.y - w.nx * w.hw }];
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function segCross(a, b, c, d) {
  const cr = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
// a wall soaks up damage until its strength runs out, then it's gone
function absorb(m, w, dmg) {
  const a = Math.min(w.cap, dmg);
  w.cap -= a;
  ev(m, 'blocked', { pid: w.owner, amount: a, x: w.x, y: w.y });
  if (w.cap <= 1e-9) { w.dead = true; ev(m, 'blockBreak', { pid: w.owner, x: w.x, y: w.y }); }
  return dmg - a;
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
    if (!pr.pierceBlock) for (const w of m.walls) {
      pr.hitWalls ||= [];
      if (w.dead || w.owner === pr.owner || pr.hitWalls.includes(w.id)) continue;
      const [a, b] = wallEnds(w);
      if (segDist(pr, a, b) > pr.r + 1) continue;
      pr.hitWalls.push(w.id);
      pr.dmg = absorb(m, w, pr.dmg);
      if (pr.dmg <= 1e-9) { pr.dead = true; break; }
    }
    if (pr.dead) continue;
    for (const u of m.units) {
      if (u.owner === pr.owner || pr.hitUnits.includes(u.id) || Math.hypot(u.x - pr.x, u.y - pr.y) > u.r + pr.r) continue;
      m.hits.push({ target: u, dmg: pr.dmg, kb: 0, from: pr, src: pr.name });
      if (pr.pierceUnits) pr.hitUnits.push(u.id); else { pr.dead = true; break; }
    }
    if (pr.dead || o.effects.invuln || Math.hypot(o.x - pr.x, o.y - pr.y) > FR + pr.r) continue;
    const d = unitDir(pr.vx, pr.vy);
    m.hits.push({ target: o, dmg: pr.dmg, kb: pr.kb, dir: d, from: { x: pr.x - d.x * 20, y: pr.y - d.y * 20 }, effect: pr.effect, divine: pr.divine, pierceBlock: pr.pierceBlock, walled: true, src: pr.name, by: pr.owner });
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
// Is one of the target's walls between the attack and the target?
function wallFor(m, t, h) {
  if (!h.from || h.walled || h.pierceBlock || h.absolute || !t.ch) return null;
  return m.walls.find((w) => !w.dead && w.owner === t.id && segCross(h.from, t, ...wallEnds(w))) || null;
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
    const w = wallFor(m, t, h);
    if (w) dmg = absorb(m, w, dmg);
    // the meditation barrier takes the damage instead of health; only divine weapons go through it
    if (t.med && !h.divine && !h.absolute && dmg > 0) {
      const a = Math.min(t.med.barrier, dmg);
      t.med.barrier -= a; dmg -= a;
      ev(m, 'barrier', { pid: t.id, amount: a, left: t.med.barrier, x: t.x, y: t.y });
      if (t.med.barrier <= 1e-9) stopMed(m, t, 'BARRIER BROKEN');
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
      if (n.hit) { // ground rule 7: a hit that gets through breaks casting and meditation; the cost stays spent
        if (t.cast && !t.cast.done) { ev(m, 'broken', { pid: t.id, name: t.cast.move.name }); say(t, `${t.cast.move.name.toUpperCase()} BROKEN`); t.cast = null; }
        if (t.med) stopMed(m, t, 'MEDITATION BROKEN');
      }
    } else t.hp -= n.dmg;
  }
  m.units = m.units.filter((u) => u.hp > 0);
  m.walls = m.walls.filter((w) => !w.dead); // a used-up wall is gone (handleBlock lets go of it next step)
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

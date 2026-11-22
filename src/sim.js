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
    projectiles: [], strikes: [], areas: [], strikesDue: [], units: [], walls: [], arenaChange: null, rough: [],
    hits: [], events: [], prev: [{}, {}], nid: 1,
  };
}

function makeFighter(ch, i) {
  return {
    id: i, ch, x: i === 0 ? -TUNE.startX : TUNE.startX, y: 0, face: { x: i === 0 ? 1 : -1, y: 0 },
    hp: ch.health, power: ch.power.size * TUNE.startPower, kvx: 0, kvy: 0,
    cast: null, block: null, med: null, dash: null, effects: {}, recover: 0, air: null, chasmSide: 0,
    chord: null,
    devotion: 0, // full devotion segments, earned by meditating and spent on boons (ground rule 11)
    boon: null,  // a boon the gods have offered, held until it's used
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
// a fighter's own basic attack (not a special, signature, class move or boon)
const BASIC = new Set(Object.values(CHARS).flatMap((c) => [c.moves.a1, c.moves.a2]));
export const isBasic = (move) => BASIC.has(move);
export function rangeOK(move, d) { const [lo, hi] = RANGES[rangeOf(move)]; return d >= lo && d <= hi; }

// Why a move can't start right now (null = it can).
export function whyNot(m, p, move, extraPower = 0) {
  if (p.effects.stun) return 'STUNNED';
  // Basic attacks always go off; their range is how far they reach (owner, 2026-11-08). Specials still need it.
  const d = dist(p, opponent(m, p)), [lo] = RANGES[rangeOf(move)];
  if (!isBasic(move) && !rangeOK(move, d)) return d < lo ? 'TOO CLOSE' : 'TOO FAR';
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

// Narada's Mischief (owner, 2026-11-21: scramble ALL controls at random, more fun than a left/right swap).
// The stick gets one of the 7 non-identity flips/turns (left and right swap, up and down swap, the axes trade
// places, ...) and the six buttons are shuffled so none stays where it was. Seeded by the match, so it replays.
const SCRAMBLE_BUTTONS = ['a1', 'a2', 'block', 's1', 's2', 's3'];
const STICK_TURNS = [[-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1]]; // [x sign, y sign, swap axes]
function mischief(rand) {
  const order = [...SCRAMBLE_BUTTONS];
  do { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  while (order.some((b, i) => b === SCRAMBLE_BUTTONS[i]));
  return { buttons: Object.fromEntries(SCRAMBLE_BUTTONS.map((b, i) => [b, order[i]])), stick: STICK_TURNS[Math.floor(rand() * STICK_TURNS.length)] };
}
// what a scrambled player's input does: pressing button b fires map.buttons[b]; the stick is flipped / turned
export function scramble(inp, map) {
  const out = { ...inp }, [sx, sy, sw] = map.stick, x = +inp.mx || 0, y = +inp.my || 0;
  out.mx = sx * (sw ? y : x); out.my = sy * (sw ? x : y);
  for (const b of SCRAMBLE_BUTTONS) out[map.buttons[b]] = !!inp[b];
  return out;
}

// Temporary effects (ground rule 9): set duration, the same kind doesn't stack, the strongest counts.
export function applyEffect(p, kind, time, mag = 1) {
  const cur = p.effects[kind], str = (e) => (kind === 'slow' ? e.mag : e.t);
  const next = { t: time, mag, T: time }; // T = the full time, so the screen can show how much is left
  if (!cur || str(next) > str(cur)) p.effects[kind] = next;
  else if (str(next) === str(cur)) { if (time > cur.t) cur.T = time; cur.t = Math.max(cur.t, time); }
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
const canMove = (p) => !p.cast && !p.block && !p.med && !p.dash && p.air?.kind !== 'jump' && !p.effects.hold && !p.effects.stun;
// Ground rule 17: off the ground = jumping (from the first moment) or flying (once the lift-off is done).
export const airborne = (p) => !!p.air && (p.air.kind === 'jump' || p.air.t >= p.air.lift);
const unitDir = (dx, dy) => { const l = Math.hypot(dx, dy); return l > 1e-9 ? { x: dx / l, y: dy / l } : { x: 0, y: 0 }; };

// ---------------------------------------------------------------------------------------------
export function stepMatch(m, inputs = [{}, {}], dt = STEP) {
  if (m.phase === 'done') return m;
  inputs = [inputs[0] || {}, inputs[1] || {}];
  // Narada's Mischief: a fighter under it has every control scrambled (everything that reads the input sees it)
  inputs = inputs.map((inp, i) => { const c = m.players[i].effects.confuse; return c?.map ? scramble(inp, c.map) : inp; });
  if (m.scene) { // a power move's dramatic scene: the game pauses for both players
    m.scene.t += dt;
    if (m.scene.t >= m.scene.dur - 1e-9) { ev(m, 'sceneEnd', { name: m.scene.name }); m.scene = null; }
    m.prev = inputs.map((i) => ({ ...i }));
    return m;
  }
  if (m.brahma && !holdBrahma(m, inputs, dt)) { m.prev = inputs.map((i) => ({ ...i })); return m; } // a Brahmastra is in the sky
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
    if (p.recover > 0) p.recover = Math.max(0, p.recover - dt);
    p.power = Math.min(p.ch.power.size, p.power + p.ch.power.refill * dt); // ground rule 2: constant rate
    if (p.air) { // ground rule 17
      const a = p.air; a.t += dt;
      if (a.kind === 'jump') {
        p.x += a.vx * dt; p.y += a.vy * dt;
        if (a.t >= a.dur - 1e-9) land(m, p);
      } else if (a.ride) { // Peacock Ride: no power cost; the peacock sets you down when its time is up
        if (!p.effects.ride) land(m, p);
      } else if (a.t >= a.lift) { // flying costs power every second it lasts; out of power = land
        p.power = Math.max(0, p.power - a.drain * dt);
        if (p.power <= 1e-9) land(m, p);
      }
    }
    if (p.dash) {
      p.x += p.dash.vx * dt; p.y += p.dash.vy * dt;
      if ((p.dash.t -= dt) <= 0) p.dash = null;
    } else if (canMove(p)) {
      let mx = +inp.mx || 0, my = +inp.my || 0;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      const sp = (airborne(p) && p.air.kind === 'fly' ? p.air.speed : p.ch.speed) * TUNE.pace.move * (1 - (p.effects.slow?.mag || 0)) * (onRough(m, p) ? 1 - TUNE.rough.slow : 1);
      p.x += mx * sp * dt; p.y += my * sp * dt;
    }
    p.x += p.kvx * dt; p.y += p.kvy * dt;
    const f = Math.exp(-TUNE.kbFriction * dt);
    p.kvx *= f; p.kvy *= f;
    if (Math.hypot(p.kvx, p.kvy) < 1) p.kvx = p.kvy = 0;
    keepOutOfChasm(m, p); // Shiva's Tandava: nobody on the ground crosses the chasm
    // ground rule 13: the edge is an invisible wall; getting knocked into it costs health
    const d = Math.hypot(p.x, p.y);
    if (d > R) {
      const n = { x: p.x / d, y: p.y / d }, vn = p.kvx * n.x + p.kvy * n.y;
      if (vn > TUNE.wallKb) { m.hits.push({ target: p, dmg: TUNE.wallDmg, kb: 0, src: 'wall', from: null }); ev(m, 'wall', { pid: p.id, x: p.x, y: p.y }); addRough(m, 'wet', n.x * R, n.y * R, TUNE.rough.wet.r, TUNE.rough.wet.life); }
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
    if (pr.seek) { // a boon homes in on the opponent: it can't be dodged, only met by another attack (owner, 2026-11-08)
      const o = m.players[1 - pr.owner], sp = Math.hypot(pr.vx, pr.vy), u = unitDir(o.x - pr.x, o.y - pr.y);
      pr.vx = u.x * sp; pr.vy = u.y * sp; pr.life = Math.max(pr.life, 0.5); pr.legs = 0;
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt; pr.lt += dt;
    pr.flown += Math.hypot(pr.vx, pr.vy) * dt;
    if (pr.flown > pr.reach) pr.dead = true; // a basic shot only reaches as far as its range
    if (pr.falloff) { // ground rule 4 (owner, 2026-11-14): past its full-strength distance a shot weakens, down to half
      const F = pr.falloff, k = 1 - 0.5 * clamp((pr.flown - F.full) / (F.half - F.full), 0, 1);
      pr.dmg *= k / pr.k; pr.k = k; // scales what's left of it (a wall may already have soaked some)
    }
    if (pr.legs > 0 && pr.lt >= pr.legTime) { // a chakra flies in straight legs and re-aims between them
      const o = m.players[1 - pr.owner], sp = Math.hypot(pr.vx, pr.vy), u = unitDir(o.x - pr.x, o.y - pr.y);
      pr.vx = u.x * sp; pr.vy = u.y * sp; pr.legs--; pr.lt = 0;
    }
    if (pr.life <= 0 || Math.hypot(pr.x, pr.y) > ARENA.r + 12) pr.dead = true;
  }
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);

  // a standing wall doesn't time out while its builder meditates behind it; hits still wear it down (owner, 2026-11-14)
  for (const w of m.walls) if (w.standing && !m.players[w.owner]?.med && (w.t -= dt) <= 0) w.dead = true;
  m.walls = m.walls.filter((w) => !w.dead);
  for (const a of m.areas) a.t -= dt;
  for (const u of m.units) u.t -= dt;
  m.units = m.units.filter((u) => u.t > 0);
  lavaBurn(m, dt);
  if (m.arenaChange && (m.arenaChange.t -= dt) <= 0) m.arenaChange = null;
  if (m.rough.length && m.rough[0].until <= m.t) m.rough = m.rough.filter((z) => z.until > m.t);
}

// Rough ground (ground rule 13, owner 2026-11-15): craters and wet sand slow anyone walking through them.
function addRough(m, kind, x, y, r, life) {
  const z = { kind, x, y, r, t0: m.t, until: m.t + life };
  m.rough.push(z); m.rough.sort((a, b) => a.until - b.until);
  if (m.rough.length > TUNE.rough.max) m.rough.shift(); // the oldest goes first
  ev(m, 'rough', { kind, x, y, r });
}
export const onRough = (m, p) => !airborne(p) && m.rough.some((z) => Math.hypot(p.x - z.x, p.y - z.y) < z.r + TUNE.rough.feet);
function roughFromHit(m, t, n) {
  const R = TUNE.rough, srcs = n.srcs;
  if (!(n.dmg > 0) || srcs.includes('Brahmastra') || srcs.includes('Thousand-Arm Form') || srcs.every((s) => s === 'Lava' || s === 'wall')) return;
  if (srcs.some((s) => R.impact.moves.includes(s))) addRough(m, 'impact', t.x, t.y, R.impact.r, R.impact.life);
  else if (n.dmg >= R.crater.minDmg) addRough(m, 'crater', t.x, t.y, Math.min(R.crater.maxR, R.crater.r + (Number.isFinite(n.dmg) ? n.dmg : 99) * R.crater.perDmg), R.crater.life);
}

// Ground rule 17: touching down ends jumping or flying, with a short landing pause.
function land(m, p) {
  p.air = null;
  delete p.effects.ride; // a Peacock Ride ends with any landing
  p.recover = Math.max(p.recover, TUNE.air.land);
  ev(m, 'land', { pid: p.id });
}
// Shiva's Tandava (an arena change, ground rule 12): a chasm along a line. Someone on the ground stays on their side
// of it; jumping or flying crosses it (coming down inside it puts you on the nearer edge).
function keepOutOfChasm(m, p) {
  const c = m.arenaChange;
  if (!c || c.kind !== 'chasm') return;
  const s = (p.x - c.x) * c.nx + (p.y - c.y) * c.ny, half = c.w / 2 + TUNE.fighterR;
  if (airborne(p)) { if (Math.abs(s) >= half) p.chasmSide = Math.sign(s); return; }
  if (Math.abs(s) >= half) { p.chasmSide = Math.sign(s); return; }
  const side = p.chasmSide || Math.sign(s) || 1, push = side * half - s;
  p.x += c.nx * push; p.y += c.ny * push;
  const vn = p.kvx * c.nx + p.kvy * c.ny; if (vn * side < 0) { p.kvx -= vn * c.nx; p.kvy -= vn * c.ny; }
}

// The sunk half of Shiva's Tandava is lava: anyone on the ground there burns (`lava` % a second, in 0.5 s ticks).
// It hurts but doesn't count as a hit: it doesn't break a cast or meditation, or push (owner, 2026-11-14).
function lavaBurn(m, dt) {
  const c = m.arenaChange;
  if (!c || c.kind !== 'chasm' || !c.lava) return;
  for (const p of m.players) {
    const s = (p.x - c.x) * c.nx + (p.y - c.y) * c.ny;
    if (airborne(p) || s <= 0) { p.lavaT = 0; continue; }
    p.lavaT = (p.lavaT || 0) + dt;
    if (p.lavaT >= 0.5 - 1e-9) { p.lavaT -= 0.5; m.hits.push({ target: p, dmg: c.lava * 0.5, kb: 0, from: null, burn: true, pierceBlock: true, src: 'Lava', by: c.owner }); }
  }
}

// ---------- 2. new moves ----------
function newMoves(m, inputs, dt) {
  for (const p of m.players) {
    if (m.brahma) break; // a Brahmastra just went off: from here on everyone is held (holdBrahma)
    const inp = inputs[p.id], prev = m.prev[p.id] || {}, pr = (b) => !!inp[b] && !prev[b];
    if (p.cast?.done) { const c = p.cast; p.cast = null; release(m, p, c); } // after the scene
    const act = chord(p, inp, ACTS.find(pr), dt);
    if (p.cast) progressCast(m, p, inp, dt);
    else if (p.med) { // a button gets up from meditation and does its thing straight away (e.g. two specials spend the devotion)
      if (act || pr('block')) { stopMed(m, p, 'MEDITATION STOPPED'); if (act && act !== 'cls' && !p.effects.stun) tryAct(m, p, act, inp); }
      else progressMed(m, p, dt);
    } else if (act && !p.block && !p.effects.stun) tryAct(m, p, act, inp); // attacks work in the air too (owner, 2026-11-14)
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
  if (c.seen.length === 2 && (p.boon || p.devotion >= TUNE.meditate.tiers[0])) return 'boon';
  if (c.slot === 's1' && c.down) return 'cls';
  return c.slot;
}

function tryAct(m, p, slot, inp) {
  let move;
  // Boons (owner, 2026-11-08): two specials first ASK for one: devotion is spent, the god appears and reveals
  // the boon, and it is held. Two specials again USE the held boon, now or any time later. One held at a time.
  if (slot === 'boon' && !p.boon) {
    const offer = pickBoon(m, p);
    if (!offer) return;
    p.devotion -= offer.devotionCost;
    p.boon = { move: offer.boon, name: offer.name, god: offer.god, godId: offer.godId, tier: offer.tier };
    ev(m, 'boon', { pid: p.id, name: offer.name, desc: offer.boon.desc, god: offer.god, godId: offer.godId, tier: offer.tier }); // both players see which boon it was
    return;
  }
  if (slot === 'boon') move = p.boon.move;
  else move = p.ch.moves[slot];
  if (!move) return;
  if (move.kind === 'fly' && p.air?.kind === 'fly') { land(m, p); return; } // press again to land (always allowed)
  if (p.recover > 0) return; // still recovering from the last attack (ground rule 16)
  if (p.air && (move.kind === 'meditate' || move.kind === 'fly' || move.kind === 'jump')) { say(p, move.kind === 'meditate' ? 'LAND FIRST' : 'IN THE AIR'); return; }
  // a boon can be used from any distance: it always finds the opponent (owner, 2026-11-08)
  const why = whyNot(m, p, slot === 'boon' ? { ...move, range: 'anywhere' } : move);
  if (why) { say(p, why); return; }
  if (slot === 'boon') { // single-use: gone as soon as it's used
    ev(m, 'boonUsed', { pid: p.id, name: p.boon.name, god: p.boon.god, godId: p.boon.godId, tier: p.boon.tier });
    p.boon = null;
  }
  pay(p, move);
  if (move.kind === 'fly') { // ground rule 17: lift-off takes `lift` s, then he is off the ground until he lands
    p.air = { kind: 'fly', t: 0, lift: move.lift, speed: move.speed, drain: move.drain };
    ev(m, 'fly', { pid: p.id }); ev(m, 'cast', { pid: p.id, name: move.name, slot }); // used like any special
    return;
  }
  if (move.kind === 'jump') { // a short hop the way the stick points (sideways, toward the middle, if it points nowhere)
    const o = opponent(m, p), l = Math.hypot(+inp.mx || 0, +inp.my || 0);
    let d = l > 0.3 ? { x: (+inp.mx || 0) / l, y: (+inp.my || 0) / l } : null;
    if (!d) { const u = unitDir(o.x - p.x, o.y - p.y), side = -u.y * -p.x + u.x * -p.y >= 0 ? 1 : -1; d = { x: -u.y * side, y: u.x * side }; }
    p.air = { kind: 'jump', t: 0, lift: 0, dur: move.time, vx: (d.x * move.distance) / move.time, vy: (d.y * move.distance) / move.time };
    ev(m, 'jump', { pid: p.id }); ev(m, 'cast', { pid: p.id, name: move.name, slot });
    return;
  }
  if (move.kind === 'meditate') {
    const M = TUNE.meditate;
    if (p.devotion >= M.segments) { say(p, 'DEVOTION FULL'); return; }
    p.med = { meter: 0, barrier: TUNE.meditate.barrier }; // a full barrier goes up by itself (rule 11)
    ev(m, 'meditate', { pid: p.id });
    return;
  }
  const l = Math.hypot(+inp.mx || 0, +inp.my || 0);
  p.cast = { move, slot, t: 0, dir: l > 0.3 ? { x: (+inp.mx || 0) / l, y: (+inp.my || 0) / l } : null };
  ev(m, 'cast', { pid: p.id, name: move.name, slot });
  if (move.cast <= 0 && !move.charge) finishCast(m, p);
}

// Which boon spending devotion buys right now: tier by how much is banked (4 / 8 segments), then a random
// boon of that tier that can be used from here, from any god (Brahmastra weighted by health, see TUNE).
// Null (and nothing spent) if none fits.
const GOD_IDS = Object.keys(GODS);
const TIER_NAMES = ['small', 'divine'];
function pickBoon(m, p) {
  const tiers = TUNE.meditate.tiers;
  let ti = -1;
  for (let i = tiers.length - 1; i >= 0; i--) if (p.devotion >= tiers[i]) { ti = i; break; }
  if (ti < 0) return null;
  // every usable boon of that tier, from every god, weighted: Brahmastra is rare unless the caster's health is low
  const opts = [];
  for (const g of GOD_IDS) for (const boon of GODS[g].tiers[ti]) {
    const w = boon.kind === 'brahmastra' ? TUNE.brahmastraOdds.find((o) => p.hp <= o.hp).w : 1;
    opts.push({ boon, god: GODS[g].name, godId: g, w });
  }
  if (!opts.length) return null;
  let r = m.rand() * opts.reduce((a, o) => a + o.w, 0), pick = opts[opts.length - 1];
  for (const o of opts) { if ((r -= o.w) < 0) { pick = o; break; } }
  return { boon: pick.boon, name: pick.boon.name, god: pick.god, godId: pick.godId, tier: TIER_NAMES[ti], devotionCost: tiers[ti], cost: {}, range: 'anywhere' };
}

function progressCast(m, p, inp, dt) {
  const c = p.cast, mv = c.move;
  c.t += dt;
  if (mv.charge ? !inp[c.slot] && c.t >= mv.cast - 1e-9 : c.t >= mv.cast - 1e-9) finishCast(m, p);
}

// A Brahmastra in the sky (TUNE.brahmastraFall s): both fighters are held and nothing else moves. Whoever started
// first has the advantage: only a Brahmastra the other fighter had already started casting can still go off and
// answer it; it's too late to start one now (owner, 2026-11-15). Returns true when its sun lands.
function holdBrahma(m, inputs, dt) {
  const b = m.brahma, o = m.players[1 - b.pid];
  b.t += dt;
  if (o.cast && !o.cast.answer) o.cast = null; // started too late
  else if (o.cast?.done) { const c = o.cast; o.cast = null; release(m, o, c); }
  else if (o.cast) progressCast(m, o, inputs[o.id], dt);
  if (m.brahma !== b || b.t < TUNE.brahmastraFall - 1e-9) return false; // Shiva took it, or it is still falling
  m.brahma = null;
  for (const t of m.players) m.hits.push({ target: t, dmg: Infinity, kb: 0, absolute: true, from: null, src: 'Brahmastra' });
  m.brahmastra = true;
  return true;
}

function finishCast(m, p) {
  const c = p.cast;
  if (c.move.kind === 'brahmastra') { // the cutoff for an answer: only a Brahmastra the other was already casting (owner, 2026-11-15)
    const o = opponent(m, p);
    if (o.cast?.move.kind === 'brahmastra' && o.cast.t > 0) o.cast.answer = true;
  }
  if (c.move.scene) { // power move: the scene plays first, then the move goes off
    c.done = true;
    m.scene = { pid: p.id, name: c.move.name, t: 0, dur: TUNE.scene };
    ev(m, 'scene', { pid: p.id, name: c.move.name });
    return;
  }
  p.cast = null;
  release(m, p, c);
}

// Recovery after an attack (ground rule 16). Blink and meditation aren't attacks.
const ATTACKS = new Set(['projectile', 'melee', 'area', 'global']);
export const recoveryOf = (mv) => (ATTACKS.has(mv.kind) ? (isBasic(mv) ? TUNE.recover.basic : TUNE.recover.special) : 0);

function release(m, p, c) {
  const mv = c.move, o = opponent(m, p);
  ev(m, 'release', { pid: p.id, name: mv.name });
  p.recover = recoveryOf(mv);
  switch (mv.kind) {
    case 'projectile': {
      const n = mv.count || 1, base = Math.atan2(o.y - p.y, o.x - p.x);
      const dmg = mv.charge ? mv.damage + (mv.charge.damage - mv.damage) * chargeOf(c) : mv.damage;
      const quick = isBasic(mv) && c.slot !== 'boon' && (!mv.charge || chargeOf(c) < TUNE.quickShot); // rule 6: quick basic shots pass each other
      for (let i = 0; i < n; i++) {
        const a = base + (n > 1 ? (i - (n - 1) / 2) * mv.spread : 0), cx = Math.cos(a), cy = Math.sin(a);
        m.projectiles.push({
          id: m.nid++, owner: p.id, name: mv.name, shape: mv.shape, x: p.x + cx * TUNE.fighterR, y: p.y + cy * TUNE.fighterR,
          vx: cx * mv.speed * TUNE.pace.shot, vy: cy * mv.speed * TUNE.pace.shot, r: mv.radius, dmg, dmg0: dmg, kb: mv.knockback, life: mv.life, legs: mv.legs ? mv.legs - 1 : 0,
          legTime: mv.legTime || 0, lt: 0, effect: mv.effect || null, divine: !!mv.divine, boon: c.slot === 'boon', reach: isBasic(mv) ? RANGES[rangeOf(mv)][1] : Infinity, flown: 0, seek: c.slot === 'boon', falloff: c.slot === 'boon' ? null : mv.falloff || null, k: 1, pierceBlock: !!mv.pierceBlock || c.slot === 'boon', pierceUnits: !!mv.pierceUnits, hitUnits: [], hitWalls: [], quick,
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
    case 'global': // across the whole arena, landing when the strike reaches (strikeDelay s), so it matches what's drawn
      if (mv.travels) { // it flies from the caster to just short of the opponent (as drawn), and can meet shots on the way
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1, gap = Math.min(15, d * 0.35), T = mv.strikeDelay || STEP;
        m.strikesDue.push({ id: m.nid++, owner: p.id, name: mv.name, t: T, T, from: { x: p.x, y: p.y }, to: { x: o.x - dx / d * gap, y: o.y - dy / d * gap },
          x: p.x, y: p.y, vx: dx / T, vy: dy / T, r: mv.travels.radius, dmg: mv.damage, kb: mv.knockback, src: mv.name, divine: !!mv.divine, travels: true });
      } else m.strikesDue.push({ owner: p.id, t: mv.strikeDelay || 0, from: { x: p.x, y: p.y }, dmg: mv.damage, kb: mv.knockback, src: mv.name, divine: !!mv.divine });
      break;
    case 'tandava': { // Shiva's Tandava: the island splits along a line between the fighters (ground rule 12)
      const n = unitDir(o.x - p.x, o.y - p.y), cx = (p.x + o.x) / 2, cy = (p.y + o.y) / 2;
      startArenaChange(m, { kind: 'chasm', name: mv.name, time: mv.time, x: cx, y: cy, nx: n.x, ny: n.y, w: mv.width, lava: mv.lava || 0, owner: p.id });
      for (const f of m.players) { // whoever stands on the line is thrown aside, to their own side
        const s = (f.x - cx) * n.x + (f.y - cy) * n.y;
        f.chasmSide = Math.sign(s) || (f === p ? -1 : 1);
        if (!airborne(f) && Math.abs(s) < mv.width / 2 + TUNE.fighterR) { f.kvx += n.x * f.chasmSide * TUNE.air.chasmPush; f.kvy += n.y * f.chasmSide * TUNE.air.chasmPush; }
      }
      m.hits.push({ target: o, dmg: mv.damage, kb: 0, from: null, pierceBlock: true, src: mv.name, by: p.id }); // a boon always finds its target
      ev(m, 'tandava', { pid: p.id, x: cx, y: cy });
      break;
    }
    case 'brahmastra': // it rises and hangs in the sky (holdBrahma); when its sun lands both fighters reach 0 health: a draw
      if (m.brahma) { // the answer to one already in the sky: Shiva takes both back, nobody is hurt and the fight goes on (owner, 2026-11-15)
        ev(m, 'shivaTakes', { pid: p.id, other: m.brahma.pid });
        m.brahma = null;
        break;
      }
      m.brahma = { pid: p.id, t: 0 };
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
    case 'confuse': // Narada's Mischief: a boon always finds its target, so it simply lands on the opponent
      applyEffect(o, 'confuse', mv.time);
      o.effects.confuse.map = mischief(m.rand); // a fresh random scramble of all their controls each time
      ev(m, 'confuse', { pid: o.id, by: p.id });
      break;
    case 'ride': // Peacock Ride: up into the air like Fly, but faster, free and timed (the 'ride' effect is the timer)
      p.air = { kind: 'fly', t: 0, lift: mv.lift, speed: mv.speed, drain: 0, ride: true };
      applyEffect(p, 'ride', mv.time + mv.lift);
      ev(m, 'fly', { pid: p.id, ride: true });
      break;
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
  p.med.meter += dt;
  if (p.med.meter < M.segTime - 1e-9) return;
  p.med.meter = 0;
  p.devotion = Math.min(M.segments, p.devotion + 1);
  ev(m, 'devotion', { pid: p.id, devotion: p.devotion });
  if (p.devotion >= M.segments) { endMed(p); ev(m, 'medFull', { pid: p.id }); say(p, 'DEVOTION FULL'); }
}
function endMed(p) { p.med = null; }
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
    if (p.blockDone || p.cast || p.med || p.dash || p.air || p.effects.stun || p.power + 1e-9 < def.cost) return;
    p.power -= def.cost;
    // several walls can stand at once, each until its own time runs out (owner, 2026-11-08); only past
    // TUNE.block.maxWalls does the oldest one go
    const mine = m.walls.filter((w) => w.owner === p.id);
    if (mine.length >= B.maxWalls) m.walls = m.walls.filter((w) => w !== mine[0]);
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
// Rule 6 says moves collide when they touch ON SCREEN, so a clash uses the size the shot is drawn at (render.js
// drawProjectile), not its small hit size against a fighter, which stays as it is (dodging is unchanged).
// Long shapes (arrows, spears, the Gaja elephant) are a capsule along the flight line: [half-length, half-thickness]
// in world units. Round ones are a circle. (2026-11-16: the elephant was drawn ~7x longer than it collided, so
// specials seemed to fly through each other.)
const CLASH_SHAPE = {
  arrow: (p) => [7, 3], spear: (p) => [8, 3], elephant: (p) => [22, 12], tiger: (p) => [19, 10],
  chakra: (p) => [0, p.r * 1.4], fire: (p) => [6, p.r], notes: (p) => [0, 5.5], wave: (p) => [0, p.r * 1.2],
  orb: (p) => [0, p.r * 1.3 * (1 + Math.max(0, p.dmg0 - 4) / 9)],
};
function clashBody(b) {
  const f = b.shape && CLASH_SHAPE[b.shape], k = b.boon ? 1.5 : 1;
  const [h, r] = f ? f(b) : [0, b.r];
  const sp = Math.hypot(b.vx || 0, b.vy || 0), dx = sp ? b.vx / sp : 1, dy = sp ? b.vy / sp : 0;
  return { a: { x: b.x - dx * h * k, y: b.y - dy * h * k }, b: { x: b.x + dx * h * k, y: b.y + dy * h * k }, r: Math.max(b.r, r * k) };
}
function segSegDist(a, b, c, d) {
  const cr = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cr(a, b, c), d2 = cr(a, b, d), d3 = cr(c, d, a), d4 = cr(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(a, c, d), segDist(b, c, d), segDist(c, a, b), segDist(d, a, b));
}
const touching = (a, b) => { const p = clashBody(a), q = clashBody(b); return segSegDist(p.a, p.b, q.a, q.b) <= p.r + q.r; };
function clashes(m) {
  const flying = m.strikesDue.filter((s) => s.travels && !s.dead);
  for (const s of flying) { // where the halo is right now (eased like the drawing in render.js)
    const u = clamp(1 - s.t / s.T, 0, 1), e = u * u * (3 - 2 * u);
    s.x = s.from.x + (s.to.x - s.from.x) * e; s.y = s.from.y + (s.to.y - s.from.y) * e;
  }
  const bodies = [...m.projectiles, ...m.strikes, ...flying];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (a.owner === b.owner || a.dead || b.dead || !touching(a, b)) continue; // only when they touch on screen
    if (a.quick && b.quick) continue; // two quick basic shots fly past each other (owner, 2026-11-14)
    ev(m, 'clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a: a.name, b: b.name });
    if (a.dmg > b.dmg) { a.dmg -= b.dmg; b.dead = true; }
    else if (b.dmg > a.dmg) { b.dmg -= a.dmg; a.dead = true; }
    else { a.dead = b.dead = true; }
  }
  for (const s of flying) if (s.dead) ev(m, 'armsBroken', { pid: s.owner, x: s.x, y: s.y }); // the halo lost: it never lands
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);
  m.strikesDue = m.strikesDue.filter((s) => !s.dead);
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
    if (o.air?.kind === 'jump' && !pr.seek) continue; // ground rule 17: shots pass under a jump (boons still find him)
    const d = unitDir(pr.vx, pr.vy);
    m.hits.push({ target: o, dmg: pr.dmg, kb: pr.kb, dir: d, from: { x: pr.x - d.x * 20, y: pr.y - d.y * 20 }, effect: pr.effect, divine: pr.divine, pierceBlock: pr.pierceBlock, walled: true, src: pr.name, by: pr.owner });
    pr.dead = true;
  }
  m.projectiles = m.projectiles.filter((pr) => !pr.dead);
  for (const s of m.strikes) {
    if (s.dead) continue;
    const p = m.players[s.owner], o = opponent(m, p);
    for (const u of m.units) if (u.owner !== s.owner && Math.hypot(u.x - p.x, u.y - p.y) <= s.reach) m.hits.push({ target: u, dmg: s.dmg, kb: 0, from: s.from, src: s.name });
    if (!o.effects.invuln && !airborne(o) && dist(p, o) <= s.reach) m.hits.push({ target: o, dmg: s.dmg, kb: s.kb, from: s.from, src: s.name, by: s.owner }); // melee can't reach anyone off the ground
  }
  for (const a of m.areas) {
    if (a.t > 0) continue;
    a.dead = true;
    ev(m, 'rain', { x: a.x, y: a.y, r: a.r });
    const o = m.players[1 - a.owner];
    if (!o.effects.invuln && !airborne(o) && Math.hypot(o.x - a.x, o.y - a.y) <= a.r + FR) m.hits.push({ target: o, dmg: a.dmg, kb: a.kb, from: { x: a.x, y: a.y }, src: 'Arrow rain', by: a.owner });
    for (const u of m.units) if (u.owner !== a.owner && Math.hypot(u.x - a.x, u.y - a.y) <= a.r + u.r) m.hits.push({ target: u, dmg: a.dmg, kb: 0, from: a, src: 'Arrow rain' });
  }
  m.areas = m.areas.filter((a) => !a.dead);
  for (const s of m.strikesDue) { // whole-arena strikes, once they arrive
    if (s.dead || (s.t -= STEP) > 1e-9) continue;
    s.dead = true;
    const p = m.players[s.owner], o = opponent(m, p);
    for (const t of [o, ...m.units.filter((u) => u.owner !== s.owner)]) m.hits.push({ target: t, dmg: s.dmg, kb: s.kb, from: s.from, src: s.src, divine: s.divine, by: s.owner });
  }
  m.strikesDue = m.strikesDue.filter((s) => !s.dead);
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
    // the meditation barrier takes most of the damage; a little (`leak`) still reaches health, so sitting under fire
    // isn't free (owner, 2026-11-14). Divine weapons go straight through it.
    if (t.med && !h.divine && !h.absolute && dmg > 0) {
      const a = Math.min(t.med.barrier, dmg * (1 - TUNE.meditate.leak));
      t.med.barrier -= a; dmg -= a;
      ev(m, 'barrier', { pid: t.id, amount: a, left: t.med.barrier, x: t.x, y: t.y });
      if (t.med.barrier <= 1e-9) stopMed(m, t, 'BARRIER BROKEN');
      else { // the barrier held: the little that leaks through hurts, but doesn't break meditation or push
        if (dmg > 0) { n.dmg += dmg; n.srcs.push(h.src); if (h.by != null && m.players[h.by]) m.players[h.by].stats.dealt += dmg; }
        continue;
      }
    }
    if (!(dmg > 0)) continue;
    if (h.burn) { n.dmg += dmg; n.srcs.push(h.src); if (h.by != null && m.players[h.by]) m.players[h.by].stats.dealt += dmg; continue; } // lava: hurts, never interrupts
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
      roughFromHit(m, t, n);
      if (n.hit) { // ground rule 7: a hit that gets through breaks casting and meditation; the cost stays spent
        if (t.cast && !t.cast.done) { ev(m, 'broken', { pid: t.id, name: t.cast.move.name }); say(t, `${t.cast.move.name.toUpperCase()} BROKEN`); t.cast = null; }
        if (t.med) stopMed(m, t, 'MEDITATION BROKEN');
        delete t.effects.confuse; // Narada's Mischief ends when a hit gets through
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

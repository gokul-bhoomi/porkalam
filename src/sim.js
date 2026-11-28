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

export function createMatch({ seed = 1, time = TUNE.match.default, chars = ['siddhan', 'veeran'], arena = 'river', hazardTest = null } = {}) {
  const duration = clamp(time, TUNE.match.min, TUNE.match.max);
  return {
    seed, rand: rng(seed), t: 0, duration, timeLeft: duration, phase: 'fight', result: null, scene: null,
    players: chars.map((id, i) => makeFighter(CHARS[id], i)),
    projectiles: [], strikes: [], areas: [], strikesDue: [], units: [], walls: [], arenaChange: null, rough: [],
    hits: [], events: [], prev: [{}, {}], nid: 1,
    arena, haz: arena === 'battlefield' ? newHazards(seed, hazardTest) : null, // the battlefield's war spills in (arena hazards)
  };
}

function makeFighter(ch, i) {
  return {
    id: i, ch, x: i === 0 ? -TUNE.startX : TUNE.startX, y: 0, face: { x: i === 0 ? 1 : -1, y: 0 },
    hp: ch.health, power: ch.power.size * TUNE.startPower, kvx: 0, kvy: 0,
    cast: null, block: null, med: null, dash: null, effects: {}, recover: 0, air: null, chasmSide: 0, poison: 0,
    chord: null, lastChord: null, late: null, buf: null, // combo wait; late second special; a press kept while busy
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
  if (move.kind === 'manthan' && m.arenaChange) return 'ARENA BUSY'; // ground rule 12: one arena change at a time
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
  if (m.haz) hazards(m, dt);      //    the battlefield's hazards move, warn and strike
  churn(m, dt);                   //    Samudra Manthan, while it lasts
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
    const inp = inputs[p.id], sl = Math.hypot(+inp.mx || 0, +inp.my || 0);
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
  // a fallen soldier (arena hazard) lies across the ground: anyone on the ground walks round him; jumping or flying
  // goes over (owner 2026-11-22: fighters seemed to walk through him)
  for (const z of m.rough) if (z.kind === 'body') for (const p of m.players) {
    if (airborne(p)) continue;
    const half = z.len / 2, cx = clamp(p.x, z.x - half, z.x + half), dx = p.x - cx, dy = p.y - z.y, d = Math.hypot(dx, dy), min = z.r + TUNE.fighterR;
    if (d >= min) continue;
    const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: p.y >= z.y ? 1 : -1 };
    p.x = cx + n.x * min; p.y = z.y + n.y * min;
    const vn = p.kvx * n.x + p.kvy * n.y; if (vn < 0) { p.kvx -= vn * n.x; p.kvy -= vn * n.y; } // knockback stops against him
  }
  // arrows stuck in the sand are solid too until they fade (owner 2026-11-22: fighters walked through them)
  for (const H of m.haz?.list || []) if (H.kind === 'arrows') for (const a of H.pts) {
    if (a.gone || H.age < H.warn + a.d) continue;
    for (const p of m.players) {
      if (airborne(p)) continue;
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy), min = TUNE.hazard.arrows.solid + TUNE.fighterR;
      if (d >= min) continue;
      const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 };
      p.x = a.x + n.x * min; p.y = a.y + n.y * min;
      const vn = p.kvx * n.x + p.kvy * n.y; if (vn < 0) { p.kvx -= vn * n.x; p.kvy -= vn * n.y; }
    }
  }
  for (const p of m.players) { // ground rule 4: he always faces the opponent (walking never turns him)
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
    if (pr.legs > 0 && pr.lt >= pr.legTime) { // a chakra flies in straight legs and re-aims at the opponent between them
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

// Samudra Manthan (an arena change, ground rule 12): `e` = seconds since it began.
export const churnSpin = (c) => { // the island's turning speed right now (rad/s, + = clockwise on screen)
  const S = c.mv.spin;
  if (c.e < S.from || c.e >= S.to) return 0;
  return S.speed * (Math.floor((c.e - S.from) / S.flip) % 2 ? -1 : 1);
};
const spinOver = (c, e0, e1) => { // how far the island turns between two moments of the churning
  let a = 0; for (let e = e0; e < e1; e += 0.05) a += churnSpin({ ...c, e }) * Math.min(0.05, e1 - e);
  return a;
};
function churn(m, dt) {
  const c = m.arenaChange;
  if (!c || c.kind !== 'churn') return;
  const mv = c.mv, B = mv.bubbles, T = mv.treasure, p = m.players[c.owner], o = m.players[1 - c.owner];
  c.e += dt;
  // the beats everyone feels (shakes and sounds in main.js): Mandara crashing down, each heave on Vasuki, the poison erupting
  if (!c.landed && c.e >= 0.7) { c.landed = true; ev(m, 'mandaraLands', {}); }
  const tug = c.e >= mv.spin.from && c.e < mv.spin.to ? Math.floor((c.e - mv.spin.from) / mv.spin.flip) : -1;
  if (tug >= 0 && tug !== c.tug) { c.tug = tug; ev(m, 'churnTug', { n: tug }); }
  if (!c.erupted && c.e >= mv.bubbles.from) { c.erupted = true; ev(m, 'halahala', {}); }
  // the whole world turns: everyone slides round with it, the caster too, and jumping or flying is no escape
  // (owner 2026-11-22: a power on the scale of Brahmastra)
  const w = churnSpin(c);
  if (w) for (const f of m.players) {
    const cs = Math.cos(w * dt), sn = Math.sin(w * dt), x = f.x, y = f.y;
    f.x = x * cs - y * sn; f.y = x * sn + y * cs;
  }
  // Mount Mandara stands in the middle: solid for anyone on the ground
  for (const f of m.players) if (!airborne(f)) {
    const d = Math.hypot(f.x, f.y), min = mv.mountain + TUNE.fighterR;
    if (d < min) { const n = d > 1e-6 ? { x: f.x / d, y: f.y / d } : { x: f === p ? -1 : 1, y: 0 }; f.x = n.x * min; f.y = n.y * min; }
  }
  // Halahala poison rises from the ocean and drifts straight at where the opponent is
  while (c.e >= c.nextBubble - 1e-9 && c.nextBubble <= B.to + 1e-9) {
    c.nextBubble += B.every;
    const ao = Math.atan2(o.y, o.x), a = ao + (m.rand() < 0.5 ? -1 : 1) * (Math.PI / 2 + m.rand() * 0.6), R = ARENA.r - 4; // from the ocean off to his side
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    // aimed where the spin will have carried him when it gets there (standing still is no answer; moving is)
    const T = Math.hypot(o.x - x, o.y - y) / B.speed, wl = spinOver(c, c.e, c.e + T), tx = o.x * Math.cos(wl) - o.y * Math.sin(wl), ty = o.x * Math.sin(wl) + o.y * Math.cos(wl);
    const u = unitDir(tx - x, ty - y);
    m.projectiles.push({ id: m.nid++, owner: p.id, name: 'Halahala', shape: 'poison', x, y, vx: u.x * B.speed, vy: u.y * B.speed, r: B.radius, dmg: mv.damage, dmg0: mv.damage, kb: 0,
      life: B.life, legs: 0, legTime: 0, lt: 0, effect: null, divine: false, boon: false, reach: Infinity, flown: 0, seek: false, falloff: null, k: 1,
      pierceBlock: false, pierceUnits: false, hitUnits: [], hitWalls: [], quick: false, poison: true, born: true });
    ev(m, 'poisonRise', { x, y });
  }
  // the treasure: the first fighter to touch it gets it
  const tr = c.treasure;
  if (tr.taken == null && c.e >= T.at && c.e < T.until) {
    const f = m.players.find((q) => Math.hypot(q.x - tr.x, q.y - tr.y) <= T.grab + TUNE.fighterR);
    if (f) {
      tr.taken = f.id; tr.at = m.t;
      const other = m.players[1 - f.id];
      if (tr.kind === 'kamadhenu') m.hits.push({ target: f, heal: T.heal, src: 'Kamadhenu' });
      else if (tr.kind === 'amrit') applyEffect(f, 'amrit', T.amrit);
      else m.hits.push({ target: other, dmg: T.charge, kb: T.chargeKb, from: { x: f.x, y: f.y }, src: 'Airavata', by: f.id });
      ev(m, 'treasure', { pid: f.id, kind: tr.kind, x: tr.x, y: tr.y });
      say(f, { kamadhenu: 'KAMADHENU: HEALED', airavata: 'AIRAVATA CHARGES', amrit: 'AMRIT: NEXT HIT CANCELLED' }[tr.kind]);
    }
  }
  // Shiva rises and drinks the poison: his scene pauses the game (ground rule 4), and right after it the Halahala
  // burns the opponent (a sure amount) and every mark bursts on whoever carries it
  if (!c.drank && c.e >= mv.shiva) {
    c.drank = true;
    m.scene = { pid: c.owner, name: 'Neelakantha', t: 0, dur: mv.drink, churn: true };
    m.projectiles = m.projectiles.filter((pr) => !pr.poison); // he draws every drifting drop of it up into his hands
    ev(m, 'neelakantha', { pid: c.owner });
    return;
  }
  // then, so everyone sees where it comes from (owner 2026-11-22): he pours the burning poison down onto the opponent
  // as a beam (`burst.pour` s); the sure part lands when it strikes, then every mark bursts one after another
  if (c.drank && c.pourAt == null) { c.pourAt = c.e; ev(m, 'poisonPour', { pid: o.id }); }
  if (c.drank && !c.burst && c.e >= c.pourAt + mv.burst.pour) {
    c.burst = true; c.burstT = c.e; c.pops = []; c.nextPop = c.e + mv.burst.gap;
    m.hits.push({ target: o, dmg: mv.burst.sure, kb: 0, from: null, pierceBlock: true, divine: true, src: 'Halahala', by: c.owner });
    ev(m, 'shivaDrinks', { pid: o.id, marks: m.players.map((f) => f.poison || 0) });
  }
  while (c.burst && c.e >= c.nextPop - 1e-9) { // one mark bursts at a time, on whoever carries it
    const f = m.players.find((q) => q.poison > 0);
    if (!f) { c.nextPop = Infinity; break; }
    f.poison--; c.nextPop += mv.burst.gap; c.pops.push({ pid: f.id, t: c.e });
    m.hits.push({ target: f, dmg: mv.burst.per, kb: 0, from: null, pierceBlock: true, divine: true, src: 'Halahala', by: c.owner });
    ev(m, 'markBurst', { pid: f.id, x: f.x, y: f.y });
  }
}

// Rough ground (ground rule 13, owner 2026-11-15): craters and wet sand slow anyone walking through them.
function addRough(m, kind, x, y, r, life, extra) {
  const z = { kind, x, y, r, t0: m.t, until: m.t + life, ...extra };
  m.rough.push(z); m.rough.sort((a, b) => a.until - b.until);
  if (m.rough.length > TUNE.rough.max) m.rough.shift(); // the oldest goes first
  ev(m, 'rough', { kind, x, y, r });
}
export const onRough = (m, p) => !airborne(p) && m.rough.some((z) => z.kind !== 'body' && Math.hypot(p.x - z.x, p.y - z.y) < z.r + TUNE.rough.feet);
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
    if (lateJoin(m, p, inp, prev, dt)) { handleBlock(m, p, inp, dt); continue; }
    let act = chord(p, inp, ACTS.find(pr), dt);
    if (p.buf && (p.buf.t -= dt) <= 1e-9) p.buf = null;
    if (act && p.cast) { p.buf = { act, t: TUNE.buffer }; act = null; } // busy casting: keep the press for a moment
    if (!act && p.buf && !p.cast && !(p.recover > 0) && !p.block && !p.effects.stun) { act = p.buf.act; p.buf = null; } // free again: the kept press goes off
    if (p.cast) progressCast(m, p, inp, dt);
    else if (p.med) { // a button gets up from meditation and does its thing straight away (e.g. two specials spend the devotion)
      if (act || pr('block')) { stopMed(m, p, 'MEDITATION STOPPED'); if (act && act !== 'cls' && !p.effects.stun) doAct(m, p, act, inp); }
      else progressMed(m, p, dt);
    } else if (act && !p.block && !p.effects.stun) doAct(m, p, act, inp); // attacks work in the air too (owner, 2026-11-14)
    p.lastChord = null;
    handleBlock(m, p, inp, dt);
  }
}

// Responsive controls (owner, 2026-11-26): a press made while still recovering is kept for TUNE.buffer s and
// goes off as soon as the fighter is free; a single special that starts winding up can still become the boon combo.
function doAct(m, p, act, inp) {
  const before = { power: p.power, hp: p.hp, cast: p.cast, air: p.air };
  const r = tryAct(m, p, act, inp);
  if (r === 'busy') { p.buf = { act, t: TUNE.buffer }; return; }
  if (!SPECIALS.includes(act) || !p.lastChord) return;
  // a single special just started: remember it, so a second special a little late can still make the boon
  const started = p.cast && p.cast !== before.cast && p.cast.t < p.cast.move.cast ? 'cast' : p.air?.kind === 'fly' && p.air !== before.air ? 'fly' : null;
  if (started) p.late = { slot: act, t: p.lastChord.t, kind: started, ref: started === 'cast' ? p.cast : p.air, power: before.power - p.power, hp: before.hp - p.hp };
}

// A second special pressed up to TUNE.lateJoin s after the first, while the first is still winding up (or still
// lifting off), calls the first one off (its cost comes back) and makes the boon combo instead (owner, 2026-11-26).
function lateJoin(m, p, inp, prev, dt) {
  const L = p.late;
  if (!L) return false;
  L.t += dt;
  const alive = L.kind === 'cast' ? p.cast === L.ref && !p.cast.done && p.cast.t < p.cast.move.cast - 1e-9 : p.air === L.ref && p.air.t < p.air.lift - 1e-9;
  if (!alive || L.t > TUNE.lateJoin + 1e-9) { p.late = null; return false; }
  const second = SPECIALS.some((b) => b !== L.slot && inp[b] && !prev[b]);
  if (!second || !(p.boon || p.devotion >= TUNE.meditate.tiers[0]) || p.effects.stun) return false;
  p.late = null; p.chord = null; p.buf = null;
  if (L.kind === 'cast') p.cast = null; else p.air = null;
  p.power = Math.min(p.ch.power.size, p.power + L.power); p.hp += L.hp;
  ev(m, 'cancel', { pid: p.id, slot: L.slot });
  tryAct(m, p, 'boon', inp);
  return true;
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
  if (c.seen.length >= 3) { p.chord = null; p.lastChord = null; return 'sig'; }
  if (c.t < TUNE.chord - 1e-9) return null;
  p.chord = null; p.lastChord = c;
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
  if (p.recover > 0) return 'busy'; // still recovering from the last attack (ground rule 16): the press is kept a moment (doAct)
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
  const aim = { dir: unitDir(o.x - p.x, o.y - p.y), target: o }; // every attack goes at the opponent (rule 4)
  ev(m, 'release', { pid: p.id, name: mv.name });
  p.recover = recoveryOf(mv);
  switch (mv.kind) {
    case 'projectile': {
      const n = mv.count || 1, base = c.slot === 'boon' ? Math.atan2(o.y - p.y, o.x - p.x) : Math.atan2(aim.dir.y, aim.dir.x);
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
    case 'area': { // it lands where the opponent stands
      const R = ARENA.r;
      let ax = o.x, ay = o.y;
      const l = Math.hypot(ax, ay); if (l > R) { ax *= R / l; ay *= R / l; }
      m.areas.push({ id: m.nid++, owner: p.id, x: ax, y: ay, r: mv.radius, t: mv.delay, delay: mv.delay, dmg: mv.damage, kb: mv.knockback });
      break;
    }
    case 'global': // across the whole arena, landing when the strike reaches (strikeDelay s), so it matches what's drawn
      if (mv.lands) { // Thousand-Arm Form (owner 2026-11-22): the arms come down where the opponent stood, with a
        // warning circle; anyone still in it when they land is hit (on the ground or off it: the arms reach up)
        const R = ARENA.r, T = mv.strikeDelay;
        let ax = o.x, ay = o.y;
        const l = Math.hypot(ax, ay); if (l > R) { ax *= R / l; ay *= R / l; }
        m.strikesDue.push({ id: m.nid++, owner: p.id, name: mv.name, t: T, T, from: { x: p.x, y: p.y }, to: { x: ax, y: ay }, land: mv.lands.radius,
          x: p.x, y: p.y, vx: (ax - p.x) / T, vy: (ay - p.y) / T, r: mv.travels?.radius || 15, dmg: mv.damage, kb: mv.knockback, src: mv.name, divine: !!mv.divine, travels: true });
      } else if (mv.travels) { // it flies from the caster to just short of the opponent (as drawn), and can meet shots on the way
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
    case 'manthan': { // Samudra Manthan (Krishna, owner 2026-11-22): see the boon in chars/gods.js
      const kinds = ['kamadhenu', 'airavata', 'amrit'], kind = kinds[Math.floor(m.rand() * kinds.length)];
      // Keep the treasure beside Mandara so its sprite and pickup area clear the mountain.
      const flank = m.rand() < 0.5 ? -1 : 1, offset = m.rand() - 0.5;
      const radius = ARENA.sizes[m.arena] ?? ARENA.r;
      startArenaChange(m, { kind: 'churn', name: mv.name, time: mv.time, owner: p.id, mv, e: 0, nextBubble: mv.bubbles.from, dir: 1,
        treasure: { kind, x: flank * radius * (0.52 + offset * 0.08), y: radius * offset * 0.32, taken: null }, burst: false });
      for (const f of m.players) f.poison = 0;
      ev(m, 'manthan', { pid: p.id });
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
  { const d = unitDir(o.x - p.x, o.y - p.y); if (d.x || d.y) p.face = d; } // it stays between him and the opponent
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

// ---------- arena hazards ----------
// Ground rule 12 note (owner, 2026-11-21): the battlefield's arrow volleys, falling soldiers, stray spears, horses
// and charging elephants belong to nobody (owner -1) and hit anyone. Each one warns first. Horses and elephants are
// extra units (own health, any attack hits them); arrows and the spear are shots that can be met by a shot (rule 6).
// Hitting them gives nothing. Their own random numbers (not m.rand), so they don't change the rest of the match.
// Height (rule 17): the falling arrows and soldier, and a horse or elephant running you down, are like arrow rain and
// melee (they miss anyone jumping or flying); the spear is a shot (it passes under a jump, hits a flyer).
const NOBODY = -1;
// test = { kind, busy } (review aid from the URL: only that kind / short gaps)
function newHazards(seed, test) {
  const rand = rng((seed * 7919 + 13) | 0), H = TUNE.hazard, first = test?.busy ? [1, 2] : H.first;
  return { rand, list: [], last: null, next: first[0] + rand() * (first[1] - first[0]), fallen: [], test };
}
// how long until the next hazard comes in, counted from when the last one came in (owner 2026-11-22: several at
// once is good, at random): now and then the next one follows almost at once, on top of the one still running
function hazardGap(Z) {
  const H = TUNE.hazard, R = (a, b) => a + Z.rand() * (b - a);
  if (Z.test?.busy) return R(1, 5);
  return Z.rand() < H.overlap ? R(H.soon[0], H.soon[1]) : R(H.gap[0], H.gap[1]);
}
// Test mode only (src/testmode.js): send this hazard in now, replacing whatever is on. Not used by the game itself.
export function forceHazard(m, kind) {
  if (!m.haz || !TUNE.hazard[kind]) return false;
  for (const h of m.haz.list.filter((h) => h.kind === kind)) { if (h.unit) { const i = m.units.indexOf(h.unit); if (i >= 0) m.units.splice(i, 1); } m.haz.list.splice(m.haz.list.indexOf(h), 1); }
  m.haz.force = kind; m.haz.next = m.t;
  return true;
}
function hazards(m, dt) {
  const Z = m.haz, H = TUNE.hazard, R = (a, b) => a + Z.rand() * (b - a), r = ARENA.r;
  Z.fallen = Z.fallen.filter((f) => m.t - f.t0 < 3);
  // the next one comes in when its time is up, whatever else is still running (they overlap at random), but never
  // two of the same kind at once, never a horse and an elephant together (two lanes to dodge at once), at most H.maxAt
  const on = new Set(Z.list.map((h) => h.kind)), big = on.has('horse') || on.has('elephant');
  const opts = Object.entries(H.weights).filter(([k]) => k !== Z.last && !on.has(k) && !(big && (k === 'horse' || k === 'elephant')));
  if (Z.test?.kind && on.has(Z.test.kind)) opts.length = 0; // a one-kind review run: one of it at a time
  if ((opts.length && Z.list.length < H.maxAt || Z.force) && (!m.arenaChange || Z.force) && m.phase === 'fight' && m.t >= Z.next) {
    if (!opts.length) opts.push(...Object.entries(H.weights)); // forced from test mode
    let w = Z.rand() * opts.reduce((a, [, v]) => a + v, 0), kind = opts[opts.length - 1][0];
    for (const [k, v] of opts) if ((w -= v) <= 0) { kind = k; break; }
    if (H[Z.test?.kind]) kind = Z.test.kind;
    if (Z.force) { kind = Z.force; Z.force = null; }
    Z.last = kind;
    const C = H[kind], a0 = R(0, Math.PI * 2), h = { id: m.nid++, kind, age: 0, warn: C.warn };
    if (kind === 'arrows') {
      h.side = Z.rand() < 0.5 ? 1 : -1;
      h.pts = Array.from({ length: Math.floor(R(C.n[0], C.n[1] + 1)) }, () => { const a = R(0, Math.PI * 2), d = Math.sqrt(Z.rand()) * r * 0.85; return { x: Math.cos(a) * d, y: Math.sin(a) * d, d: R(0, C.stagger), tilt: R(-0.3, 0.3), dmg: C.dmg }; });
      h.life = C.warn + C.stagger + C.stick;
    } else if (kind === 'soldier') {
      h.fall = C.fall; h.life = C.warn + C.fall; h.army = Z.rand() < 0.5 ? 0 : 1;
      h.x0 = Math.cos(a0) * r * 1.12; h.y0 = Math.sin(a0) * r * 1.12; h.x1 = Math.cos(a0) * r * 0.86; h.y1 = Math.sin(a0) * r * 0.86;
    } else if (kind === 'spear') {
      const a1 = a0 + Math.PI + R(-0.7, 0.7);
      h.x0 = h.x = Math.cos(a0) * r * 1.05; h.y0 = h.y = Math.sin(a0) * r * 1.05; h.x1 = Math.cos(a1) * r * 1.3; h.y1 = Math.sin(a1) * r * 1.3;
      const d = unitDir(h.x1 - h.x0, h.y1 - h.y0); h.vx = d.x * C.speed; h.vy = d.y * C.speed; h.dmg = C.dmg;
      h.life = C.warn + Math.hypot(h.x1 - h.x0, h.y1 - h.y0) / C.speed;
    } else { // a horse or an elephant runs straight across, left to right or right to left (owner 2026-11-22: they are
      // painted side-on, so a lane up or down the screen made them slide sideways into the war behind or out the front)
      const b0 = (Z.rand() < 0.5 ? 0 : Math.PI) + R(-0.55, 0.55), a1 = b0 + Math.PI + R(-0.35, 0.35), sp = R(C.speed[0], C.speed[1]);
      const a0 = b0;
      h.x0 = Math.cos(a0) * r * 1.3; h.y0 = Math.sin(a0) * r * 1.3; h.x1 = Math.cos(a1) * r * 1.3; h.y1 = Math.sin(a1) * r * 1.3;
      const d = unitDir(h.x1 - h.x0, h.y1 - h.y0); h.vx = d.x * sp; h.vy = d.y * sp; h.army = Z.rand() < 0.5 ? 0 : 1; h.rider = kind === 'elephant' || Z.rand() < 0.5;
      h.run = Math.hypot(h.x1 - h.x0, h.y1 - h.y0) / sp; h.life = C.warn + h.run;
    }
    Z.list.push(h); Z.next = m.t + hazardGap(Z);
    ev(m, 'hazard', { kind, id: h.id });
  }
  for (const h of [...Z.list]) stepHazard(m, Z, h, dt);
}
function stepHazard(m, Z, h, dt) {
  const H = TUNE.hazard;
  h.age += dt;
  const C = H[h.kind], FR = TUNE.fighterR, onGround = (p) => !airborne(p);
  const shotDown = (x, y, rr, dmg) => { // a fighter's shot meets it (rule 6): the stronger goes on, weakened
    for (const pr of m.projectiles) {
      if (pr.dead || Math.hypot(pr.x - x, pr.y - y) > pr.r + rr) continue;
      ev(m, 'clash', { x, y, a: pr.name, b: h.kind });
      if (pr.dmg > dmg) { pr.dmg -= dmg; return 0; }
      if (pr.dmg < dmg) { dmg -= pr.dmg; pr.dead = true; continue; }
      pr.dead = true; return 0;
    }
    return dmg;
  };
  if (h.kind === 'arrows') {
    for (const p of h.pts) {
      if (p.done) continue;
      const land = h.warn + p.d;
      if (h.age < land) { p.dmg = shotDown(p.x, p.y, 3, p.dmg); if (p.dmg <= 0) { p.done = p.gone = true; } continue; }
      p.done = true;
      for (const t of m.players) if (onGround(t) && Math.hypot(t.x - p.x, t.y - p.y) <= C.r + FR) m.hits.push({ target: t, dmg: p.dmg, kb: C.kb, from: { x: p.x, y: p.y }, src: 'Stray arrows' });
    }
  } else if (h.kind === 'soldier') {
    if (!h.landed && h.age >= h.life) {
      h.landed = true;
      for (const t of m.players) if (onGround(t) && Math.hypot(t.x - h.x1, t.y - h.y1) <= C.r + FR) m.hits.push({ target: t, dmg: C.dmg, kb: C.kb, from: { x: h.x0, y: h.y0 }, src: 'Falling soldier' });
      addRough(m, 'body', h.x1, h.y1, C.body.r, C.body.life, { army: h.army, flip: h.x0 <= 0, len: C.body.len }); // he lies there, solid, until he fades
    }
  } else if (h.kind === 'spear') {
    if (h.age >= h.warn && !h.dead) {
      h.x += h.vx * dt; h.y += h.vy * dt;
      h.dmg = shotDown(h.x, h.y, C.r, h.dmg);
      for (const w of m.walls) { // a block soaks it like any shot
        if (h.dmg <= 0 || w.dead || (h.hitWalls ||= []).includes(w.id)) continue;
        const [a, b] = wallEnds(w);
        if (segDist(h, a, b) > C.r + 1) continue;
        h.hitWalls.push(w.id); h.dmg = absorb(m, w, h.dmg);
      }
      if (h.dmg <= 0) h.dead = true;
      for (const t of m.players) {
        if (h.dead || t.air?.kind === 'jump' || Math.hypot(t.x - h.x, t.y - h.y) > FR + C.r) continue;
        const d = unitDir(h.vx, h.vy);
        m.hits.push({ target: t, dmg: h.dmg, kb: C.kb, dir: d, from: { x: h.x - d.x * 20, y: h.y - d.y * 20 }, walled: true, src: 'Stray spear' });
        h.dead = true;
      }
      if (h.dead) h.life = Math.min(h.life, h.age + 0.4);
    }
  } else { // horse / elephant
    if (h.age >= h.warn && !h.unit && !h.gone) { // it comes in: an extra unit with its own health (rule 12)
      h.unit = { id: m.nid++, owner: NOBODY, hazard: h.kind, x: h.x0, y: h.y0, vx: h.vx, vy: h.vy, hp: C.hp, hp0: C.hp, t: h.run, r: C.r, name: h.kind, hit: [] };
      m.units.push(h.unit);
    }
    const u = h.unit;
    if (u) {
      if (!m.units.includes(u)) { // gone: run out of the arena, or brought down
        if (u.hp <= 0) { Z.fallen.push({ kind: h.kind, x: u.x, y: u.y, vx: u.vx, army: h.army, rider: h.rider, t0: m.t }); ev(m, 'hazardDown', { kind: h.kind, x: u.x, y: u.y }); }
        h.unit = null; h.gone = true; h.life = Math.min(h.life, h.age);
      } else {
        u.x += u.vx * dt; u.y += u.vy * dt;
        for (const t of m.players) { // runs down anyone on the ground in its way, once each
          if (!onGround(t) || u.hit.includes(t.id) || Math.hypot(t.x - u.x, t.y - u.y) > u.r + FR) continue;
          u.hit.push(t.id);
          const d = unitDir(u.vx, u.vy);
          m.hits.push({ target: t, dmg: C.dmg, kb: C.kb, dir: d, from: { x: u.x - d.x * 12, y: u.y - d.y * 12 }, src: h.kind === 'elephant' ? 'Charging elephant' : 'Runaway horse' });
        }
        if (C.swing) tuskSwing(m, u, C.swing, dt); // the elephant also swings its tusks at anyone just beside its path
      }
    }
  }
  if (h.age >= h.life) { // over
    if (h.unit) { const i = m.units.indexOf(h.unit); if (i >= 0) m.units.splice(i, 1); }
    Z.list.splice(Z.list.indexOf(h), 1);
  }
}

// The elephant's tusk swing (owner 2026-11-22): someone on the ground near its front, just outside its path, gets a
// sweep of the tusks: a visible wind-up (u.swing.t < windup), then anyone still in reach is hit once. Rests a moment after.
function tuskSwing(m, u, S, dt) {
  const FR = TUNE.fighterR, d = unitDir(u.vx, u.vy), reach = u.r + S.reach + FR;
  const inReach = (t) => { const dx = t.x - u.x, dy = t.y - u.y; return !airborne(t) && Math.hypot(dx, dy) <= reach && dx * d.x + dy * d.y > -u.r * 0.5; }; // beside or ahead, not behind
  if (u.swing) {
    u.swing.t += dt;
    if (!u.swing.struck && u.swing.t >= S.windup) {
      u.swing.struck = true;
      for (const t of m.players) if (inReach(t) && !u.hit.includes(t.id)) { u.hit.push(t.id); m.hits.push({ target: t, dmg: S.dmg, kb: S.kb, from: { x: u.x, y: u.y }, src: 'Tusk swing' }); }
    }
    if (u.swing.t >= S.dur) { u.swing = null; u.rest = S.rest; }
    return;
  }
  if ((u.rest = Math.max(0, (u.rest || 0) - dt)) > 0) return;
  if (m.players.some((t) => inReach(t) && !u.hit.includes(t.id))) { u.swing = { t: 0 }; ev(m, 'tusk', { x: u.x, y: u.y }); }
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
  for (const s of flying) { // advance the halo before resolving contact on this step
    s.t -= STEP;
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
    if (o.air?.kind === 'jump' && !pr.seek && !pr.poison) continue; // ground rule 17: shots pass under a jump (boons still find him; Samudra Manthan's poison is a whole-arena power and reaches any height)
    const d = unitDir(pr.vx, pr.vy);
    m.hits.push({ target: o, dmg: pr.dmg, kb: pr.kb, dir: d, from: { x: pr.x - d.x * 20, y: pr.y - d.y * 20 }, effect: pr.effect, divine: pr.divine, pierceBlock: pr.pierceBlock, walled: true, src: pr.name, by: pr.owner, poison: pr.poison });
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
    if (!s.travels) s.t -= STEP;
    if (s.dead || s.t > 1e-9) continue;
    s.dead = true;
    const p = m.players[s.owner], o = opponent(m, p);
    const caught = (t) => !s.land || Math.hypot(t.x - s.to.x, t.y - s.to.y) <= s.land + (t.r ?? FR); // a landing spot only catches who is in it
    if (s.land) ev(m, 'armsLand', { x: s.to.x, y: s.to.y, vx: s.vx, vy: s.vy });
    for (const t of [o, ...m.units.filter((u) => u.owner !== s.owner)]) if (caught(t) && !(t === o && o.effects.invuln)) m.hits.push({ target: t, dmg: s.dmg, kb: s.kb, from: s.land ? s.to : s.from, src: s.src, divine: s.divine, by: s.owner });
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
    if (t.effects?.amrit && !h.absolute && !h.burn && h.dmg > 0) { delete t.effects.amrit; ev(m, 'amrit', { pid: t.id, x: t.x, y: t.y }); continue; } // the Amrit pot cancels the next hit
    let dmg = h.dmg;
    const w = wallFor(m, t, h);
    if (w) dmg = absorb(m, w, dmg);
    if (h.poison && t.ch && dmg > 0) { t.poison = (t.poison || 0) + 1; ev(m, 'poisonHit', { pid: t.id, x: t.x, y: t.y }); } // Samudra Manthan: a poison mark, until Shiva drinks
    // the meditation barrier takes most of the damage; a little (`leak`) still reaches health, so sitting under fire
    // isn't free (owner, 2026-11-14). Divine weapons go straight through it.
    if (t.med && !h.divine && !h.absolute && dmg > 0) {
      const a = Math.min(t.med.barrier, dmg * (1 - TUNE.meditate.leak));
      t.med.barrier -= a; dmg -= a;
      ev(m, 'barrier', { pid: t.id, amount: a, left: t.med.barrier, x: t.x, y: t.y });
      if (t.med.barrier <= 1e-9) stopMed(m, t, 'BARRIER BROKEN');
      else { // the barrier held: the little that leaks through hurts, but doesn't break meditation or push
        if (dmg > 0) { n.dmg += dmg; n.srcs.push(h.src); if (h.by != null && m.players[h.by] && !t.hazard) m.players[h.by].stats.dealt += dmg; }
        continue;
      }
    }
    if (!(dmg > 0)) continue;
    if (h.burn) { n.dmg += dmg; n.srcs.push(h.src); if (h.by != null && m.players[h.by] && !t.hazard) m.players[h.by].stats.dealt += dmg; continue; } // lava: hurts, never interrupts
    n.dmg += dmg; n.hit = true; n.srcs.push(h.src);
    if (h.by != null && m.players[h.by] && !t.hazard) m.players[h.by].stats.dealt += Number.isFinite(dmg) ? dmg : 0;
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

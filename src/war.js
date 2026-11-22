// The live battlefield (owner, 2026-11-21): a war going on round the arena, never the same twice.
// Two halves:
//  - behind the arena (this file only, just for looks): a "war director" keeps duels, charges, horsemen, elephants,
//    chariots and arrow volleys going along the far rim, picked at random from the match seed, never the same kind
//    twice running.
//  - inside the arena: the hazards (arrow volleys, falling soldiers, stray spears, horses, charging elephants) are
//    real and live in sim.js (ground rule 12 note); this file only draws what the match says is there.
// The look: ChatGPT frame sheets (art/prompts_battlefield_live.txt); the code shapes below are only a fallback if a sheet is missing.
import { rng } from './util.js';
import { ART, drawFx } from './art.js';
import { TUNE, ARENA } from './config.js';

// play frame i of a strip (prefix1..n) standing on (x, y), `h` = the cell's height on screen; false if the art isn't there
// `from` = how many frames of the strip to skip (play frames from+1 .. from+n)
function strip(prefix, n, i, x, y, h, flip, alpha = 1, from = 0) {
  const f = ART.fx[prefix + 1];
  if (!f) return false;
  const w = h * f.w / f.h, k = ((Math.floor(i) % n) + n) % n;
  return drawFx(G, prefix + (from + k + 1), x, y, w, { h, anchor: 'bottom', m: flip ? [-1, 0, 0, 1] : null, alpha });
}
const RUN = ['runT', 'runF'], STAG = ['stag', 'stagF'];
// One scale for everything (owner 2026-11-22: "scale issues"): every sheet is drawn so its figure is a set number of
// man-heights tall, measured from the art itself (the painted figure's height and how far its feet sit above the cell's
// bottom), so a runner, a duellist, a horseman, the chariot and the elephant all match a man at the same depth.
const TALL = { runT: 1, runF: 1, duel: 1, stag: 1, stagF: 1, cavF: 1.45, horse: 1.1, chariot: 1.8, eleC: 2.3 };
const FIG = new Map();
function measure(prefix) {
  if (FIG.has(prefix)) return FIG.get(prefix);
  const f = ART.fx[prefix + 1];
  if (!f) return null;
  const w = Math.floor(f.w), h = Math.floor(f.h), d = f.canvas.getContext('2d').getImageData(Math.floor(f.x), Math.floor(f.y), w, h).data;
  let top = h, bot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) { if (y < top) top = y; if (y > bot) bot = y; }
  const r = bot >= top ? { tall: (bot - top + 1) / h, foot: (h - 1 - bot) / h } : { tall: 1, foot: 0 };
  FIG.set(prefix, r);
  return r;
}
// frame `frame` of a sheet with its figure `px` screen pixels tall and its feet on (x, y); ref = whose frame 1 sets the scale
function figure(prefix, frame, x, y, px, flip, alpha = 1, ref = prefix) {
  const r = measure(ref);
  if (!r || !ART.fx[prefix + 1]) return false;
  const cell = px / r.tall;
  return strip(prefix, 1, 0, x, y + cell * r.foot, cell, flip, alpha, frame);
}
const MAN_A = 46; // a man's height in the arena, screen px (the fighters' height)
const ARROW_CELL = 62; // owner 2026-11-22: the arrows looked unintentionally tiny; a war arrow is about half a man's height
// a common soldier in the arena, standing height in screen px. The art lies about 2.2x longer than it stands (dropped spear
// and all), so this is set by the body on the ground: ~55 px long next to the 46 px fighters (owner 2026-11-22: "still huge" at 36)
// a war spear is longer than a man is tall (owner 2026-11-22: at 44 it looked like an arrow); the cell is a bit longer than the spear
const SPEAR_W = 70; // art/war_spear_hd.png: the spear fills almost the whole cell
const SOLDIER_A = 42; // art/war_fallen_tiger.png (2026-11-22, sharper redraw) has real proportions: a 42 px man lies about 66 px long


const ARMY = [
  { cloth: '#b02a1c', dark: '#5e130c', trim: '#e8b84a' }, // the tiger army (red)
  { cloth: '#2a4c9c', dark: '#122452', trim: '#d9c26a' }, // the fish army (blue)
];
const warParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('war') : null;
export const warOn = warParam !== '0'; // ?war=0 hides the war behind the arena, to compare (the hazards stay: they can't be turned off)

// The war behind the arena (owner 2026-11-22: people popped in and out, speeds didn't match, wanted more of them):
// the two armies come in from their own side, off screen (tiger from the left, fish from the right), and run along the
// band. When a tiger and a fish soldier meet they stop and duel; one falls and lies there, the other runs on. The fallen
// stay and only fade slowly much later. Horsemen (fish), chariots and elephants (tiger) ride through now and then, and
// archers off screen send volleys over. Everything moves at its own steady speed, and its legs move with the ground it
// covers (frames by distance, not by time), so nothing skates. All placed in painting pixels.
const BAND = { top: 236, bottom: 268, w: 1672 }; // right along the far rim
const manP = (y) => (62 + (y - BAND.top) * 0.9) * 1.25; // a man's height in painting px, bigger nearer the arena (x1.25, owner 2026-11-22: ~2/3 of a fighter at the rim)
const TARGET = 24;                               // soldiers on foot on the field at once
const DIR = [1, -1], EDGE = [-60, BAND.w + 60];  // tiger runs right from the left edge, fish left from the right
const LOOP = { run: 1.4, gallop: 2.4, ele: 1.5 }; // ground covered (man-heights) by one loop of the frames
const S = { m: null, t: 0, rand: Math.random, men: [], duels: [], riders: [], volleys: [], nextWave: 0, nextRide: 0, nextVolley: 0 };
const R = (a, b) => a + S.rand() * (b - a);

export function warUpdate(m, t) {
  if (m !== S.m) { // a new match: a new war, seeded from the match; run it 25 s so it is already going
    Object.assign(S, { m, t, rand: rng((m.seed ?? 1) * 104729 + 7), men: [], duels: [], riders: [], volleys: [], nextWave: 0, nextRide: R(2, 6), nextVolley: R(3, 8) });
    for (let i = 0, f = t - 25; i < 250; i++) { f += 0.1; stepWar(f, 0.1); }
    S.t = t;
  }
  const dt = Math.max(0, Math.min(0.1, t - S.t)); S.t = t;
  if (dt) stepWar(t, dt);
}

function spawnWave(t) {
  const alive = [0, 1].map((a) => S.men.filter((x) => x.army === a && x.state !== 'dead').length);
  const army = alive[0] === alive[1] ? (S.rand() < 0.5 ? 0 : 1) : alive[0] < alive[1] ? 0 : 1, n = Math.floor(R(3, 8));
  for (let i = 0; i < n; i++) {
    const y = R(BAND.top, BAND.bottom);
    S.men.push({ army, y, x: EDGE[army] - DIR[army] * R(0, 220), dir: DIR[army], speed: manP(y) * R(1.05, 1.3), dist: R(0, 50), state: 'run', t0: t });
  }
}

function stepWar(t, dt) {
  const running = S.men.filter((x) => x.state === 'run' || x.state === 'duel').length;
  if (t >= S.nextWave && running < TARGET) { spawnWave(t); S.nextWave = t + R(0.6, 2.2); }
  if (t >= S.nextRide) { // something mounted rides through
    const r = S.rand(), kind = r < 0.45 ? 'cav' : r < 0.75 ? 'chariot' : 'ele', army = kind === 'cav' ? 1 : 0;
    const n = kind === 'cav' ? Math.floor(R(2, 5)) : 1;
    for (let i = 0; i < n; i++) {
      const y = R(BAND.top, BAND.bottom), sp = { cav: R(2.3, 2.7), chariot: R(2.5, 3), ele: R(0.55, 0.7) }[kind];
      S.riders.push({ kind, army, y, x: EDGE[army] - DIR[army] * (60 + i * R(50, 90)), dir: DIR[army], speed: manP(y) * sp, dist: R(0, 50) });
    }
    S.nextRide = t + R(5, 13);
  }
  if (t >= S.nextVolley) { // archers off one side: arrows arc over the sky and drop into the far ranks
    const side = S.rand() < 0.5 ? 1 : -1;
    S.volleys.push({ side, t0: t, arrows: Array.from({ length: Math.floor(R(10, 22)) }, () => ({ x0: R(-60, 180), x1: R(500, 1500), peak: R(30, 120), d: R(0, 0.9), y1: R(BAND.top - 10, BAND.bottom) })) });
    S.nextVolley = t + R(4, 11);
  }
  for (const x of S.men) if (x.state === 'run') { x.x += x.dir * x.speed * dt; x.dist += x.speed * dt; }
  // a tiger and a fish soldier who meet stop and fight (they meet at the distance the duel art holds them apart)
  for (const a of S.men) {
    if (a.state !== 'run' || a.army !== 0) continue;
    for (const b of S.men) {
      if (b.state !== 'run' || b.army !== 1 || Math.abs(a.y - b.y) > 6) continue;
      const gap = b.x - a.x, need = manP((a.y + b.y) / 2) * 1.05;
      if (gap < 0 || gap > need) continue;
      a.state = b.state = 'duel';
      S.duels.push({ a, b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t0: t, until: t + R(2, 5.5), ph: R(0, 12) });
      break;
    }
  }
  for (const d of S.duels) if (t >= d.until) { // one of them falls where he stood; the other runs on
    const [win, lose] = S.rand() < 0.5 ? [d.a, d.b] : [d.b, d.a], half = manP(d.y) * 0.53;
    d.a.x = d.x - half; d.b.x = d.x + half; d.a.y = d.b.y = d.y;
    win.state = 'run'; lose.state = 'dead'; lose.t0 = t; d.done = true;
  }
  S.duels = S.duels.filter((d) => !d.done);
  for (const r of S.riders) { r.x += r.dir * r.speed * dt; r.dist += r.speed * dt; }
  // the riders fight too (owner 2026-11-22): a horseman's sword, the chariot's archer and the elephant cut down enemy
  // soldiers on foot as they pass (a duel they ride into ends with the enemy down); each soldier gets one chance
  for (const r of S.riders) {
    const reach = manP(r.y) * (r.kind === 'ele' ? 0.45 : 0.3), front = r.x + r.dir * manP(r.y) * (r.kind === 'ele' ? 0.7 : 0.5);
    for (const x of S.men) {
      if (x.army === r.army || x.state === 'dead' || x.seen?.has(r) || Math.abs(x.y - r.y) > 5 || Math.abs(x.x - front) > reach) continue;
      (x.seen ||= new Set()).add(r);
      if (S.rand() > (r.kind === 'cav' ? 0.3 : r.kind === 'ele' ? 0.45 : 0.2)) continue; // most get out of the way
      const d = S.duels.find((q) => q.a === x || q.b === x);
      if (d) { d.done = true; const other = d.a === x ? d.b : d.a, half = manP(d.y) * 0.53; d.a.x = d.x - half; d.b.x = d.x + half; other.state = 'run'; }
      x.state = 'dead'; x.t0 = t; x.dir = -r.dir; // knocked back the way the rider is going: he falls away from it
    }
  }
  S.duels = S.duels.filter((d) => !d.done);
  const off = (o) => (o.dir > 0 ? o.x > BAND.w + 260 : o.x < -260);
  S.riders = S.riders.filter((r) => !off(r));
  // the fallen stay; only once there are many, or long after, do they slowly fade
  const dead = S.men.filter((x) => x.state === 'dead');
  dead.forEach((x, i) => { if (!x.fade && (i < dead.length - 16 || t - x.t0 > 45)) x.fade = t; });
  S.men = S.men.filter((x) => !(x.state === 'run' && off(x)) && !(x.fade && t - x.fade > 4));
  S.volleys = S.volleys.filter((v) => t - v.t0 < 3.4);
}

// ---------- drawing (placeholder shapes) ----------
let G = null;
const lw = (w) => { G.lineWidth = Math.max(0.5, w); };
function stroke(c, w, pts) { G.strokeStyle = c; lw(w); G.beginPath(); G.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) G.lineTo(pts[i], pts[i + 1]); G.stroke(); }
function blob(x, y, rx, ry, c) { G.fillStyle = c; G.beginPath(); G.ellipse(x, y, Math.max(0.4, rx), Math.max(0.4, ry), 0, 0, Math.PI * 2); G.fill(); }

// a foot soldier, feet at (0,0) in the current transform, facing +x; pose 'run' | 'fight' | 'stand' | 'stagger'
function soldier(h, army, pose, ph) {
  const A = ARMY[army], hip = -h * 0.45, sw = pose === 'run' ? Math.sin(ph) * h * 0.18 : pose === 'stagger' ? Math.sin(ph * 0.6) * h * 0.1 : Math.sin(ph * 0.5) * h * 0.04;
  stroke('#3a2416', h * 0.08, [0, hip, sw, 0]); stroke('#3a2416', h * 0.08, [0, hip, -sw, 0]); // legs
  G.fillStyle = A.cloth; G.fillRect(-h * 0.13, -h * 0.8, h * 0.26, h * 0.37); // body
  G.fillStyle = A.trim; G.fillRect(-h * 0.13, hip - h * 0.04, h * 0.26, h * 0.05); // belt
  blob(0, -h * 0.88, h * 0.1, h * 0.1, '#c08455'); // head
  blob(0, -h * 0.93, h * 0.11, h * 0.06, A.dark); // helmet
  const thrust = pose === 'fight' ? Math.max(0, Math.sin(ph * 1.7)) * h * 0.3 : 0, up = pose === 'stagger' ? -h * 0.2 : 0;
  stroke('#8a6a40', h * 0.05, [-h * 0.3 + thrust, -h * 0.55 + up, h * 0.55 + thrust, -h * 0.85 + up]); // spear
  stroke('#d8d8d8', h * 0.07, [h * 0.5 + thrust, -h * 0.84 + up, h * 0.62 + thrust, -h * 0.88 + up]); // spearhead
  blob(h * 0.14, -h * 0.6, h * 0.15, h * 0.17, A.dark); blob(h * 0.14, -h * 0.6, h * 0.08, h * 0.09, A.trim); // shield
}
// a horse, hooves at (0,0), length len, facing +x
function horse(len, ph, coat, army, rider) {
  const by = -len * 0.55;
  for (let i = 0; i < 4; i++) { const lx = (i < 2 ? 0.25 : -0.25) * len + (i % 2 ? 0.05 : -0.05) * len, s = Math.sin(ph + i * 1.6) * len * 0.14; stroke('#2a1a10', len * 0.06, [lx, by, lx + s, 0]); }
  stroke(coat, len * 0.06, [-len * 0.38, by - len * 0.05, -len * 0.55, by + len * 0.2]); // tail
  blob(0, by, len * 0.38, len * 0.15, coat); // body
  stroke(coat, len * 0.13, [len * 0.28, by - len * 0.05, len * 0.42, by - len * 0.32]); // neck
  blob(len * 0.48, by - len * 0.32, len * 0.12, len * 0.06, coat); // head
  if (rider) { G.save(); G.translate(-len * 0.02, by - len * 0.05); soldier(len * 0.75, army, 'fight', ph * 0.5); G.restore(); }
}
// an elephant, feet at (0,0), length len, facing +x, with a howdah in its army's colours
function elephant(len, ph, army) {
  const A = ARMY[army], by = -len * 0.5;
  for (let i = 0; i < 4; i++) { const lx = (i < 2 ? 0.24 : -0.24) * len + (i % 2 ? 0.06 : -0.06) * len, s = Math.sin(ph + i * 1.6) * len * 0.05; G.fillStyle = '#5c5856'; G.fillRect(lx - len * 0.06 + s, by, len * 0.12, -by); }
  blob(0, by, len * 0.42, len * 0.26, '#6e6a68'); // body
  blob(len * 0.4, by - len * 0.1, len * 0.17, len * 0.17, '#74706d'); // head
  G.strokeStyle = '#6e6a68'; lw(len * 0.07); G.beginPath(); G.moveTo(len * 0.52, by - len * 0.05); G.quadraticCurveTo(len * 0.66 + Math.sin(ph * 0.7) * len * 0.04, by + len * 0.15, len * 0.6, by + len * 0.42); G.stroke(); // trunk
  stroke('#eee6d0', len * 0.035, [len * 0.5, by + len * 0.02, len * 0.66, by + len * 0.06]); // tusk
  G.fillStyle = A.cloth; G.fillRect(-len * 0.3, by - len * 0.22, len * 0.55, len * 0.32); // caparison
  G.fillStyle = A.trim; G.fillRect(-len * 0.3, by + len * 0.08, len * 0.55, len * 0.04);
  G.fillStyle = A.dark; G.fillRect(-len * 0.2, by - len * 0.5, len * 0.34, len * 0.26); // howdah
  G.fillStyle = A.trim; G.fillRect(-len * 0.22, by - len * 0.52, len * 0.38, len * 0.04);
  blob(-len * 0.08, by - len * 0.55, len * 0.05, len * 0.05, '#c08455'); blob(len * 0.06, by - len * 0.55, len * 0.05, len * 0.05, '#c08455');
}
function chariot(len, ph, army) {
  const A = ARMY[army];
  G.save(); G.translate(len * 0.32, 0); horse(len * 0.55, ph, '#d6cdbb', army, false); G.translate(len * 0.08, -len * 0.02); horse(len * 0.55, ph + 1, '#cfc4b0', army, false); G.restore();
  stroke('#6a4a28', len * 0.03, [len * 0.05, -len * 0.25, -len * 0.1, -len * 0.22]);
  G.fillStyle = A.cloth; G.fillRect(-len * 0.4, -len * 0.42, len * 0.32, len * 0.24);
  G.fillStyle = A.trim; G.fillRect(-len * 0.4, -len * 0.44, len * 0.32, len * 0.04);
  G.strokeStyle = '#4a3018'; lw(len * 0.03); G.beginPath(); G.arc(-len * 0.24, -len * 0.15, len * 0.15, 0, Math.PI * 2); G.stroke();
  G.save(); G.translate(-len * 0.24, -len * 0.4); soldier(len * 0.4, army, 'fight', ph); G.restore();
}
// the arena's hazard arrows use the same painted arrows as Kanalan's block (art/fx_arrow_parts.png, owner 2026-11-22:
// the old strip looked low quality next to the players' arrows). Same size and anchor as render.js drawVolley:
// the cell point (256, 0.89 of its height) is where the arrow goes into the sand. `to` = how much of it shows (from the top).
const ARROW_LEN = 36;
function realArrow(kind, x, y, rot, flip, alpha = 1, to = 1) {
  const f = ART.fx['arrow' + (kind + 1)];
  if (!f) return false;
  const upp = ARROW_LEN / 400, dw = 512 * upp * f.w / f.h, dh = 512 * upp;
  G.save(); G.globalAlpha *= alpha; G.translate(x, y); G.rotate(rot); if (flip) G.scale(-1, 1);
  G.imageSmoothingEnabled = true;
  G.drawImage(f.canvas, f.x, f.y, f.w, f.h * to, -dw / 2, -0.89 * dh, dw, dh * to);
  G.restore();
  return true;
}
const arrowKind = (p) => Math.floor((((Math.sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453) % 1) + 1) % 1 * 4);
function arrow(x, y, ang, len, a = 1) {
  G.save(); G.globalAlpha *= a; G.translate(x, y); G.rotate(ang);
  stroke('#5a3a1e', Math.max(0.5, len * 0.07), [-len, 0, 0, 0]); stroke('#cfcfcf', Math.max(0.6, len * 0.12), [0, 0, len * 0.15, 0]);
  stroke('#e8e0d0', Math.max(0.5, len * 0.1), [-len, 0, -len * 0.8, -len * 0.08]);
  G.restore();
}
function dust(x, y, r, a, seed) {
  for (let i = 0; i < 5; i++) {
    const k = Math.sin(seed * 12.9 + i * 78.2) * 0.5 + 0.5, px = x + (k - 0.5) * r * 1.6, py = y - k * r * 0.4, rr = r * (0.5 + k * 0.5);
    const g = G.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, `rgba(170,120,80,${0.45 * a})`); g.addColorStop(1, 'rgba(170,120,80,0)');
    G.fillStyle = g; G.beginPath(); G.ellipse(px, py, rr, rr * 0.6, 0, 0, Math.PI * 2); G.fill();
  }
}
const at = (x, y, flip, draw) => { G.save(); G.translate(x, y); if (flip) G.scale(-1, 1); draw(); G.restore(); };

// behind the arena. P(x, y) maps painting pixels to the screen; k = screen px per painting px.
export function warDrawBack(g, P, k) {
  if (!S.m) return;
  G = g; G.save(); G.lineCap = 'round';
  const man = (y) => manP(y) * k, t = S.t, list = [];
  for (const x of S.men) {
    if (x.state === 'duel') continue; // drawn as their duel
    list.push({ y: x.y, draw: () => {
      const [sx, sy] = P(x.x, x.y), h = man(x.y);
      if (x.state === 'run') figure(RUN[x.army], Math.floor(x.dist / (LOOP.run * manP(x.y) / 8)) % 8, sx, sy, h, x.dir < 0);
      else { // fell backwards (away from his foe) and lies there; the art falls to its left
        const fr = 6 + Math.min(9, Math.floor((t - x.t0) * 10)), a = x.fade ? Math.max(0, 1 - (t - x.fade) / 4) : 1;
        figure(STAG[x.army], fr, sx, sy, h, x.dir < 0, a, STAG[x.army]);
      }
    } });
  }
  for (const d of S.duels) list.push({ y: d.y, draw: () => { const [sx, sy] = P(d.x, d.y); figure('duel', Math.floor((t - d.t0) * 8 + d.ph) % 12, sx, sy, man(d.y), false); } });
  for (const r of S.riders) list.push({ y: r.y, draw: () => {
    const [sx, sy] = P(r.x, r.y), h = man(r.y), mp = manP(r.y);
    if (r.kind === 'cav') figure('cavF', Math.floor(r.dist / (LOOP.gallop * mp / 8)) % 8, sx, sy, h * TALL.cavF, r.dir < 0);
    if (r.kind === 'chariot') figure('chariot', Math.floor(r.dist / (LOOP.gallop * mp / 8)) % 8, sx, sy, h * TALL.chariot, r.dir < 0);
    if (r.kind === 'ele') figure('eleC', Math.floor(r.dist / (LOOP.ele * mp / 12)) % 12, sx, sy, h * TALL.eleC, r.dir < 0);
    dust(sx - r.dir * 30 * k, sy, 22 * k, 0.5, r.y); // kicked-up dust behind them
  } });
  list.sort((a, b) => a.y - b.y);
  for (const o of list) o.draw();
  for (const v of S.volleys) for (const a of v.arrows) {
    const u = (t - v.t0 - a.d) / 2.2; if (u < 0 || u > 1) continue;
    const x0 = v.side > 0 ? a.x0 : BAND.w - a.x0, x1 = v.side > 0 ? a.x1 : BAND.w - a.x1;
    const at2 = (q) => P(x0 + (x1 - x0) * q, (1 - q) * 200 + q * a.y1 - Math.sin(Math.PI * q) * (200 - a.peak));
    const [ax, ay] = at2(u), [bx, by] = at2(u + 0.02);
    arrow(ax, ay, Math.atan2(by - ay, bx - ax), 18 * k, Math.min(1, (1 - u) * 6));
  }
  G.restore();
}

function hpBar(x, y, u) { // horses and elephants are extra units with their own health (rule 12)
  const w = u.hazard === 'elephant' ? 26 : 16, k = Math.max(0, u.hp / u.hp0);
  G.fillStyle = 'rgba(0,0,0,.6)'; G.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 4);
  G.fillStyle = '#d8c070'; G.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * k), 2);
}

// inside the arena, on the sand (under the fighters): warnings, lanes, stuck arrows, the fallen.
// V = { sx, sy, Z, SQ, SC } from the renderer. Reads only the match.
export function warDrawGround(g, V, m) {
  if (!m.haz) return;
  G = g; G.save(); G.lineCap = 'round';

  for (const f of m.haz.fallen) { // a horse or elephant brought down: it tips over and fades
    const k = Math.min(1, (m.t - f.t0) / 0.5), fade = 1 - Math.max(0, (m.t - f.t0 - 1.5) / 1.5);
    if (f.kind === 'elephant' && figure('eleF', Math.min(11, Math.floor((m.t - f.t0) * 5)), V.sx(f.x), V.sy(f.y) + 2, MAN_A * TALL.eleC, f.vx < 0, Math.min(1, (3 - (m.t - f.t0)) / 0.8), 'eleC')) continue; // rears, crashes down, fades
    if (f.kind === 'horse' && figure(f.rider ? 'cavF' : 'horse', 0, V.sx(f.x), V.sy(f.y) + 2, MAN_A * (f.rider ? TALL.cavF : TALL.horse), f.vx < 0, fade * (1 - k * 0.3))) continue;
    at(V.sx(f.x), V.sy(f.y), f.vx < 0, () => { G.globalAlpha *= fade; G.rotate(k * Math.PI / 2 * 0.9); if (f.kind === 'elephant') elephant(72, 0, f.army); else horse(52, 0, f.army ? '#d8d0c0' : '#6b4a2e', f.army, f.rider); });
  }
  for (const h of m.haz.list) {
    if (h.kind === 'arrows') {
      for (const p of h.pts) {
        if (p.gone) continue; // shot down before it landed
        const x = V.sx(p.x), y = V.sy(p.y), t = h.age - h.warn - p.d;
        if (t < 0) { const k = Math.min(1, h.age / h.warn); blob(x, y, 3 + 6 * k, (3 + 6 * k) * V.SQ, `rgba(40,10,0,${0.15 + 0.35 * k})`); } // the shadow grows as it comes down
        else if (t > 0.2) { // stuck in the sand: it shudders as it goes in, then stands still until it fades
          const al = Math.min(1, (h.life - h.age) / 1), q = Math.sin((t - 0.2) * 55) * 0.09 * Math.max(0, 1 - (t - 0.2) / 0.35);
          if (t < 0.45) dust(x, y + 1, 5 + (t - 0.2) * 20, (0.45 - t) * 3, p.x); // a puff of sand where it went in
          if (!realArrow(arrowKind(p), x, y + 2, -h.side * 0.3 + p.tilt * 0.4 + q, h.side < 0, al) && !strip('arrowL', 1, 0, x, y + 2, ARROW_CELL, h.side < 0, al, 11)) arrow(x, y, -Math.PI / 2 - h.side * 0.5 + p.tilt, 9, al);
        }
      }
    } else if (h.kind === 'horse' || h.kind === 'elephant') {
      // its warning is the dust and the drumming hooves, no red lane across the sand (owner 2026-11-22: didn't want it)
      const big = h.kind === 'elephant';
      if (h.age < h.warn + 0.5) { // dust rising where it will come in: billows up through the warning, then thins as it bursts through
        const fr = h.age < h.warn ? Math.min(7, Math.floor(h.age / h.warn * 8)) : 8 + Math.min(3, Math.floor((h.age - h.warn) * 8));
        if (!strip('dustW', 1, 0, V.sx(h.x0 * 0.85), V.sy(h.y0 * 0.85) + 4, big ? 64 : 46, false, 0.9, fr)) dust(V.sx(h.x0 * 0.85), V.sy(h.y0 * 0.85), big ? 26 : 16, Math.min(1, h.age / 0.4) * (big ? 1 : 0.8), h.id);
      }
    } else if (h.kind === 'spear' && h.age < h.warn) {
      // its line across the sand, flashing faintly (owner 2026-11-22: no star-shaped glint), like the horse's lane but thin
      const a = 0.1 + 0.16 * Math.abs(Math.sin(h.age * 9)), k = Math.min(1, h.age / (h.warn * 0.6));
      G.strokeStyle = `rgba(255,80,40,${a})`; lw(TUNE.hazard.spear.r * 2 * V.SC * V.SQ); G.beginPath(); G.moveTo(V.sx(h.x0), V.sy(h.y0)); G.lineTo(V.sx(h.x0 + (h.x1 - h.x0) * k), V.sy(h.y0 + (h.y1 - h.y0) * k)); G.stroke();
    }
  }
  G.restore();
}

// hazards standing up in the arena, each with a world y so the renderer sorts them in with the fighters
export function warActors(V, m) {
  if (!m.haz) return [];
  const out = [];
  for (const h of m.haz.list) {
  if (h.kind === 'arrows') {
    for (const p of h.pts) {
      const t = h.age - h.warn - p.d;
      if (!p.gone && t >= 0 && t <= 0.2) out.push({ y: p.y, warDraw: (g) => { G = g; const k = t / 0.2; if (realArrow(arrowKind(p), V.sx(p.x) - h.side * 28 * (1 - k), V.sy(p.y) + 2 - 80 * (1 - k), -h.side * (0.3 + 0.25 * (1 - k)) + p.tilt * 0.4, h.side < 0, 1, 0.86)) return; if (strip('arrowL', 1, 0, V.sx(p.x) - h.side * 24 * (1 - k), V.sy(p.y) + 2 - 50 * (1 - k), ARROW_CELL, h.side < 0, 1, Math.min(3, Math.floor(k * 4)))) return; const x = V.sx(p.x) - h.side * 30 * (1 - k), y = V.sy(p.y) - 60 * (1 - k); arrow(x, y, Math.atan2(60, h.side * 30), 10); } });
    }
  } else if (h.kind === 'soldier' && !h.landed) {
    out.push({ y: h.age < h.warn ? h.y0 : h.y1, warDraw: (g) => {
      G = g; G.save(); G.lineCap = 'round';
      const flip = h.x0 > 0; // he backs into the arena, facing the fight he came out of
      // the art staggers back to its left and falls that way, so it is turned to fall toward the middle of the arena
      if (h.age < h.warn) { const k = h.age / h.warn, x = h.x0 + (h.x1 - h.x0) * 0.25 * k, y = h.y0 + (h.y1 - h.y0) * 0.25 * k; if (!figure(STAG[h.army], Math.min(5, Math.floor(k * 6)), V.sx(x), V.sy(y) + 3, SOLDIER_A, !flip)) at(V.sx(x), V.sy(y), !flip, () => soldier(42, h.army, 'stagger', h.age * 12)); }
      else { const k = Math.min(1, (h.age - h.warn) / h.fall), x = h.x0 + (h.x1 - h.x0) * (0.25 + 0.75 * k), y = h.y0 + (h.y1 - h.y0) * (0.25 + 0.75 * k); if (!figure(STAG[h.army], 6 + Math.min(4, Math.floor(k * 5)), V.sx(x), V.sy(y) + 3, SOLDIER_A, !flip)) at(V.sx(x), V.sy(y), !flip, () => { G.rotate(-k * Math.PI / 2); soldier(42, h.army, 'stand', 0); }); }
      G.restore();
    } });
  } else if (h.kind === 'spear' && h.age >= h.warn && !h.dead) {
    out.push({ y: h.y, warDraw: (g) => {
      G = g; const ang = Math.atan2(V.sy(h.y1) - V.sy(h.y0), V.sx(h.x1) - V.sx(h.x0)), k = Math.floor(m.t * 16) % 8;
      if (!ART.fx.spear1 || !drawFx(G, 'spear' + (k + 1), V.sx(h.x), V.sy(h.y) - 14, SPEAR_W, { rot: ang })) arrow(V.sx(h.x), V.sy(h.y) - 14, ang, 22);
    } });
  }
  }
  for (const b of m.rough) if (b.kind === 'body') out.push({ y: b.y, warDraw: (g) => { // a fallen soldier: solid, so he sorts in with the fighters
    G = g;
    const fade = Math.min(1, (b.until - m.t) / 2, (m.t - b.t0) / 0.05 + 1);
    if (!figure(STAG[b.army || 0], 15, V.sx(b.x), V.sy(b.y) + 3, SOLDIER_A, b.flip, fade)) at(V.sx(b.x), V.sy(b.y), b.flip, () => { G.globalAlpha *= fade; blob(0, 0, 20, 6, 'rgba(0,0,0,.25)'); G.rotate(-Math.PI / 2); soldier(42, b.army || 0, 'stand', 0); });
  } });
  for (const u of m.units) if (u.hazard) out.push({ y: u.y, warDraw: (g) => {
    G = g; G.save(); G.lineCap = 'round';
    const big = u.hazard === 'elephant', flip = u.vx < 0, x = V.sx(u.x), y = V.sy(u.y), ph = m.t * (big ? 4 : 18) + u.id, c = m.haz.list.find((z) => z.unit === u);
    // owner 2026-11-22 (going out felt weird): off the sand it fades, coming in out of its dust and going out over the rim,
    // instead of striding over the war behind at full size and then vanishing
    const al = Math.max(0, Math.min(1, (ARENA.r * 1.28 - Math.hypot(u.x, u.y)) / (ARENA.r * 0.22)));
    if (al <= 0) { G.restore(); return; }
    G.globalAlpha *= al;
    const sw = TUNE.hazard[u.hazard].r * V.SC * 1.1; blob(x, y, sw, sw * 0.3, 'rgba(0,0,0,.25)');
    // legs move with the ground covered: a gallop loop covers ~2.4 man-heights, an elephant's walk ~1.5
    const run = c ? Math.hypot(u.x - c.x0, u.y - c.y0) * V.SC : 0, fr = big ? Math.floor(run / (1.5 * MAN_A / 12)) : Math.floor(run / (2.4 * MAN_A / 8));
    const sw2 = u.swing && TUNE.hazard.elephant.swing, sf = sw2 && (u.swing.t < sw2.windup ? Math.floor(u.swing.t / sw2.windup * 4) : u.swing.t < sw2.windup + 0.15 ? 4 + Math.floor((u.swing.t - sw2.windup) / 0.05) : 7 + Math.floor((u.swing.t - sw2.windup - 0.15) / (sw2.dur - sw2.windup - 0.15) * 5));
    if (big && sw2 && ART.fx.eleS1) figure('eleS', Math.min(11, sf), x, y + 2, MAN_A * TALL.eleC, flip, 1, 'eleC'); // the tusk swing: wind-up, sweep, recover
    else if (big) { if (!figure('eleC', fr % 12, x, y + 2, MAN_A * TALL.eleC, flip)) at(x, y, flip, () => elephant(72, ph, c?.army ?? 0)); }
    else if (!figure(c?.rider ? 'cavF' : 'horse', fr % 8, x, y + 2, MAN_A * (c?.rider ? TALL.cavF : TALL.horse), flip)) at(x, y, flip, () => horse(52, ph, c?.army ? '#d8d0c0' : '#6b4a2e', c?.army ?? 0, c?.rider));
    dust(x - (flip ? -1 : 1) * 20, y, big ? 18 : 10, 0.7, u.id + m.t);
    if (al > 0.9) hpBar(x, y - MAN_A * (big ? TALL.eleC : c?.rider ? TALL.cavF : TALL.horse) - 4, u);
    G.restore();
  } });
  return out;
}

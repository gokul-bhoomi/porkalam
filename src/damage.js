// What the fight leaves on the sand (2026-11-15). The marks are painted (art/fx_sand_hits.png, fx_sand_marks.png:
// seen from straight above, lit from the far side like the arena), squashed into the 3/4 view and blended onto the
// real floor (art.js sandSheet): heavy hits leave craters, knockback ploughs skid grooves, feet leave prints,
// river water wets the sand, lightning fuses it, power moves blow out a deep crater with water in the bottom.
// Marks that have settled are painted once onto two floor layers (one that darkens, one that brightens), so a whole
// match of damage costs the same per frame; the layers weather slowly, like wind over sand.
// Only drawing: reads the match and its events, never changes them.
import { W, H, RES, ARENA, TUNE } from './config.js';
import { ART } from './art.js';
import { CX, CY, SQ, SC, sx, sy } from './render.js';

const WEATHER = 0.01; // share of the old marks the wind smooths away per second of fight (half gone in about a minute, as the rough ground fades)
// how much of its cell each painted mark fills (so a mark can be sized by the mark, not by the cell)
const FILL = { crater: 0.58, impact: 0.75, skid: 0.73, scuff: 0.28, foot: 0.31, wet: 0.73, glass: 0.71, burn: 0.57 };
const SKID_START = 0.14; // where the grooves begin in their cell (0 = left edge); they run to the heap at the right

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const rnd = (a, b) => a + Math.random() * (b - a);
const FLOOR = () => ({ rx: ARENA.r * SC, ry: ARENA.r * SC * SQ });

const LIVE = []; // marks still changing (growing, sliding, drying)
const DUST = []; // sand thrown up, in the air for a moment
const TRACK = [{ dist: 0, side: 1, last: null }, { dist: 0, side: 1, last: null }]; // footsteps, per fighter
let darkL = null, lightL = null, DG = null, LG = null, weathered = null;

function ensureLayers() {
  if (darkL || typeof document === 'undefined') return;
  const mk = () => { const c = document.createElement('canvas'); c.width = W * RES; c.height = H * RES; return c; };
  darkL = mk(); lightL = mk(); DG = darkL.getContext('2d'); LG = lightL.getContext('2d');
  clearLayers();
}
function clearLayers() {
  if (!DG) return;
  DG.setTransform(1, 0, 0, 1, 0, 0); DG.globalCompositeOperation = 'source-over'; DG.fillStyle = '#fff'; DG.fillRect(0, 0, darkL.width, darkL.height);
  LG.setTransform(1, 0, 0, 1, 0, 0); LG.globalCompositeOperation = 'source-over'; LG.fillStyle = '#000'; LG.fillRect(0, 0, lightL.width, lightL.height);
}
export function damageReset() {
  LIVE.length = 0; DUST.length = 0; weathered = null;
  for (const t of TRACK) { t.dist = 0; t.last = null; }
  clearLayers();
}
const floorClip = (g) => { const f = FLOOR(); g.beginPath(); g.ellipse(CX, CY, f.rx * 0.985, f.ry * 0.985, 0, 0, Math.PI * 2); g.clip(); };

// One painted mark: centred on (x, y), `w` = width of its whole cell from above, turned by `rot`, then squashed
// into the 3/4 view. gd gets the darkening half (multiply), gl the brightening half (lighter).
function paint(gd, gl, name, x, y, w, o = {}) {
  const art = ART.sand[name]; if (!art) return;
  for (const [g, img, op] of [[gd, art.dark, 'multiply'], [gl, art.light, 'lighter']]) {
    g.save(); g.translate(x, y); g.scale(1, SQ); if (o.rot) g.rotate(o.rot); if (o.flip) g.scale(1, -1);
    g.globalCompositeOperation = op; g.globalAlpha *= o.alpha ?? 1; g.imageSmoothingEnabled = true;
    g.drawImage(img, -w / 2, -w / 2, w, w);
    g.restore();
  }
}
const cellW = (name, size) => size / FILL[name]; // a mark `size` across

// ---------- the marks ----------
// look(m, t) -> { name, x, y, w, rot, flip, alpha } as the mark looks t s after it was made; settle = when it stops
// changing (then it is painted onto the layers); dry = it fades away instead.
const LOOK = {
  grow: (m, t) => { const k = easeOut(clamp01(t / (m.grow || 0.15))); return { ...m, w: m.w * (0.7 + 0.3 * k), alpha: (m.alpha ?? 1) * k }; },
  wet: (m, t) => { const land = clamp01((t - m.delay) / 0.2), dry = Math.pow(clamp01(t / m.dry), 1.5); return { ...m, w: m.w * (0.6 + 0.4 * land) * (1 - 0.25 * dry), alpha: land * (1 - dry) }; },
  skid: (m) => { // the grooves run from where the slide began to where the fighter is now, the heap at their end
    const L = Math.max(4, m.len), w = cellW('skid', L), c = w * (0.5 - SKID_START);
    return { name: 'skid', x: m.x + Math.cos(m.rot) * c, y: m.y + Math.sin(m.rot) * c * SQ, w, rot: m.rot, alpha: clamp01(m.len / 6) };
  },
};
function add(m) {
  ensureLayers();
  if (m.settle === 0) { const k = { ...m, ...(m.look ? LOOK[m.look](m, 99) : {}) }; withFloor(() => paint(DG, LG, k.name, k.x, k.y, k.w, k)); return m; }
  LIVE.push(m); return m;
}
function withFloor(fn) { for (const g of [DG, LG]) { g.save(); g.setTransform(RES, 0, 0, RES, 0, 0); floorClip(g); } fn(); DG.restore(); LG.restore(); }
export function dust(x, y, n, reach, o = {}) { // grains thrown up; they land and disappear into the painted mark
  for (let i = 0; i < n; i++) {
    const a = o.dir != null ? o.dir + rnd(-0.6, 0.6) : rnd(0, Math.PI * 2), d = reach * Math.sqrt(rnd(0.2, 1));
    DUST.push({ t0: o.t0, x0: x, y0: y, x1: x + Math.cos(a) * d, y1: y + Math.sin(a) * d * SQ, T: rnd(0.25, 0.55) * (o.slow || 1), h: rnd(3, 10) * (o.high || 1), s: rnd(0.3, 0.7) * (o.size || 1), c: Math.random() < 0.5 ? '150,80,30' : '255,215,150' });
  }
}

const mark = (now, name, x, y, size, o = {}) => add({ t0: now, name, x, y, w: cellW(name, size), rot: o.rot ?? rnd(0, Math.PI * 2), look: o.look || 'grow', settle: o.settle ?? 0.4, ...o });

// ---------- what makes them ----------
// e: a match event; now: the fight clock the effects are stamped with
export function damageEvent(e, m, now) {
  if (!ART.sand.crater) return;
  const at = (x, y) => [sx(x), sy(y)];
  if (e.type === 'rough') { // rough ground (ground rule 13): the mark is exactly the area that slows
    const [x, y] = at(e.x, e.y), d = 2 * e.r * SC;
    if (e.kind === 'impact') { if (ART.theme === 'river') mark(now, 'impact', x, y, d, { grow: 0.25 }); else mark(now, 'crater', x, y, d * 1.25, { grow: 0.25 }); /* dry ground: no water in the crater */ dust(x, y, 90, d * 1.1, { t0: now, high: 2.4, size: 1.4 }); }
    if (e.kind === 'crater') { mark(now, 'crater', x, y, d); dust(x, y, Math.round(d * 1.5), d * 1.4, { t0: now }); }
    if (e.kind === 'wet' && ART.theme === 'river') mark(now, 'wet', x, y, d * 1.3, { look: 'wet', delay: 0.3, dry: TUNE.rough.wet.life + 2, settle: Infinity }); // knocked into the river's edge: a splash
    else if (e.kind === 'wet') { mark(now, 'scuff', x, y, d * 1.3, { alpha: 0.95 }); dust(x, y, 40, d, { t0: now, high: 1.6 }); } // battlefield: knocked into the churned earth at the edge
  }
  if (e.type === 'hp' && e.dmg > 0) {
    const srcs = e.srcs || [], [x, y] = at(e.x, e.y), p = m.players[e.pid];
    if (srcs.includes('Brahmastra') || srcs.includes('Thousand-Arm Form') || srcs.every((s) => s === 'Lava')) return;
    if (srcs.includes('Pashupatastra')) { mark(now, 'burn', x, y, 34, { alpha: 0.7 }); mark(now, 'glass', x, y, 52, { grow: 0.12 }); }
    else if (e.dmg >= 2 && e.dmg < TUNE.rough.crater.minDmg) { mark(now, 'scuff', x, y, 8, { alpha: 0.8 }); dust(x, y, 6, 6, { t0: now, high: 0.5 }); }
    if (p && !p.air && Math.hypot(p.kvx, p.kvy) > 70 && !LIVE.some((s) => s.look === 'skid' && s.pid === p.id && s.stop == null)) {
      add({ t0: now, look: 'skid', pid: p.id, x, y, rot: Math.atan2(p.kvy, p.kvx), len: 0, stop: null, settle: Infinity });
    }
  }
  if (e.type === 'rain') for (let i = 0; i < 5; i++) { const a = rnd(0, 6.28), d = Math.sqrt(rnd(0, 1)) * e.r; const [x, y] = at(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d); mark(now + rnd(0, 0.15), 'scuff', x, y, 6, { alpha: 0.9 }); }
}

// every frame: footprints while walking, skids following the slide, settled marks painted onto the layers
export function damageTrack(m, now) {
  if (!ART.sand.crater) return;
  ensureLayers();
  if (weathered != null && now > weathered) { // the wind smooths the sand
    const a = Math.min(0.2, WEATHER * (now - weathered));
    for (const [g, c] of [[DG, `rgba(255,255,255,${a})`], [LG, `rgba(0,0,0,${a})`]]) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.fillStyle = c; g.fillRect(0, 0, darkL.width, darkL.height); g.restore(); }
  }
  weathered = now;
  const sliding = (pid) => LIVE.some((s) => s.look === 'skid' && s.pid === pid && s.stop == null);
  for (const p of m.players) { // footprints, left and right in turn
    const T = TRACK[p.id], x = sx(p.x), y = sy(p.y);
    if (p.air || !T.last || m.phase === 'done' || sliding(p.id)) { T.last = [x, y]; continue; }
    const dx = x - T.last[0], dy = (y - T.last[1]) / SQ, d = Math.hypot(dx, dy);
    T.last = [x, y];
    if (d > 8) continue; // a blink or a reset, not a step
    T.dist += d;
    if (T.dist > 7 && d > 0.05) {
      T.dist = 0; T.side = -T.side;
      const a = Math.atan2(dy, dx);
      mark(now, 'foot', x - Math.sin(a) * 1.4 * T.side, y + Math.cos(a) * 1.4 * T.side * SQ, 3.4, { rot: a, flip: T.side < 0, look: null, alpha: 0.75, settle: 0 });
    }
  }
  for (const s of LIVE) if (s.look === 'skid' && s.stop == null) { // the grooves follow the slide
    const p = m.players[s.pid], x = sx(p.x), y = sy(p.y), dx = x - s.x, dy = (y - s.y) / SQ, t = now - s.t0;
    const len = Math.hypot(dx, dy);
    if (len > s.len + 12) { s.stop = t; continue; } // teleported away
    if (len > s.len) { s.len = len; if (len > 2) s.rot = Math.atan2(dy, dx); }
    if (p.air || t > 1 || Math.hypot(p.kvx, p.kvy) < 25) {
      s.stop = t; s.settle = t + 0.05;
      if (s.len < 6) s.drop = true; // no slide to speak of
      else dust(x, y, 16, 10, { t0: now, dir: s.rot, slow: 1.2 }); // sand sprayed off the heap
    }
  }
  for (let i = LIVE.length - 1; i >= 0; i--) {
    const s = LIVE[i], t = now - s.t0;
    if (s.drop || (s.dry && t > s.dry)) { LIVE.splice(i, 1); continue; }
    if (t > s.settle) { const k = LOOK[s.look](s, t); withFloor(() => paint(DG, LG, k.name, k.x, k.y, k.w, k)); LIVE.splice(i, 1); }
  }
  for (let i = DUST.length - 1; i >= 0; i--) if (now - DUST[i].t0 > DUST[i].T) DUST.splice(i, 1);
}

// 'ground': the marks, on the sand under the fighters; 'air': sand thrown up, over them
export function drawDamage(G, now, part) {
  if (!darkL) return;
  if (part === 'ground') {
    G.save(); floorClip(G);
    G.globalCompositeOperation = 'multiply'; G.drawImage(darkL, 0, 0, W, H);
    G.globalCompositeOperation = 'lighter'; G.drawImage(lightL, 0, 0, W, H);
    G.globalCompositeOperation = 'source-over';
    for (const s of LIVE) { const t = now - s.t0; if (t < 0) continue; const k = LOOK[s.look](s, t); if (k.alpha > 0) paint(G, G, k.name, k.x, k.y, k.w, k); }
    G.restore();
    return;
  }
  for (const q of DUST) {
    const u = (now - q.t0) / q.T; if (u <= 0 || u >= 1) continue;
    const x = q.x0 + (q.x1 - q.x0) * u, y = q.y0 + (q.y1 - q.y0) * u - 4 * q.h * u * (1 - u);
    G.fillStyle = `rgba(${q.c},${0.85 * (1 - u * u)})`; G.fillRect(x - q.s / 2, y - q.s / 2, q.s, q.s);
  }
}

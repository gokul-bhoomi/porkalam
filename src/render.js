// Drawing on a 480x270 canvas: the generated art (src/art.js) where it exists, grey-box shapes otherwise.
// Only reads the match state.
import { W, H, RES, ARENA, TUNE } from './config.js';
import { ACTIONS, LABELS, KEYS, KEY_NAME, PAD, PAD_NAMES, REMAP } from './input.js';
import { opponent, chargeOf, airborne } from './sim.js';
import { ART, drawSprite, drawFx as fxSprite, drawPortrait, POSES, AIR_POSES } from './art.js';
import { GODS as GODS_LIST } from './chars/gods.js';
const fxArt = (name) => useArt && ART.fx[name];

export const FONT = '"Press Start 2P", monospace';
export const CX = 240;                // screen centre
export let CY = 160, SQ = 0.62, SC = 1; // arena centre on screen, y squash for the 3/4 view, screen px per world unit (set from the art)
export const sx = (x) => CX + x * SC, sy = (y) => CY + y * SQ * SC;
const Z = (r) => r * SC;              // a world-unit size on screen
export let useArt = true;             // false = grey-box shapes (?grey=1, or the G key)
export const setUseArt = (v) => { useArt = v; fitView(); };

// Line the world up with the arena floor in arena.png, then draw the picture at the matching scale.
let arenaDraw = null;
const VIEW = { floor: 0.84, cy: 165 }; // floor width as a share of the screen; where its centre sits (below the HUD)
export function fitView() {
  const img = ART.arena, f = ART.fit;
  if (!useArt || !img) { CY = 160; SQ = 0.62; SC = 1; arenaDraw = null; return; }
  // zoom in so the floor fills VIEW.floor of the screen width, but never so little that the picture leaves a gap
  const s = Math.max(W / img.width, H / img.height, (VIEW.floor * W) / (2 * f.rx * img.width));
  const w = img.width * s, h = img.height * s;
  SC = (f.rx * img.width * s) / ARENA.r;             // the floor's half-width = the arena radius
  SQ = (f.ry * img.height) / (f.rx * img.width);
  // floor centred on CX and VIEW.cy; y is nudged if that would leave a gap above or below the picture
  const x = CX - f.cx * w, y = Math.min(0, Math.max(H - h, VIEW.cy - f.cy * h));
  CY = y + f.cy * h;
  arenaDraw = { s, x, y, w, h };
}

let G = null;
export const setCtx = (g) => { G = g; };

export function R(x, y, w, h, c) { G.fillStyle = c; G.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
export function ell(x, y, rx, ry, c) { G.fillStyle = c; G.beginPath(); G.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); G.fill(); }
function ring(x, y, rx, ry, c, w = 1, a0 = 0, a1 = Math.PI * 2) { G.strokeStyle = c; G.lineWidth = w; G.beginPath(); G.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, a0, a1); G.stroke(); }
function line(x0, y0, x1, y1, c, w = 1) { G.strokeStyle = c; G.lineWidth = w; G.beginPath(); G.moveTo(x0, y0); G.lineTo(x1, y1); G.stroke(); }
// Every text drawn this frame, with its box in layout units, when the overlap test asks for it
// (window.__textLog = []). The test fails if two boxes overlap or one leaves the screen.
export function txt(s, x, y, c = '#fff', al = 'left', sz = 8, ol = 'rgba(0,0,0,.75)') {
  G.font = `${sz}px ${FONT}`; G.textAlign = al; G.textBaseline = 'top';
  if (typeof window !== 'undefined' && window.__textLog && s) {
    const w = G.measureText(s).width, t = G.getTransform(), k = t.a / RES, x0 = al === 'center' ? x - w / 2 : al === 'right' ? x - w : x;
    window.__textLog.push({ s: String(s), x0: x0 * k + t.e / RES, y0: y * k + t.f / RES, x1: (x0 + w) * k + t.e / RES, y1: (y + sz) * k + t.f / RES, a: G.globalAlpha });
  }
  if (ol) { G.fillStyle = ol; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) G.fillText(s, Math.round(x) + dx, Math.round(y) + dy); }
  G.fillStyle = c; G.fillText(s, Math.round(x), Math.round(y));
}
// a full-screen opaque page was drawn: the text under it is hidden, so the overlap test forgets it
function covered() { if (typeof window !== 'undefined' && window.__textLog) window.__textLog.length = 0; }
// text that must fit a width: the font shrinks (down to 4) until it does
function txtFit(s, x, y, c, al, sz, maxW) {
  let z = sz;
  for (; z > 4; z -= 0.5) { G.font = `${z}px ${FONT}`; if (G.measureText(s).width <= maxW) break; }
  txt(s, x, y, c, al, z);
}
const short = (s) => s.toUpperCase().replace('PINNING ARROW', 'PIN ARROW');
export const clock = (s) => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// ---------- arena ----------
// Life on the river: glints on the water, waves lapping round the sand, birds, drifting embers.
// Purely visual, from the render clock; nothing here touches the match.
const hash = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
function drawAmbient(now) {
  const rx = ARENA.r * SC, ry = rx * SQ, top = arenaDraw.y + arenaDraw.h * 0.27; // the far bank / horizon
  const inFloor = (x, y, k) => ((x - CX) / (rx * k)) ** 2 + ((y - CY) / (ry * k)) ** 2 < 1;
  G.save();
  G.lineCap = 'round';
  for (let i = 0; i < 110; i++) { // sunset glints
    const y = top + 3 + hash(i, 2) * (H - top), x = hash(i, 1) * W + Math.sin(now * 0.3 + i) * 2;
    if (inFloor(x, y, 1.1)) continue;
    const a = Math.max(0, Math.sin(now * (1.2 + hash(i, 3) * 2.2) + hash(i, 4) * 6.28)) ** 3;
    if (a < 0.02) continue;
    const len = (1.5 + hash(i, 5) * 4) * (0.5 + (y - top) / (H - top));
    G.strokeStyle = `rgba(255,226,176,${0.85 * a})`; G.lineWidth = 0.6;
    G.beginPath(); G.moveTo(x - len, y); G.lineTo(x + len, y); G.stroke();
  }
  for (let i = 0; i < 3; i++) { // foam rings pushing out from the sand and fading
    const t = (now / 2.6 + i / 3) % 1, k = 1.01 + t * 0.07;
    G.strokeStyle = `rgba(255,245,230,${0.45 * Math.sin(Math.PI * t)})`; G.lineWidth = 0.7;
    G.beginPath(); G.ellipse(CX, CY, rx * k, ry * k + t * 2, 0, 0, Math.PI * 2); G.stroke();
  }
  for (let i = 0; i < 4; i++) { // birds over the far bank
    const sp = 9 + hash(i, 6) * 7, x = ((now * sp + hash(i, 7) * 600) % (W + 80)) - 40, y = Math.max(44, top - 14) + hash(i, 8) * 10 + Math.sin(now + i) * 1.5;
    const f = Math.sin(now * 9 + i * 2) * 1.6, s = 1.6 + hash(i, 9);
    G.strokeStyle = 'rgba(40,20,50,.75)'; G.lineWidth = 0.6;
    G.beginPath(); G.moveTo(x - s, y - f); G.lineTo(x, y); G.lineTo(x + s, y - f); G.stroke();
  }
  for (let i = 0; i < 26; i++) { // embers / fireflies drifting up
    const sp = 4 + hash(i, 10) * 6, y = H + 10 - ((now * sp + hash(i, 11) * (H + 20)) % (H + 20)), x = hash(i, 12) * W + Math.sin(now * 0.8 + i) * 6;
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(now * 2.5 + i * 1.7));
    G.fillStyle = `rgba(255,200,110,${0.18 * a})`; G.beginPath(); G.arc(x, y, 2.2, 0, Math.PI * 2); G.fill();
    G.fillStyle = `rgba(255,236,170,${0.9 * a})`; G.beginPath(); G.arc(x, y, 0.6, 0, Math.PI * 2); G.fill();
  }
  G.restore();
}

function drawBackdrop(now) {
  if (useArt && arenaDraw) { // the picture already has sky, clouds and arena
    R(0, 0, W, H, '#5a55a8');
    G.imageSmoothingEnabled = true;
    G.drawImage(ART.arena, arenaDraw.x, arenaDraw.y, arenaDraw.w, arenaDraw.h);
    G.imageSmoothingEnabled = false;
    drawAmbient(now);
    return;
  }
  const g = G.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6f8fb5'); g.addColorStop(1, '#c9d6e3');
  G.fillStyle = g; G.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) { // drifting clouds
    const x = ((i * 97 + now * (4 + i)) % (W + 120)) - 60, y = 60 + ((i * 53) % 190);
    ell(x, y, 40 + (i % 3) * 14, 9, 'rgba(255,255,255,.45)');
  }
}
function drawArena() {
  if (useArt && arenaDraw) return;
  const r = ARENA.r;
  ell(CX, CY + 12, r + 2, r * SQ + 6, '#4a453d');       // side of the floating rock
  ell(CX, CY + 22, r * 0.7, r * SQ * 0.7, '#3a362f');
  ell(CX, CY, r + 2, r * SQ + 1, '#615a4e');
  ell(CX, CY, r, r * SQ, '#8f887a');
  for (const k of [0.33, 0.66]) ring(CX, CY, r * k, r * SQ * k, 'rgba(0,0,0,.12)');
  ring(CX, CY, r, r * SQ, '#d8d0bf', 1);
}


// Shiva's Tandava: a glowing chasm across the island along a line (an arena change, ground rule 12).
// How far (screen px, up is negative) the ground at a world point has moved: the caster's half (behind the line,
// against n) rises, the other half sinks. Only a picture: the halves are still the same height in the game.
const SPLIT = { lift: 14, sink: 10 };
let chasm = null;
// The split plays in beats: a crack races along the line (CRACK s), then the halves lurch apart with a small
// bounce, sit there with the lava bubbling, and grind back together over the last 0.8 s.
const CRACK = 0.3;
const hash01 = (i) => { const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
function splitK(c) { return clamp01((c.time - c.t - CRACK) / 0.7) * clamp01(c.t / 0.8); }
function splitE(c) { // eased: the opening overshoots a little and settles, the closing is smooth
  const o = clamp01((c.time - c.t - CRACK) / 0.7), cl = clamp01(c.t / 0.8), b = 1.7;
  return (1 + (b + 1) * Math.pow(o - 1, 3) + b * Math.pow(o - 1, 2)) * cl * cl * (3 - 2 * cl);
}
function liftAt(x, y) {
  const c = chasm;
  if (!c) return 0;
  const s = (x - c.x) * c.nx + (y - c.y) * c.ny, e = splitE(c);
  return (s < 0 ? -SPLIT.lift : SPLIT.sink) * e;
}
// Draw the two halves of the island moved apart in height: under the sunk half a dark gap, under the raised half its
// rock face. The picture is redrawn into each half, clipped to the floor's ellipse.
function drawSplit(c, now) {
  if (!useArt || !arenaDraw) return;
  const k = splitE(c), rx = ARENA.r * SC * 1.07, ry = rx * SQ + 4;
  const tx = -c.ny, ty = c.nx, B = 2000;
  const half = (side) => { // the half-plane on one side of the line, as a screen polygon (sx/sy are linear)
    const a = { x: c.x - tx * B, y: c.y - ty * B }, b = { x: c.x + tx * B, y: c.y + ty * B };
    return [a, b, { x: b.x + c.nx * side * B, y: b.y + c.ny * side * B }, { x: a.x + c.nx * side * B, y: a.y + c.ny * side * B }].map((q) => [sx(q.x), sy(q.y)]);
  };
  const clip = (side) => {
    G.beginPath(); G.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2); G.clip();
    G.beginPath(); half(side).forEach(([x, y], i) => (i ? G.lineTo(x, y) : G.moveTo(x, y))); G.closePath(); G.clip();
  };
  for (const side of [1, -1]) { // the sinking half first, then the raised half over it
    const dy = (side < 0 ? -SPLIT.lift : SPLIT.sink) * k;
    G.save(); clip(side); // what the moved half uncovers: darkness below the sunk half, rock under the raised one
    const g = G.createLinearGradient(0, CY - ry, 0, CY + ry + 12);
    if (side < 0) { g.addColorStop(0, '#a07a52'); g.addColorStop(0.5, '#6b4a2e'); g.addColorStop(1, '#3a2414'); } else { g.addColorStop(0, '#0a0302'); g.addColorStop(1, '#2a0e06'); }
    G.fillStyle = g; G.fillRect(0, 0, W, H);
    if (side < 0) for (let i = 0; i < 14; i++) { const x = CX - rx + (i / 13) * rx * 2; line(x, CY - ry, x + 3, CY + ry, 'rgba(0,0,0,.18)', 1); } // rock strata
    else { G.fillStyle = `rgba(255,120,40,${0.25 * k * (0.7 + 0.3 * Math.sin(now * 5))})`; G.fillRect(0, 0, W, H); } // lava glow far below
    G.restore();
    G.save(); G.translate(0, dy); clip(side);
    G.imageSmoothingEnabled = true; G.drawImage(ART.arena, arenaDraw.x, arenaDraw.y, arenaDraw.w, arenaDraw.h); G.imageSmoothingEnabled = false;
    if (side > 0) { G.fillStyle = `rgba(20,6,0,${0.22 * k})`; G.fillRect(0, 0, W, H); drawLava(c, k, now); } // the sunk half sits in shadow, and burns
    G.restore();
  }
}

// The sunk half is lava (it burns anyone standing there): a red cast, glowing cracks that pulse, and bubbles that
// swell and pop. Drawn in world positions so it stays put on the floor.
function drawLava(c, k, now) {
  if (k <= 0.01) return;
  const tx = -c.ny, ty = c.nx, at = (s, u) => [sx(c.x + c.nx * s + tx * u), sy(c.y + c.ny * s + ty * u)];
  const pulse = 0.75 + 0.25 * Math.sin(now * 4);
  G.fillStyle = `rgba(190,40,0,${0.3 * k * pulse})`; G.fillRect(0, 0, W, H);
  const ga = at(6, 0), gb = at(ARENA.r * 0.9, 0), grd = G.createLinearGradient(ga[0], ga[1], gb[0], gb[1]); // hottest along the chasm
  grd.addColorStop(0, `rgba(255,150,40,${0.45 * k * pulse})`); grd.addColorStop(1, 'rgba(255,90,20,0)');
  G.fillStyle = grd; G.fillRect(0, 0, W, H);
  G.lineCap = 'round';
  for (let i = 0; i < 34; i++) { // cracks: short jagged lines, brighter near the chasm
    const s0 = 10 + hash01(i) * ARENA.r * 1.8, u0 = (hash01(i + 50) - 0.5) * ARENA.r * 2.2, near = 1 - clamp01(s0 / (ARENA.r * 1.6));
    let [x, y] = at(s0, u0);
    G.strokeStyle = `rgba(255,${130 + 80 * near},40,${(0.35 + 0.5 * near) * k * (0.6 + 0.4 * Math.sin(now * 3 + i))})`;
    const pts = [[x, y]];
    for (let j = 1; j <= 4; j++) { x += (hash01(i * 7 + j) - 0.5) * 26; y += (hash01(i * 9 + j) - 0.5) * 10; pts.push([x, y]); }
    const path = () => { G.beginPath(); pts.forEach(([a, b], j) => (j ? G.lineTo(a, b) : G.moveTo(a, b))); };
    const st = G.strokeStyle;
    G.strokeStyle = `rgba(255,90,10,${0.35 * k})`; G.lineWidth = 4 + 2 * near; path(); G.stroke(); // glow
    G.strokeStyle = st; G.lineWidth = 1.5 + near; path(); G.stroke();
  }
  for (let i = 0; i < 14; i++) { // bubbles: each one swells and pops on its own clock
    const per = 1.4 + hash01(i + 200) * 1.2, ph = ((now + hash01(i + 300) * per) % per) / per;
    const [x, y] = at(14 + hash01(i + 100) * ARENA.r * 1.3, (hash01(i + 150) - 0.5) * ARENA.r * 1.8), r = 1.5 + ph * 4.5;
    G.fillStyle = `rgba(255,${180 + 60 * ph},80,${(ph < 0.85 ? 0.7 : (1 - ph) * 4.6) * k})`;
    G.beginPath(); G.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); G.fill();
  }
}

// Beats on top of the halves: the racing crack, rocks breaking off the cliff edge into the gap, dust as it closes.
function drawSplitBeats(c, ends, now) {
  const age = c.time - c.t, e = splitE(c), k = splitK(c), dir = [sx(ends[1].x) - sx(ends[0].x), sy(ends[1].y) - sy(ends[0].y)];
  const p0 = [sx(ends[0].x), sy(ends[0].y)];
  if (age < CRACK + 0.25) { // the crack runs from one end to the other, white-hot, before anything moves
    const f = clamp01(age / CRACK), a = 1 - clamp01((age - CRACK) / 0.25);
    G.lineCap = 'round';
    G.strokeStyle = `rgba(255,150,50,${0.5 * a})`; G.lineWidth = 6; G.beginPath(); G.moveTo(...p0); G.lineTo(p0[0] + dir[0] * f, p0[1] + dir[1] * f); G.stroke();
    G.strokeStyle = `rgba(255,248,220,${a})`; G.lineWidth = 2; G.beginPath(); G.moveTo(...p0); G.lineTo(p0[0] + dir[0] * f, p0[1] + dir[1] * f); G.stroke();
    for (let i = 0; i < 6; i++) { // sparks thrown up at the crack's head
      const h = hash01(i + Math.floor(age * 30) * 13), x = p0[0] + dir[0] * f + (h - 0.5) * 10, y = p0[1] + dir[1] * f - hash01(i + 40) * 12;
      R(x, y, 1.5, 1.5, `rgba(255,${200 + 55 * h},120,${a})`);
    }
  }
  if (k > 0.05) for (let i = 0; i < 16; i++) { // rocks crumble off the raised edge: a burst at the lurch, then now and then
    const per = 2.6, first = CRACK + 0.1 + hash01(i) * 0.5, tt = age < first + 1 ? age - first : (age - first - 1 + hash01(i + 9) * per) % per;
    if (tt < 0 || tt > 0.9) continue;
    const u = hash01(i + 20), ex = p0[0] + dir[0] * u, ey = p0[1] + dir[1] * u - SPLIT.lift * e;
    const x = ex + (hash01(i + 30) - 0.5) * 6 + c.nx * tt * 8, y = ey + 140 * tt * tt, sz = 1.5 + hash01(i + 40) * 2;
    R(x, y, sz, sz, `rgba(${120 + 40 * hash01(i)},${85 + 20 * hash01(i + 1)},55,${1 - tt / 0.9})`);
  }
  if (c.t < 0.9) { // closing: dust rolls out along the seam as the halves grind together
    const f = 1 - c.t / 0.9;
    for (let i = 0; i < 12; i++) {
      const u = (i + 0.5) / 12, x = p0[0] + dir[0] * u, y = p0[1] + dir[1] * u, r = 3 + f * 10 * (0.6 + 0.4 * hash01(i));
      G.fillStyle = `rgba(190,160,120,${0.35 * Math.sin(f * Math.PI)})`; G.beginPath(); G.ellipse(x, y - r * 0.3, r, r * 0.55, 0, 0, Math.PI * 2); G.fill();
    }
  }
}

function drawChasm(m, now) {
  const c = m.arenaChange;
  if (!c || c.kind !== 'chasm') return;
  drawSplit(c, now);
  const tx = -c.ny, ty = c.nx, off = c.x * tx + c.y * ty, rr = c.x * c.x + c.y * c.y - off * off;
  const L = Math.sqrt(Math.max(0, ARENA.r * ARENA.r - rr)) ; // half-length of the line inside the arena
  const age = (c.time - c.t), open = clamp01((age - CRACK) / 0.4), close = Math.min(1, c.t / 0.6), k = open * close;
  const cx = c.x - tx * off, cy = c.y - ty * off; // the point of the line nearest the centre
  const hw = (c.w / 2) * k, ends = [-L, L].map((u) => ({ x: cx + tx * u, y: cy + ty * u }));
  const quad = (w) => [[ends[0], -w], [ends[1], -w], [ends[1], w], [ends[0], w]].map(([e, ww]) => [sx(e.x + c.nx * ww), sy(e.y + c.ny * ww)]);
  const poly = (pts, fill) => { G.beginPath(); pts.forEach(([px, py], i) => (i ? G.lineTo(px, py) : G.moveTo(px, py))); G.closePath(); G.fillStyle = fill; G.fill(); };
  const art = useArt && ART.fx.tandavaCrack;
  if (art) { // the painted crack, laid along the line (squashed into the 3/4 view by the screen positions)
    const a0 = [sx(ends[0].x), sy(ends[0].y)], a1 = [sx(ends[1].x), sy(ends[1].y)], len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    const thick = Z(c.w) * (1.4 + 1.2 * Math.abs(c.nx)) * k; // looks thicker seen across than end-on
    fxSprite(G, 'tandavaCrack', (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, len * 1.04, { h: thick, rot: Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), alpha: Math.min(1, 0.4 + k) });
    poly(quad(hw * 0.12), `rgba(255,240,200,${0.35 * k * (0.7 + 0.3 * Math.sin(now * 9))})`); // a pulse of light inside
    drawSplitBeats(c, ends, now);
    return;
  }
  poly(quad(hw + 2.5), 'rgba(60,30,10,.55)');                                    // broken sand edge
  poly(quad(hw), '#120604');                                                     // the dark chasm
  poly(quad(hw * 0.45), `rgba(255,${150 + 60 * Math.sin(now * 9)},60,${0.75 * k})`); // molten light inside
  poly(quad(hw * 0.15), `rgba(255,245,210,${0.9 * k})`);
  drawSplitBeats(c, ends, now);
}

// ---------- fighters ----------
// A wall stays where it was built. It looks weaker as its strength gets used up.
function drawWall(w) {
  const B = TUNE.block, k = w.cap / w.max, x = sx(w.x), y = sy(w.y), px = -w.ny, py = w.nx, hw = Z(w.hw);
  const fade = w.standing && w.t < 0.6 && Math.floor(w.t * 10) % 2 ? 0.4 : 1; // blinks just before it disappears
  G.globalAlpha = fade;
  const art = fxArt(w.look === 'hill' ? 'hill' : 'arrowWall');
  if (art) { // upright; narrower when the wall is seen end-on, taller as it gets stronger
    const len = 2 * Z(w.hw) * 1.25, wide = len * Math.max(0.55, Math.abs(px));
    const up = (w.look === 'hill' ? 0.45 + 0.55 * k : 0.6 + 0.4 * k) * len / art.w * art.h;
    fxSprite(G, w.look === 'hill' ? 'hill' : 'arrowWall', x, y + 2, wide, { h: up, anchor: 'bottom' });
  } else if (w.look === 'hill') { // rising earth: a mound that grows
    const h = 4 + k * 16;
    G.fillStyle = '#6d8f3d'; G.beginPath(); G.ellipse(x, y, Math.max(Math.abs(px) * hw, hw * 0.6), h, 0, Math.PI, 0); G.fill();
    line(x - px * hw, y - py * hw * SQ, x + px * hw, y + py * hw * SQ, '#4b6527', 2);
  } else { // arrow wall: more arrows the stronger it is
    const n = 2 + Math.round(k * 9);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * 2, ax = x + px * t * hw, ay = y + py * t * hw * SQ;
      line(ax, ay, ax + w.nx * 2, ay - 9, '#d9c08a', 1); R(ax + w.nx * 2 - 1, ay - 10, 2, 2, '#fff');
    }
  }
  G.globalAlpha = 1;
  const bw = 20, left = w.standing ? w.t / B.standTime : 1 - w.held / B.buildTime;
  R(x - bw / 2, y + 4, bw, 2, 'rgba(0,0,0,.5)'); R(x - bw / 2, y + 4, bw * k, 2, '#9fe07a'); // strength
  R(x - bw / 2, y + 7, bw * left, 1, w.standing ? '#ffffff' : '#ffd34a');                    // time left
}

// How high a fighter is off the ground, in screen units (ground rule 17): a jump arcs, a flight rises and bobs.
function heightOf(p, now) {
  const a = p.air;
  if (!a) return 0;
  if (a.kind === 'jump') return 11 * Math.sin(Math.PI * Math.min(1, a.t / a.dur));
  return 13 * Math.min(1, a.t / Math.max(0.01, a.lift)) + (airborne(p) ? 1.5 * Math.sin(now * 3) : 0);
}
// Which off-the-ground frame: lift-off / flying / casting in the air; crouch / mid-air / landing.
function airPose(p) {
  const a = p.air, A = AIR_POSES;
  if (a.kind === 'fly') return a.t < a.lift ? A.lift : p.cast || p.recover > 0 ? A.cast : A.up;
  return a.t < 0.08 ? A.crouch : a.t > a.dur - 0.1 ? A.land : A.up;
}
function drawFighter(m, p, now) {
  const x = sx(p.x), gy = sy(p.y) + liftAt(p.x, p.y), h = heightOf(p, now), y = gy - h, c = p.ch.color, o = opponent(m, p);
  ell(x, gy + 1, 9 * (1 - h / 60), 4 * (1 - h / 60), `rgba(0,0,0,${0.3 - h / 120})`); // the shadow stays on the sand
  if (p.air?.kind === 'fly') ell(x, gy + 1, 7, 3, `rgba(80,230,215,${0.25 + 0.15 * Math.sin(now * 6)})`); // teal glow under a flyer
  if (p.effects.invuln && Math.floor(now * 20) % 2) G.globalAlpha = 0.4;
  let top = y - 30;
  if (useArt && ART.sheets[p.ch.id]) {
    ring(x, gy + 1, Z(9), Z(9) * SQ, p.id === 0 ? 'rgba(90,160,255,.9)' : 'rgba(255,90,70,.9)', 1); // player ring, on the ground
    const pose = poseOf(m, p);
    if (m.phase === 'done' && drawEnd(m, p, x, y + 1, now)) { /* knockout / victory */ }
    else if (p.air && drawSprite(G, p.ch.id, 'air', airPose(p), x, y + 1, p.face.x < 0, 1 + 0.08 * Math.min(1, h / 13))) { /* jumping or flying (rule 17): a little bigger the higher, as if nearer */ }
    else if (pose == null || !drawSprite(G, p.ch.id, 'act', pose, x, y + 1, p.face.x < 0)) {
      const moving = anim[p.id].moving, fps = moving ? 10 : 5, i = Math.floor(now * fps) % 4 + (moving ? 4 : 0);
      drawSprite(G, p.ch.id, 'walk', i, x, y + 1, p.face.x < 0);
    }
    top = y - ART_TOP;
  } else {
    ell(x, y - 4, 8, 7, c);
    ell(x, y - 13, 5, 5, c);
    ring(x, y - 4, 8, 7, 'rgba(0,0,0,.5)');
    line(x + p.face.x * 4, y - 4 + p.face.y * 3, x + p.face.x * 11, y - 4 + p.face.y * 7, '#fff', 2); // facing
    txt(p.ch.cls === 'mage' ? 'M' : 'W', x, y - 8, '#fff', 'center', 8, null);
  }
  G.globalAlpha = 1;
  if (m.phase === 'done') return; // no cast bars or status text once it's over
  const fx = Object.entries(p.effects).filter(([k]) => k !== 'invuln' || true);
  if (fx.length) {
    const s = fx.map(([k, e]) => `${{ slow: 'SLOW', hold: 'HELD', stun: 'STUN', invuln: 'SAFE' }[k] || k.toUpperCase()} ${e.t.toFixed(1)}`).join(' ');
    txt(s, x, top, '#ffe14d', 'center'); top -= 10;
  }
  if (p.cast) {
    const mv = p.cast.move, k = mv.charge ? chargeOf(p.cast) : Math.min(1, p.cast.t / Math.max(0.01, mv.cast));
    const label = mv.charge ? `CHARGE ${Math.round(mv.damage + (mv.charge.damage - mv.damage) * k)}` : short(mv.name);
    if (mv.cast >= 0.4 || mv.charge) {
      txt(label, x, top, mv.signature || mv.scene ? '#ff9a3c' : '#fff', 'center');
      R(x - 16, top + 10, 32, 3, 'rgba(0,0,0,.6)'); R(x - 16, top + 10, 32 * k, 3, '#fff');
      if (!mv.charge) txt(`${Math.max(0, mv.cast - p.cast.t).toFixed(1)}`, x + 20, top + 8, '#fff', 'left');
      top -= 12;
    }
  }
  if (p.med) {
    const M = TUNE.meditate, k = p.med.meter / M.segTime;
    // the barrier: a golden dome that fades as it soaks up hits
    const bs = p.med.barrier / M.barrier, rx = Z(13), ry = Z(17), cy = y - Z(14), fl = 0.75 + 0.25 * Math.sin(now * 7);
    const g = G.createRadialGradient(x, cy, 2, x, cy, ry * 1.2);
    g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.75, `rgba(255,210,110,${0.10 * bs})`); g.addColorStop(1, `rgba(255,230,150,${0.35 * bs * fl})`);
    G.fillStyle = g; G.beginPath(); G.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); G.fill();
    ring(x, cy, rx, ry, `rgba(255,236,170,${0.25 + 0.6 * bs * fl})`, 1);
    ring(x, y + 1, Z(13), Z(13) * SQ, `rgba(255,220,120,${0.5 * bs})`, 1);
    ring(x, y - 6, 14, 12, 'rgba(0,0,0,.4)', 3);
    ring(x, y - 6, 14, 12, '#ffd34a', 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    txt('MEDITATING', x, top, '#ffd34a', 'center'); top -= 10;
  }
  if (p.msg) txt(p.msg.text, x, top, '#ffb4a8', 'center');
}

// The match is over: the loser falls (knockout) or slumps (time up), the winner celebrates.
// The winner raises a glowing hand to the sky. Timed from when the match ended.
const VICTORY = { siddhan: 'cast', veeran: 'cast' };
function drawEnd(m, p, x, y, now) {
  const P = POSES[p.ch.id], a = anim[p.id];
  if (!P || !ART.sheets[p.ch.id]?.act) return false;
  if (a.doneAt == null) a.doneAt = now;
  const t = now - a.doneAt, flip = p.face.x < 0, won = m.result?.winner === p.id;
  if (won) {
    const bob = Math.abs(Math.sin(t * 3)) * 1.5;
    const g = 0.5 + 0.5 * Math.sin(t * 6); ell(x + (flip ? -12 : 12), y - 52, 4 + 2 * g, 4 + 2 * g, `rgba(255,220,120,${0.35 * g})`);
    return drawSprite(G, p.ch.id, 'act', P[VICTORY[p.ch.id]], x, y - bob, flip);
  }
  if (p.hp > 0) { // time up: hurt and beaten, but standing
    G.save(); G.translate(x, y); G.rotate((flip ? 1 : -1) * 0.12); G.globalAlpha = 0.85;
    drawSprite(G, p.ch.id, 'act', P.hit, 0, 0, flip); G.restore(); return true;
  }
  // knockout: topple backwards (away from the opponent), bounce once, then lie there
  const k = Math.min(1, t / 0.45), fall = k < 1 ? k * k : 1, bounce = t > 0.45 && t < 0.7 ? Math.sin((t - 0.45) / 0.25 * Math.PI) * 0.08 : 0;
  const dir = flip ? 1 : -1; // falls away from where it faces
  G.save(); G.translate(x, y); G.rotate(dir * (Math.PI / 2) * (fall - bounce));
  drawSprite(G, p.ch.id, 'act', P.hit, 0, 0, flip); G.restore();
  if (t > 0.4 && t < 1.3) { const d = (t - 0.4) / 0.9; ell(x + dir * 20, y, 14 + d * 16, 4 + d * 4, `rgba(230,200,150,${0.5 * (1 - d)})`); } // dust
  return true;
}

function drawProjectile(pr0, now) {
  const pr = { ...pr0, r: Z(pr0.r) };
  const x = sx(pr.x), y = sy(pr.y) - 6, a = Math.atan2(pr.vy * SQ, pr.vx), ca = Math.cos(a), sa = Math.sin(a);
  if (pr.shape === 'orb') { // the mage's mantra bolt: a glowing teal orb with a short tail
    const hy = sy(pr.y) - 18, r = Z(pr0.r) * 1.3 * (1 + Math.max(0, pr0.dmg - 4) / 9), g = G.createRadialGradient(x, hy, 0, x, hy, r * 2.2); // a charged bolt is bigger
    g.addColorStop(0, 'rgba(235,255,252,1)'); g.addColorStop(0.35, 'rgba(90,230,215,.9)'); g.addColorStop(1, 'rgba(40,160,170,0)');
    ell(x, sy(pr.y), r * 0.8, r * 0.3, 'rgba(0,0,0,.2)');
    for (let i = 1; i <= 3; i++) ell(x - ca * i * r * 0.9, hy - sa * i * r * 0.9, r * (1 - i * 0.22), r * (1 - i * 0.22), `rgba(90,230,215,${0.35 - i * 0.09})`);
    G.fillStyle = g; G.beginPath(); G.arc(x, hy, r * 2.2, 0, Math.PI * 2); G.fill();
    return;
  }
  const name = { note: 'notes', chakra: 'chakra', wave: 'wave', tiger: 'tiger', elephant: ART.fx.elephant ? 'elephant' : 'tiger', fire: 'fire', spear: 'spear' }[pr.shape] || 'arrow';
  if (fxArt(name)) {
    const size = { notes: 11, chakra: pr0.r * 2.8, wave: pr0.r * 2.4, tiger: 30, elephant: 34, fire: pr0.r * 4, spear: 18, arrow: 16 }[name] * SC * (name === 'tiger' || name === 'elephant' ? 1.6 : 1) * (pr0.boon ? 1.5 : 1);
    const hy = sy(pr.y) - 18; // shots fly at chest height, with a shadow on the sand
    ell(x, sy(pr.y), size * 0.3, size * 0.1, 'rgba(0,0,0,.25)');
    const flip = name === 'notes' && pr.vx < 0; // notes stay upright
    if (pr0.boon) { // a god's gift: bigger, with a glowing trail
      for (let i = 1; i <= 5; i++) ell(x - ca * i * 5, hy - sa * i * 5, size * (0.45 - i * 0.06), size * (0.45 - i * 0.06), `rgba(255,230,160,${0.35 - i * 0.06})`);
      ell(x, hy, size * 0.75, size * 0.75, 'rgba(255,240,190,.25)');
    }
    if (name === 'tiger' || name === 'elephant') for (let i = 3; i >= 1; i--) fxSprite(G, 'fire', x - ca * i * 16, hy - sa * i * 16, size * (0.9 - i * 0.15), { rot: Math.cos(a) < 0 ? a - Math.PI : a, flip: Math.cos(a) < 0, alpha: 0.6 - i * 0.12 }); // flame trail
    if (pr0.name === 'Pashupatastra') { // crackling lightning behind Shiva's arrow
      G.strokeStyle = 'rgba(190,230,255,.85)'; G.lineWidth = 1; G.beginPath(); G.moveTo(x, hy);
      for (let i = 1; i <= 6; i++) G.lineTo(x - ca * i * 9 + (hash(i, Math.floor(now * 30)) - 0.5) * 8, hy - sa * i * 9 + (hash(i + 9, Math.floor(now * 30)) - 0.5) * 8);
      G.stroke(); ell(x, hy, size * 0.5, size * 0.5, 'rgba(150,210,255,.25)');
    }
    const left = Math.cos(a) < 0; // flying left: mirror the sprite rather than turning it upside down
    const fade = pr0.k < 1 ? { alpha: 0.4 + 0.6 * (2 * pr0.k - 1) } : {}; // a shot past its full-strength distance looks fainter (rule 4)
    fxSprite(G, name, x, hy, size, { ...(name === 'chakra' ? { spin: now * 14 } : name === 'notes' ? { flip } : { rot: left ? a - Math.PI : a, flip: (name === 'wave') !== left }), ...fade });
    return;
  }
  switch (pr.shape) {
    case 'note': ring(x, y, pr.r, pr.r, '#bfe3ff', 2); break;
    case 'chakra':
      ell(x, y, pr.r, pr.r * 0.8, '#ffd34a'); ring(x, y, pr.r, pr.r * 0.8, '#b0801a', 1);
      for (let i = 0; i < 4; i++) { const t = now * 20 + i * Math.PI / 2; line(x, y, x + Math.cos(t) * pr.r, y + Math.sin(t) * pr.r * 0.8, '#fff8d0'); }
      break;
    case 'wave': for (const k of [1, 0.6]) ring(x, y, pr.r * k, pr.r * k * 0.7, k === 1 ? '#c9b6ff' : '#e6dcff', 2, a - 1.1, a + 1.1); break;
    case 'tiger': case 'elephant': ell(x, y, pr.r + 2, pr.r, '#ff8a1e'); line(x - ca * 16, y - sa * 16, x, y, '#ffcf6a', 3); txt('E', x, y - 4, '#3a1a00', 'center', 8, null); break;
    case 'fire': ell(x, y, pr.r, pr.r, '#ff5a2a'); ell(x, y, pr.r * 0.5, pr.r * 0.5, '#ffe08a'); break;
    case 'spear': line(x - ca * 10, y - sa * 10, x + ca * 3, y + sa * 3, '#e8f0ff', 2); break;
    default: line(x - ca * 7, y - sa * 7, x + ca * 2, y + sa * 2, '#f5e6c0', 1); R(x + ca * 2 - 1, y + sa * 2 - 1, 2, 2, '#fff');
  }
}

// ---------- the whole fight view ----------
// walking or standing, from how far each fighter moved since the last frame
// plus short poses that outlive a cast: the release of a shot or strike, and flinching from a hit
const anim = [0, 1].map(() => ({ x: 0, y: 0, moving: false, still: 0, hp: 100, cast: null, pose: null, until: 0 }));
const ART_TOP = 58;
let animMatch = null;
function trackMotion(m) {
  const now = m.t; // match clock: poses freeze with the game
  if (animMatch !== m) { // a new match (rematch): forget the last one's poses, they were timed on its clock
    animMatch = m;
    for (const p of m.players) Object.assign(anim[p.id], { x: p.x, y: p.y, moving: false, still: 0, hp: p.hp, taken: p.stats.taken, cast: null, pose: null, until: 0, doneAt: null });
    hpShown[0] = hpShown[1] = 100;
  }
  for (const p of m.players) {
    const a = anim[p.id];
    if (m.phase !== 'done') a.doneAt = null;
    const d = Math.hypot(p.x - a.x, p.y - a.y), P = POSES[p.ch.id];
    if (d > 0.2) { a.moving = true; a.still = 0; } else if (++a.still > 4) a.moving = false;
    a.x = p.x; a.y = p.y;
    // flinch only when hit (damage taken), not when paying a move's health cost, e.g. a signature
    if (P && p.stats.taken > a.taken + 0.01) { a.pose = P.hit; a.until = now + 0.3; }
    else if (P && a.cast && !p.cast) { // a cast just ended: hold the follow-through
      const after = { a1: P.shoot, s1: P.shoot, s2: p.ch.weapon === 'bow' ? P.shoot : null, a2: P.melee, sig: p.ch.weapon === 'bow' ? P.shoot : P.cast }[a.cast];
      if (after != null) { a.pose = after; a.until = now + (a.cast === 'sig' ? 0.8 : 0.22); } // a signature holds its release while it strikes
    }
    a.hp = p.hp; a.taken = p.stats.taken; a.cast = p.cast ? p.cast.slot : null;
  }
}
// for tests: is the fighter showing the hurt pose right now?
export const isHurtPose = (m, pid) => { const p = m.players[pid], P = POSES[p.ch.id]; return !!P && poseOf(m, p) === P.hit; };
// which action frame a fighter shows right now (null = idle / walk)
function poseOf(m, p) {
  const P = POSES[p.ch.id], a = anim[p.id], now = m.t;
  if (!P) return null;
  if (a.pose != null && now < a.until) return a.pose;
  if (p.effects.stun) return P.hit;
  if (p.block) return P.block;
  if (p.med) return P.meditate ?? P.cast;
  if (!p.cast) return null;
  const c = p.cast, k = c.move.cast > 0 ? c.t / c.move.cast : 1;
  if (c.slot === 'a1' || (c.slot === 's1' && c.move.kind === 'projectile' && p.ch.weapon === 'bow') || (c.slot === 's2' && p.ch.weapon === 'bow')) return P.shootWind;
  if (c.slot === 'a2') return k < 0.6 ? P.meleeWind : P.melee;
  return P.cast;
}

// fxNow: the clock the effects were stamped with (the fight clock, which stops during pauses and scenes)
export function drawFight(m, now, fx, tags = ['P1', 'P2'], fxNow = now, hints = [null, null]) {
  trackMotion(m);
  chasm = m.arenaChange?.kind === 'chasm' ? m.arenaChange : null;
  let sh = 0; // screen shake from power moves landing
  for (const f of fx) if (f.kind === 'shake') sh += f.amp * Math.max(0, 1 - (fxNow - f.t0) / f.life);
  G.save();
  if (sh) G.translate(Math.sin(now * 83) * sh, Math.cos(now * 67) * sh * 0.7);
  const cam = sceneCamera(m); // a power-up zooms in on the caster
  if (cam) { G.translate(CX, H / 2); G.scale(cam.z, cam.z); G.translate(-cam.fx, -cam.fy); }
  drawBackdrop(now);
  if (m.scene) sceneSky(m);
  for (const f of fx) if (f.kind === 'god') drawGod(f, fxNow); // a god appearing in the sky (small and medium boons)
  drawArena();
  drawChasm(m, now);
  for (const a of m.areas) {
    const k = 1 - a.t / a.delay;
    if (fxArt('danger')) { // the warning circle fills in as the arrows get closer
      const w = Z(a.r) * 2.2;
      fxSprite(G, 'danger', sx(a.x), sy(a.y), w, { h: w * SQ, alpha: 0.6 + 0.4 * Math.abs(Math.sin(now * 10)) });
      fxSprite(G, 'danger', sx(a.x), sy(a.y), w * k, { h: w * k * SQ, alpha: 0.5 });
      continue;
    }
    ring(sx(a.x), sy(a.y), Z(a.r), Z(a.r) * SQ, '#ff4a3a', 1);
    ell(sx(a.x), sy(a.y), Z(a.r) * k, Z(a.r) * SQ * k, 'rgba(255,74,58,.3)');
  }
  for (const u of m.units) { ell(sx(u.x), sy(u.y) - 4, Z(u.r), Z(u.r), '#999'); txt(`${Math.ceil(u.hp)}`, sx(u.x), sy(u.y) - 20, '#fff', 'center'); }
  for (const f of fx) if (f.ground) drawFx(f, fxNow);
  if (m.scene?.name === 'Thousand-Arm Form') {
    const p = m.players[m.scene.pid];
    drawSignatureHalo(sx(p.x), sy(p.y) - 18, m.scene.t);
  }
  const order = [...m.players, ...m.walls].sort((a, b) => a.y - b.y); // back to front
  const lifted = (o, draw) => { const d = liftAt(o.x, o.y); if (d) { G.save(); G.translate(0, d); draw(); G.restore(); } else draw(); }; // rides its half of a split island
  for (const o of order) if (o.ch) drawFighter(m, o, now); else lifted(o, () => drawWall(o));
  for (const pr of m.projectiles) lifted(pr, () => drawProjectile(pr, now));
  for (const f of fx) if (!f.ground) drawFx(f, fxNow);
  if (m.scene) sceneAura(m, now);
  G.restore();
  if (!m.scene) drawHud(m, tags, hints);
  else sceneTitle(m);
}

// The blessing halo remains a single painted formation throughout its forward press and return.
const SIGNATURE_HANDS = [
  { radius: 75, count: 12, size: 12 },
  { radius: 49, count: 8, size: 10.5 },
].flatMap((row, rowIndex) => Array.from({ length: row.count }, (_, index) => ({
  ...row, row: rowIndex, index, angle: -Math.PI + 0.2 + index / (row.count - 1) * (Math.PI - 0.4),
})));
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
function drawSignaturePalm(x, y, size, alpha) {
  ell(x, y, size * 0.3, size * 0.5, `rgba(250,236,180,${alpha})`);
}
// Simple curved limbs preserve the blessing pose in the grey-box fallback.
function drawDivineArm(rx, ry, ex, ey, width, alpha, side) {
  G.save(); G.globalAlpha *= alpha; G.lineCap = 'round'; G.lineJoin = 'round';
  const path = () => {
    G.beginPath(); G.moveTo(rx, ry);
    G.bezierCurveTo(rx + (ex - rx) * 0.45, ry + 14, ex - side * 2, ey + 24, ex, ey);
  };
  const shade = G.createLinearGradient(rx, ry + 6, ex, ey - 5);
  shade.addColorStop(0, '#83b3a0'); shade.addColorStop(0.35, '#a5c7ab'); shade.addColorStop(0.7, '#c4d4ad'); shade.addColorStop(1, '#e8dfb5');
  path(); G.strokeStyle = 'rgba(211,173,78,0.9)'; G.lineWidth = width + 1; G.stroke();
  path(); G.strokeStyle = shade; G.lineWidth = width; G.stroke();
  G.translate(0, -width * 0.2); path(); G.strokeStyle = 'rgba(255,246,196,0.65)'; G.lineWidth = Math.max(0.5, width * 0.18); G.stroke();
  G.restore();
}
function drawDivineMandala(cx, cy, open, fade) {
  G.save(); G.globalAlpha *= fade * open;
  const r = 86 * open;
  const aura = G.createRadialGradient(cx, cy - 20, 12, cx, cy - 20, r + 15);
  aura.addColorStop(0, 'rgba(255,223,133,0.13)'); aura.addColorStop(1, 'rgba(255,223,133,0)');
  G.fillStyle = aura; G.fillRect(cx - r - 15, cy - r - 35, 2 * r + 30, 2 * r + 30);
  G.strokeStyle = '#f4ce77'; G.lineWidth = 0.65;
  for (const rr of [r, r - 3, r * 0.67]) { G.beginPath(); G.arc(cx, cy, Math.max(0, rr), -Math.PI - 0.12, 0.12); G.stroke(); }
  for (let i = 0; i <= 40; i++) {
    const a = -Math.PI + i / 40 * Math.PI;
    ell(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5), 0.35, 0.35, '#fff1bc');
  }
  // A small lotus crowns the aureole; its fine outline leaves the hands readable.
  const ly = cy - r - 1;
  for (const side of [-1, 0, 1]) {
    G.beginPath(); G.moveTo(cx, ly + 1);
    G.bezierCurveTo(cx + side * 8 - 3, ly - 3, cx + side * 6, ly - 8, cx + side * 5, ly - 9 + Math.abs(side) * 3);
    G.bezierCurveTo(cx + side * 9 + 3, ly - 4, cx + 4, ly, cx, ly + 1); G.stroke();
  }
  G.restore();
}
function drawSignatureHalo(cx, cy, age, releasing = false, fade = 1) {
  const reveal = releasing ? 1 : easeOut(clamp01(age / 0.95));
  if (useArt && ART.fx.divineHalo) {
    // Preserve the approved painting's soft shading and outward-curving blessing arms.
    fxSprite(G, 'divineHalo', cx, cy + 28, 174 * reveal, { anchor: 'bottom', alpha: fade * reveal });
    return;
  }
  drawDivineMandala(cx, cy, reveal, fade);
  for (const h of SIGNATURE_HANDS) {
    const open = releasing ? 1 : easeOut(clamp01((age - (1 - h.row) * 0.16) / 0.8));
    if (open <= 0) continue;
    const side = Math.cos(h.angle) < 0 ? -1 : 1;
    const ex = cx + Math.cos(h.angle) * h.radius * open, ey = cy + Math.sin(h.angle) * h.radius * open;
    drawDivineArm(cx + side * 5, cy + 22, ex, ey + h.size * 0.75, (h.row ? 3.7 : 4.5) * open, fade * 0.92, side);
    drawSignaturePalm(ex, ey, h.size * open, fade, side < 0);
  }
}
function drawDivineImpact(tx, ty, age, fade) {
  const t = age - 0.4;
  if (t < 0 || t > 0.62) return;
  G.save(); G.globalAlpha *= fade;
  for (let i = 0; i < 3; i++) {
    const k = clamp01((t - i * 0.045) / 0.42);
    if (k <= 0 || k >= 1) continue;
    ring(tx, ty, 5 + k * 13, 9 + k * 20, `rgba(255,231,154,${(1 - k) * 0.9})`, 0.8);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, r = 7 + t * 27;
    G.save(); G.translate(tx + Math.cos(a) * r, ty + Math.sin(a) * r - t * 12); G.rotate(a);
    G.fillStyle = `rgba(255,236,167,${(1 - t / 0.62) * 0.8})`; G.beginPath(); G.ellipse(0, 0, 2.3, 0.8, 0, 0, Math.PI * 2); G.fill(); G.restore();
  }
  G.restore();
}

function drawFx(f, now) {
  const age = now - f.t0, k = age / f.life, x = sx(f.x), y = sy(f.y);
  const spr = { flash: 'spark', boom: 'burst', clash: 'clash' }[f.kind];
  if (spr && fxArt(spr)) {
    const size = { spark: 20 + k * 10, burst: Z(22) * 2 * (0.6 + k * 0.6), clash: 34 + k * 12 }[spr];
    fxSprite(G, spr, x, spr === 'burst' ? y : y - 18, size, { alpha: 1 - k * k, anchor: spr === 'burst' ? 'bottom' : 'center' });
    return;
  }
  if (f.kind === 'rain' && fxArt('rain')) { // arrows drop onto the circle
    for (let i = 0; i < 5; i++) { const a = i * 2.4, r = (i / 5) * Z(f.r); fxSprite(G, 'rain', x + Math.cos(a) * r, y + Math.sin(a) * r * SQ - 40 * (1 - k), 22, { anchor: 'bottom', alpha: 1 - k * 0.5 }); }
    return;
  }
  switch (f.kind) {
    case 'shake': case 'god': break;
    case 'arms': { // the painted halo strikes, carries through to the far bank, then dissolves
      const cx = x, cy = y - 18, tx = sx(f.tx), ty = sy(f.ty) - 18;
      const fade = 1 - clamp01((age - f.life + 0.4) / 0.4);
      if (f.part === 'fan') {
        const face = tx >= cx ? 1 : -1, gap = Math.min(64, Math.abs(tx - cx) * 0.35);
        const travel = smooth(age / 0.4), hitX = tx - face * gap;
        // Continue along the attack's world-space direction, including diagonal and vertical attacks.
        const dx = f.tx - f.x, dy = f.ty - f.y, distance = Math.hypot(dx, dy);
        const ux = distance > 0 ? dx / distance : face, uy = distance > 0 ? dy / distance : 0;
        const dot = f.tx * ux + f.ty * uy;
        const toEdge = Math.max(0, -dot + Math.sqrt(Math.max(0, dot * dot + ARENA.r ** 2 - f.tx ** 2 - f.ty ** 2)));
        const exitX = sx(f.tx + ux * (toEdge + 90 / SC)), exitY = sy(f.ty + uy * (toEdge + 90 / SC)) - 18;
        const carry = smooth((age - 0.4) / 0.9), dissolve = smooth((carry - 0.2) / 0.8);
        const mx = cx + (hitX - cx) * travel + (exitX - hitX) * carry;
        const my = cy + (ty - cy) * travel + (exitY - ty) * carry;
        drawSignatureHalo(mx, my, age, true, fade * (1 - dissolve));
        if (dissolve > 0 && dissolve < 1) for (let i = 0; i < 14; i++) {
          const a = i / 14 * Math.PI * 2, r = 28 + dissolve * 55;
          star(mx + Math.cos(a) * r, my - 28 + Math.sin(a) * r * 0.65 - dissolve * 12, 0.7 + dissolve, Math.sin(dissolve * Math.PI) * 0.6 * fade);
        }
      } else drawDivineImpact(tx, ty, age, fade);
      break;
    }
    case 'crack': { // a fissure in the sand: a scorched dip, jagged branching cracks with a lit edge; fades late
      const a = Math.min(1, (f.life - age) / 6), grow = Math.min(1, age / 0.12), sz = f.size * grow;
      G.save(); G.beginPath(); G.ellipse(CX, CY, ARENA.r * SC, ARENA.r * SC * SQ, 0, 0, Math.PI * 2); G.clip(); // only on the sand
      const dip = G.createRadialGradient(x, y, 0, x, y, Z(10) * sz);
      dip.addColorStop(0, `rgba(80,40,15,${0.35 * a})`); dip.addColorStop(1, 'rgba(80,40,15,0)');
      G.fillStyle = dip; G.beginPath(); G.ellipse(x, y, Z(10) * sz, Z(10) * sz * SQ, 0, 0, Math.PI * 2); G.fill();
      const n = 4 + (f.seed % 4);
      for (let i = 0; i < n; i++) {
        let ang = (i / n) * Math.PI * 2 + hash(i, f.seed) * 0.9, px = x, py = y;
        const len = Z(6 + hash(i, f.seed + 1) * 9) * sz, pts = [[px, py]];
        for (let j = 1; j <= 5; j++) { ang += (hash(i * 7 + j, f.seed) - 0.5) * 1.3; px += Math.cos(ang) * len / 5; py += Math.sin(ang) * len / 5 * SQ; pts.push([px, py]); }
        const path = () => { G.beginPath(); G.moveTo(pts[0][0], pts[0][1]); for (const [qx, qy] of pts.slice(1)) G.lineTo(qx, qy); };
        G.lineCap = 'round'; G.lineJoin = 'round';
        path(); G.strokeStyle = `rgba(255,228,180,${0.5 * a})`; G.lineWidth = 0.9; G.save(); G.translate(0, 0.45); G.stroke(); G.restore(); // lit lower lip
        path(); G.strokeStyle = `rgba(55,26,10,${0.9 * a})`; G.lineWidth = 0.55 * (1.2 - 0.2 * sz); G.stroke();
        if (hash(i, f.seed + 9) > 0.5) { // a small side branch
          const [bx, by] = pts[2], ba = ang + (hash(i, f.seed + 3) > 0.5 ? 0.9 : -0.9);
          G.beginPath(); G.moveTo(bx, by); G.lineTo(bx + Math.cos(ba) * len * 0.35, by + Math.sin(ba) * len * 0.35 * SQ); G.lineWidth = 0.4; G.stroke();
        }
      }
      G.restore();
      break;
    }
    case 'splash': { // river water thrown up: droplets arc outward and fall, with a ring on the water
      const out = Math.hypot(f.x, f.y) > 1 ? unitDir2(f.x, f.y) : { x: 0, y: -1 }, b = f.big || 1;
      ring(x, y, Z(4 + 8 * k) * Math.min(b, 1.3), Z(4 + 8 * k) * Math.min(b, 1.3) * SQ, `rgba(230,245,255,${0.6 * (1 - k)})`, 1);
      if (b > 1.5) { // a column of water thrown up, falling back
        const h = Z(60) * (b / 2.6) * Math.sin(Math.PI * Math.min(1, k * 1.2)), wcol = Z(5);
        const gcol = G.createLinearGradient(0, y - h, 0, y);
        gcol.addColorStop(0, 'rgba(235,248,255,0)'); gcol.addColorStop(0.3, `rgba(220,240,255,${0.75 * (1 - k)})`); gcol.addColorStop(1, `rgba(170,215,250,${0.55 * (1 - k)})`);
        G.fillStyle = gcol; G.beginPath(); G.moveTo(x - wcol, y); G.quadraticCurveTo(x - wcol * 0.3, y - h * 0.6, x, y - h); G.quadraticCurveTo(x + wcol * 0.3, y - h * 0.6, x + wcol, y); G.closePath(); G.fill();
      }
      for (let i = 0; i < 14; i++) {
        const spread = (hash(i, 50) - 0.5) * 1.6, sp = (20 + hash(i, 51) * 30) * b, ang = Math.atan2(out.y, out.x) + spread;
        const dx = Math.cos(ang) * sp * age, up = (40 + hash(i, 52) * 40) * b * age - 120 * age * age;
        if (up < -2) continue;
        G.fillStyle = `rgba(200,232,255,${0.9 * (1 - k)})`;
        G.beginPath(); G.arc(x + Z(dx), y + Z(Math.sin(ang) * sp * age) * SQ - Z(up), 0.7 + hash(i, 53) * 0.8, 0, Math.PI * 2); G.fill();
      }
      break;
    }
    case 'shock': { // a ring of force rolling across the floor
      const r = Z(f.r) * easeOut(k), a = 1 - k;
      ring(x, y, r, r * SQ, `rgba(${f.color},${a})`, 3 * a + 0.5);
      ring(x, y, r * 0.8, r * 0.8 * SQ, `rgba(255,255,255,${0.6 * a})`, 1);
      ell(x, y, r, r * SQ, `rgba(${f.color},${0.12 * a})`);
      break;
    }
    case 'ghost': { // the painting glows faintly over the arena
      const img = ART.scenes[f.scene];
      if (img) { G.save(); G.globalCompositeOperation = 'screen'; place(img, 1.05 + 0.1 * k, 0.5, 0.5, CX, H / 2, 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.4))); G.restore(); }
      break;
    }
    case 'pillar': { // a column of white light from the sky
      const w = Z(14) * (1 - k * 0.6), a = 1 - k * k;
      const g = G.createLinearGradient(x - w, 0, x + w, 0);
      g.addColorStop(0, 'rgba(255,250,220,0)'); g.addColorStop(0.5, `rgba(255,255,245,${a})`); g.addColorStop(1, 'rgba(255,250,220,0)');
      G.fillStyle = g; G.fillRect(x - w, 0, w * 2, y); ell(x, y, w * 1.6, w * 0.6, `rgba(255,255,240,${a * 0.8})`);
      break;
    }
    case 'bolt': { // lightning from the storm onto the archer
      if (k > 0.6) break;
      G.strokeStyle = `rgba(200,235,255,${1 - k})`; G.lineWidth = 2; G.beginPath();
      let bx = x + 30, by = 0; G.moveTo(bx, by);
      for (let i = 1; i <= 8; i++) { by = (y - 30) * (i / 8); bx = x + (hash(i, Math.floor(f.t0 * 10)) - 0.5) * 30 * (1 - i / 8); G.lineTo(bx, by); }
      G.stroke(); G.lineWidth = 0.7; G.strokeStyle = '#fff'; G.stroke();
      break;
    }
    case 'pop': txt(f.text, x, y - 34 - age * 20, f.color, 'center'); break;
    case 'clash': case 'flash': ring(x, y - 6, 4 + k * 12, (4 + k * 12) * 0.8, `rgba(255,255,255,${1 - k})`, 2); break;
    case 'swing': ring(x, y - 6, 12, 9, `rgba(255,255,255,${0.8 - k * 0.8})`, 2, f.a - 1, f.a + 1); break;
    case 'boom': ell(x, y, Z(22) * (0.5 + k), Z(22) * SQ * (0.5 + k), `rgba(255,140,40,${0.8 - k * 0.8})`); break;
    case 'rain': for (let i = 0; i < 9; i++) { const a = i * 2.4, r = (i / 9) * Z(f.r); line(x + Math.cos(a) * r, y + Math.sin(a) * r * SQ - 10 * (1 - k), x + Math.cos(a) * r, y + Math.sin(a) * r * SQ, '#f5e6c0'); } break;
    case 'trail': line(sx(f.x0), sy(f.y0) - 6, x, y - 6, `rgba(180,220,255,${1 - k})`, 3); break;
    case 'global': G.fillStyle = `rgba(${f.color || '255,220,120'},${0.5 * (1 - k)})`; G.fillRect(-10, -10, W + 20, H + 20); break;
  }
}

// ---------- HUD (both power bars always visible) ----------
function bar(x, y, w, h, k, c, right) {
  R(x - 1, y - 1, w + 2, h + 2, '#111');
  R(x, y, w, h, '#3a3a3a');
  const fw = Math.round(w * Math.max(0, Math.min(1, k)));
  R(right ? x + w - fw : x, y, fw, h, c);
}
// rounded box
function box(x, y, w, h, r, fill, stroke) {
  G.beginPath(); G.roundRect(x, y, w, h, r);
  if (fill) { G.fillStyle = fill; G.fill(); }
  if (stroke) { G.strokeStyle = stroke; G.lineWidth = 0.75; G.stroke(); }
}
// The health bar's red "just lost" part drains after a hit. It runs on real time, not the match clock: the clock
// stops at a KO, and the red part used to freeze there, so the bar looked full-ish while the number said 0%.
const hpShown = [100, 100]; let hudLast = null;
function drawHud(m, tags, hints = [null, null]) {
  const now = performance.now() / 1000, dt = hudLast === null ? 0 : Math.min(0.1, Math.max(0, now - hudLast)); hudLast = now;
  for (const p of m.players) {
    const right = p.id === 1, X = (v, w = 0) => (right ? W - v - w : v), al = right ? 'right' : 'left';
    const pw = p.power / p.ch.power.size; // both power bars always visible (ground rule 14)
    // panel
    const g = G.createLinearGradient(0, 3, 0, 45);
    g.addColorStop(0, 'rgba(34,22,52,.88)'); g.addColorStop(1, 'rgba(18,10,26,.88)');
    box(X(4, 194), 3, 194, 42, 6, g, '#c9a24a');
    // portrait
    const pcx = X(24), pcy = 24;
    ell(pcx, pcy, 17.5, 17.5, '#1a1020');
    if (!drawPortrait(G, p.ch.id, pcx, pcy, 16)) txt(p.ch.cls === 'mage' ? 'M' : 'W', pcx, pcy - 4, p.ch.color, 'center');
    ring(pcx, pcy, 17, 17, p.ch.color, 1.5); ring(pcx, pcy, 18.6, 18.6, '#c9a24a', 0.75);
    // name + tag
    txt(p.ch.name.toUpperCase(), X(46), 6, p.ch.color, al);
    G.font = `8px ${FONT}`; const nw = G.measureText(p.ch.name).width;
    txt(tags[p.id], X(46 + nw + 8), 6, tags[p.id] === 'CPU' ? '#b8b0c8' : '#fff', al);
    // health: red trail for what was just lost, then the colour bar
    hpShown[p.id] = p.hp > hpShown[p.id] ? p.hp : Math.max(p.hp, hpShown[p.id] - (m.phase === 'done' ? 60 : 30) * dt);
    const bx = X(46, 114), k = Math.max(0, p.hp / 100), kt = hpShown[p.id] / 100;
    box(bx - 1, 15, 116, 10, 3, '#0d0812', '#5a4a2a');
    const fill = (from, to, c1, c2) => {
      if (to <= from) return;
      const x0 = right ? bx + 114 * (1 - to) : bx + 114 * from, gg = G.createLinearGradient(0, 16, 0, 24);
      gg.addColorStop(0, c1); gg.addColorStop(1, c2); box(x0, 16, 114 * (to - from), 8, 2, gg);
    };
    fill(k, kt, '#ff8a7a', '#c0302a');
    const col = p.hp > 50 ? ['#8af07a', '#2e9c3a'] : p.hp > 25 ? ['#ffe07a', '#d09a1a'] : ['#ff7a5a', '#b8241a'];
    fill(0, k, ...col);
    R(right ? bx + 114 * (1 - k) : bx, 16, 114 * k, 1.5, 'rgba(255,255,255,.35)');
    txt(`${Math.max(0, Math.ceil(p.hp))}%`, X(164), 16, '#fff', al);
    // power: gold, marked every 10%
    box(bx - 1, 28, 116, 5, 2, '#0d0812', '#5a4a2a');
    const pg = G.createLinearGradient(0, 29, 0, 32); pg.addColorStop(0, '#fff1a0'); pg.addColorStop(1, '#e0a21a');
    if (pw > 0) box(right ? bx + 114 * (1 - pw) : bx, 29, 114 * pw, 3, 1.5, pg);
    for (let i = 1; i < 10; i++) R(bx + 11.4 * i, 29, 0.5, 3, 'rgba(0,0,0,.45)');
    txt(`${Math.floor(p.power)}`, X(164), 27, '#ffd34a', al, 6);
    // boon / meditation line
    // devotion: 8 segments earned by meditating; a part-filled one only counts once it's full
    const MD = TUNE.meditate, segW = 72 / MD.segments, dx0 = X(46, MD.segments * segW), part = p.med ? Math.min(1, p.med.meter / MD.segTime) : 0;
    for (let i = 0; i < MD.segments; i++) {
      const sxp = dx0 + (right ? MD.segments - 1 - i : i) * segW, full = i < p.devotion, tierEdge = MD.tiers.includes(i + 1);
      R(sxp, 36, segW - 1.2, 5, '#0d0812');
      if (full) R(sxp, 36, segW - 1.2, 5, i + 1 > MD.tiers[0] ? '#fff2b0' : '#e0a040');
      else if (i === p.devotion && part > 0) R(sxp, 36 + 5 * (1 - part), segW - 1.2, 5 * part, 'rgba(255,207,106,.45)');
      if (tierEdge) R(sxp + segW - 1.2, 35, 0.6, 7, '#c9a24a');
    }
    const tierName = p.devotion >= MD.tiers[1] ? 'DIVINE' : p.devotion >= MD.tiers[0] ? 'SMALL' : '';
    txt(tierName ? `ASK: ${tierName}` : 'DEVOTION', X(46 + MD.segments * segW + 4), 35.5, tierName ? '#ffcf6a' : '#a898c0', al, 6);
    if (p.boon) { // the held boon, in a gold tag under the panel
      const label = `${p.boon.tier === 'divine' ? '✦ ' : ''}${p.boon.name.toUpperCase()}${hints[p.id] ? `   ${hints[p.id].keys}` : ''}`;
      G.font = `6px ${FONT}`; const tw = G.measureText(label).width + 12, tx = X(30, tw), glow = 0.6 + 0.4 * Math.sin(m.t * 5);
      box(tx, 47, tw, 11, 4, `rgba(60,36,10,.9)`, `rgba(255,207,106,${glow})`);
      txt(label, tx + tw / 2, 49.5, '#ffe7a0', 'center', 6);
    }
  }
  // timer medallion
  const low = m.timeLeft <= 30, tg = G.createLinearGradient(0, 3, 0, 35);
  tg.addColorStop(0, 'rgba(60,34,20,.92)'); tg.addColorStop(1, 'rgba(24,12,10,.92)');
  box(CX - 34, 3, 68, 32, 8, tg, '#e8c060');
  box(CX - 31, 6, 62, 26, 6, null, 'rgba(232,192,96,.45)');
  txt(clock(m.timeLeft), CX, 11, low && Math.floor(m.t * 2) % 2 ? '#ff6a5a' : low ? '#ffb0a0' : '#fff6dc', 'center', 16);
}

// ---------- dramatic scenes (ground rule 4: the game pauses while one plays) ----------
// Owner, 2026-11-08: like a fighting game's super move, the game itself stays on screen. The camera zooms in on
// the caster, the SKY turns into the power (the scene painting, art/scene_<key>.png, fills the sky above the far
// bank, with the fighter's spirit form for a signature), the rest of the arena dims around a spotlight, an aura
// rises from the caster, the move's name slams in, and the camera pulls back as the move goes off.
const SCENE_LOOK = {
  siddhan_sig: { face: [0.3, 0.3], at: [0.62, 0.35], glow: '255,221,147', spark: '255,242,195', bg: ['#123a4a', '#03080c'], sub: 'THE MAGE AWAKENS' },
  veeran_elephant: { fallback: 'veeran_sig', face: [0.25, 0.3], at: [0.6, 0.33], glow: '255,130,50', spark: '255,196,96', bg: ['#7a1a10', '#140404'], sub: 'THE WAR ELEPHANT' },
  vishwaroopam: { face: [0.375, 0.21], at: [0.6, 0.16], glow: '255,214,120', spark: '255,236,170', bg: ['#2a1a5a', '#05030f'], sub: 'DIVINE BOON OF KRISHNA' },
  shakti_vel: { face: [0.4, 0.3], at: [0.7, 0.4], glow: '255,200,90', spark: '255,240,190', bg: ['#5a3a10', '#0a0604'], sub: 'DIVINE BOON OF MURUGAN' },
  brahmastra: { face: [0.4, 0.3], at: [0.7, 0.38], glow: '255,246,214', spark: '255,255,236', bg: ['#4a3a20', '#0a0806'], sub: 'DIVINE BOON OF BRAHMA' },
  pashupatastra: { face: [0.4, 0.3], at: [0.82, 0.37], glow: '160,215,255', spark: '210,240,255', bg: ['#1a2a6a', '#03050f'], sub: 'DIVINE BOON OF SHIVA' },
  tandava: { face: [0.5, 0.3], at: [0.5, 0.6], glow: '255,150,60', spark: '255,230,170', bg: ['#5a1a10', '#0a0302'], sub: 'BOON OF SHIVA: THE ISLAND SPLITS' },
};
export const sceneKey = (name) => ({ 'Thousand-Arm Form': 'siddhan_sig', 'Gaja Arrow': 'veeran_elephant', Pashupatastra: 'pashupatastra',
  Brahmastra: 'brahmastra', 'Shakti Vel': 'shakti_vel', Vishwaroopam: 'vishwaroopam', "Shiva's Tandava": 'tandava' })[name] || null;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 3;

// Draw an image scaled z times "cover", with its point (fx, fy) (fractions of the image) at screen (sx, sy).
function place(img, z, fx, fy, sx, sy, alpha = 1) {
  const c = Math.max(W / img.width, H / img.height) * z, w = img.width * c, h = img.height * c;
  G.save(); G.globalAlpha *= alpha; G.imageSmoothingEnabled = true;
  G.drawImage(img, sx - fx * w, sy - fy * h, w, h);
  G.restore();
}
function star(x, y, r, a) { // a four-point glint
  G.fillStyle = `rgba(255,255,255,${a})`;
  G.beginPath(); G.moveTo(x, y - r); G.lineTo(x + r * 0.18, y - r * 0.18); G.lineTo(x + r, y); G.lineTo(x + r * 0.18, y + r * 0.18);
  G.lineTo(x, y + r); G.lineTo(x - r * 0.18, y + r * 0.18); G.lineTo(x - r, y); G.lineTo(x - r * 0.18, y - r * 0.18); G.closePath(); G.fill();
}

// Long branching fissures out from an impact, reaching toward the edge. run = how far they've spread (0-1),
// glow = molten light inside them (0-1), alpha = overall fade.
function fissures(x, y, seed, run, glow, alpha = 1) {
  const n = 8;
  G.lineCap = 'round'; G.lineJoin = 'round';
  const crack = (pts, w0) => { // tapered: each segment a little thinner than the last
    for (let j = 1; j < pts.length; j++) {
      const w = w0 * (1 - (j - 1) / pts.length), [ax, ay] = pts[j - 1], [bx, by] = pts[j];
      G.beginPath(); G.moveTo(ax, ay + 0.8); G.lineTo(bx, by + 0.8); G.strokeStyle = `rgba(255,224,170,${0.45 * alpha})`; G.lineWidth = w * 0.6; G.stroke(); // lit lower lip
      G.beginPath(); G.moveTo(ax, ay); G.lineTo(bx, by); G.strokeStyle = `rgba(35,15,5,${0.95 * alpha})`; G.lineWidth = w; G.stroke();
      if (glow > 0) { G.strokeStyle = `rgba(255,${150 + 60 * glow | 0},70,${glow})`; G.lineWidth = w * 0.45; G.stroke(); }
    }
  };
  for (let i = 0; i < n; i++) {
    let ang = (i / n) * Math.PI * 2 + hash(i, seed) * 0.6, px = x, py = y;
    const len = Z(35 + hash(i, seed + 1) * 65) * run, segs = 14, pts = [[px, py]];
    for (let j = 1; j <= segs; j++) { ang += (hash(i * 17 + j, seed) - 0.5) * 1.1; const l = (len / segs) * (0.6 + hash(i * 5 + j, seed + 2) * 0.8); px += Math.cos(ang) * l; py += Math.sin(ang) * l * SQ; pts.push([px, py]); }
    crack(pts, 2.6);
    for (const bj of [4, 8, 11]) if (hash(i * 3 + bj, seed) > 0.45) { // side cracks
      let ba = ang + (hash(i, seed + bj) > 0.5 ? 1 : -1) * (0.6 + hash(i, bj) * 0.7), [qx, qy] = pts[bj];
      const bp = [[qx, qy]], bl = len * 0.22;
      for (let j = 1; j <= 5; j++) { ba += (hash(i * 7 + j + bj, seed + 5) - 0.5) * 1.2; qx += Math.cos(ba) * bl / 5; qy += Math.sin(ba) * bl / 5 * SQ; bp.push([qx, qy]); }
      crack(bp, 1.3);
    }
  }
  const pit = G.createRadialGradient(x, y, 0, x, y, Z(18));
  pit.addColorStop(0, `rgba(25,10,3,${0.8 * alpha})`); pit.addColorStop(0.55, `rgba(70,35,12,${0.45 * alpha})`); pit.addColorStop(1, 'rgba(70,35,12,0)');
  G.fillStyle = pit; G.beginPath(); G.ellipse(x, y, Z(18), Z(18) * SQ, 0, 0, Math.PI * 2); G.fill();
  if (glow > 0) { G.fillStyle = `rgba(255,160,60,${0.6 * glow})`; G.beginPath(); G.ellipse(x, y, Z(7), Z(7) * SQ, 0, 0, Math.PI * 2); G.fill(); }
}
const GOD_GLOW = { shiva: '150,205,255', murugan: '255,200,90', brahma: '255,240,205', krishna: '130,175,255' };
const unitDir2 = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
// A god rises in the sky and over the river around the island, blessing, while the fight goes on (small and
// medium boons). Never over the sand, so every attack stays visible; the fighters are drawn in front.
function drawGod(f, now) {
  const g = ART.gods[f.god], age = now - f.t0, k = clamp01(age / f.life);
  const a = clamp01(age / 0.3) * (1 - clamp01((age - f.life + 0.5) / 0.5)), rise = (1 - easeOut(clamp01(age / 0.7))) * 24;
  if (a <= 0) return;
  G.save();
  G.beginPath(); G.rect(-300, -300, W + 600, H + 600);
  G.ellipse(CX, CY, ARENA.r * SC * 1.03, ARENA.r * SC * SQ * 1.03 + 2, 0, 0, Math.PI * 2); G.clip('evenodd'); // everything but the sand
  const glow = G.createRadialGradient(CX, 70 + rise, 10, CX, 70 + rise, 230);
  glow.addColorStop(0, `rgba(255,225,150,${0.45 * a})`); glow.addColorStop(1, 'rgba(255,225,150,0)');
  G.fillStyle = glow; G.fillRect(-300, -300, W + 600, H + 600);
  if (g) place(g.fg || g.img, 0.62 + 0.04 * k, 0.5, 0.42, CX, 78 + rise, (g.fg ? 0.95 : 0.75) * a); // head and blessing hand above the far bank
  G.restore();
}

// the camera during a power-up: zoom toward the caster, ease in, hold, ease back out
function sceneCamera(m) {
  const s = m.scene; if (!s) return null;
  const p = m.players[s.pid], t = s.t, D = s.dur;
  const e = easeOut(clamp01(t / 0.35)) * (1 - easeOut(clamp01((t - (D - 0.3)) / 0.3)));
  return { e, z: 1 + 0.22 * e, fx: CX + (sx(p.x) - CX) * 0.6 * e, fy: H / 2 + (sy(p.y) - 22 - H / 2) * 0.5 * e };
}
// the world around the island becomes the power: the painting replaces sky, river and far bank, and only the
// sand floor stays (drawn right after the backdrop, inside the camera)
function sceneSky(m) {
  if (m.scene.name === 'Thousand-Arm Form') return; // the serene aureole stays in the sunlit arena
  const s = m.scene, p = m.players[s.pid], key = sceneKey(s.name), look = SCENE_LOOK[key] || {};
  const k2 = key && !ART.scenes[key] && look.fallback ? look.fallback : key; // e.g. a painting that isn't in yet
  const img = useArt && k2 ? ART.scenes[k2] : null, lay = img ? ART.sceneLayers[k2] : null, t = s.t, u = t / s.dur;
  const fade = clamp01(t / 0.35) * (1 - clamp01((t - s.dur + 0.25) / 0.25));
  if (!fade || !arenaDraw) return;
  G.save();
  G.setTransform(RES, 0, 0, RES, 0, 0); // the far background doesn't zoom with the camera (parallax)
  if (img) {
    place(lay ? lay.bg : img, 1.03 + 0.05 * u, 0.5, 0.42, CX - 8 * u, H * 0.42, fade);
    if (lay) { G.save(); G.globalCompositeOperation = 'screen'; place(lay.fg, 1.15, 0.3, 0.55, sx(p.x) < CX ? W * 0.28 : W * 0.72, H * 0.5, 0.65 * fade); G.restore(); } // the spirit form, towering behind
  } else {
    const g = G.createLinearGradient(0, 0, 0, H); g.addColorStop(0, look.bg ? look.bg[1] : '#000'); g.addColorStop(1, look.bg ? look.bg[0] : '#333');
    G.globalAlpha = fade; G.fillStyle = g; G.fillRect(-200, -200, W + 400, H + 400);
  }
  G.restore();
  // the sand island stays: redraw it from the arena picture, with a glowing rim
  const rx = ARENA.r * SC * 1.04, ry = rx * SQ;
  G.save(); G.beginPath(); G.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2); G.clip();
  G.imageSmoothingEnabled = true; G.drawImage(ART.arena, arenaDraw.x, arenaDraw.y, arenaDraw.w, arenaDraw.h);
  G.restore();
  ring(CX, CY, rx, ry, `rgba(${look.glow || '255,220,140'},${0.8 * fade})`, 1.5);
  ring(CX, CY, rx * 1.03, ry * 1.03 + 1, `rgba(${look.glow || '255,220,140'},${0.3 * fade})`, 3);
}
// dim everything but the caster, and raise an aura around them (inside the camera, over the fighters)
function sceneAura(m, now) {
  const s = m.scene, p = m.players[s.pid], look = SCENE_LOOK[sceneKey(s.name)] || { glow: '255,220,140', spark: '255,240,200' }, t = s.t;
  const fade = clamp01(t / 0.3) * (1 - clamp01((t - s.dur + 0.25) / 0.25)), x = sx(p.x), y = sy(p.y);
  const serene = s.name === 'Thousand-Arm Form';
  const dim = G.createRadialGradient(x, y - 20, 18, x, y - 20, 140);
  dim.addColorStop(0, 'rgba(0,0,0,0)'); dim.addColorStop(1, `rgba(5,3,12,${(serene ? 0.2 : 0.55) * fade})`);
  G.fillStyle = dim; G.fillRect(-300, -300, W + 600, H + 600);
  G.save(); G.globalCompositeOperation = 'lighter';
  const pulse = serene ? 0.94 + 0.06 * Math.sin(t * 3) : 0.75 + 0.25 * Math.sin(t * 12);
  const glow = G.createRadialGradient(x, y - 22, 2, x, y - 22, 34 * pulse);
  glow.addColorStop(0, `rgba(${look.glow},${0.55 * fade})`); glow.addColorStop(1, `rgba(${look.glow},0)`);
  G.fillStyle = glow; G.fillRect(x - 60, y - 90, 120, 120);
  ring(x, y + 1, Z(12) * (1 + 0.15 * Math.sin(t * 9)), Z(12) * SQ * (1 + 0.15 * Math.sin(t * 9)), `rgba(${look.glow},${0.9 * fade})`, 1.2);
  for (let i = 0; i < (serene ? 9 : 26); i++) { // energy rising up the body
    const life = (t * (0.9 + hash(i, 40)) + hash(i, 41)) % 1, a = hash(i, 42) * Math.PI * 2, r = 6 + hash(i, 43) * 10;
    G.fillStyle = `rgba(${look.spark},${(1 - life) * fade})`;
    G.beginPath(); G.arc(x + Math.cos(a) * r, y - life * 60, 0.5 + (1 - life) * 1.2, 0, Math.PI * 2); G.fill();
  }
  G.fillStyle = `rgba(${look.glow},${0.12 * fade * pulse})`; G.fillRect(x - 6, -200, 12, y + 200); // a faint pillar into the sky
  G.restore();
}
// the move's name, over everything
function sceneTitle(m) {
  const s = m.scene, p = m.players[s.pid], look = SCENE_LOOK[sceneKey(s.name)] || { glow: '255,220,140', spark: '255,240,200', sub: '' }, t = s.t;
  const bar = 22 * clamp01(t / 0.25) * (1 - clamp01((t - s.dur + 0.2) / 0.2));
  R(-10, -10, W + 20, bar + 10, '#000'); R(-10, H - bar, W + 20, bar + 10, '#000');
  const hit = clamp01((t - 0.35) / 0.3);
  if (hit > 0) {
    const e = easeOut(hit), sz = 1 + 1.6 * (1 - e), y = H - 58;
    G.globalAlpha = e * (1 - clamp01((t - s.dur + 0.3) / 0.3));
    txt(p.ch.name.toUpperCase(), CX, y - 14, p.ch.color, 'center');
    G.save(); G.translate(CX, y + 12); G.scale(sz, sz); txt(s.name.toUpperCase(), 0, -12, '#ffe7a0', 'center', 24, 'rgba(40,16,0,.9)'); G.restore();
    const lw = 140 * easeOut(clamp01((t - 0.6) / 0.4));
    R(CX - lw, y + 38, lw * 2, 1, `rgba(${look.glow},.9)`);
    if (look.sub) txt(look.sub, CX, y + 42, `rgba(${look.spark},.95)`, 'center', 8, 'rgba(0,0,0,.8)');
    G.globalAlpha = 1;
  }
  const flash = Math.max(0, 1 - t / 0.1) * 0.7 + clamp01((t - s.dur + 0.12) / 0.12) * 0.8;
  if (flash > 0.01) { G.fillStyle = `rgba(255,252,240,${flash})`; G.fillRect(0, 0, W, H); }
}

// The boon card: when a god grants a wish, say what it is, what it does and how to use it.
const TIER_LABEL = { small: 'A SMALL BOON', divine: 'A DIVINE WEAPON' };
export function drawOffer(o, p, hint, t) {
  const e = easeOut(clamp01(t / 0.3)), out = clamp01((t - 4) / 0.5), a = e * (1 - out);
  const w = 300, h = 74, x = CX - w / 2, y = H - 84 + (1 - e) * 20;
  G.save(); G.globalAlpha = a;
  const g = G.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(46,26,8,.95)'); g.addColorStop(1, 'rgba(22,12,4,.95)');
  box(x, y, w, h, 7, g, '#e8c060'); box(x + 3, y + 3, w - 6, h - 6, 5, null, 'rgba(232,192,96,.4)');
  txt(`${o.god.toUpperCase()} GRANTS ${p.ch.name.toUpperCase()} ${TIER_LABEL[o.tier] || 'A BOON'}`, CX, y + 7, '#c9b07a', 'center', 6);
  txt(o.name.toUpperCase(), CX, y + 17, o.tier === 'divine' ? '#fff2b0' : '#ffe7a0', 'center', 16, 'rgba(60,20,0,.9)');
  txt(o.desc || '', CX, y + 40, '#f0e6d0', 'center', 6);
  const pulse = 0.65 + 0.35 * Math.sin(t * 6);
  if (hint) {
    G.globalAlpha = a * pulse;
    txt(`USE IT ANY TIME: ${hint.keys}  OR PAD ${hint.pad}`, CX, y + 55, '#9fe07a', 'center', 6);
  } else txt('THE COMPUTER HOLDS IT', CX, y + 54, '#c8bce0', 'center', 6);
  G.restore();
}

// ---------- character select and the move / boon pages ----------
function wrap(text, max) { // split into lines of at most `max` characters, on spaces
  const out = []; let line = '';
  for (const w of String(text).split(' ')) { if ((line + ' ' + w).trim().length > max) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }
  if (line) out.push(line);
  return out;
}
function drawCard(ch, x, y, w, h, now) { // the Codex card art, or the fighter drawn large on a backdrop
  const img = ART.cards?.[ch.id];
  G.save(); G.beginPath(); G.roundRect(x, y, w, h, 5); G.clip();
  if (img) { G.imageSmoothingEnabled = true; G.drawImage(img, x, y, w, h); }
  else {
    const g = G.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, ch.cls === 'mage' ? '#123a4a' : '#5a1a10'); g.addColorStop(1, '#0a0608');
    G.fillStyle = g; G.fillRect(x, y, w, h);
    if (ART.sheets[ch.id]) { G.save(); G.translate(x + w / 2, y + h * 0.82); G.scale(2.2, 2.2); drawSprite(G, ch.id, 'walk', Math.floor(now * 5) % 4, 0, 0, false); G.restore(); }
  }
  const sh = G.createLinearGradient(0, y + h * 0.7, 0, y + h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.85)');
  G.fillStyle = sh; G.fillRect(x, y, w, h);
  G.restore();
  txt(ch.name.toUpperCase(), x + w / 2, y + h - 22, ch.color, 'center', 8);
  txt(ch.cls === 'mage' ? 'MAGE' : 'WARRIOR', x + w / 2, y + h - 11, '#c9b07a', 'center', 6);
}
const MOVE_ROWS = [['a1', 'ATK 1'], ['a2', 'ATK 2'], ['block', 'BLOCK'], ['s1', 'SP 1'], ['s2', 'SP 2'], ['s3', 'SP 3'], ['sig', 'SP 1+2+3'], ['cls', 'DOWN+SP 1']];
// a fighter's page, kept crisp: a button chip, the move's name and one short phrase, and its power cost
function drawMoveList(ch, x, y, w) {
  txt(ch.name.toUpperCase(), x, y, ch.color, 'left', 16);
  txt(ch.cls === 'mage' ? 'MAGE' : 'WARRIOR', x + w, y + 6, '#c9b07a', 'right', 8);
  wrap(ch.bio || '', Math.floor(w / 5.1)).slice(0, 2).forEach((l, i) => txt(l, x, y + 19 + i * 6, '#d8cfe8', 'left', 5));
  let yy = y + 34;
  for (const [slot, btn] of MOVE_ROWS) {
    const mv = slot === 'block' ? { name: ch.defence.name, short: ch.defence.short, cost: { power: ch.defence.cost } } : ch.moves[slot];
    const sig = slot === 'sig';
    box(x, yy, 50, 18, 3, sig ? 'rgba(120,80,20,.6)' : 'rgba(60,90,50,.45)', sig ? '#e8c060' : 'rgba(159,224,122,.6)');
    txt(btn, x + 25, yy + 6, sig ? '#ffe7a0' : '#bff0a8', 'center', 5);
    const c = mv.cost || {}, textW = w - 58 - 34; // the name and line never reach the cost column
    txtFit(mv.name.toUpperCase(), x + 58, yy + 2, sig ? '#ffcf6a' : '#fff', 'left', 8, textW);
    txtFit(`${mv.short || ''}${c.health ? `, costs ${c.health}% HP` : ''}`, x + 58, yy + 11, c.health ? '#ffb4a8' : '#c8bcd8', 'left', 6, textW);
    txt(`${c.power || 0}`, x + w, yy + 1, '#ffd34a', 'right', 8); // power cost, labelled so it reads as a cost
    txt('POWER', x + w, yy + 11, '#c9a24a', 'right', 5);
    yy += 22;
  }
}
// The fighter card on the select screen: five trait bars (ground rule 16's shared budget) and one line each for
// what the fighter is strong and weak at. The moves and keys are a page of their own (up).
const TRAITS = [['range', 'RANGE'], ['speed', 'SPEED'], ['defence', 'DEFENCE'], ['control', 'CONTROL'], ['burst', 'BURST']];
function drawTraitCard(ch, x, y, w, now) {
  txt(ch.name.toUpperCase(), x, y, ch.color, 'left', 16);
  txt(ch.cls === 'mage' ? 'MAGE' : 'WARRIOR', x + w, y + 6, '#c9b07a', 'right', 8);
  wrap(ch.bio || '', Math.floor(w / 5.1)).slice(0, 2).forEach((l, i) => txt(l, x, y + 20 + i * 7, '#d8cfe8', 'left', 5));
  let yy = y + 42;
  const pw = 22, gap = 3, px0 = x + w - 5 * (pw + gap) + gap;
  for (const [k, label] of TRAITS) {
    const v = ch.traits?.[k] || 0;
    txt(label, x, yy + 1, '#e8dcc0', 'left', 8);
    for (let i = 0; i < 5; i++) {
      const on = i < v, bx = px0 + i * (pw + gap);
      box(bx, yy, pw, 9, 2, on ? ch.color : 'rgba(255,255,255,.06)', on ? 'rgba(255,240,200,.55)' : 'rgba(201,162,74,.35)');
      if (on) R(bx + 2, yy + 1.5, pw - 4, 1.5, 'rgba(255,255,255,.35)'); // a little shine on the lit pips
    }
    yy += 19;
  }
  yy += 4;
  R(x, yy - 6, w, 0.6, 'rgba(201,162,74,.5)');
  txt('STRONG', x, yy + 2, '#9fe07a', 'left', 6); txtFit((ch.strong || '').toUpperCase(), x + 48, yy + 2, '#d8f5c8', 'left', 6, w - 48);
  txt('WEAK', x, yy + 16, '#ff8a7a', 'left', 6); txtFit((ch.weak || '').toUpperCase(), x + 48, yy + 16, '#ffd0c8', 'left', 6, w - 48);
  const blink = 0.55 + 0.45 * Math.sin(now * 4);
  txt('UP: MOVES AND KEYS', x + w / 2, yy + 36, `rgba(255,207,106,${blink})`, 'center', 6);
}
// how boons work, and every boon by tier
function drawBoonsPage(now) {
  R(0, 0, W, H, 'rgba(8,6,14,.94)'); covered();
  txt('BOONS OF THE GODS', CX, 8, '#ffcf6a', 'center', 16);
  const how = ['MEDITATE (DOWN + SPECIAL 1) BEHIND A BARRIER TO FILL 8 DEVOTION SEGMENTS.',
    'A WALL YOU BUILT STAYS UP WHILE YOU SIT.',
    'TWO SPECIALS ASK A RANDOM GOD FOR A BOON: 4 = SMALL, 8 = DIVINE WEAPON.',
    'THE GOD REVEALS IT AND YOU HOLD IT. TWO SPECIALS AGAIN USE IT, NOW OR LATER.',
    'A BOON ATTACK ALWAYS FINDS THE OPPONENT. ONLY ANOTHER ATTACK MEETING IT CAN WEAKEN IT.'];
  how.forEach((l, i) => txt(l, CX, 28 + i * 8, '#d8cfe8', 'center', 5));
  const tiers = [['SMALL  (4)', 0], ['DIVINE WEAPON  (8)', 1]], colW = 225;
  tiers.forEach(([label, ti], c) => {
    const x = 15 + c * colW + c * 3; let y = 72;
    box(x - 4, y - 4, colW, 172, 5, 'rgba(40,24,10,.6)', ti === 1 ? '#e8c060' : 'rgba(201,162,74,.6)');
    txt(label, x + colW / 2 - 4, y, ti === 1 ? '#fff2b0' : '#ffcf6a', 'center', 6); y += 12;
    for (const [gid, god] of Object.entries(GODS_LIST)) for (const b of god.tiers[ti]) {
      txt(b.name.toUpperCase(), x, y, '#fff', 'left', 5); txt(god.name.toUpperCase(), x + colW - 8, y, '#c9b07a', 'right', 5); y += 7;
      for (const l of wrap(b.desc || '', 44).slice(0, 3)) { txt(l, x + 3, y, '#c8bcd8', 'left', 5); y += 6; }
      y += 4;
    }
  });
  txt('BRAHMASTRA IS RARE UNLESS YOUR HEALTH IS LOW. DIVINE WEAPONS GO THROUGH A MEDITATION BARRIER.', CX, 250, '#9aa', 'center', 5);
}
export function drawSelect(now, o) {
  drawBackdrop(now);
  R(0, 0, W, H, 'rgba(8,6,14,.82)');
  if (o.boonsPage) { drawBoonsPage(now); txt('ANY KEY: BACK', CX, 260, '#ddd', 'center', 6); return; }
  if (o.movesPage) { // the focused fighter's moves and keys
    box(110, 12, 260, 236, 6, 'rgba(20,12,24,.85)', 'rgba(201,162,74,.6)'); drawMoveList(o.chars[o.ids[o.cursor[o.focus || 0]]], 120, 20, 240);
    txt('ANY KEY: BACK', CX, 260, '#ddd', 'center', 6); return;
  }
  txt('CHOOSE YOUR FIGHTER', CX, 6, '#ffcf6a', 'center', 16);
  const cw = 100, chh = 133, gap = 12, x0 = 14, y0 = 32;
  o.ids.forEach((id, i) => drawCard(o.chars[id], x0 + i * (cw + gap), y0, cw, chh, now));
  const humans = o.mode === '1p' ? [0] : [0, 1];
  for (const pid of humans) { // the players' cursors
    const i = o.cursor[pid], x = x0 + i * (cw + gap), col = pid === 0 ? '90,160,255' : '255,90,70', pulse = o.locked[pid] ? 1 : 0.6 + 0.4 * Math.sin(now * 6);
    G.save(); G.strokeStyle = `rgba(${col},${pulse})`; G.lineWidth = 2; G.beginPath(); G.roundRect(x - 2 - pid * 2, y0 - 2 - pid * 2, cw + 4 + pid * 4, chh + 4 + pid * 4, 6); G.stroke(); G.restore();
    const tag = o.mode === '1p' ? 'YOU' : `P${pid + 1}`;
    txt(o.locked[pid] ? `${tag} READY` : tag, x + (pid ? cw - 2 : 2), y0 + chh + 6, `rgb(${col})`, pid ? 'right' : 'left', 6);
  }
  if (o.mode === '1p') txt(o.tutorial ? 'THE OTHER ONE IS YOUR TRAINING DUMMY' : 'THE CPU TAKES THE OTHER FIGHTER', x0 + cw + gap / 2, y0 + chh + 18, '#9aa', 'center', 5);
  box(232, 28, 242, 222, 6, 'rgba(20,12,24,.85)', 'rgba(201,162,74,.6)');
  drawTraitCard(o.chars[o.ids[o.cursor[o.focus || 0]]], 242, 36, 222, now);
  txt(o.mode === '1p' ? 'LEFT/RIGHT CHOOSE   ENTER LOCK IN   UP: MOVES   DOWN: BOONS' : 'LEFT/RIGHT CHOOSE   ATTACK 1 LOCK IN   UP: MOVES   DOWN: BOONS', CX, 258, '#ddd', 'center', 5);
}
// pause menu pages: page 0 and 1 = the two fighters in this match, 2 = boons
export function drawInfo(page, chs) {
  R(0, 0, W, H, 'rgba(8,6,14,.94)'); covered();
  if (page === 2) drawBoonsPage(0);
  else if (page === 3) drawControls();
  else { box(110, 12, 260, 236, 6, 'rgba(20,12,24,.85)', 'rgba(201,162,74,.6)'); drawMoveList(chs[page], 120, 20, 240); }
  txt(`< ${['P1 FIGHTER', 'P2 FIGHTER', 'BOONS', 'CONTROLS'][page]} >    LEFT/RIGHT: NEXT PAGE    ESC: BACK`, CX, 260, '#ddd', 'center', 6);
}

// ---------- screens ----------
// The controls, for both key sets and the pad (moved off the title screen, owner 2026-11-08).
function drawControls(pads = 0) {
  R(0, 0, W, H, 'rgba(8,6,14,.94)'); covered();
  txt('CONTROLS', CX, 8, '#ffcf6a', 'center', 16);
  const k3 = (k, n) => k.slice(0, n).map(KEY_NAME).join('+');
  const sp = (K) => ['s1', 's2', 's3'].map((s) => K[s][0]);
  const mv = (K) => (K.up[0] === 'ArrowUp' && K.left[0] === 'ArrowLeft' && K.down[0] === 'ArrowDown' && K.right[0] === 'ArrowRight' ? 'ARROWS' : ['up', 'left', 'down', 'right'].map((a) => KEY_NAME(K[a][0])).join(''));
  const pn = (a) => PAD_NAMES[PAD[a]] || `#${PAD[a]}`;
  const rows = [['MOVE', mv(KEYS[0]), mv(KEYS[1]), 'STICK'],
    ...['a1', 'a2', 'block', 's1', 's2', 's3'].map((a) => [{ a1: 'ATTACK 1', a2: 'ATTACK 2 (CLOSE)', block: 'BLOCK', s1: 'SPECIAL 1', s2: 'SPECIAL 2', s3: 'SPECIAL 3' }[a], KEYS[0][a].map(KEY_NAME).join('/'), KEYS[1][a].map(KEY_NAME).join('/'), pn(a)]),
    ['SIGNATURE: ALL 3 SPECIALS', k3(sp(KEYS[0]), 3), k3(sp(KEYS[1]), 3), `${pn('s1')}+${pn('s2')}+${pn('s3')}`],
    ['BOON: 2 SPECIALS', k3(sp(KEYS[0]), 2), k3(sp(KEYS[1]), 2), `${pn('s1')}+${pn('s2')}`],
    ['MEDITATE: DOWN + SPECIAL 1', `${KEY_NAME(KEYS[0].down[0])}+${KEY_NAME(KEYS[0].s1[0])}`, `${KEY_NAME(KEYS[1].down[0])}+${KEY_NAME(KEYS[1].s1[0])}`, `DOWN+${pn('s1')}`],
    ['PAUSE', 'ESC', 'ESC', 'START']];
  let y = 40;
  [['', 30], ['P1', 250], ['P2', 320], ['PAD', 405]].forEach(([t, x]) => txt(t, x, y, '#9aa', 'left', 8));
  y += 14;
  rows.forEach((r, i) => {
    if (i % 2 === 0) R(24, y - 3, 432, 15, 'rgba(255,255,255,.04)');
    const combo = i >= 7 && i <= 9;
    txt(r[0], 30, y, combo ? '#ffcf6a' : '#ddd', 'left', 6);
    r.slice(1).forEach((v, j) => txt(v, [250, 320, 405][j], y, '#fff', 'left', 6));
    y += 15;
  });
  txt(`M: SOUND   \`: FULLSCREEN   PADS: ${pads}   REMAP: TITLE OR PAUSE > CONTROLS`, CX, y + 8, '#9aa', 'center', 5);
}
// Title screen: the Codex key art (art/title.png), the logo and 'press start'.
export function drawTitle(now, pads, sel = 0) {
  const img = ART.title;
  if (img) { const sc = Math.max(W / img.width, H / img.height), w = img.width * sc, h = img.height * sc; G.imageSmoothingEnabled = true; G.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }
  else { drawBackdrop(now); drawArena(); R(0, 0, W, H, 'rgba(10,12,20,.5)'); }
  const top = G.createLinearGradient(0, 0, 0, 80); top.addColorStop(0, 'rgba(0,0,0,.6)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  G.fillStyle = top; G.fillRect(0, 0, W, 80);
  const glow = 0.5 + 0.5 * Math.sin(now * 2);
  // the name: Porkalam ('the battlefield'), in pixel letters and in Tamil script (owner, 2026-11-08)
  G.save(); G.shadowColor = `rgba(255,190,90,${0.6 + 0.3 * glow})`; G.shadowBlur = 10;
  txt('PORKALAM', CX, 10, '#ffcf6a', 'center', 32, 'rgba(60,20,0,.95)');
  G.font = '900 22px "Noto Serif Tamil", serif'; G.textAlign = 'center'; G.textBaseline = 'top';
  const tg = G.createLinearGradient(0, 46, 0, 72); tg.addColorStop(0, '#fff2b0'); tg.addColorStop(1, '#e09a2a');
  G.lineWidth = 3; G.strokeStyle = 'rgba(60,20,0,.95)'; G.strokeText('போர்க்களம்', CX, 44);
  G.fillStyle = tg; G.fillText('போர்க்களம்', CX, 44);
  G.restore();
  txt('INSPIRED BY INDIAN MYTHOLOGY', CX, 76, '#f0dca8', 'center', 7);
  const bot = G.createLinearGradient(0, H - 50, 0, H); bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,.7)');
  G.fillStyle = bot; G.fillRect(0, H - 50, W, 50);
  const bg = G.createLinearGradient(0, H - 70, 0, H); bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,.55)');
  G.fillStyle = bg; G.fillRect(0, H - 70, W, 70);
  ['PLAY', 'TUTORIAL', 'CONTROLS'].forEach((s, i) => {
    const on = i === sel, y = H - 54 + i * 14;
    if (on) box(CX - 60, y - 3, 120, 13, 4, 'rgba(255,207,106,.18)', 'rgba(255,207,106,.6)');
    txt(on ? `> ${s} <` : s, CX, y, on ? '#ffe7a0' : '#d8cfb8', 'center', 8);
  });
  txt('M: SOUND', 6, H - 10, '#c8bca0', 'left', 5);
  txt(`PADS: ${pads}`, W - 6, H - 10, '#c8bca0', 'right', 5);
}

export function drawSetup(now, o) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.65)');
  txt('MATCH SETUP', CX, 40, '#ffcf6a', 'center', 16);
  const names = ['SIDDHAN (MAGE)', 'VEERAN (WARRIOR)'];
  const show = {
    mode: ['PLAYERS', o.mode === '1p' ? '1 PLAYER VS CPU' : '2 PLAYERS'],
    level: ['CPU LEVEL', o.levelName],
    length: ['LENGTH', `${o.minutes} MIN`],
  };
  o.rows.forEach((r, i) => {
    const y = 84 + i * 24, on = i === o.row, [label, val] = show[r];
    if (on) R(CX - 170, y - 5, 340, 18, 'rgba(255,207,106,.15)');
    txt(label, CX - 160, y, on ? '#ffcf6a' : '#ddd');
    txt(on ? `<  ${val}  >` : val, CX + 160, y, on ? '#ffcf6a' : '#fff', 'right');
  });
  const tip = o.mode === '1p' ? 'YOU PICK YOUR FIGHTER NEXT; THE CPU TAKES THE OTHER ONE.' : 'BOTH PLAYERS PICK THEIR FIGHTER NEXT.';
  txt(tip, CX, 200, '#9aa', 'center');
  txt('UP/DOWN PICK  LEFT/RIGHT CHANGE  ENTER FIGHT  ESC BACK', CX, 220, '#ddd', 'center');
}

export function drawPause(sel, items = ['RESUME', 'MOVES & BOONS', 'CONTROLS', 'QUIT TO TITLE']) {
  R(0, 0, W, H, 'rgba(0,0,0,.6)'); covered();
  txt('PAUSED', CX, 80, '#fff', 'center', 16);
  items.forEach((s, i) => txt((i === sel ? '> ' : '  ') + s, CX, 114 + i * 16, i === sel ? '#ffcf6a' : '#ddd', 'center'));
}

// ---------- Controls screen: remap keys and pad buttons ----------
const REMAP_LABEL = { up: 'MOVE UP', down: 'MOVE DOWN', left: 'MOVE LEFT', right: 'MOVE RIGHT', a1: 'ATTACK 1', a2: 'ATTACK 2 (CLOSE)', block: 'BLOCK', s1: 'SPECIAL 1', s2: 'SPECIAL 2', s3: 'SPECIAL 3' };
export function drawRemap(now, c, pads = 0) {
  R(0, 0, W, H, 'rgba(8,6,14,.94)'); covered();
  txt('CONTROLS', CX, 8, '#ffcf6a', 'center', 16);
  const COLS = [236, 316, 396], CW = 70, y0 = 46, rh = 13;
  ['P1 KEYS', 'P2 KEYS', 'PAD'].forEach((t, i) => txt(t, COLS[i] + CW / 2, 32, i === c.col ? '#ffcf6a' : '#9aa', 'center', 6));
  REMAP.forEach((a, r) => {
    const y = y0 + r * rh, on = r === c.row;
    if (r % 2 === 0) R(40, y - 3, 430, rh, 'rgba(255,255,255,.04)');
    txt(REMAP_LABEL[a], 50, y, on ? '#ffcf6a' : '#ddd', 'left', 6);
    const vals = [KEY_NAME(KEYS[0][a][0]), KEY_NAME(KEYS[1][a][0]), ACTIONS.includes(a) ? PAD_NAMES[PAD[a]] || `#${PAD[a]}` : 'STICK'];
    vals.forEach((v, i) => {
      const sel = on && i === c.col, wait = sel && c.listen;
      if (sel) box(COLS[i], y - 3, CW, rh - 1, 3, wait ? 'rgba(255,207,106,.35)' : 'rgba(255,207,106,.15)', '#ffcf6a');
      const show = wait ? (Math.floor(now * 3) % 2 ? (i === 2 ? 'BUTTON?' : 'KEY?') : '') : v;
      txt(show, COLS[i] + CW / 2, y, wait ? '#fff2b0' : i === 2 && !ACTIONS.includes(a) ? '#777' : '#fff', 'center', 6);
    });
  });
  const yr = y0 + REMAP.length * rh + 6;
  ['RESET TO DEFAULTS', 'BACK'].forEach((s, i) => {
    const on = c.row === REMAP.length + i, y = yr + i * 14;
    if (on) box(CX - 80, y - 3, 160, 12, 3, 'rgba(255,207,106,.15)', '#ffcf6a');
    txt(s, CX, y, on ? '#ffcf6a' : '#ddd', 'center', 6);
  });
  const my = yr + 32;
  if (c.listen) txt(c.col === 2 ? 'PRESS A BUTTON ON THE PAD    ESC: CANCEL' : `PRESS A KEY FOR P${c.col + 1} ${REMAP_LABEL[REMAP[c.row]]}    ESC: CANCEL`, CX, my, '#fff2b0', 'center', 6);
  else if (c.msg && now - c.msg.t0 < 4) txtFit(c.msg.text, CX, my, c.msg.good ? '#9fe07a' : '#ffb4a8', 'center', 6, 460);
  txt('ARROWS: PICK   ENTER: CHANGE   ESC: BACK', CX, H - 12, '#ddd', 'center', 5);
  txt('A KEY THAT IS ALREADY USED SWAPS WITH THE OLD ONE.  SAVED IN THIS BROWSER.', CX, H - 22, '#9aa', 'center', 5);
}

// ---------- tutorial lesson card ----------
// Explaining lessons: a big card in the middle (the fight waits). Doing lessons: a slim card under the HUD.
export function drawTutorial(v, now) {
  if (v.info) {
    R(0, 0, W, H, 'rgba(6,4,12,.55)');
    if (v.id === 'hud') { // point at the parts of the screen being explained
      const a = 0.55 + 0.45 * Math.sin(now * 5);
      G.save(); G.strokeStyle = `rgba(255,231,160,${a})`; G.lineWidth = 1.5;
      for (const [x, y, w, h] of [[43, 13, 120, 14], [43, 26, 120, 9], [43, 34, 150, 9], [CX - 36, 1, 72, 36]]) { G.beginPath(); G.roundRect(x, y, w, h, 3); G.stroke(); }
      G.restore();
    }
    const w = 380, lines = v.lines.flatMap((l) => wrap(l.toUpperCase(), 58)), h = 54 + lines.length * 10, x = CX - w / 2, y = Math.max(64, 150 - h / 2);
    const g = G.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(40,24,52,.96)'); g.addColorStop(1, 'rgba(18,10,26,.96)');
    box(x, y, w, h, 7, g, '#e8c060');
    txt(`LESSON ${v.n}/${v.of}`, x + 10, y + 8, '#a898c0', 'left', 5);
    txt('TUTORIAL', x + w - 10, y + 8, '#a898c0', 'right', 5);
    txt(v.title, CX, y + 16, '#ffcf6a', 'center', 10);
    lines.forEach((l, i) => txt(l, CX, y + 34 + i * 10, '#f0e6d0', 'center', 6));
    G.save(); G.globalAlpha = 0.6 + 0.4 * Math.sin(now * 5);
    txt(`PRESS ${v.confirm} TO CONTINUE`, CX, y + h - 12, '#9fe07a', 'center', 5);
    G.restore();
    return;
  }
  // a doing lesson: "PRESS [F] TO ATTACK", the keys drawn as gold key caps
  const w = 400, x = CX - w / 2, y = 62, h = v.lines[1] ? 46 : 36;
  box(x, y, w, h, 6, 'rgba(18,10,26,.86)', v.done ? '#9fe07a' : 'rgba(232,192,96,.8)');
  txt(`${v.n}/${v.of}  ${v.title}`, x + 8, y + 5, '#a898c0', 'left', 5);
  if (v.done) txt('WELL DONE!', x + w - 8, y + 5, '#9fe07a', 'right', 6);
  else if (v.progress) txt(v.progress, x + w - 8, y + 5, '#fff2b0', 'right', 5);
  const parts = v.lines[0].toUpperCase().split(/(\[[^\]]+\])/).filter(Boolean), SZ = 10;
  G.font = `${SZ}px ${FONT}`;
  const widths = parts.map((t) => (t.startsWith('[') ? G.measureText(t.slice(1, -1)).width + 8 : G.measureText(t).width));
  let px = CX - widths.reduce((a, b) => a + b, 0) / 2;
  const pulse = 0.7 + 0.3 * Math.sin(now * 6);
  parts.forEach((t, i) => {
    if (t.startsWith('[')) {
      box(px, y + 14, widths[i], SZ + 6, 3, `rgba(255,207,106,${0.25 * pulse})`, '#ffcf6a');
      txt(t.slice(1, -1), px + widths[i] / 2, y + 17, '#fff2b0', 'center', SZ);
    } else txt(t, px, y + 17, '#fff', 'left', SZ);
    px += widths[i];
  });
  if (v.lines[1]) txt(v.lines[1].toUpperCase(), CX, y + 35, '#c8bcd8', 'center', 5);
}

// t = seconds since the match ended: first the call (K.O. / TIME!) over the knockout, then the result fades in.
export function drawResult(m, sel, t = 9) {
  const r0 = m.result;
  if (t < 1.6) {
    const e = easeOut(clamp01(t / 0.25)), word = { ko: 'K.O.', double: 'DOUBLE K.O.', time: 'TIME!', brahmastra: 'BRAHMASTRA' }[r0.reason] || 'K.O.';
    G.save(); G.translate(CX, 130); G.scale(1 + 1.5 * (1 - e), 1 + 1.5 * (1 - e)); G.globalAlpha = Math.min(1, e * 1.2) * (t > 1.3 ? (1.6 - t) / 0.3 : 1);
    txt(word, 0, -12, '#ffe7a0', 'center', 24, 'rgba(60,10,0,.95)');
    G.restore();
    if (t < 1.2) return;
  }
  G.globalAlpha = clamp01((t - 1.2) / 0.4);
  R(0, 44, W, H - 44, 'rgba(0,0,0,.6)');
  const r = m.result, why = { ko: 'KNOCKOUT', time: 'TIME UP', double: 'DOUBLE KNOCKOUT', brahmastra: 'BRAHMASTRA' }[r.reason];
  txt(why, CX, 80, '#ddd', 'center');
  txt(r.winner == null ? 'DRAW' : `${m.players[r.winner].ch.name.toUpperCase()} WINS`, CX, 100, r.winner == null ? '#fff' : m.players[r.winner].ch.color, 'center', 16);
  m.players.forEach((p, i) => txt(`${p.ch.name}: ${Math.ceil(p.hp)}% health, dealt ${Math.round(p.stats.dealt)}%`, CX, 134 + i * 12, '#ddd', 'center'));
  ['REMATCH', 'MATCH SETUP', 'TITLE'].forEach((s, i) => txt((i === sel ? '> ' : '  ') + s, CX, 176 + i * 14, i === sel ? '#ffcf6a' : '#ddd', 'center'));
  G.globalAlpha = 1;
}

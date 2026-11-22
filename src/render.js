// Drawing on a 480x270 canvas: the generated art (src/art.js) where it exists, grey-box shapes otherwise.
// Only reads the match state.
import { W, H, RES, ARENA, TUNE } from './config.js';
import { ACTIONS, LABELS, KEYS, KEY_NAME, PAD, PAD_NAMES, REMAP } from './input.js';
import { opponent, chargeOf, airborne } from './sim.js';
import { ART, drawSprite, drawFx as fxSprite, drawPortrait, POSES, AIR_POSES } from './art.js';
import { GODS as GODS_LIST } from './chars/gods.js';
import { damageReset, damageTrack, drawDamage } from './damage.js';
import { warOn, warUpdate, warDrawBack, warDrawGround, warActors } from './war.js';
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
const VIEW = { floor: 0.84, cy: 165 }; // a bigger arena (ARENA.r over 121) is drawn bigger on screen, so fighters and effects keep their size (fitView); // floor width as a share of the screen; where its centre sits (below the HUD)
export function fitView() {
  const img = ART.arena, f = ART.fit;
  if (!useArt || !img) { CY = 160; SQ = 0.62; SC = 1; arenaDraw = null; return; }
  // zoom in so the floor fills VIEW.floor of the screen width, but never so little that the picture leaves a gap
  const grow = ARENA.r / ARENA.sizes.river, floor = Math.min(0.97, VIEW.floor * grow), cy = VIEW.cy + 7 * (grow - 1) / 0.15;
  const s = Math.max(W / img.width, H / img.height, (floor * W) / (2 * f.rx * img.width));
  const w = img.width * s, h = img.height * s;
  SC = (f.rx * img.width * s) / ARENA.r;             // the floor's half-width = the arena radius
  SQ = (f.ry * img.height) / (f.rx * img.width);
  // floor centred on CX and VIEW.cy; y is nudged if that would leave a gap above or below the picture
  const x = CX - f.cx * w, y = Math.min(0, Math.max(H - h, cy - f.cy * h));
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
// The battlefield has no water: dust haze rolling across, embers from the burning tents, ash falling.
// (The live army, banners and smoke columns come from ChatGPT frame sheets, art/prompts_battlefield.txt.)
function drawWarAmbient(now) {
  const rx = ARENA.r * SC, ry = rx * SQ;
  const inFloor = (x, y) => ((x - CX) / rx) ** 2 + ((y - CY) / ry) ** 2 < 1;
  G.save();
  for (let i = 0; i < 7; i++) { // low banks of battle dust drifting along behind the floor
    const sp = 5 + hash(i, 20) * 6, x = ((now * sp + hash(i, 21) * (W + 200)) % (W + 200)) - 100, y = CY - ry - 8 + hash(i, 22) * 18;
    const r = 40 + hash(i, 23) * 50, g = G.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(190,120,70,${0.16 + 0.08 * Math.sin(now * 0.4 + i)})`); g.addColorStop(1, 'rgba(190,120,70,0)');
    G.fillStyle = g; G.beginPath(); G.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2); G.fill();
  }
  for (let i = 0; i < 40; i++) { // embers rising from the fires, swaying in the heat
    const sp = 6 + hash(i, 10) * 9, y = H + 10 - ((now * sp + hash(i, 11) * (H + 20)) % (H + 20)), x = hash(i, 12) * W + Math.sin(now * 1.1 + i) * 8;
    const a = 0.4 + 0.6 * Math.max(0, Math.sin(now * 3 + i * 1.7));
    G.fillStyle = `rgba(255,140,60,${0.2 * a})`; G.beginPath(); G.arc(x, y, 2, 0, Math.PI * 2); G.fill();
    G.fillStyle = `rgba(255,214,140,${0.9 * a})`; G.beginPath(); G.arc(x, y, 0.55, 0, Math.PI * 2); G.fill();
  }
  for (let i = 0; i < 30; i++) { // grey ash drifting down, tumbling
    const sp = 5 + hash(i, 30) * 5, y = ((now * sp + hash(i, 31) * (H + 20)) % (H + 20)) - 10, x = hash(i, 32) * W + Math.sin(now * 0.7 + i * 2) * 10;
    if (inFloor(x, y)) continue;
    const s = 0.5 + hash(i, 33) * 0.8, t = Math.sin(now * 2 + i);
    G.fillStyle = 'rgba(70,60,60,.55)'; G.fillRect(x, y, s * (1 + Math.abs(t)), s);
  }
  G.restore();
}
// The battlefield's life (owner 2026-11-16): the painted armies stay still (looped army frames only bobbed in place
// and looked fake); what moves is what would look right from afar: smoke rising over the painted fires, big war
// banners snapping in the wind at the edges, battle dust drifting along the back of the clearing, and now and then
// a volley of arrows crossing the sky. All ChatGPT frame sheets, crossfaded. Places are in the painting's pixels.
const WAR = {
  smoke: [{ x: 452, y: 200, s: 0.42, ph: 0 }, { x: 705, y: 205, s: 0.36, ph: 3 }, { x: 1318, y: 205, s: 0.4, ph: 5 }], // over the fires in the old arena_battlefield.png (?war=0)
  sky: { name: 'skyArrows', n: 8, fps: 8, ground: 250, scale: 1.0, drift: 0, alpha: 0.85, every: 11, show: 3.5 }, // a volley every 11 s
  dust: { name: 'dustBand', n: 8, fps: 4, ground: 300, scale: 0.6, drift: 12, alpha: 0.55, foot: 0 },
  props: [
    { name: 'tigerFlag', from: 1, n: 16, x: 12, y: 500, w: 230, fps: 9, anchor: 'left', foot: 0.03 }, // pole at the cell's edge
    { name: 'fishFlag', from: 1, n: 16, x: 1660, y: 500, w: 230, fps: 9, anchor: 'right', foot: 0.03, ph: 7 },
  ],
};
function drawWarLive(now) {
  const a = arenaDraw, X = (x) => a.x + x * a.s, Y = (y) => a.y + y * a.s;
  const blend = (pre, n, fps, ph, from, draw) => { // frame i fading into i+1, so painted frames flow instead of popping
    const t = now * fps + ph, i = Math.floor(t) % n, k = t - Math.floor(t);
    draw(pre + (from + i), 1); draw(pre + (from + (i + 1) % n), k);
  };
  const band = (L, fade = 1) => { // a full-width band, tiled side to side, drifting
    const c = ART.fx[L.name + '1'];
    if (!c || fade <= 0) return;
    const w = c.w * L.scale * a.s, h = c.h * L.scale * a.s, bottom = Y(L.ground) + h * (L.foot || 0);
    const off = ((now * L.drift * a.s) % w + w) % w;
    for (let x = a.x - w + off; x < a.x + a.w + w; x += w) blend(L.name, L.n, L.fps, 0, 1, (nm, al) => fxSprite(G, nm, x + w / 2, bottom, w, { h, anchor: 'bottom', alpha: (L.alpha ?? 1) * al * fade }));
  };
  const S = WAR.sky, ts = now % S.every; // the volley rises, crosses and fades (the live war's director sends its own, at random)
  if (!warOn && ts < S.show) band(S, Math.min(1, ts / 0.6, (S.show - ts) / 0.8));
  // the live painting has its own fires and smoke; these burning-tent loops (made for the old painting) stood out bigger than its
  // tents with a pink rim (owner 2026-11-22: "something feels off in the huts"), so only the old painting keeps them
  if (!warOn) for (const b of WAR.smoke) { const c = ART.fx.smokeCol1; if (c) blend('smokeCol', 8, 6, b.ph, 1, (nm, al) => fxSprite(G, nm, X(b.x), Y(b.y), c.w * b.s * a.s, { anchor: 'bottom', alpha: al })); }
  band(WAR.dust);
  // the live painting (war on) has its own big banners in the top corners; these edge banners stood on the arena's rim and
  // fighters at the edge were drawn over their poles (owner 2026-11-22: "the flags don't feel right"), so only the old painting keeps them
  if (!warOn) for (const P of WAR.props) {
    const c = ART.fx[P.name + P.from];
    if (!c) continue;
    const w = P.w * a.s, h = w * c.h / c.w, x = P.anchor === 'left' ? X(P.x) + w / 2 - w * 0.06 : P.anchor === 'right' ? X(P.x) - w / 2 + w * 0.06 : X(P.x);
    blend(P.name, P.n || 8, P.fps, P.ph || 0, P.from, (nm, al) => fxSprite(G, nm, x, Y(P.y) + h * (P.foot || 0), w, { h, anchor: 'bottom', alpha: al }));
  }
}
function drawAmbient(now) {
  if (ART.theme === 'battlefield') return drawWarAmbient(now);
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
    if (ART.theme === 'battlefield') drawWarLive(now);
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
    else if (ART.lavaFloor && c.lava) drawLava(c, k, now); // the gap the sunk half leaves (its far rim, the chasm) fills with the same lava, not black
    else { G.fillStyle = `rgba(255,120,40,${0.25 * k * (0.7 + 0.3 * Math.sin(now * 5))})`; G.fillRect(0, 0, W, H); } // lava glow far below
    G.restore();
    G.save(); G.translate(0, dy); clip(side);
    G.imageSmoothingEnabled = true; G.drawImage(ART.arena, arenaDraw.x, arenaDraw.y, arenaDraw.w, arenaDraw.h); G.imageSmoothingEnabled = false;
    if (side > 0) { G.fillStyle = `rgba(20,6,0,${0.22 * k})`; G.fillRect(0, 0, W, H); drawLava(c, k, now); } // the sunk half sits in shadow, and burns
    G.restore();
  }
  drawCliffFaces(c, k, rx, ry, clip);
}

// The torn rock face (art/lava_cliff.png, lava dripping down it) in the gaps the split opens: under the raised
// half's front rim, and along the chasm when the raised half is the far one (its broken edge faces the camera).
// Drawn as thin vertical slices so the strip follows the curved rim.
const CLIFF_SRC = { y: 150, h: 215 }; // the rock band in the strip image, top lip to bottom rubble
function drawCliffFaces(c, k, rx, ry, clip) {
  const img = ART.lavaCliff;
  if (!img || k < 0.05) return;
  const h = SPLIT.lift * k, step = 2;
  const slice = (x, top, hh) => { const s = hh / CLIFF_SRC.h, sw = step / s; G.drawImage(img, (((x - CX) / s) % (img.width - sw) + (img.width - sw)) % (img.width - sw), CLIFF_SRC.y, sw, CLIFF_SRC.h, x, top, step + 0.5, hh); };
  G.save(); G.imageSmoothingEnabled = true;
  G.save(); clip(-1); // the raised half's front rim: the band it uncovered by rising
  for (let x = CX - rx; x < CX + rx; x += step) { const u = (x - CX) / rx, yb = CY + ry * Math.sqrt(Math.max(0, 1 - u * u)); slice(x, yb - h, h + 2); }
  G.restore();
  if (c.ny > 0) { // the raised half is behind the chasm: its torn edge faces us, from its lifted rim down to the sunk floor
    const tx = -c.ny, ty = c.nx, a = [sx(c.x - tx * 400), sy(c.y - ty * 400)], b = [sx(c.x + tx * 400), sy(c.y + ty * 400)];
    G.beginPath(); G.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2); G.clip();
    const deep = h + SPLIT.sink * k;
    for (let x = Math.max(CX - rx, Math.min(a[0], b[0])); x < Math.min(CX + rx, Math.max(a[0], b[0])); x += step) {
      const y = a[1] + ((x - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]); slice(x, y - h, deep + 1);
    }
  }
  G.restore();
}

// The sunk half is lava (it burns anyone standing there): a red cast, glowing cracks that pulse, and bubbles that
// swell and pop. Drawn in world positions so it stays put on the floor.
function drawLava(c, k, now) {
  if (k <= 0.01) return;
  if (ART.lavaFloor) { drawLavaArt(c, k, now); return; }
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

// The painted lava (art/lava_floor.png): it spreads out from the chasm as the half sinks (the sand melts), two
// layers of the texture drift against each other so the crust looks like it floats, the glow pulses and is
// hottest along the chasm, and embers rise off it. Laid on the floor in the 3/4 view (squashed by SQ).
const LAVA = { tile: 70, melt: 1.1, pat: null }; // one tile of the texture in world units; seconds for the lava to cover the half
function drawLavaArt(c, k, now) {
  const age = c.time - c.t, reach = ARENA.r * 2.2 * easeOut(clamp01((age - CRACK) / LAVA.melt));
  if (reach <= 1) return;
  const tx = -c.ny, ty = c.nx, B = 2000, at = (s, u) => [sx(c.x + c.nx * s + tx * u), sy(c.y + c.ny * s + ty * u)];
  G.save();
  G.beginPath(); [at(0, -B), at(0, B), at(reach, B), at(reach, -B)].forEach(([x, y], i) => (i ? G.lineTo(x, y) : G.moveTo(x, y))); G.closePath(); G.clip();
  const layer = (scale, dx, dy, alpha, op) => {
    const pat = LAVA.pat || (LAVA.pat = G.createPattern(ART.lavaFloor, 'repeat')), s = (LAVA.tile * scale * SC) / ART.lavaFloor.width;
    pat.setTransform(new DOMMatrix().translate(CX + dx * SC, CY + dy * SC * SQ).scale(s, s * SQ));
    G.globalCompositeOperation = op; G.globalAlpha = alpha; G.fillStyle = pat; G.fillRect(0, 0, W, H);
  };
  G.imageSmoothingEnabled = true;
  const pulse = 0.75 + 0.25 * Math.sin(now * 2.2);
  layer(1, now * 1.6, now * 0.9, k, 'source-over');                     // the crust, drifting slowly
  layer(1.37, -now * 2.3, now * 1.4, 0.32 * k * pulse, 'lighter');       // a second, larger layer: the molten glow shifting under it
  G.globalCompositeOperation = 'source-over'; G.globalAlpha = 1;
  const ga = at(0, 0), gb = at(ARENA.r * 0.8, 0), grd = G.createLinearGradient(ga[0], ga[1], gb[0], gb[1]); // hottest along the chasm
  grd.addColorStop(0, `rgba(255,170,60,${0.35 * k * pulse})`); grd.addColorStop(1, 'rgba(255,90,20,0)');
  G.globalCompositeOperation = 'lighter'; G.fillStyle = grd; G.fillRect(0, 0, W, H); G.globalCompositeOperation = 'source-over';
  if (reach < ARENA.r * 2.1) { // the melting front: a bright rim where the sand is turning to lava
    const [x0, y0] = at(reach, -B), [x1, y1] = at(reach, B);
    G.lineCap = 'round';
    G.strokeStyle = `rgba(255,120,30,${0.6 * k})`; G.lineWidth = 7; G.beginPath(); G.moveTo(x0, y0); G.lineTo(x1, y1); G.stroke();
    G.strokeStyle = `rgba(255,235,170,${0.9 * k})`; G.lineWidth = 2; G.beginPath(); G.moveTo(x0, y0); G.lineTo(x1, y1); G.stroke();
  }
  for (let i = 0; i < 30; i++) { // embers: rise, drift and fade, each on its own clock
    const per = 1.6 + hash01(i + 400) * 1.4, ph = ((now + hash01(i + 500) * per) % per) / per;
    const s0 = 6 + hash01(i + 600) * ARENA.r * 1.5; if (s0 > reach) continue;
    const [x, y] = at(s0, (hash01(i + 700) - 0.5) * ARENA.r * 1.9);
    const a = Math.sin(ph * Math.PI) * k, r = 0.8 + hash01(i + 800) * 1.2;
    R(x + Math.sin(now * 2 + i) * 4 * ph, y - ph * 34, r, r, `rgba(255,${170 + 70 * (1 - ph)},90,${a})`);
  }
  G.restore();
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
// Draw one whole cell of a stage sheet (fullCells in art.js). upp = layout units per cell pixel (cells are 512 px);
// cell point (256, ay*512) lands on (x, y). o: from/to = which rows (0..1), sx = horizontal squash, alpha, add (glow),
// lift = pushed down by this much and cut off at row `ground` (rising out of the sand).
function drawCell(name, x, y, upp, ay, o = {}) {
  const f = fxArt(name);
  if (!f) return false;
  const dw = 512 * upp * (f.w / f.h) * (o.sx ?? 1), dh = 512 * upp * (o.sy ?? 1), lift = o.lift ?? 0; // cells are 512 px tall
  const r0 = o.from ?? 0, r1 = Math.min(o.to ?? 1, lift ? (o.ground ?? 1) - lift / dh : 1);
  if (r1 <= r0) return true;
  G.save();
  if (o.alpha != null) G.globalAlpha *= o.alpha;
  if (o.add) G.globalCompositeOperation = 'lighter';
  G.imageSmoothingEnabled = true;
  G.drawImage(f.canvas, f.x, f.y + f.h * r0, f.w, f.h * (r1 - r0), x - dw / 2, y - ay * dh + r0 * dh + lift, dw, dh * (r1 - r0));
  G.restore();
  return true;
}

// ---------- debris: chips, shards, splinters, dust, smoke, and pieces of a broken sprite ----------
// Each bit flies on its own simple arc (worked out from its start, so a slow frame never breaks it) and lands on the sand.
const PARTS = [];
const rnd = (a, b) => a + Math.random() * (b - a);
function partAt(q, t) {
  let tt = t;
  if (q.floor != null && q.g) { // when does it land?
    const a = 0.5 * q.g, b = q.vy, c = q.y - q.floor, d = b * b - 4 * a * c;
    if (d >= 0) { const tl = (-b + Math.sqrt(d)) / (2 * a); if (tl > 0 && t > tl) tt = tl; }
  }
  return { x: q.x + q.vx * tt, y: q.y + q.vy * tt + 0.5 * (q.g || 0) * tt * tt, tt };
}
function drawParts(now, back) {
  for (let i = PARTS.length - 1; i >= 0; i--) if (now - PARTS[i].t0 > PARTS[i].life || now < PARTS[i].t0 - 1) PARTS.splice(i, 1);
  for (const q of PARTS) {
    if (!!q.back !== back || now < q.t0) continue; // not started yet (a delayed puff)
    const t = now - q.t0, k = t / q.life, at = partAt(q, t), rot = (q.rot || 0) + (q.vr || 0) * at.tt;
    G.save();
    G.globalAlpha = (q.alpha ?? 1) * (q.late ? 1 - clamp01((k - 0.65) / 0.35) : 1 - k);
    if (q.add) G.globalCompositeOperation = 'lighter';
    G.translate(at.x + (q.sway ? Math.sin(t * 5 + q.sway) * 3 : 0), at.y); if (q.sx) G.scale(q.sx, 1); G.rotate(rot);
    const z = q.size;
    if (q.kind === 'piece') { // a piece of a broken sprite: the art itself, clipped to a jagged shape
      G.beginPath(); q.poly.forEach(([px, py], i) => (i ? G.lineTo(px, py) : G.moveTo(px, py))); G.closePath(); G.clip();
      G.imageSmoothingEnabled = true; G.drawImage(q.img.canvas, q.img.x, q.img.y, q.img.w, q.img.h, q.ox, q.oy, q.dw, q.dh);
    } else if (q.kind === 'chip' || q.kind === 'shard') {
      G.fillStyle = q.color; G.beginPath(); G.moveTo(-z, -z * 0.6); G.lineTo(z * 0.8, -z * 0.8); G.lineTo(z * 0.5, z * 0.7); if (q.kind === 'chip') G.lineTo(-z * 0.7, z * 0.5); G.closePath(); G.fill();
    } else if (q.kind === 'spark') { G.fillStyle = q.color; G.fillRect(-z / 2, -z / 2, z, z); }
    else if (q.kind === 'splinter') { G.strokeStyle = q.color; G.lineWidth = 1.6; G.beginPath(); G.moveTo(-z / 2, 0); G.lineTo(z / 2, 0); G.stroke(); }
    else if (q.kind === 'feather') { G.fillStyle = '#f4efe2'; G.beginPath(); G.ellipse(0, 0, z, z * 0.35, 0, 0, Math.PI * 2); G.fill(); }
    else if (q.kind === 'dust') { const r = Math.max(0.1, z * (0.5 + 0.9 * easeOut(Math.min(1, k)))); G.fillStyle = q.color; G.beginPath(); G.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2); G.fill(); }
    else if (q.kind === 'ripple') { const r = z * easeOut(k); G.strokeStyle = q.color; G.lineWidth = 1.5 * (1 - k) + 0.3; G.beginPath(); G.ellipse(0, 0, r * 0.45, r, 0, 0, Math.PI * 2); G.stroke(); }
    else if (q.kind === 'sprite') { const f = fxArt(q.name); if (f) { const w2 = z * f.w / f.h; G.imageSmoothingEnabled = true; G.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w2 / 2, -z / 2, w2, z); } }
    else if (q.kind === 'smoke') {
      const f = fxArt('smoke' + (1 + Math.min(3, Math.floor(k * 4)))), h = z * (0.6 + 0.6 * k);
      if (f) { G.imageSmoothingEnabled = true; G.drawImage(f.canvas, f.x, f.y, f.w, f.h, -h / 2, -h, h, h); }
      else { G.fillStyle = 'rgba(90,80,75,.5)'; G.beginPath(); G.ellipse(0, -h / 3, h / 3, h / 4, 0, 0, Math.PI * 2); G.fill(); }
    }
    G.restore();
  }
}
// Break one cell of a stage sheet into jagged pieces, laid out exactly where drawCell drew it, and throw them.
// o: cols/rows (how many pieces), sx (squash), dir (away from the hit), throw(piece centre, cell centre) -> {vx, vy}, g, life, add, back.
function shatter(name, x, y, upp, ay, o, now) {
  const f = fxArt(name);
  if (!f) return;
  const dw = 512 * upp * (f.w / f.h) * (o.sx ?? 1), dh = 512 * upp, left = x - dw / 2, top = y - ay * dh, C = o.cols, Rr = o.rows;
  const pt = (i, j) => [left + (i + (i > 0 && i < C ? rnd(-0.38, 0.38) : 0)) * dw / C, top + (j + (j > 0 && j < Rr ? rnd(-0.38, 0.38) : 0)) * dh / Rr];
  const grid = []; for (let j = 0; j <= Rr; j++) { grid.push([]); for (let i = 0; i <= C; i++) grid[j].push(pt(i, j)); }
  for (let j = 0; j < Rr; j++) for (let i = 0; i < C; i++) {
    const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
    const tris = (i + j) % 2 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    for (const tri of tris) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, v = o.throw(cx - x, cy - y);
      PARTS.push({ kind: 'piece', img: f, t0: now, life: o.life * rnd(0.85, 1.15), x: cx, y: cy, vx: v.vx, vy: v.vy, g: o.g, floor: (o.floor ?? y) + rnd(-1, 4),
        vr: rnd(-1, 1) * (o.spin ?? 3), poly: tri.map(([px, py]) => [px - cx, py - cy]), ox: left - cx, oy: top - cy, dw, dh, add: o.add, back: o.back, late: true });
    }
  }
}
function burst(n, make) { for (let i = 0; i < n; i++) PARTS.push(make(i)); }
const YANTRA = { h: 420, ay: 0.9 };
// The layered yantra: ring, gates, triangles, petals, core, each arriving with its own motion as the block builds.
const YL = { th: [0, 0.2, 0.45, 0.7, 0.88], dur: [0.32, 0.26, 0.34, 0.3, 0.28] };
const YSTATE = new WeakMap();
function yantraState(w) { let Y = YSTATE.get(w); if (!Y) { Y = { on: [], locked: [], cracks: [] }; YSTATE.set(w, Y); } return Y; }
function drawYantraLayers(w, x, y, s, side, now, fade, flash) {
  const Y = yantraState(w), top = (WALLFX.peak.get(w) ?? w.cap) / w.max, R = 222 * s, cy = y - R - 2;
  YL.th.forEach((th, i) => { if (top >= th - 1e-6 && Y.on[i] == null) Y.on[i] = now; });
  G.save(); G.translate(x, cy); G.scale(side, 1); G.globalAlpha *= fade;
  const pulse = 0.85 + 0.15 * Math.sin(now * 5);
  G.save(); G.globalCompositeOperation = 'lighter'; G.globalAlpha *= 0.35 * pulse; ell(0, R - 1, R * 0.7, R * 0.12, 'rgba(90,240,220,.8)'); G.restore(); // light where it meets the sand
  const layer = (i, sc, rot, a, add) => {
    const f = fxArt('yl' + (i + 1)); if (!f) return;
    const d = 512 * s * sc;
    G.save(); G.rotate(rot); G.globalAlpha *= a; if (add) G.globalCompositeOperation = 'lighter';
    G.imageSmoothingEnabled = true; G.drawImage(f.canvas, f.x, f.y, f.w, f.h, -d / 2, -d / 2, d, d); G.restore();
  };
  for (let i = 0; i < 5; i++) {
    const t0 = Y.on[i]; if (t0 == null || now < t0) continue;
    const k = clamp01((now - t0) / YL.dur[i]), e = easeOut(k);
    if (k >= 1 && !Y.locked[i]) { // it locks into place: a flash and a ring of light
      Y.locked[i] = now;
      PARTS.push({ kind: 'ripple', t0: now, life: 0.3, x: x, y: cy, vx: 0, vy: 0, size: R * (0.6 + i * 0.12), color: 'rgba(200,255,248,.85)', add: true });
    }
    const sc = [0.3 + 0.7 * e, 1.35 - 0.35 * e, 0.2 + 0.8 * e, 0.7 + 0.3 * e, k < 1 ? 0.3 + e + 0.3 * Math.sin(Math.PI * k) : 1 + 0.05 * Math.sin(now * 5)][i];
    const rot = [(1 - e) * -4, (1 - e) * 0.8, (1 - e) * 6, (1 - e) * -1, 0][i]; // still once settled: rotating pixel art every frame makes it soft
    layer(i, sc, rot, Math.min(1, k * 2));
    const fl = Y.locked[i] ? 1 - clamp01((now - Y.locked[i]) / 0.25) : 0;
    layer(i, sc, rot, 0.1 * pulse + 0.7 * fl + 0.5 * flash, true); // its glow (and the flash as it locks, or when hit)
  }
  // cracks spread from where each hit landed
  const dmg = 1 - clamp01(w.cap / Math.max(1e-6, WALLFX.peak.get(w) ?? w.cap)), cf = fxArt('yl6');
  if (cf) for (const c of Y.cracks) {
    const r = (0.3 + 0.7 * clamp01((now - c.t0) / 0.18)) * (110 + 260 * dmg) * s;
    G.save(); G.beginPath(); G.arc(c.x * s, c.y * s, r, 0, Math.PI * 2); G.clip(); G.rotate(c.rot);
    const d = 512 * s; G.imageSmoothingEnabled = true; G.drawImage(cf.canvas, cf.x, cf.y, cf.w, cf.h, -d / 2, -d / 2, d, d);
    G.globalCompositeOperation = 'lighter'; G.drawImage(cf.canvas, cf.x, cf.y, cf.w, cf.h, -d / 2, -d / 2, d, d); G.restore(); // bright, so the cracks read
  }
  G.restore();
} // the yantra's height in its cell and where its foot is (replaced when fx_yantra2 loads)
function shatterWall(w, L, now) { // a block used up: the yantra bursts into glass, the arrows snap and scatter
  if (w.look === 'hill' && L.layers) { // each layer flies off on its own, spinning, then it all bursts into crystal
    const Y = YSTATE.get(w), cy = L.y - 222 * L.s - 2;
    (Y?.on || []).forEach((t, i) => { if (t == null || i > 3) return;
      PARTS.push({ kind: 'sprite', name: 'yl' + (i + 1), t0: now, life: rnd(0.55, 0.8), x: L.x, y: cy, vx: rnd(-90, 90), vy: rnd(-70, 10), g: 120, rot: rnd(0, 6), vr: rnd(-9, 9), size: 512 * L.s * (1 + i * 0.05), sx: L.side, late: true }); });
    burst(26, () => ({ kind: 'shard', t0: now, life: rnd(0.4, 0.8), x: L.x + rnd(-10, 10) * L.side, y: cy + rnd(-30, 30) * L.s * 8, vx: rnd(-110, 110), vy: rnd(-90, 30), g: 140, vr: rnd(-14, 14), size: rnd(2, 4.5), color: ['#9ff3ea', '#d8fffa', '#5fd6cf'][Math.floor(rnd(0, 3))], add: true }));
    PARTS.push({ kind: 'ripple', t0: now, life: 0.4, x: L.x, y: cy, vx: 0, vy: 0, size: 60 * L.s * 8, color: 'rgba(190,255,245,.9)', add: true });
  } else if (w.look === 'hill') {
    shatter(L.name, L.x, L.y, L.s, L.ay, { cols: 5, rows: 6, sx: L.side, g: 90, life: 0.8, spin: 6,
      throw: (dx, dy) => ({ vx: dx * 3.2 + rnd(-15, 15), vy: dy * 1.6 + rnd(-25, 5) }) }, now);
    burst(18, () => ({ kind: 'spark', t0: now, life: rnd(0.3, 0.6), x: L.x + rnd(-8, 8), y: L.y - rnd(0, L.h * 0.9), vx: rnd(-70, 70), vy: rnd(-60, 20), g: 60, size: rnd(1.6, 3), color: '#bff8f0', add: true }));
  } else {
    shatter(L.name, L.x, L.y, L.s, L.ay, { cols: 6, rows: 3, sx: L.side, g: 320, life: 1.1, spin: 9,
      throw: (dx, dy) => ({ vx: dx * 1.5 + rnd(-30, 30), vy: rnd(-70, -20) }) }, now);
    burst(14, () => ({ kind: 'splinter', t0: now, life: rnd(0.6, 1), x: L.x + rnd(-15, 15), y: L.y - rnd(4, 20), vx: rnd(-60, 60), vy: rnd(-80, -20), g: 300, floor: L.y + rnd(0, 3), vr: rnd(-20, 20), size: rnd(4, 9), color: '#a8743a', late: true }));
    burst(6, (i) => ({ kind: 'feather', t0: now, life: rnd(1, 1.6), x: L.x + rnd(-15, 15), y: L.y - rnd(15, 30), vx: rnd(-20, 20), vy: rnd(-25, -5), g: 25, floor: L.y, vr: rnd(-4, 4), size: rnd(2.6, 4), sway: i * 1.7, late: true }));
  }
  burst(5, () => ({ kind: 'dust', t0: now, life: rnd(0.6, 1), x: L.x + rnd(-14, 14), y: L.y - 2, vx: rnd(-12, 12), vy: rnd(-6, -1), size: rnd(5, 9), color: 'rgba(214,170,110,.45)' }));
}
// ---------- Kanalan's block: a volley of single arrows (art/fx_arrow_parts.png) ----------
// Arrows rain down one after another and thud into the sand (more the longer he holds); each hit snaps some.
const VOLLEY = { len: 36, ay: 0.89, fall: 0.17, max: 12, gap: 0.07, sky: 80 };
const volleyOf = new WeakMap();
function arrowAt(w, a) { // where an arrow stands: spread along the wall line, a little in front / behind it
  const thick = 2 + 9 * (1 - Math.abs(w.ny)); // seen end-on, a thin line would stack into one column: spread them as a thicket instead
  const wx = w.x - w.ny * a.t * w.hw + w.nx * a.d * thick, wy = w.y + w.nx * a.t * w.hw + w.ny * a.d * thick;
  return { x: sx(wx), y: sy(wy) + 2, wy };
}
function volleyArrows(w, now) {
  let v = volleyOf.get(w);
  if (!v) { v = { arrows: [], seed: (w.id ?? 0) + 1 }; volleyOf.set(w, v); }
  const peak = WALLFX.peak.get(w) ?? w.cap, want = Math.round(3 + clamp01(peak / w.max) * (VOLLEY.max - 3));
  while (v.arrows.length < want) {
    const i = v.arrows.length, h = (k) => hash01(v.seed * 31 + i * 7 + k), last = v.arrows[i - 1];
    v.arrows.push({ t: (i === 0 ? 0 : h(1) * 2 - 1) * 0.95, d: i === 0 ? 0 : h(2) * 1.4 - 0.4, /* mostly on the enemy side, off the archer */ kind: Math.floor(h(3) * 4), lean: (h(4) - 0.5) * 0.2, flip: h(5) > 0.5,
      at: Math.max(now, last ? last.at + VOLLEY.gap : now), snapped: null, landed: false });
  }
  return v.arrows;
}
const ARROW_UPP = () => VOLLEY.len / 400;
function drawVolley(w, now, gone) {
  const arrows = [...volleyArrows(w, now)].map((a) => ({ a, p: arrowAt(w, a) })).sort((u, v) => u.p.wy - v.p.wy);
  const fade = gone ? 1 - gone.t : 1, dir = Math.sign(m0.players[1 - w.owner].x - w.x) || 1;
  for (const { a, p } of arrows) {
    if (now < a.at) continue;
    const f = (now - a.at) / VOLLEY.fall, upp = ARROW_UPP();
    G.save(); G.globalAlpha *= fade;
    if (f < 1) { // still falling from the sky, steeply, from behind the archer
      const k = 1 - f;
      G.translate(p.x - dir * k * VOLLEY.sky * 0.35, p.y - k * VOLLEY.sky); G.rotate(a.lean - dir * 0.25 * k);
      drawCell('arrow' + (a.kind + 1), 0, 0, upp, VOLLEY.ay, { to: 0.86 });
      G.restore(); continue;
    }
    if (!a.landed) { // thud: a puff of sand where it went in
      a.landed = true;
      burst(3, () => ({ kind: 'dust', t0: now, life: rnd(0.35, 0.6), x: p.x + rnd(-2, 2), y: p.y, vx: rnd(-12, 12), vy: rnd(-8, -2), size: rnd(3, 5), color: 'rgba(222,180,110,.6)' }));
      burst(4, () => ({ kind: 'spark', t0: now, life: rnd(0.3, 0.5), x: p.x, y: p.y - 1, vx: rnd(-25, 25), vy: rnd(-45, -15), g: 200, floor: p.y + 1, size: rnd(0.8, 1.4), color: '#e8c27a' }));
    }
    const quiver = Math.sin((now - a.at) * 55) * 0.09 * Math.max(0, 1 - (now - a.at - VOLLEY.fall) / 0.35); // it shudders as it sticks
    G.translate(p.x, p.y); G.rotate(a.lean + quiver); if (a.flip) G.scale(-1, 1);
    drawCell(a.snapped || gone ? 'arrowStump' + (1 + (a.kind % 2)) : 'arrow' + (a.kind + 1), 0, 0, upp, VOLLEY.ay);
    G.restore();
  }
}
function snapArrow(w, a, now, dir) { // the top half flies off, the stump stays in the sand
  a.snapped = now;
  const p = arrowAt(w, a), y = p.y + liftAt(w.x, w.y), hy = y - VOLLEY.len * 0.55;
  PARTS.push({ kind: 'sprite', name: 'arrowTop' + (1 + Math.floor(rnd(0, 2))), t0: now, life: rnd(0.8, 1.1), x: p.x, y: hy, vx: dir * rnd(25, 60), vy: rnd(-90, -50), g: 330, floor: y + rnd(-1, 3), rot: a.lean, vr: dir * rnd(6, 12), size: VOLLEY.len * 0.62, late: true });
  burst(4, () => ({ kind: 'splinter', t0: now, life: rnd(0.4, 0.7), x: p.x, y: y - VOLLEY.len * 0.3, vx: dir * rnd(10, 60), vy: rnd(-70, -20), g: 300, floor: y, vr: rnd(-25, 25), size: rnd(2.5, 5), color: '#b98444', late: true }));
  if (Math.random() < 0.5) PARTS.push({ kind: 'feather', t0: now, life: 1.2, x: p.x, y: hy - 5, vx: dir * rnd(5, 20), vy: -18, g: 25, floor: y, vr: 3, size: 3, sway: rnd(0, 6), late: true });
}

// ---------- the divine weapons in the arena (art/fx_pashupata, fx_vel, fx_vishwa, fx_brahma, fx_storm, fx_sky_eye, fx_cosmic_form) ----------
// Each one is staged: the world dims, time slows, the camera pushes in, the game freezes for an instant on impact,
// the screen shakes. Pashupatastra: a storm rolls in, Shiva's eye opens across the sky, its bolt strikes.
// Shakti Vel: time crawls as the vel flies and the camera rides it; a gold shockwave tears the sand.
// Vishwaroopam: the sky becomes the cosmos and Krishna's universal form looms over it; pillars of light rain down.
// Brahmastra: silence; the arrow climbs and becomes a second sun that fills the sky; white-out; ash.
export const DRAMA_MOVES = new Set(['Pashupatastra', 'Shakti Vel', 'Vishwaroopam', 'Brahmastra']);
const DIV = [];
const DR = { freeze: 0, slow: null, cam: null, dim: null, shake: [] };
const EYE = { x: CX, y: 78 }; // where Shiva's eye opens in the sky
// The game's time scale while a divine weapon plays (main.js multiplies the sim clock by it).
export function divineTime(now) {
  if (now < DR.freeze) return 0.03;
  if (DR.slow && now < DR.slow.until) return DR.slow.k;
  return 1;
}
const freeze = (now, s) => { DR.freeze = Math.max(DR.freeze, now + s); };
const shakeAt = (now, amp, life) => DR.shake.push({ t0: now, amp, life });
function dramaShake(now) {
  DR.shake = DR.shake.filter((q) => now - q.t0 < q.life);
  const b = DIV.find((d) => d.kind === 'brahma');
  return DR.shake.reduce((a, q) => a + (now < q.t0 ? 0 : q.amp * (1 - (now - q.t0) / q.life)), 0) + (b ? brahmaRumble(now - b.t0) : 0);
}
// camera: push in on a point (or follow one), easing in and out
function camOn(now, z, at, hold) { DR.cam = { t0: now, z, at, until: now + hold }; }
let DR_NOW = 0; // the clock, for camera targets that move
function divineCamera(now) {
  DR_NOW = now;
  const c = DR.cam;
  if (!c) return null;
  const w = Math.min(easeOut(clamp01((now - c.t0) / 0.3)), 1 - clamp01((now - c.until) / 0.45));
  if (w <= 0 && now > c.until) { DR.cam = null; return null; }
  const p = typeof c.at === 'function' ? c.at() : c.at;
  if (!p) return null;
  const z = typeof c.z === 'function' ? c.z() : c.z;
  return { z: 1 + (z - 1) * w, fx: CX + (p.x - CX) * w, fy: H / 2 + (p.y - H / 2) * w };
}
function dimOn(now, rgb, a, until) { DR.dim = { t0: now, rgb, a, until }; }
function drawDim(now) {
  const d = DR.dim;
  if (!d) return;
  const k = Math.min(clamp01((now - d.t0) / 0.3), 1 - clamp01((now - d.until) / 0.5));
  if (k <= 0 && now > d.until) { DR.dim = null; return; }
  G.fillStyle = `rgba(${d.rgb},${d.a * k})`; G.fillRect(-W, -H, W * 3, H * 3);
}
const tgtOf = (m, pid) => m.players[1 - pid];
const scr = (q) => ({ x: sx(q.x), y: sy(q.y) + liftAt(q.x, q.y) });
const DIV_LAST = { vel: null, velPos: null };
function divineEvent(e, m, now) {
  if (e.type === 'release' && DRAMA_MOVES.has(e.name) && fxArt('storm')) {
    const p = m.players[e.pid];
    if (e.name === 'Pashupatastra') { // the storm and the eye; time slows while the trident flies
      DIV.push({ kind: 'storm', t0: now, life: 5, pid: e.pid }); // shortened when it lands
      dimOn(now, '8,16,44', 0.55, now + 4); DR.slow = { k: 0.45, until: now + 4 }; // (a safety limit; the hit ends it)
    }
    if (e.name === 'Shakti Vel') { // time crawls, the camera rides the vel
      dimOn(now, '30,16,0', 0.4, now + 4); DR.slow = { k: 0.3, until: now + 4 };
      camOn(now, 1.35, () => DIV_LAST.velPos, 4);
    }
    if (e.name === 'Vishwaroopam') { // the sky opens onto the cosmos; light rains toward the target
      DIV.push({ kind: 'cosmic', t0: now, life: 3.2, pid: e.pid });
      dimOn(now, '4,4,22', 0.6, now + 1.6); DR.slow = { k: 0.5, until: now + 0.85 };
      const o = tgtOf(m, e.pid);
      for (let i = 0; i < 9; i++) { // pillars sweep in from far away to the target
        const k = i / 8, a = hash01(i * 5 + Math.floor(now)) * Math.PI * 2, r = (1 - k) * ARENA.r * 0.9;
        DIV.push({ kind: 'pillar', t0: now + 0.05 + k * 0.32, life: 0.9, wx: o.x + Math.cos(a) * r, wy: o.y + Math.sin(a) * r * 0.8, big: i === 8 });
      }
    }
    if (e.name === 'Brahmastra') {
      const d = { kind: 'brahma', t0: now, life: BRAHMA_HOLD, x: p.x, y: p.y, pid: e.pid, hp0: [...hpShown] }; // the bars hold until the sun lands
      DIV.push(d);
      DR.cam = { t0: now, z: () => brahmaCam(d, DR_NOW).z, at: () => brahmaCam(d, DR_NOW), until: now + B.born + 1.6 };
    }
  }
  if (e.type === 'shivaTakes' && fxArt('storm')) { // two Brahmastras: Shiva takes both back
    for (let i = DIV.length - 1; i >= 0; i--) if (DIV[i].kind === 'brahma') DIV.splice(i, 1);
    DR.cam = null; DR.dim = null;
    DIV.push({ kind: 'shiva', t0: now, life: SHV.dur, at: [scr(m.players[e.pid]), scr(m.players[e.other])] });
    DIV.push({ kind: 'storm', t0: now + SHV.eye, life: SHV.dur - SHV.eye - 0.3, pid: e.pid }); // the storm, and the eye opening in it
    freeze(now, SHV.dur); // the game all but stops while Shiva acts
  }
  if (e.type === 'hp' && e.dmg > 0 && fxArt('storm')) {
    const src = e.srcs || [], at = { x: sx(e.x), y: sy(e.y) + liftAt(e.x, e.y) };
    if (src.includes('Pashupatastra')) {
      DR.slow = null; freeze(now, 0.18); shakeAt(now, 7, 1.0); camOn(now, 1.3, at, 0.9);
      DIV.push({ kind: 'bolt', t0: now, life: 1.3, ...at });
      const st = DIV.find((d) => d.kind === 'storm'); if (st) st.life = now - st.t0 + 1.6;
      if (DR.dim) DR.dim.until = now + 1.2;
    }
    if (src.includes('Shakti Vel')) {
      DR.slow = null; freeze(now, 0.2); shakeAt(now, 6, 0.8); camOn(now, 1.3, at, 0.8);
      if (DR.dim) DR.dim.until = now + 0.8;
      DIV.push({ kind: 'shock', t0: now, life: 0.9, ...at });
      PARTS.push({ kind: 'sprite', name: 'velBurst', t0: now, life: 0.6, x: at.x, y: at.y - 18, vx: 0, vy: 0, size: 90, add: true });
      burst(16, () => ({ kind: 'dust', t0: now + rnd(0, 0.15), life: rnd(0.8, 1.3), x: at.x + rnd(-20, 20), y: at.y + rnd(-2, 4), vx: rnd(-40, 40), vy: rnd(-25, -5), size: rnd(10, 18), color: 'rgba(214,176,120,.55)' }));
    }
    if (src.includes('Vishwaroopam')) { freeze(now, 0.15); shakeAt(now, 5, 0.7); camOn(now, 1.25, at, 0.7); }
  }
}
// A shot in flight. Returns true when it drew it.
function drawDivineShot(pr0, now) {
  const x = sx(pr0.x), gy = sy(pr0.y), hy = gy - 18, a = Math.atan2(pr0.vy * SQ, pr0.vx), left = Math.cos(a) < 0, rot = left ? a - Math.PI : a;
  if (pr0.name === 'Pashupatastra' && fxArt('trident1')) {
    ell(x, gy, 16, 4, 'rgba(120,190,255,.3)');
    fxSprite(G, 'trident' + (1 + (Math.floor(now * 18) % 2)), x, hy, 72, { rot, flip: left });
    G.save(); G.globalCompositeOperation = 'lighter'; ell(x, hy, 34, 18, 'rgba(140,200,255,.25)'); G.restore();
    return true;
  }
  if (pr0.name === 'Shakti Vel' && fxArt('vel')) {
    DIV_LAST.vel = { vx: pr0.vx, vy: pr0.vy }; DIV_LAST.velPos = { x, y: hy };
    const ca = Math.cos(a), sa = Math.sin(a);
    ell(x, gy, 16, 3, 'rgba(0,0,0,.3)');
    fxSprite(G, 'velTrail', x - ca * 52, hy - sa * 52, 100, { rot, flip: left, alpha: 0.95 });
    fxSprite(G, 'vel', x, hy, 66, { rot, flip: left });
    G.save(); G.globalCompositeOperation = 'lighter'; ell(x + ca * 16, hy + sa * 16, 16, 10, 'rgba(255,220,120,.3)'); G.restore();
    for (const w of m0?.walls || []) if (Math.hypot(w.x - pr0.x, w.y - pr0.y) < 9 && !w.velPierced) { // it bursts straight through a block
      w.velPierced = true;
      PARTS.push({ kind: 'sprite', name: 'velBurst', t0: now, life: 0.45, x: sx(w.x), y: sy(w.y) - 20, vx: 0, vy: 0, size: 54, add: true });
      burst(10, () => ({ kind: 'spark', t0: now, life: rnd(0.3, 0.6), x: sx(w.x), y: sy(w.y) - 20, vx: rnd(-60, 60), vy: rnd(-60, 20), g: 80, size: rnd(1.5, 3), color: '#ffd27a', add: true }));
    }
    return true;
  }
  return false;
}
// The sky behind the island (storm, Shiva's eye, the cosmic form): drawn over the backdrop, under the arena.
function drawHeaven(m, now) {
  for (const d of DIV) {
    const t = now - d.t0, k = t / d.life;
    if (d.kind === 'storm' && fxArt('storm')) {
      const inn = easeOut(clamp01(t / 0.5)), out = clamp01((t - d.life + 0.7) / 0.7), a = inn * (1 - out);
      fxSprite(G, 'storm', CX, -12 + 70 * inn, W * 1.15, { h: W * 1.15 / 4, alpha: a });
      if (fxArt('skyEye')) { // the eye opens in the clouds
        const open = easeOut(clamp01((t - 0.35) / 0.45)), pulse = 1 + 0.03 * Math.sin(now * 9);
        G.save(); G.globalCompositeOperation = 'lighter'; ell(EYE.x, EYE.y, 120 * open, 40 * open, `rgba(255,150,60,${0.25 * a})`); G.restore();
        fxSprite(G, 'skyEye', EYE.x, EYE.y, W * 0.95 * pulse, { h: W * 0.95 / 4 * open * pulse, alpha: a });
      }
    }
    if (d.kind === 'brahma' && t >= 0) drawBrahma(m, d, t, now, 'heaven');
    if (d.kind === 'shiva') drawGod({ god: 'shiva', t0: d.t0 + SHV.god[0], life: SHV.god[1] - SHV.god[0] }, now); // Shiva himself appears first
    if (d.kind === 'cosmic') {
      const inn = easeOut(clamp01(t / 0.5)), out = clamp01((t - d.life + 0.8) / 0.8), a = inn * (1 - out);
      G.fillStyle = `rgba(6,4,24,${0.75 * a})`; G.fillRect(-W, -H, W * 3, H + 60 + CY - 60); // the sky goes black
      if (fxArt('cosmosSky')) { const w = W * 1.3 * (1.06 - 0.06 * inn); fxSprite(G, 'cosmosSky', CX, 62, w, { h: w * 0.375, alpha: a }); }
      else if (fxArt('cosmos')) fxSprite(G, 'cosmos', CX, 40, W * 1.3, { h: W * 0.5, spin: now * 0.05, alpha: 0.7 * a });
      if (fxArt('cosmicForm')) fxSprite(G, 'cosmicForm', CX, 60 + 14 * (1 - inn), W * 1.1 * (1.04 - 0.04 * inn), { h: W * 1.1 / 4, alpha: 0.9 * a });
    }
  }
}
function drawDivine(m, now, layer) {
  DR_NOW = now;
  if (m.brahma) for (const d of DIV) if (d.kind === 'brahma') d.t0 = now - m.brahma.t; // in step with the sim's Brahmastra (it pauses for a scene)
  for (let i = DIV.length - 1; i >= 0; i--) if (now - DIV[i].t0 > DIV[i].life || now < DIV[i].t0 - 5) DIV.splice(i, 1);
  if (layer === 'ground') drawDim(now);
  for (const d of DIV) {
    const t = now - d.t0, k = t / d.life;
    if (t < 0) continue;
    if (d.kind === 'bolt') { // from the eye in the sky down to the target
      if (layer === 'sky' && t < 0.7) {
        const dx = d.x - EYE.x, dy = d.y - 14 - EYE.y, len = Math.hypot(dx, dy), flick = Math.floor(now * 26) % 2;
        G.save(); G.translate(EYE.x, EYE.y); G.rotate(Math.atan2(dy, dx) - Math.PI / 2);
        fxSprite(G, 'lightning', flick ? 2 : -2, 0, 70, { h: len, anchor: 'top', flip: !!flick, alpha: 1 - clamp01((t - 0.45) / 0.25) });
        G.restore();
        G.save(); G.globalCompositeOperation = 'lighter'; ell(d.x, d.y - 12, 22, 20, `rgba(170,220,255,${0.4 * (1 - t / 0.7)})`); G.restore();
      }
      if (layer === 'ground') { const g = 1 - clamp01((t - 0.3) / 1.0), bg = G.createRadialGradient(d.x, d.y + 1, 0, d.x, d.y + 1, 26); bg.addColorStop(0, `rgba(20,10,6,${0.45 * g})`); bg.addColorStop(1, 'rgba(20,10,6,0)'); G.save(); G.translate(d.x, d.y + 1); G.scale(1, 0.32); G.translate(-d.x, -d.y - 1); G.fillStyle = bg; G.beginPath(); G.arc(d.x, d.y + 1, 26, 0, Math.PI * 2); G.fill(); G.restore(); G.save(); G.globalCompositeOperation = 'lighter'; ell(d.x, d.y + 1, 20 + 90 * easeOut(clamp01(t / 0.6)), 7 + 30 * easeOut(clamp01(t / 0.6)), `rgba(140,200,255,${0.45 * g})`); G.restore(); }
      if (layer === 'screen') { // a white frame, then a black one: the strike
        if (t < 0.05) { G.fillStyle = 'rgba(235,245,255,.92)'; G.fillRect(-W, -H, W * 3, H * 3); }
        else if (t < 0.1) { G.fillStyle = 'rgba(0,0,8,.85)'; G.fillRect(-W, -H, W * 3, H * 3); }
      }
    }
    if (d.kind === 'shock' && layer === 'ground') { // a gold shockwave ring tears across the sand
      const u = easeOut(clamp01(t / 0.6)), a = 1 - clamp01((t - 0.3) / 0.6), r = 14 + 150 * u;
      G.save(); G.globalCompositeOperation = 'lighter';
      G.strokeStyle = `rgba(255,214,120,${0.9 * a})`; G.lineWidth = 3 * (1 - u) + 1; G.beginPath(); G.ellipse(d.x, d.y, r, r * SQ, 0, 0, Math.PI * 2); G.stroke();
      G.strokeStyle = `rgba(255,255,230,${0.6 * a})`; G.lineWidth = 1; G.beginPath(); G.ellipse(d.x, d.y, r * 0.8, r * 0.8 * SQ, 0, 0, Math.PI * 2); G.stroke();
      G.restore();
      if (fxArt('lightImpact')) fxSprite(G, 'lightImpact', d.x, d.y, 90 * (0.6 + 0.8 * u), { h: 90 * (0.6 + 0.8 * u) * 0.5, alpha: a });
    }
    if (d.kind === 'cosmic' && layer === 'ground' && fxArt('cosmos')) { // the island itself turns to stars
      const a = easeOut(clamp01(t / 0.35)) * (1 - clamp01((t - d.life + 0.8) / 0.8)), w = ARENA.r * SC * 2.14;
      fxSprite(G, 'cosmos', CX, CY, w, { h: w * SQ, spin: now * 0.12, alpha: 0.85 * a });
    }
    if (d.kind === 'pillar') { // a pillar of light from the sky
      const p = { x: sx(d.wx), y: sy(d.wy) }, on = clamp01(t / 0.08), a = on * (1 - clamp01((t - 0.35) / 0.5)), wdt = d.big ? 34 : 20;
      if (layer === 'ground' && fxArt('lightImpact')) fxSprite(G, 'lightImpact', p.x, p.y, (d.big ? 110 : 60) * (0.5 + 0.7 * easeOut(clamp01(t / 0.3))), { h: (d.big ? 110 : 60) * 0.5, alpha: a });
      if (layer === 'sky' && fxArt('lightBeam')) fxSprite(G, 'lightBeam', p.x, p.y, wdt, { h: p.y + 30, anchor: 'bottom', alpha: a });
      if (layer === 'sky' && t < 0.06 && d.big) { G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = 'rgba(255,240,200,.35)'; G.fillRect(-W, -H, W * 3, H * 3); G.restore(); }
    }
    if (d.kind === 'brahma') drawBrahma(m, d, t, now, layer);
    if (d.kind === 'shiva') drawShivaTakes(m, d, t, now, layer);
  }
}
// Two Brahmastras at once (owner, 2026-11-15): Shiva takes both back. The world goes dark and the game all but
// stops; Shiva appears over the far bank; both arrows rise and drift toward each other; his third eye opens in a storm over the island and draws them
// in; a flash, the eye closes, and the fight goes on.
const SHV = { dur: 6, god: [0.2, 2.6], rise: [0.6, 3.2], pull: [3.2, 4.0], flash: 4.0, eye: 2.0 }; // Shiva appears first, then his eye opens
function shivaArrow(d, i, t) {
  const f = d.at[i], hover = { x: f.x, y: f.y - 64 }, meet = { x: CX + (f.x < CX ? -36 : 36), y: EYE.y + 34 };
  if (t < SHV.rise[0]) return { x: hover.x, y: hover.y, rot: -Math.PI / 2, s: 1 };
  if (t < SHV.rise[1]) { // a slow arc up toward the other arrow
    const u = easeInOut((t - SHV.rise[0]) / (SHV.rise[1] - SHV.rise[0])), v = 1 - u, c = { x: hover.x + (meet.x - hover.x) * 0.1, y: meet.y - 30 };
    const x = v * v * hover.x + 2 * v * u * c.x + u * u * meet.x, y = v * v * hover.y + 2 * v * u * c.y + u * u * meet.y;
    return { x, y, rot: Math.atan2(v * (c.y - hover.y) + u * (meet.y - c.y), v * (c.x - hover.x) + u * (meet.x - c.x)), s: 1 };
  }
  const u = clamp01((t - SHV.pull[0]) / (SHV.pull[1] - SHV.pull[0])), e = u * u * u; // drawn into the eye, faster and faster
  return { x: meet.x + (EYE.x - meet.x) * e, y: meet.y + (EYE.y - meet.y) * e, rot: Math.atan2(EYE.y - meet.y, EYE.x - meet.x), s: 1 - 0.85 * e };
}
function drawShivaTakes(m, d, t, now, layer) {
  if (layer === 'ground') {
    const dark = clamp01(t / 0.6) * (1 - clamp01((t - (SHV.dur - 0.9)) / 0.8)), deep = 0.55 + 0.25 * clamp01((t - SHV.god[1] + 0.4) / 0.6); // lighter while Shiva is there
    if (dark > 0) { G.fillStyle = `rgba(4,6,20,${deep * dark})`; G.fillRect(-W, -H, W * 3, H * 3); }
  }
  if (layer === 'sky') { // the eye burns through the dark
    const g = clamp01((t - SHV.eye - 0.4) / 0.6) * (1 - clamp01((t - SHV.flash - 0.4) / 0.6)), r = 70 * (1 + 0.08 * Math.sin(now * 6));
    if (g > 0) { const eg = G.createRadialGradient(EYE.x, EYE.y, 0, EYE.x, EYE.y, r); eg.addColorStop(0, `rgba(255,140,60,${0.45 * g})`); eg.addColorStop(1, 'rgba(255,80,20,0)'); G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = eg; G.fillRect(EYE.x - r, EYE.y - r, r * 2, r * 2); G.restore(); }
  }
  if (layer === 'sky' && t < SHV.pull[1]) {
    for (let i = 0; i < 2; i++) {
      const on = clamp01((t - 0.1) / 0.5);
      // the trail along the path it flew
      const start = Math.max(SHV.rise[0], t - 0.8);
      if (t > SHV.rise[0]) {
        G.save(); G.globalCompositeOperation = 'lighter'; G.lineCap = 'round';
        let q = shivaArrow(d, i, start);
        for (let k = 1; k <= 16; k++) { const p = shivaArrow(d, i, start + (t - start) * (k / 16)), f = k / 16; G.strokeStyle = `rgba(255,220,150,${0.5 * f})`; G.lineWidth = 1 + 4 * f * p.s; G.beginPath(); G.moveTo(q.x, q.y); G.lineTo(p.x, p.y); G.stroke(); q = p; }
        G.restore();
      }
      const a = shivaArrow(d, i, t), r = 20 * a.s, hg = G.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
      hg.addColorStop(0, `rgba(255,240,190,${0.6 * on})`); hg.addColorStop(1, 'rgba(255,190,90,0)');
      G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = hg; G.fillRect(a.x - r, a.y - r, r * 2, r * 2); G.restore();
      fxSprite(G, 'brahmArrow', a.x, a.y, 66 * a.s, { rot: a.rot, alpha: on });
    }
    if (t > SHV.pull[0]) { // the eye's pull: streaks of light into it
      const u = clamp01((t - SHV.pull[0]) / (SHV.pull[1] - SHV.pull[0]));
      G.save(); G.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 10; k++) { const ang = hash01(k * 3) * Math.PI * 2 + now, r0 = 90 * (1 - ((now * 1.6 + hash01(k)) % 1)); G.strokeStyle = `rgba(180,220,255,${0.4 * u})`; G.lineWidth = 1; G.beginPath(); G.moveTo(EYE.x + Math.cos(ang) * r0, EYE.y + Math.sin(ang) * r0 * 0.5); G.lineTo(EYE.x + Math.cos(ang) * r0 * 0.6, EYE.y + Math.sin(ang) * r0 * 0.3); G.stroke(); }
      G.restore();
    }
  }
  if (layer === 'sky' && t > SHV.flash && t < SHV.flash + 0.8) { // swallowed: a burst of light from the eye
    const u = (t - SHV.flash) / 0.8, r = 30 + 160 * easeOut(u), gr = G.createRadialGradient(EYE.x, EYE.y, 0, EYE.x, EYE.y, r);
    gr.addColorStop(0, `rgba(255,255,245,${0.9 * (1 - u)})`); gr.addColorStop(0.4, `rgba(180,220,255,${0.5 * (1 - u)})`); gr.addColorStop(1, 'rgba(120,180,255,0)');
    G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = gr; G.fillRect(EYE.x - r, EYE.y - r, r * 2, r * 2); G.restore();
  }
  if (layer === 'screen' && t > SHV.flash && t < SHV.flash + 0.15) { G.fillStyle = `rgba(230,240,255,${0.5 * (1 - (t - SHV.flash) / 0.15)})`; G.fillRect(-W, -H, W * 3, H * 3); }
}

// The Brahmastra, staged slowly (owner, 2026-11-15: "it ends both fighters; it must not feel rushed").
//  0.0 invocation: the world goes dark, light gathers to the caster, the arrow forms above their head
//  1.5 ascent: the arrow climbs into the sky on a column of light, the camera riding it
//  3.1 birth: it bursts into a second sun, which swells until it fills the sky; the island burns orange, the ground shakes
//  5.7 the breath: the sun draws in, the shaking stops, the edges go dark: silence
//  6.2 the strike: light falls on the island; white-out, the two fighters black shapes that fall
//  7.5 the white fades to an island under grey ash; the result comes up at BRAHMA_HOLD
const B = { sunY: 58, rise: 1.5, born: 3.1, breath: 5.7, strike: TUNE.brahmastraFall - 0.4, impact: TUNE.brahmastraFall, whiteHold: 7.8, ash: 7.7 }; // impact: when the sim's sun lands
export const BRAHMA_HOLD = 10; // s from a Brahmastra going off to the result screen
export const BRAHMA_AFTER = BRAHMA_HOLD - TUNE.brahmastraFall; // ...of which this much comes after the match ends (its sun lands)
export const BRAHMA_STRIKE = B.impact, BRAHMA_BORN = B.born;
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const brahmaT = (now) => { const b = DIV.find((d) => d.kind === 'brahma'); return b ? { t: now - b.t0, pid: b.pid, hp0: b.hp0 } : null; };
function brahmaArrow(d, t) { // hovers over the caster, then flies one arc (a curve up and over) into the middle of the sky, facing along it
  const c = scr(d), hover = { x: c.x, y: c.y - 64 + 2 * Math.sin(t * 5), rot: -Math.PI / 2 };
  if (t < B.rise) return hover;
  const u = easeInOut(clamp01((t - B.rise) / (B.born - B.rise))), v = 1 - u;
  const p0 = hover, p1 = { x: hover.x + (CX - hover.x) * 0.15, y: B.sunY - 40 }, p2 = { x: CX, y: B.sunY };
  const x = v * v * p0.x + 2 * v * u * p1.x + u * u * p2.x, y = v * v * p0.y + 2 * v * u * p1.y + u * u * p2.y;
  const tx = v * (p1.x - p0.x) + u * (p2.x - p1.x), ty = v * (p1.y - p0.y) + u * (p2.y - p1.y);
  return { x, y, rot: Math.atan2(ty, tx) };
}
function brahmaCam(d, now) { // the camera: in on the caster, then a slow, steady pull back to the whole arena as the arrow flies (no tracking: no sway)
  const t = now - d.t0, c = scr(d), u = easeInOut(clamp01((t - B.rise) / (B.born - B.rise)));
  return { x: c.x + (CX - c.x) * u, y: c.y - 34 + (H / 2 - c.y + 34) * u, z: 1.25 - 0.25 * u };
}
function brahmaRumble(t) { // a low tremor while the sun swells, still for the breath, one hard hit on impact
  if (t < B.born) return 0;
  if (t < B.breath) return 0.25 + 0.75 * clamp01((t - B.born) / (B.breath - B.born));
  if (t < B.impact) return 0;
  return 4 * (1 - clamp01((t - B.impact) / 0.9));
}
function sunSize(t) {
  if (t < B.born) return 0;
  const g = easeInOut(clamp01((t - B.born) / (B.breath - B.born))), full = 24 + 200 * g;
  if (t < B.breath) return full;
  return full * (1 - 0.18 * easeOut(clamp01((t - B.breath) / (B.strike - B.breath)))); // it draws in before it falls
}
function drawBrahma(m, d, t, now, layer) {
  const c = scr(d), sunX = CX, sunY = B.sunY;
  if (layer === 'heaven') { // the second sun rises behind the island and fills the sky
    const sz = sunSize(t), sunA = t < B.strike ? 1 : 0; // (from the strike it is drawn falling, in front)
    if (sz > 0 && sunA > 0) { // the second sun, behind the island: the island's shape is cut out of it
      const pulse = 1 + 0.035 * Math.sin(now * 11), rx = ARENA.r * SC * 1.03, ry = ARENA.r * SC * SQ * 1.03 + 3;
      G.save(); G.beginPath(); G.rect(-W, -H, W * 3, H * 3); G.ellipse(CX, CY + 2, rx, ry, 0, 0, Math.PI * 2); G.clip('evenodd');
      G.save(); G.globalCompositeOperation = 'lighter';
      ell(sunX, sunY, sz * 2.2, sz * 1.5, `rgba(255,170,90,${0.25 * sunA})`); ell(sunX, sunY, sz * 1.3, sz * 1.0, `rgba(255,235,190,${0.3 * sunA})`); // the sky behind burns
      G.restore();
      G.restore();
    }
    return;
  }
  if (layer === 'ground') {
    const dark = clamp01(t / 1.0) * (1 - clamp01((t - B.born) / 1.2)); // night falls
    if (dark > 0) { G.fillStyle = `rgba(2,2,10,${0.85 * dark})`; G.fillRect(-W, -H, W * 3, H * 3); }
    const warm = clamp01((t - B.born) / (B.breath - B.born)) * (1 - clamp01((t - B.impact) / 0.3)); // the island burns under the second sun
    if (warm > 0) {
      G.fillStyle = `rgba(150,60,10,${0.3 * warm})`; G.fillRect(-W, -H, W * 3, H * 3);
      G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = `rgba(255,170,80,${0.14 * warm})`; G.fillRect(-W, -H, W * 3, H * 3); G.restore();
    }
    const aura = clamp01(t / 1.2) * (1 - clamp01((t - B.born) / 0.6)); // light gathers under the caster
    if (aura > 0) {
      G.save(); G.globalCompositeOperation = 'lighter'; ell(c.x, c.y, 34 + 4 * Math.sin(now * 7), 12, `rgba(255,215,130,${0.5 * aura})`); G.restore();
      if (fxArt('whiteRing')) { const w = 76 * (1 + 0.06 * Math.sin(now * 8)); fxSprite(G, 'whiteRing', c.x, c.y, w, { h: w * 0.42, alpha: 0.8 * aura }); }
    }
    if (t > B.born && t < B.impact && fxArt('whiteRing')) { // the mark where it will fall, growing
      const g = clamp01((t - B.born) / (B.breath - B.born)), w = 80 + 300 * g;
      fxSprite(G, 'whiteRing', CX, CY, w, { h: w * 0.42, alpha: 0.55 * g * (0.75 + 0.25 * Math.sin(now * 10)) });
    }
    if (t > B.impact && t < B.impact + 1.2 && fxArt('whiteRing')) { const u = clamp01((t - B.impact) / 1.0), w = 60 + 900 * easeOut(u); fxSprite(G, 'whiteRing', CX, CY, w, { h: w * 0.42, alpha: 1 - u }); }
    if (t > B.ash) { G.fillStyle = `rgba(62,58,54,${0.62 * clamp01((t - B.ash) / 0.8)})`; G.fillRect(-W, -H, W * 3, H * 3); } // after: grey under ash
  }
  if (layer === 'sky') {
    if (t > 0.15 && !d.gather) { // motes of light drawn in to the caster
      d.gather = true;
      burst(30, () => {
        const a = rnd(0, Math.PI * 2), r = rnd(60, 120), L = rnd(0.7, 1.1), y0 = c.y - 40;
        return { kind: 'spark', t0: now + rnd(0, 1.2), life: L, x: c.x + Math.cos(a) * r, y: y0 + Math.sin(a) * r * 0.6, vx: -Math.cos(a) * r / L, vy: -Math.sin(a) * r * 0.6 / L, g: 0, size: rnd(1.4, 2.6), color: ['#fff1c0', '#ffd27a'][Math.floor(rnd(0, 2))], add: true };
      });
    }
    if (t > B.rise && t < B.born + 0.9) { // its trail follows the arc it flew: brightest at the arrow, fading behind it
      const end = Math.min(t, B.born), fade = 1 - clamp01((t - B.born) / 0.9), n = 24, start = Math.max(B.rise, end - 0.9);
      G.save(); G.globalCompositeOperation = 'lighter'; G.lineCap = 'round';
      let q = brahmaArrow(d, start);
      for (let k = 1; k <= n; k++) {
        const p = brahmaArrow(d, start + (end - start) * (k / n)), f = (k / n) * fade;
        G.strokeStyle = `rgba(255,200,110,${0.35 * f})`; G.lineWidth = 2 + 6 * f; G.beginPath(); G.moveTo(q.x, q.y); G.lineTo(p.x, p.y); G.stroke();
        G.strokeStyle = `rgba(255,250,230,${0.8 * f})`; G.lineWidth = 0.6 + 1.2 * f; G.stroke();
        q = p;
      }
      G.restore();
    }
    if (t > 0.2 && t < B.born + 0.05) { // the arrow: forms above the caster, then climbs
      const a = brahmaArrow(d, t), on = clamp01((t - 0.2) / 0.8), glow = 18 + 5 * Math.sin(now * 9) + 10 * clamp01((t - B.rise) / 1.6);
      const hg = G.createRadialGradient(a.x, a.y, 0, a.x, a.y, glow); hg.addColorStop(0, `rgba(255,240,190,${0.6 * on})`); hg.addColorStop(1, 'rgba(255,190,90,0)');
      G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = hg; G.fillRect(a.x - glow, a.y - glow, glow * 2, glow * 2); G.restore();
      fxSprite(G, 'brahmArrow', a.x, a.y, 66, { rot: a.rot, alpha: on });
    }
    const glow = clamp01((t - B.born) / 1.5) * (1 - clamp01((t - B.impact) / 0.3)); // the second sun's light falls on the island and the fighters
    if (glow > 0) { const r = G.createRadialGradient(CX, B.sunY, 20, CX, B.sunY, W * 0.8); r.addColorStop(0, `rgba(255,230,170,${0.45 * glow})`); r.addColorStop(1, 'rgba(255,150,60,0)'); G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = r; G.fillRect(-W, -H, W * 3, H * 3); G.restore(); }
    if (t > B.born && t < B.born + 0.6) { // its birth: a burst of light where the arrow was
      const u = (t - B.born) / 0.6, r = 20 + 220 * easeOut(u), gr = G.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
      gr.addColorStop(0, `rgba(255,255,240,${0.9 * (1 - u)})`); gr.addColorStop(0.35, `rgba(255,220,150,${0.5 * (1 - u)})`); gr.addColorStop(1, 'rgba(255,180,90,0)');
      G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = gr; G.fillRect(sunX - r, sunY - r, r * 2, r * 2); G.restore();
    }
    if (t > B.born + 0.5 && !d.embers) { // embers lift off the burning island
      d.embers = true;
      burst(46, () => { const a = rnd(0, Math.PI * 2), r = Math.sqrt(rnd(0, 1)) * ARENA.r * SC; return { kind: 'spark', t0: now + rnd(0, 2.2), life: rnd(1.4, 2.4), x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r * SQ, vx: rnd(-8, 8), vy: rnd(-45, -20), g: -6, size: rnd(1.2, 2.6), color: ['#ffb347', '#ff7a2a', '#ffe0a0'][Math.floor(rnd(0, 3))], add: true }; });
    }
    if (t > B.born && t < B.strike) { const sz = sunSize(t); fxSprite(G, 'sun2', sunX, sunY, sz * (1 + 0.035 * Math.sin(now * 11)), { spin: now * 0.22 }); } // the second sun, high over the island
    if (t >= B.strike && t < B.impact + 0.05) { // it falls: the sun drops out of the sky onto the middle of the island
      const u = clamp01((t - B.strike) / (B.impact - B.strike)), e = u * u, y = sunY + (CY - 10 - sunY) * e, sz = sunSize(B.strike) * (1 - 0.55 * e);
      G.save(); G.globalCompositeOperation = 'lighter';
      const tr = G.createLinearGradient(0, sunY - 40, 0, y); tr.addColorStop(0, 'rgba(255,220,150,0)'); tr.addColorStop(1, `rgba(255,240,200,${0.6 * u})`);
      G.fillStyle = tr; G.fillRect(CX - sz * 0.25, sunY - 40, sz * 0.5, y - sunY + 40); // its streak
      const hg = G.createRadialGradient(CX, y, 0, CX, y, sz * 0.8); hg.addColorStop(0, 'rgba(255,220,150,.45)'); hg.addColorStop(1, 'rgba(255,180,90,0)'); G.fillStyle = hg; G.fillRect(CX - sz, y - sz, sz * 2, sz * 2); G.restore();
      fxSprite(G, 'sun2', CX, y, sz, { spin: now * 0.6 });
    }
    if (t > B.ash && fxArt('ash') && !d.ash) { d.ash = true; burst(50, () => ({ kind: 'sprite', name: 'ash', t0: now + rnd(0, 2.2), life: rnd(2.4, 3.4), x: rnd(0, W), y: rnd(-30, 50), vx: rnd(-12, 12), vy: rnd(14, 28), g: 0, vr: rnd(-1, 1), size: rnd(28, 54), alpha: 0.85 })); }
  }
  if (layer === 'screen') {
    if (t > B.born && t < B.born + 0.22) { G.fillStyle = `rgba(255,250,235,${0.55 * (1 - (t - B.born) / 0.22)})`; G.fillRect(-W, -H, W * 3, H * 3); } // the birth flash
    const hush = clamp01((t - B.breath) / 0.3) * (1 - clamp01((t - B.strike) / 0.05)); // the breath: the edges go dark
    if (hush > 0) {
      const v = G.createRadialGradient(CX, H / 2, H * 0.3, CX, H / 2, W * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${0.75 * hush})`);
      G.fillStyle = v; G.fillRect(-W, -H, W * 3, H * 3);
    }
    const white = clamp01((t - B.impact) / 0.1) * (1 - clamp01((t - B.whiteHold) / 1.0)); // white-out, the fighters black shapes against it
    if (white > 0) {
      G.fillStyle = `rgba(255,252,240,${0.97 * white})`; G.fillRect(-W, -H, W * 3, H * 3);
      if ('filter' in G) for (const p of m.players) { G.save(); G.filter = 'brightness(0)'; G.globalAlpha = white; drawFighter(m, p, now); G.restore(); }
    }
  }
}

// Hits on a block or a meditation barrier, from the sim's events (main.js passes them in): show every hit.
export function fxEvent(e, m, now) {
  if (!useArt || !m) return;
  divineEvent(e, m, now);
  if (e.type === 'blocked') {
    const w = m.walls.find((q) => q.x === e.x && q.y === e.y), L = w && WALLFX.look.get(w);
    if (!L) return;
    WALLFX.hit.set(w, now);
    if (L.layers) yantraState(w).cracks.push({ x: rnd(-150, 150), y: rnd(-150, 150), rot: rnd(0, 6.3), t0: now });
    const o = m.players[1 - e.pid], dir = Math.sign(o.x - e.x) || 1, hy = L.y - rnd(0.3, 0.8) * L.h, hx = L.x + dir * 3;
    if (w.look === 'hill') { // glass rings and cracks off where it was struck
      PARTS.push({ kind: 'ripple', t0: now, life: 0.35, x: hx, y: hy, vx: 0, vy: 0, size: 24, color: 'rgba(170,255,240,.9)', add: true });
      burst(7, () => ({ kind: 'shard', t0: now, life: rnd(0.35, 0.6), x: hx, y: hy, vx: dir * rnd(20, 70), vy: rnd(-50, 10), g: 140, vr: rnd(-12, 12), size: rnd(2.2, 4.2), color: '#9ff3ea', add: true }));
    } else if (fxArt('arrow1') && volleyOf.get(w)) { // real arrows snap: as many as the strength it lost, nearest the hit first
      const v = volleyOf.get(w), peak = WALLFX.peak.get(w) || w.max, up = v.arrows.filter((a) => !a.snapped && now >= a.at);
      const keep = Math.ceil(v.arrows.length * clamp01(w.cap / peak)), n = Math.max(1, up.length - keep);
      up.sort((a, b) => arrowAt(w, b).x * dir - arrowAt(w, a).x * dir).slice(0, n).forEach((a) => snapArrow(w, a, now, dir));
    } else { // an arrow snaps: splinters, a feather, the broken half tumbling away
      burst(5, () => ({ kind: 'splinter', t0: now, life: rnd(0.5, 0.8), x: hx, y: hy, vx: dir * rnd(20, 70), vy: rnd(-70, -20), g: 300, floor: L.y, vr: rnd(-25, 25), size: rnd(4, 8), color: '#b98444', late: true }));
      PARTS.push({ kind: 'splinter', t0: now, life: 0.9, x: hx, y: hy - 4, vx: dir * rnd(30, 50), vy: rnd(-90, -60), g: 320, floor: L.y + 1, vr: dir * rnd(10, 16), size: 16, color: '#c8964f', late: true });
      PARTS.push({ kind: 'feather', t0: now, life: 1.3, x: hx, y: hy - 6, vx: dir * rnd(5, 20), vy: -20, g: 25, floor: L.y, vr: 3, size: 3.5, sway: rnd(0, 6), late: true });
    }
  }
  if (e.type === 'barrier') {
    const p = m.players[e.pid], o = m.players[1 - e.pid], dir = Math.sign(o.x - p.x) || 1, x = sx(p.x), y = sy(p.y) + liftAt(p.x, p.y);
    MED.hit[p.id] = { t0: now, dir };
    if (p.ch.id === 'siddhan' && fxArt('pillar')) shrineHit(p, now, dir);
    else if (p.ch.id === 'siddhan') { // stone chips and dust burst off the struck pillar
      const hx = x + dir * 26, hy = y - rnd(10, 40);
      burst(9, () => ({ kind: 'chip', t0: now, life: rnd(0.7, 1.1), x: hx, y: hy, vx: dir * rnd(15, 70), vy: rnd(-70, -10), g: 320, floor: y + rnd(0, 6), vr: rnd(-15, 15), size: rnd(2, 4.5), color: ['#8a6a4a', '#a8845c', '#6f5238'][Math.floor(rnd(0, 3))], late: true }));
      burst(3, () => ({ kind: 'dust', t0: now, life: rnd(0.5, 0.9), x: hx, y: hy + rnd(0, 10), vx: dir * rnd(5, 20), vy: rnd(-8, 4), size: rnd(8, 13), color: 'rgba(200,170,130,.55)' }));
    } else { // the fire flares and spits sparks
      const hx = x + dir * 30, hy = y - 6;
      burst(14, () => ({ kind: 'spark', t0: now, life: rnd(0.3, 0.7), x: hx, y: hy - rnd(0, 18), vx: dir * rnd(10, 60) + rnd(-20, 20), vy: rnd(-80, -20), g: 90, size: rnd(1.6, 3.2), color: ['#ffd27a', '#ff9a3c', '#fff1c0'][Math.floor(rnd(0, 3))], add: true }));
    }
  }
}

// Walls the sim has just removed (broken or timed out) linger a moment so they can shatter / snap.
let FX_MATCH = null;
// Draw the big effect images once, invisibly, as a match starts: the browser uploads them to the GPU then,
// instead of stalling the first time Shiva's Tandava (or a divine weapon) needs them.
let warmed = false;
function warmArt() {
  if (warmed || !useArt) return;
  warmed = true;
  G.save(); G.globalAlpha = 0.002;
  const big = [ART.lavaFloor, ART.lavaCliff, ...Object.values(ART.gods || {}).flatMap((g) => [g?.img, g?.fg]), ...Object.values(ART.scenes || {}), ...Object.values(ART.sceneLayers || {}).flatMap((l) => [l?.bg, l?.fg])];
  for (const img of big) if (img && (img.width || img.naturalWidth)) G.drawImage(img, 0, 0, 1, 1); // gods, scenes: the first boon used no longer stalls
  const seen = new Set();
  for (const f of Object.values(ART.fx)) if (f?.canvas && !seen.has(f.canvas)) { seen.add(f.canvas); G.drawImage(f.canvas, 0, 0, 1, 1); }
  G.restore();
}
const WALLFX = { prev: [], ghosts: [], peak: new WeakMap(), look: new WeakMap(), hit: new WeakMap(), life: 0.5 };
let m0 = null; // the match being drawn (wallGhosts needs to know who is attacking)
function wallGhosts(walls, now) {
  for (const w of WALLFX.prev) {
    if (walls.includes(w)) continue;
    const L = WALLFX.look.get(w);
    const broke = w.dead && w.cap <= 1e-9; // dead from hits, not from its time running out (that also sets dead)
    if (broke && L && w.look !== 'hill' && fxArt('arrow1')) { // every arrow still standing snaps; the stumps linger
      for (const a of volleyOf.get(w)?.arrows || []) if (!a.snapped && now >= a.at) snapArrow(w, a, now, Math.sign(m0.players[1 - w.owner].x - w.x) || 1);
      WALLFX.ghosts.push({ ghost: true, w, x: w.x, y: w.y, t0: now });
    } else if (broke && L) shatterWall(w, L, now); // broken: it bursts / snaps apart
    else WALLFX.ghosts.push({ ghost: true, w, x: w.x, y: w.y, t0: now }); // its time ran out: it just fades
  }
  WALLFX.prev = [...walls];
  WALLFX.ghosts = WALLFX.ghosts.filter((g) => now - g.t0 < WALLFX.life && now >= g.t0);
  return WALLFX.ghosts;
}
// Stage art for a wall: grows with its strength; the cracked / snapped cell once hits have worn it down.
const WALL_ART = { hill: ['yantra1', 'yantra2', 'yantra3', 'yantraCrack'], arrows: ['volley1', 'volley2', 'volley3', 'volleyBreak'] };
function drawWallArt(w, now, gone = null) {
  const names = WALL_ART[w.look === 'hill' ? 'hill' : 'arrows'];
  if (!fxArt(names[0])) return false;
  const k = w.cap / w.max, peak = Math.max(WALLFX.peak.get(w) ?? 0, w.cap);
  WALLFX.peak.set(w, peak);
  const top = peak / w.max, hurt = gone || w.cap < peak - 0.12 * w.max, stage = hurt ? 3 : top < 0.4 ? 0 : top < 0.75 ? 1 : 2; // stage by the strongest it got: a hit never un-forms it
  const x = sx(w.x), y = sy(w.y) + 2, len = 2 * Z(w.hw) * 1.25, side = Math.max(0.55, Math.abs(w.ny)); // narrower seen end-on
  const fade = gone ? 1 - gone.t : w.standing && w.t < 0.6 && Math.floor(w.t * 10) % 2 ? 0.4 : 1;
  const flash = 1 - clamp01((now - (WALLFX.hit.get(w) ?? -9)) / 0.25), jolt = flash * Math.sin(now * 80) * 1.2; // a hit: it flares and jolts
  const dy = liftAt(w.x, w.y);
  if (w.look === 'hill' && fxArt('yl1')) { // the yantra assembles layer by layer (art/fx_yantra_layers.png)
    const s = Math.min(54, Math.max(32, len * 0.7)) / YANTRA.h; // capped: a big one cluttered the screen
    drawYantraLayers(w, x + jolt, y, s, Math.max(0.8, side), now, fade, flash);
    if (!gone) WALLFX.look.set(w, { name: names[3], x, y: y + dy, s, ay: YANTRA.ay, side, h: 440 * s, layers: true });
  } else if (w.look === 'hill') { // the yantra: upright teal light, breathing
    const s = Math.max(38, len * 1.05) / YANTRA.h, pulse = 0.85 + 0.15 * Math.sin(now * 6);
    drawCell(names[stage], x + jolt, y, s, YANTRA.ay, { sx: side, alpha: fade * (0.6 + 0.4 * Math.min(1, k * 2 + 0.3)) });
    drawCell(names[stage], x + jolt, y, s, YANTRA.ay, { sx: side, alpha: fade * (0.35 * pulse + 0.6 * flash), add: true });
    if (!gone) WALLFX.look.set(w, { name: names[3], x, y: y + dy, s, ay: YANTRA.ay, side, h: YANTRA.h * s });
  } else if (fxArt('arrow1')) { // the volley: single arrows that have rained down and stuck
    drawVolley(w, now, gone);
    if (!gone) WALLFX.look.set(w, { name: names[3], x, y: y + dy, s: 0, ay: 0, side, h: VOLLEY.len });
  } else { // the arrow volley pictures (older art)
    const s = Math.max(44, len * 1.25) / 440;
    drawCell(names[stage], x + jolt, y, s, 0.83, { sx: side, alpha: fade });
    if (!gone) WALLFX.look.set(w, { name: names[3], x, y: y + dy, s, ay: 0.83, side, h: 300 * s });
  }
  return true;
}
function drawWall(w, now) {
  if (w.ghost) { drawWallArt(w.w, now, { t: (now - w.t0) / WALLFX.life }); return; }
  const B = TUNE.block, k = w.cap / w.max, x = sx(w.x), y = sy(w.y), px = -w.ny, py = w.nx, hw = Z(w.hw);
  const fade = w.standing && w.t < 0.6 && Math.floor(w.t * 10) % 2 ? 0.4 : 1; // blinks just before it disappears
  G.globalAlpha = fade;
  const art = fxArt(w.look === 'hill' ? 'hill' : 'arrowWall');
  if (useArt && drawWallArt(w, now)) { G.globalAlpha = 1; }
  else if (art) { // upright; narrower when the wall is seen end-on, taller as it gets stronger
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
  const ch = m.arenaChange, inLava = ch?.kind === 'chasm' && ch.lava && !p.air && (p.x - ch.x) * ch.nx + (p.y - ch.y) * ch.ny > 0 && splitE(ch) > 0.3;
  if (inLava) { // standing in the lava: it glows hot around the feet, and burns
    const fl = 0.8 + 0.2 * Math.sin(now * 13 + p.id * 2);
    G.save(); G.globalCompositeOperation = 'lighter';
    ell(x, gy + 1, 13 * fl, 5.5 * fl, 'rgba(255,110,20,.45)'); ell(x, gy + 1, 7, 3, 'rgba(255,220,140,.55)');
    G.restore();
  }
  const bar = barrierState(p, now), barArt = useArt && drawBarrier(p, bar, x, gy + 1, now, 'back');
  if (p.effects.invuln && Math.floor(now * 20) % 2) G.globalAlpha = 0.4;
  let top = y - 30;
  if (useArt && ART.sheets[p.ch.id]) {
    ring(x, gy + 1, Z(9), Z(9) * SQ, p.id === 0 ? 'rgba(90,160,255,.9)' : 'rgba(255,90,70,.9)', 1); // player ring, on the ground
    const pose = poseOf(m, p);
    if (m.phase === 'done' && drawEnd(m, p, x, y + 1, now)) { /* knockout / victory */ }
    else if (p.air?.ride && drawSprite(G, p.ch.id, 'ride', Math.floor(m.t * 12), x, y + 4, p.face.x < 0)) { /* Peacock Ride: the wing-flap loop */ }
    else if (p.air && drawSprite(G, p.ch.id, 'air', airPose(p), x, y + 1, p.face.x < 0, 1 + 0.08 * Math.min(1, h / 13))) { /* jumping or flying (rule 17): a little bigger the higher, as if nearer */ }
    else if (pose == null || !drawSprite(G, p.ch.id, 'act', pose, x, y + 1, p.face.x < 0)) {
      const a = anim[p.id], sh = ART.sheets[p.ch.id] || {};
      if (a.moving && sh.walk8) drawSprite(G, p.ch.id, 'walk8', loopFrame(Math.floor(a.stride * 2), 8), x, y + 1, p.face.x < 0); // 8 frames over the same ground as the old 4
      else if (!a.moving && sh.idle8) drawSprite(G, p.ch.id, 'idle8', Math.floor(now * 8) % 8, x, y + 1, p.face.x < 0);
      else drawSprite(G, p.ch.id, 'walk', a.moving ? loopFrame(Math.floor(a.stride), 4) + 4 : Math.floor(now * 5) % 4, x, y + 1, p.face.x < 0); // walking: one frame per STRIDE walked, so the feet keep pace with the ground
    }
    top = y - ART_TOP - (p.air?.ride && ART.sheets[p.ch.id]?.ride ? 12 : 0); // a peacock rider sits higher: keep the labels clear of his head
  } else {
    ell(x, y - 4, 8, 7, c);
    ell(x, y - 13, 5, 5, c);
    ring(x, y - 4, 8, 7, 'rgba(0,0,0,.5)');
    line(x + p.face.x * 4, y - 4 + p.face.y * 3, x + p.face.x * 11, y - 4 + p.face.y * 7, '#fff', 2); // facing
    txt(p.ch.cls === 'mage' ? 'M' : 'W', x, y - 8, '#fff', 'center', 8, null);
  }
  G.globalAlpha = 1;
  if (barArt) drawBarrier(p, bar, x, gy + 1, now, 'front');
  if (m.phase === 'done') return; // no cast bars or status text once it's over
  const fx = Object.entries(p.effects).filter(([k]) => k !== 'invuln' || true);
  if (fx.length) {
    // each effect: its name, and a small bar under it for the time left (owner, 2026-11-21: no running numbers)
    for (const [k, e] of fx) {
      txt({ slow: 'SLOW', hold: 'HELD', stun: 'STUN', invuln: 'SAFE', confuse: 'SCRAMBLED', ride: 'PEACOCK' }[k] || k.toUpperCase(), x, top, '#ffe14d', 'center', 6);
      const bw = 28, left = Math.max(0, Math.min(1, e.t / (e.T || e.t || 1)));
      R(x - bw / 2, top + 8, bw, 2, 'rgba(0,0,0,.6)'); R(x - bw / 2, top + 8, bw * left, 2, '#ffe14d');
      top -= 13;
    }
  }
  if (p.cast) {
    const mv = p.cast.move, k = mv.charge ? chargeOf(p.cast) : Math.min(1, p.cast.t / Math.max(0.01, mv.cast));
    if (mv.cast >= 0.4 || mv.charge) {
      // no move name over the head (owner, 2026-11-15: less text): just the cast bar
      R(x - 16, top + 10, 32, 3, 'rgba(0,0,0,.6)'); R(x - 16, top + 10, 32 * k, 3, '#fff');
      top -= 12;
    }
  }
  if (p.med) {
    if (barArt && p.ch.id === 'siddhan') top = Math.min(top, gy - 512 * SHRINE.upp * SHRINE.feet - 6); // the label sits above the shrine roof
    const M = TUNE.meditate, k = p.med.meter / M.segTime;
    if (!barArt) { // no art: the barrier is a golden dome that fades as it soaks up hits
      const bs = p.med.barrier / M.barrier, rx = Z(13), ry = Z(17), cy = y - Z(14), fl = 0.75 + 0.25 * Math.sin(now * 7);
      const g = G.createRadialGradient(x, cy, 2, x, cy, ry * 1.2);
      g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.75, `rgba(255,210,110,${0.10 * bs})`); g.addColorStop(1, `rgba(255,230,150,${0.35 * bs * fl})`);
      G.fillStyle = g; G.beginPath(); G.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2); G.fill();
      ring(x, cy, rx, ry, `rgba(255,236,170,${0.25 + 0.6 * bs * fl})`, 1);
      ring(x, y + 1, Z(13), Z(13) * SQ, `rgba(255,220,120,${0.5 * bs})`, 1);
    }
    ring(x, y - 6, 14, 12, 'rgba(0,0,0,.4)', 3);
    ring(x, y - 6, 14, 12, '#ffd34a', 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
  }
  if (p.msg && p.msg.text !== 'MEDITATION STOPPED') txt(p.msg.text, x, top, '#ffb4a8', 'center'); // the shrine sinking / fire going out already says it
}

// The meditation barrier, per fighter: Mangulan's stone shrine rises around him, Kanalan sits in a ring of sacred fire.
// It wears down with the barrier (ground rule 11) and, once meditation ends, collapses / blows out for a moment.
const MED = { start: new WeakMap(), last: [null, null], end: [null, null], hit: [null, null], pos: [null, null], endTime: 1.4, rise: 0.55 };
function barrierState(p, now) {
  const id = p.id;
  if (p.med) {
    if (!MED.start.has(p.med)) MED.start.set(p.med, now);
    MED.last[id] = { bs: p.med.barrier / TUNE.meditate.barrier }; MED.end[id] = null;
    return { bs: MED.last[id].bs, age: now - MED.start.get(p.med), end: 0 };
  }
  if (MED.last[id]) { MED.end[id] = { t0: now, bs: MED.last[id].bs }; MED.last[id] = null; barrierEnds(p, MED.end[id], now); }
  const e = MED.end[id];
  if (e && now >= e.t0 && now - e.t0 < MED.endTime) return { bs: e.bs, age: 99, end: (now - e.t0) / MED.endTime };
  return null;
}
const SHRINE = { upp: 0.165, feet: 0.79, ground: 0.94 }, FIRE = { upp: 0.19, mid: 0.664 };
// Meditation just ended: a broken shrine collapses into falling stone; a broken fire ring blows out into smoke.
function barrierEnds(p, e, now) {
  const at = MED.pos[p.id];
  e.broke = e.bs < 0.05;
  if (!at || !useArt) return;
  e.x = at.x; e.y = at.y; // it collapses / burns out where it stood, not following the fighter
  const { x, y } = at, dir = MED.hit[p.id]?.dir ?? 1;
  if (p.ch.id === 'siddhan' && e.broke && fxArt('shrinePlatform') && fxArt('pillar')) { shrineBreaks(p, e, now); return; }
  if (p.ch.id === 'siddhan' && e.broke && fxArt('shrineBackHurt')) {
    const fall = { cols: 6, rows: 7, g: 300, life: 1.7, spin: 2.5, throw: (dx, dy) => ({ vx: dx * 0.6 - dir * rnd(5, 30), vy: rnd(-35, 0) }) };
    shatter('shrineBackHurt', x, y, SHRINE.upp, SHRINE.feet, { ...fall, back: true }, now);
    shatter('shrineFrontHurt', x, y, SHRINE.upp, SHRINE.feet, fall, now);
    burst(10, () => ({ kind: 'dust', t0: now + rnd(0.15, 0.5), life: rnd(0.9, 1.4), x: x + rnd(-40, 40), y: y + rnd(-2, 6), vx: rnd(-18, 18), vy: rnd(-10, -2), size: rnd(8, 14), color: 'rgba(190,160,120,.5)' }));
    e.shattered = true;
  }
  if (p.ch.id === 'veeran') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.4; PARTS.push({ kind: 'smoke', t0: now + i * 0.05, life: rnd(1.2, 1.6), x: x + Math.cos(a) * FLAME.rx, y: y + Math.sin(a) * FLAME.ry, vx: rnd(-4, 4), vy: rnd(-14, -8), size: rnd(44, 58), alpha: 0.9, back: Math.sin(a) < 0 }); }
  }
}
// The ring of sacred fire: a loop of separate flames, each flickering on its own (art/fx_flame.png, 8 frames).
// They shrink and die out one by one as the barrier drains, lean away from a hit, and snuff out when it breaks.
const FLAME = { n: 28, rx: 34, ry: 13.5, h: 40, fps: 13, foot: 0.94 };
function drawFlameRing(p, b, x, y, now, part) {
  const hit = MED.hit[p.id], kick = hit ? 1 - clamp01((now - hit.t0) / 0.5) : 0;
  const out = b.end ? 1 - clamp01(b.end * MED.endTime / 0.3) : 1, grow = easeOut(clamp01(b.age / 0.5)), alive = 0.15 + 0.85 * b.bs;
  if (part === 'back') { // the scorched ring on the sand, and the glow
    drawCell('ring4', x, y, FIRE.upp, FIRE.mid, { from: 0.5, alpha: 0.9 * (b.end ? 1 - clamp01((b.end - 0.4) / 0.6) : grow) });
    G.save(); G.globalCompositeOperation = 'lighter'; ell(x, y, 40, 16, `rgba(255,120,30,${0.25 * alive * out * grow})`); G.restore();
  }
  const ids = [...Array(FLAME.n).keys()].map((i) => ({ i, a: (i / FLAME.n) * Math.PI * 2 + 0.17 })).filter((q) => (Math.sin(q.a) < 0) === (part === 'back'));
  ids.sort((u, v) => Math.sin(u.a) - Math.sin(v.a));
  for (const { i, a } of ids) {
    const r = hash01(i * 7 + p.id * 31), rank = hash01(i * 13 + 5), life = clamp01((alive - rank * 0.95) * 5);
    const hh = FLAME.h * (0.7 + 0.45 * r) * (0.3 + 0.7 * life) * grow * out * (0.93 + 0.07 * Math.sin(now * 7 + i)) * (1 + 0.25 * kick);
    if (life <= 0 || hh < 1) continue;
    const frame = Math.floor(now * FLAME.fps * (0.8 + 0.4 * r) + r * 8) % 8, f = fxArt('flame' + (frame + 1));
    if (!f) continue;
    const fx = x + Math.cos(a) * FLAME.rx, fy = y + Math.sin(a) * FLAME.ry, w = hh * f.w / f.h;
    const lean = (hit ? hit.dir * 0.7 * kick : 0) + 0.06 * Math.sin(now * 1.7 + i * 2);
    G.save(); G.translate(fx, fy); G.transform(1, 0, lean, 1, 0, 0); if (r > 0.5) G.scale(-1, 1);
    G.imageSmoothingEnabled = true;
    G.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w / 2, -hh * FLAME.foot, w, hh);
    G.globalCompositeOperation = 'lighter'; G.globalAlpha = 0.25; G.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w / 2, -hh * FLAME.foot, w, hh);
    G.restore();
  }
}
// Mangulan's shrine, built from pieces (art/fx_shrine_big.png, fx_shrine_pillar.png): the platform pushes up out
// of the sand, four pillars rise one by one, the roof drops onto them. Hits crack the pillar that was struck; as
// the barrier drains pillars snap (the roof tilts); when it breaks the roof crashes down and it all sinks.
// Positions are in the old whole-shrine cell (512 px, feet at 256,405), so it lines up with fx_shrine.png.
const SH = {
  feet: 405, pillarAy: 472 / 512, pillarH: 200, roofUnder: 194, roofAy: 300 / 512, platAy: 405 / 512, platGround: 482 / 512,
  pillars: [{ x: 146, y: 372, s: 0.95 }, { x: 366, y: 372, s: 0.95 }, { x: 95, y: 414, s: 1.15, front: true }, { x: 417, y: 414, s: 1.15, front: true }],
  plat: 0.25, pillarT: [0.22, 0.34, 0.46, 0.58], pillarRise: 0.2, roofT: 0.78, roofFall: 0.24, breaks: [0.75, 0.5, 0.25],
};
const shrineOf = [null, null];
function shrineState(p) {
  const key = p.med || shrineOf[p.id]?.key;
  if (!shrineOf[p.id] || shrineOf[p.id].key !== key) shrineOf[p.id] = { key, pil: SH.pillars.map(() => ({ hits: 0, broke: null, landed: false })), plat: false, roof: false };
  return shrineOf[p.id];
}
const shAt = (x, y, cx, cy) => ({ x: x + (cx - 256) * SHRINE.upp, y: y + (cy - SH.feet) * SHRINE.upp });
function snapPillar(p, i, x, y, now, dir) {
  const st = shrineState(p), q = st.pil[i], P = SH.pillars[i], at = shAt(x, y, P.x, P.y), up = SHRINE.upp * P.s;
  q.broke = now;
  PARTS.push({ kind: 'sprite', name: 'pillarTop', t0: now, life: rnd(1.1, 1.4), x: at.x, y: at.y - SH.pillarH * up * 0.7, vx: -dir * rnd(10, 35), vy: rnd(-40, -15), g: 300, floor: at.y + rnd(2, 6), rot: 0, vr: -dir * rnd(3, 6), size: 512 * up, back: !P.front, late: true });
  burst(6, () => ({ kind: 'chip', t0: now, life: rnd(0.7, 1), x: at.x, y: at.y - SH.pillarH * up * 0.5, vx: rnd(-50, 50), vy: rnd(-60, -10), g: 320, floor: at.y + rnd(0, 6), vr: rnd(-15, 15), size: rnd(2, 4), color: '#8a6a4a', late: true }));
  burst(3, () => ({ kind: 'dust', t0: now + 0.35, life: rnd(0.6, 0.9), x: at.x + rnd(-8, 8), y: at.y + 3, vx: rnd(-10, 10), vy: rnd(-6, -1), size: rnd(7, 11), color: 'rgba(200,170,130,.5)' }));
}
function shrineHit(p, now, dir) { // the pillar nearest the attacker takes it; past each threshold one snaps
  const st = shrineState(p), at = MED.pos[p.id];
  if (!at) return;
  const order = st.pil.map((q, i) => i).filter((i) => !st.pil[i].broke).sort((a, b) => (SH.pillars[b].x - SH.pillars[a].x) * dir);
  if (!order.length) return;
  const i = order[0], P = SH.pillars[i], c = shAt(at.x, at.y, P.x, P.y), up = SHRINE.upp * P.s, hy = c.y - SH.pillarH * up * rnd(0.3, 0.8);
  st.pil[i].hits++;
  burst(9, () => ({ kind: 'chip', t0: now, life: rnd(0.7, 1.1), x: c.x, y: hy, vx: dir * rnd(15, 70), vy: rnd(-70, -10), g: 320, floor: at.y + rnd(0, 6), vr: rnd(-15, 15), size: rnd(2, 4.5), color: ['#8a6a4a', '#a8845c', '#6f5238'][Math.floor(rnd(0, 3))], late: true }));
  if (fxArt('rubble1')) burst(2, (k) => ({ kind: 'sprite', name: 'rubble' + (k + 1), t0: now, life: rnd(0.9, 1.2), x: c.x, y: hy, vx: dir * rnd(20, 50), vy: rnd(-60, -20), g: 320, floor: at.y + rnd(2, 6), vr: rnd(-8, 8), size: 512 * SHRINE.upp * 0.7, late: true }));
  burst(3, () => ({ kind: 'dust', t0: now, life: rnd(0.5, 0.9), x: c.x, y: hy + rnd(0, 10), vx: dir * rnd(5, 20), vy: rnd(-8, 4), size: rnd(8, 13), color: 'rgba(200,170,130,.55)' }));
  const bs = p.med ? p.med.barrier / TUNE.meditate.barrier : 0, want = SH.breaks.filter((t) => bs < t).length;
  let broken = st.pil.filter((q) => q.broke).length;
  for (const j of order) { if (broken >= want) break; snapPillar(p, j, at.x, at.y, now, dir); broken++; }
}
function shrineBreaks(p, e, now) { // the barrier is gone: the last pillars snap and the roof crashes down in pieces
  const st = shrineState(p), dir = MED.hit[p.id]?.dir ?? 1, { x, y } = e;
  st.pil.forEach((q, i) => { if (!q.broke) snapPillar(p, i, x, y, now + i * 0.04, dir); });
  const tilt = 0, r = shAt(x, y, 256, SH.roofUnder);
  shatter(fxArt('shrineRoofHurt') ? 'shrineRoofHurt' : 'shrineRoof', r.x, r.y, SHRINE.upp, SH.roofAy, { cols: 6, rows: 5, g: 340, life: 1.6, spin: 2.5, floor: y + 4,
    throw: (dx, dy) => ({ vx: dx * 0.5 - dir * rnd(0, 20), vy: rnd(-20, 10) }) }, now);
  burst(12, () => ({ kind: 'dust', t0: now + rnd(0.2, 0.5), life: rnd(0.9, 1.4), x: x + rnd(-45, 45), y: y + rnd(-2, 6), vx: rnd(-18, 18), vy: rnd(-10, -2), size: rnd(9, 15), color: 'rgba(190,160,120,.5)' }));
  st.roofGone = true;
}
function drawShrineBuilt(p, b, x, y, now, part) {
  const st = shrineState(p), up = SHRINE.upp, age = b.age, endK = b.end ? clamp01(b.end * MED.endTime / 0.9) : 0;
  const hit = MED.hit[p.id], kick = Math.max(hit ? 1 - clamp01((now - hit.t0) / 0.3) : 0, st.thud ? 1 - clamp01((now - st.thud) / 0.18) : 0);
  const shake = kick * Math.sin(now * 70) * 1.4, sink = endK * 60;
  const thud = (cx, cy, n) => { st.thud = now; burst(n, () => ({ kind: 'dust', t0: now, life: rnd(0.4, 0.7), x: x + (cx - 256) * up + rnd(-6, 6), y: y + (cy - SH.feet) * up, vx: rnd(-16, 16), vy: rnd(-7, -1), size: rnd(5, 9), color: 'rgba(214,180,130,.55)' })); };
  const X = x + shake;
  if (part === 'back') {
    const k = clamp01(age / SH.plat), lift = (1 - easeOut(k)) * 130 * up + sink;
    if (k >= 1 && !st.plat) { st.plat = true; if (!b.end) thud(256, 470, 6); }
    drawCell(b.bs < 0.5 || b.end ? 'shrinePlatformHurt' : 'shrinePlatform', X, y, up, SH.platAy, { lift, ground: SH.platGround, alpha: 1 - endK * 0.6 });
    ell(x, y - 2, 34, 9, `rgba(80,230,215,${0.1 * (1 - endK)})`);
  }
  SH.pillars.forEach((P, i) => {
    if (!!P.front !== (part === 'front')) return;
    const q = st.pil[i], k = clamp01((age - SH.pillarT[i]) / SH.pillarRise);
    if (k <= 0) return;
    if (k >= 1 && !q.landed) { q.landed = true; if (!b.end) thud(P.x, P.y, 3); }
    const c = shAt(X, y, P.x, P.y), sc = up * P.s, lift = (1 - easeOut(k)) * SH.pillarH * sc * 1.05 + sink;
    const name = q.broke ? 'pillarStump' : q.hits >= 2 ? 'pillarCracked2' : q.hits >= 1 ? 'pillarCracked' : 'pillar';
    drawCell(name, c.x, c.y, sc, SH.pillarAy, { lift, ground: SH.pillarAy, alpha: 1 - endK * 0.6 });
  });
  if (part === 'front' && !st.roofGone) { // the roof drops onto the pillars; it tilts toward the side that lost pillars
    const k = clamp01((age - SH.roofT) / SH.roofFall);
    if (k > 0) {
      if (k >= 1 && !st.roof) { st.roof = true; if (!b.end) { thud(256, 180, 5); thud(256, 470, 4); } }
      const br = st.pil.map((q, i) => (q.broke ? (SH.pillars[i].x < 256 ? -1 : 1) : 0)), nb = br.filter(Boolean).length;
      const tilt = br.reduce((a, v) => a + v, 0) * 0.06, drop = -(1 - k * k) * 70 + nb * 2.5 + sink;
      const r = shAt(X, y, 256, SH.roofUnder);
      G.save(); G.translate(r.x, r.y + drop); G.rotate(tilt);
      drawCell(nb >= 2 ? 'shrineRoofHurt' : 'shrineRoof', 0, 0, up, SH.roofAy, { alpha: Math.min(1, k * 3) * (1 - endK * 0.6) });
      G.restore();
    }
  }
  return true;
}
function drawBarrier(p, b, x, y, now, part) {
  if (!b) return false;
  const ended = b.end ? MED.end[p.id] : null;
  if (ended?.x != null) { x = ended.x; y = ended.y; } // meditation is over: the ending plays where it stood
  else MED.pos[p.id] = { x, y };
  if (p.ch.id === 'siddhan' && fxArt('shrinePlatform') && fxArt('pillar')) return drawShrineBuilt(p, b, x, y, now, part);
  if (p.ch.id === 'siddhan') {
    if (!fxArt('shrineBack')) return false;
    const e = MED.end[p.id];
    if (b.end && e?.shattered) return true; // it is falling apart as debris now
    const dh = 512 * SHRINE.upp, hurt = b.bs < 0.5;
    const rise = (1 - easeOut(clamp01(b.age / MED.rise))) * dh * SHRINE.ground;
    const fall = b.end ? clamp01(b.end * MED.endTime / 0.9) * dh * SHRINE.ground : 0;
    const hit = MED.hit[p.id], kick = hit ? 1 - clamp01((now - hit.t0) / 0.3) : 0;
    const shake = kick * Math.sin(now * 70) * 1.6;
    const name = (part === 'back' ? 'shrineBack' : 'shrineFront') + (hurt ? 'Hurt' : '');
    if (part === 'back') ell(x, y - 2, 34, 9, `rgba(80,230,215,${0.12 * (1 - b.end)})`); // faint teal glow from the carvings
    drawCell(name, x + shake, y, SHRINE.upp, SHRINE.feet, { lift: rise + fall, ground: SHRINE.ground, alpha: 1 - b.end * 0.5 });
    return true;
  }
  if (fxArt('flame1')) { drawFlameRing(p, b, x, y, now, part); return true; }
  if (!fxArt('ring1')) return false;
  const stage = b.end ? 'ring4' : b.bs > 0.66 ? 'ring1' : b.bs > 0.33 ? 'ring2' : 'ring3';
  const grow = easeOut(clamp01(b.age / 0.4)), fl = 1 + 0.04 * Math.sin(now * 13 + p.id) + 0.03 * Math.sin(now * 23);
  const o = part === 'back' ? { to: FIRE.mid } : { from: FIRE.mid };
  if (part === 'back' && !b.end) { G.save(); G.globalCompositeOperation = 'lighter'; ell(x, y, 34, 13, `rgba(255,120,30,${0.22 * b.bs * fl})`); G.restore(); }
  drawCell(stage, x, y, FIRE.upp, FIRE.mid, { ...o, sy: grow * fl, alpha: 1 - b.end });
  return true;
}

// The match is over: the loser falls (knockout) or slumps (time up), the winner celebrates.
// The winner raises a glowing hand to the sky. Timed from when the match ended.
const VICTORY = { siddhan: 'cast', veeran: 'cast' };
function drawEnd(m, p, x, y, now) {
  const P = POSES[p.ch.id], a = anim[p.id];
  if (!P || !ART.sheets[p.ch.id]?.act) return false;
  const bt = brahmaT(now);
  if (bt && bt.t < B.impact) { // a Brahmastra is coming: both still stand, the caster with the hand raised
    a.doneAt = null;
    return p.id === bt.pid ? drawSprite(G, p.ch.id, 'act', P[VICTORY[p.ch.id]], x, y, p.face.x < 0) : drawSprite(G, p.ch.id, 'walk', 0, x, y, p.face.x < 0); // the other just stands
  }
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
  if (useArt && drawDivineShot(pr0, now)) return;
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
const loopFrame = (n, k) => ((n % k) + k) % k; // frame n of a k-frame loop, also when counting backward
const STRIDE = 6.5; // world units walked per frame of the walk cycle (2026-11-15: was a fixed 10 frames a second at any speed)
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
    // backing away (owner 2026-11-22): he keeps facing the fight and steps backward, the walk plays in reverse
    const back = (p.x - a.x) * p.face.x + (p.y - a.y) * p.face.y < -0.3 * d;
    if (d < 20) a.stride = (a.stride || 0) + (back ? -d : d) / STRIDE;
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
  if (m !== FX_MATCH) { warmArt(); FX_MATCH = m; WALLFX.prev = []; WALLFX.ghosts = []; MED.last = [null, null]; MED.end = [null, null]; MED.hit = [null, null]; PARTS.length = 0; DIV.length = 0; DR.freeze = 0; DR.slow = null; DR.cam = null; DR.dim = null; DR.shake = []; damageReset(); } // a new match starts clean
  trackMotion(m);
  damageTrack(m, fxNow); // footprints, skids, settled marks painted onto the floor (src/damage.js)
  chasm = m.arenaChange?.kind === 'chasm' ? m.arenaChange : null;
  let sh = 0; // screen shake from power moves landing
  for (const f of fx) if (f.kind === 'shake') sh += f.amp * Math.max(0, 1 - (fxNow - f.t0) / f.life);
  sh += dramaShake(now);
  G.save();
  if (sh) G.translate(Math.sin(now * 83) * sh, Math.cos(now * 67) * sh * 0.7);
  const cam = sceneCamera(m) || divineCamera(now); // a power-up zooms in on the caster; a divine weapon on its moment
  if (cam) { G.translate(CX, H / 2); G.scale(cam.z, cam.z); G.translate(-cam.fx, -cam.fy); }
  drawBackdrop(now);
  const live = warOn && useArt && arenaDraw && ART.theme === 'battlefield'; // the war going on behind the battlefield (src/war.js, just for looks; ?war=0 hides it)
  const WV = { sx, sy, Z, SQ, SC };
  if (live) { const a = arenaDraw; warUpdate(m, fxNow); warDrawBack(G, (x, y) => [a.x + x * a.s, a.y + y * a.s], a.s); }
  if (m.scene) sceneSky(m);
  drawHeaven(m, now);
  for (const f of fx) if (f.kind === 'god') drawGod(f, fxNow); // a god appearing in the sky (small and medium boons)
  drawArena();
  drawDamage(G, fxNow, 'ground'); // what the fight has done to the sand
  if (m.haz) warDrawGround(G, WV, m); // the battlefield's hazards (they are real, so they show with or without the art)
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
  for (const s of m.strikesDue) if (s.land && !s.dead) { // Thousand-Arm Form: where the arms will come down, filling in as they come
    const k = 1 - s.t / s.T, w = Z(s.land) * 2.2;
    if (fxArt('danger')) {
      fxSprite(G, 'danger', sx(s.to.x), sy(s.to.y), w, { h: w * SQ, alpha: 0.6 + 0.4 * Math.abs(Math.sin(now * 10)) });
      fxSprite(G, 'danger', sx(s.to.x), sy(s.to.y), w * k, { h: w * k * SQ, alpha: 0.5 });
    } else {
      ring(sx(s.to.x), sy(s.to.y), Z(s.land), Z(s.land) * SQ, '#ffd36a', 1);
      ell(sx(s.to.x), sy(s.to.y), Z(s.land) * k, Z(s.land) * SQ * k, 'rgba(255,211,106,.3)');
    }
  }
  for (const u of m.units) if (!u.hazard) { ell(sx(u.x), sy(u.y) - 4, Z(u.r), Z(u.r), '#999'); txt(`${Math.ceil(u.hp)}`, sx(u.x), sy(u.y) - 20, '#fff', 'center'); }
  for (const f of fx) if (f.ground) drawFx(f, fxNow);
  drawDivine(m, now, 'ground');
  if (m.scene?.name === 'Thousand-Arm Form') {
    const p = m.players[m.scene.pid];
    drawSignatureHalo(sx(p.x), sy(p.y) - 18, m.scene.t);
  }
  m0 = m;
  const order = [...m.players, ...m.walls, ...wallGhosts(m.walls, now), ...warActors(WV, m)].sort((a, b) => a.y - b.y); // back to front
  const lifted = (o, draw) => { const d = liftAt(o.x, o.y); if (d) { G.save(); G.translate(0, d); draw(); G.restore(); } else draw(); }; // rides its half of a split island
  drawParts(now, true);
  for (const o of order) if (o.ch) drawFighter(m, o, now); else if (o.warDraw) o.warDraw(G); else lifted(o, () => drawWall(o, now));
  drawParts(now, false);
  drawDamage(G, fxNow, 'air'); // sand thrown up
  drawDivine(m, now, 'sky');
  for (const pr of m.projectiles) lifted(pr, () => drawProjectile(pr, now));
  for (const f of fx) if (!f.ground) drawFx(f, fxNow);
  if (m.scene) sceneAura(m, now);
  drawDivine(m, now, 'screen');
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
    fxSprite(G, 'divineHalo', cx, cy + 18, 112 * reveal, /* 174 -> 112 (owner, 2026-11-16: too big) */ { anchor: 'bottom', alpha: fade * reveal });
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
        const at = f.broken ?? age, travel = smooth(at / 0.4), hitX = tx - face * gap; // a broken halo stays where it lost
        // Continue along the attack's world-space direction, including diagonal and vertical attacks.
        const dx = f.tx - f.x, dy = f.ty - f.y, distance = Math.hypot(dx, dy);
        const ux = distance > 0 ? dx / distance : face, uy = distance > 0 ? dy / distance : 0;
        const dot = f.tx * ux + f.ty * uy;
        const toEdge = Math.max(0, -dot + Math.sqrt(Math.max(0, dot * dot + ARENA.r ** 2 - f.tx ** 2 - f.ty ** 2)));
        const exitX = sx(f.tx + ux * (toEdge + 90 / SC)), exitY = sy(f.ty + uy * (toEdge + 90 / SC)) - 18;
        const carry = smooth((at - 0.4) / 0.9), dissolve = smooth((carry - 0.2) / 0.8);
        const mx = cx + (hitX - cx) * travel + (exitX - hitX) * carry;
        const my = cy + (ty - cy) * travel + (exitY - ty) * carry;
        drawSignatureHalo(mx, my, age, true, fade * (1 - dissolve));
        if (dissolve > 0 && dissolve < 1) for (let i = 0; i < 14; i++) {
          const a = i / 14 * Math.PI * 2, r = 18 + dissolve * 35;
          star(mx + Math.cos(a) * r, my - 18 + Math.sin(a) * r * 0.65 - dissolve * 12, 0.7 + dissolve, Math.sin(dissolve * Math.PI) * 0.6 * fade);
        }
      } else if (f.broken == null) drawDivineImpact(tx, ty, age, fade); // no impact if it never landed
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
    const bh = brahmaT(DR_NOW), hp = bh && bh.t < B.impact ? bh.hp0[p.id] : p.hp; // a Brahmastra: nobody falls until its sun lands
    hpShown[p.id] = hp > hpShown[p.id] ? hp : Math.max(hp, hpShown[p.id] - (m.phase === 'done' ? 60 : 30) * dt);
    const bx = X(46, 114), k = Math.max(0, hp / 100), kt = hpShown[p.id] / 100;
    box(bx - 1, 15, 116, 10, 3, '#0d0812', '#5a4a2a');
    const fill = (from, to, c1, c2) => {
      if (to <= from) return;
      const x0 = right ? bx + 114 * (1 - to) : bx + 114 * from, gg = G.createLinearGradient(0, 16, 0, 24);
      gg.addColorStop(0, c1); gg.addColorStop(1, c2); box(x0, 16, 114 * (to - from), 8, 2, gg);
    };
    fill(k, kt, '#ff8a7a', '#c0302a');
    const col = hp > 50 ? ['#8af07a', '#2e9c3a'] : hp > 25 ? ['#ffe07a', '#d09a1a'] : ['#ff7a5a', '#b8241a'];
    fill(0, k, ...col);
    R(right ? bx + 114 * (1 - k) : bx, 16, 114 * k, 1.5, 'rgba(255,255,255,.35)');
    txt(`${Math.max(0, Math.ceil(hp))}%`, X(164), 16, '#fff', al);
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
      const label = `${p.boon.name.toUpperCase()}${hints[p.id] ? `   ${hints[p.id].keys}` : ''}`;
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
  if (SERIES) { // a tournament: the match number, and one dot per match (owner, 2026-11-21: best of 3 = 3 dots),
    // filled with the winner's colour once played (grey for a draw); the one being played has a brighter rim
    const res = SERIES.results || [], n = Math.max(SERIES.bestOf, res.length + (m.phase === 'done' ? 0 : 1)), gap = 9, x0 = CX - (n - 1) * gap / 2;
    txt(`MATCH ${SERIES.round}`, CX, 37, '#e8dcc0', 'center', 6);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap, r = res[i], cur = i === res.length && m.phase !== 'done';
      ell(x, 49, 3, 3, r === undefined ? '#0d0812' : r === null ? '#8a8494' : m.players[r].ch.color);
      ring(x, 49, 3.6, 3.6, cur ? '#ffe7a0' : '#c9a24a', cur ? 1.2 : 0.75); // the match being played has a steady brighter rim (owner, 2026-11-21: no blinking)
    }
  }
}
// The tournament being played (best of 3 or 5), or null for a single match: shown on the HUD and the result.
let SERIES = null;
export function setSeries(s) { SERIES = s; }

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
    G.save(); G.translate(CX, y + 12); G.scale(sz, sz); txt(s.name.toUpperCase(), 0, -12, '#ffe7a0', 'center', 24, 'rgba(40,16,0,.9)'); G.restore();
    const lw = 140 * easeOut(clamp01((t - 0.6) / 0.4));
    R(CX - lw, y + 38, lw * 2, 1, `rgba(${look.glow},.9)`);
    G.globalAlpha = 1;
  }
  const flash = Math.max(0, 1 - t / 0.1) * 0.7 + clamp01((t - s.dur + 0.12) / 0.12) * 0.8;
  if (flash > 0.01) { G.fillStyle = `rgba(255,252,240,${flash})`; G.fillRect(0, 0, W, H); }
}

// The boon card: when a god grants a wish, say what it is, what it does and how to use it.
export function drawOffer(o, p, hint, t) {
  const e = easeOut(clamp01(t / 0.3)), out = clamp01((t - 4) / 0.5), a = e * (1 - out);
  const w = 240, h = 44, x = CX - w / 2, y = H - 56 + (1 - e) * 20;
  G.save(); G.globalAlpha = a;
  const g = G.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(46,26,8,.95)'); g.addColorStop(1, 'rgba(22,12,4,.95)');
  box(x, y, w, h, 7, g, '#e8c060'); box(x + 3, y + 3, w - 6, h - 6, 5, null, 'rgba(232,192,96,.4)');
  txtFit(o.name.toUpperCase(), CX, y + 8, o.tier === 'divine' ? '#fff2b0' : '#ffe7a0', 'center', 16, w - 16); // long names shrink to fit the card // just the name (owner, 2026-11-15: less text)
  const pulse = 0.65 + 0.35 * Math.sin(t * 6);
  if (hint) {
    G.globalAlpha = a * pulse;
    txt(`${hint.keys}  /  PAD ${hint.pad}`, CX, y + 31, '#9fe07a', 'center', 6);
  }
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
// A fighter's page, kept plain (owner, 2026-11-21: the old chips and glow looked machine-made and were hard to
// read): one row per move = the button, the move's name and one short line, and its power cost. Nothing below size 6.
const PANEL = '#15111b', PANEL_EDGE = 'rgba(255,255,255,.14)', DIM = '#8f86a0', SOFT = '#cfc6dc';
function drawMoveList(ch, x, y, w) {
  txt(ch.name.toUpperCase(), x, y, ch.color, 'left', 16);
  txt(ch.cls === 'mage' ? 'MAGE' : 'WARRIOR', x + w, y + 5, DIM, 'right', 8);
  let yy = y + 24;
  txt('BUTTON', x, yy, DIM, 'left', 6); txt('POWER', x + w, yy, DIM, 'right', 6);
  yy += 11;
  for (const [slot, btn] of MOVE_ROWS) {
    const mv = slot === 'block' ? { name: ch.defence.name, short: ch.defence.short, cost: { power: ch.defence.cost } } : ch.moves[slot];
    const sig = slot === 'sig', c = mv.cost || {}, nx = x + 66, textW = w - 66 - 30;
    R(x, yy - 3, w, 0.6, 'rgba(255,255,255,.08)');
    txt(btn, x, yy + 2, sig ? '#ffcf6a' : '#9fe07a', 'left', 6);
    txtFit(mv.name.toUpperCase(), nx, yy, sig ? '#ffcf6a' : '#fff', 'left', 8, textW);
    txtFit((mv.short || '').toUpperCase(), nx, yy + 11, SOFT, 'left', 6, textW);
    txt(`${c.power || 0}`, x + w, yy, '#ffd34a', 'right', 8);
    if (c.health) txt(`-${c.health}% HP`, x + w, yy + 11, '#ff8a7a', 'right', 6);
    yy += 24;
  }
}
// The fighter card on the select screen: five trait bars (ground rule 16's shared budget) and one line each for
// what the fighter is strong and weak at. The moves and keys are a page of their own (up).
const TRAITS = [['range', 'RANGE'], ['speed', 'SPEED'], ['defence', 'DEFENCE'], ['control', 'CONTROL'], ['burst', 'BURST']];
function drawTraitCard(ch, x, y, w, now) {
  txt(ch.name.toUpperCase(), x, y, ch.color, 'left', 16);
  txt(ch.cls === 'mage' ? 'MAGE' : 'WARRIOR', x + w, y + 6, '#c9b07a', 'right', 8);
  wrap((ch.bio || '').toUpperCase(), Math.floor(w / 6.1)).slice(0, 2).forEach((l, i) => txt(l, x, y + 20 + i * 8, '#d8cfe8', 'left', 6));
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
// How boons work, and every boon: three steps, then one row per boon (name, god, one short line). Plain and
// large enough to read (owner, 2026-11-21).
function drawBoonsPage(now) {
  R(0, 0, W, H, 'rgba(8,6,14,.96)'); covered();
  txt('BOONS', CX, 8, '#ffcf6a', 'center', 16);
  [['1  MEDITATE', 'DOWN + SP 1'], ['2  FILL DEVOTION', '4 SMALL  /  8 DIVINE'], ['3  USE THE BOON', 'SP 1 + SP 2']].forEach(([a, b], i) => {
    const cx = 80 + i * 160;
    txt(a, cx, 34, '#fff', 'center', 8); txt(b, cx, 46, '#9fe07a', 'center', 6);
  });
  const colW = 222;
  [['SMALL BOONS', 0], ['DIVINE WEAPONS', 1]].forEach(([label, ti], c) => {
    const x = 12 + c * (colW + 12), top = 66;
    box(x, top, colW, 164, 4, PANEL, ti === 1 ? 'rgba(232,192,96,.55)' : PANEL_EDGE);
    txt(label, x + 10, top + 9, ti === 1 ? '#ffcf6a' : '#fff', 'left', 8);
    txt(ti === 1 ? '8 DEVOTION' : '4 DEVOTION', x + colW - 10, top + 10, DIM, 'right', 6);
    let y = top + 28;
    for (const god of Object.values(GODS_LIST)) for (const b of god.tiers[ti]) {
      R(x + 10, y - 5, colW - 20, 0.6, 'rgba(255,255,255,.08)');
      txtFit(b.name.toUpperCase(), x + 10, y, '#fff', 'left', 8, colW - 80);
      txt(god.name.toUpperCase(), x + colW - 10, y + 1, '#c9a24a', 'right', 6);
      txtFit(b.short || b.desc || '', x + 10, y + 12, SOFT, 'left', 6, colW - 20);
      y += 30;
    }
  });
  txt('BOON ATTACKS ALWAYS FIND THE OPPONENT. DIVINE WEAPONS GO THROUGH BARRIERS.', CX, 237, DIM, 'center', 6);
  txt('BRAHMASTRA COMES MOSTLY WHEN YOUR HEALTH IS LOW.', CX, 247, DIM, 'center', 6);
}
export function drawSelect(now, o) {
  drawBackdrop(now);
  R(0, 0, W, H, 'rgba(8,6,14,.82)');
  if (o.boonsPage) { drawBoonsPage(now); txt('ANY KEY: BACK', CX, 260, '#ddd', 'center', 6); return; }
  if (o.movesPage) { // the focused fighter's moves and keys
    box(110, 10, 260, 240, 4, PANEL, PANEL_EDGE); drawMoveList(o.chars[o.ids[o.cursor[o.focus || 0]]], 120, 20, 240);
    txt('ANY KEY: BACK', CX, 260, '#ddd', 'center', 6); return;
  }
  if (!(o.mode === '1p' && !o.tutorial)) txt('CHOOSE YOUR FIGHTER', CX, 6, '#ffcf6a', 'center', 16);
  const cw = 100, chh = 133, gap = 12, x0 = 14, y0 = 32;
  o.ids.forEach((id, i) => drawCard(o.chars[id], x0 + i * (cw + gap), y0, cw, chh, now));
  const pickCpu = o.mode === '1p' && !o.tutorial, humans = o.mode === '1p' ? (pickCpu && o.locked[0] ? [0, 1] : [0]) : [0, 1];
  if (pickCpu) txt(o.locked[0] ? 'CHOOSE THE CPU FIGHTER' : 'CHOOSE YOUR FIGHTER', CX, 6, '#ffcf6a', 'center', 16);
  for (const pid of humans) { // the players' cursors
    const i = o.cursor[pid], x = x0 + i * (cw + gap), col = pid === 0 ? '90,160,255' : '255,90,70', pulse = o.locked[pid] ? 1 : 0.6 + 0.4 * Math.sin(now * 6);
    G.save(); G.strokeStyle = `rgba(${col},${pulse})`; G.lineWidth = 2; G.beginPath(); G.roundRect(x - 2 - pid * 2, y0 - 2 - pid * 2, cw + 4 + pid * 4, chh + 4 + pid * 4, 6); G.stroke(); G.restore();
    const tag = o.mode === '1p' ? (pid ? 'CPU' : 'YOU') : `P${pid + 1}`;
    txt(o.locked[pid] ? `${tag} READY` : tag, x + (pid ? cw - 2 : 2), y0 + chh + 6, `rgb(${col})`, pid ? 'right' : 'left', 6);
  }
  if (o.tutorial) txt('THE OTHER ONE IS YOUR TRAINING DUMMY', x0 + cw + gap / 2, y0 + chh + 18, '#9aa', 'center', 6);
  box(232, 28, 242, 222, 6, 'rgba(20,12,24,.85)', 'rgba(201,162,74,.6)');
  drawTraitCard(o.chars[o.ids[o.cursor[o.focus || 0]]], 242, 36, 222, now);
  txt(o.mode === '1p' ? 'LEFT/RIGHT CHOOSE   ENTER LOCK IN   UP: MOVES   DOWN: BOONS' : 'LEFT/RIGHT CHOOSE   ATTACK 1 LOCK IN   UP: MOVES   DOWN: BOONS', CX, 258, '#ddd', 'center', 6);
}
// pause menu pages: page 0 and 1 = the two fighters in this match, 2 = boons
export function drawInfo(page, chs) {
  R(0, 0, W, H, 'rgba(8,6,14,.94)'); covered();
  if (page === 2) drawBoonsPage(0);
  else if (page === 3) drawControls();
  else { box(110, 10, 260, 240, 4, PANEL, PANEL_EDGE); drawMoveList(chs[page], 120, 20, 240); }
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
  const show = {
    mode: ['PLAYERS', o.mode === '1p' ? '1 PLAYER VS CPU' : '2 PLAYERS'],
    level: ['CPU LEVEL', o.levelName],
    length: ['LENGTH', `${o.minutes} MIN`],
    series: ['MATCHES', o.bestOf > 1 ? `BEST OF ${o.bestOf}` : 'SINGLE MATCH'],
    arena: ['ARENA', ARENA_NAME[o.arena] || o.arena],
  };
  o.rows.forEach((r, i) => {
    const y = 84 + i * 24, on = i === o.row, [label, val] = show[r];
    if (on) R(CX - 170, y - 5, 340, 18, 'rgba(255,207,106,.15)');
    txt(label, CX - 160, y, on ? '#ffcf6a' : '#ddd');
    txt(on ? `<  ${val}  >` : val, CX + 160, y, on ? '#ffcf6a' : '#fff', 'right');
  });
}

const ARENA_NAME = { river: 'RIVER ISLAND', battlefield: 'BATTLEFIELD' };
// Between tournament matches (owner 2026-11-22): whoever lost the last match picks the arena for the next one.
export function drawArenaPick(now, o) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.55)');
  txt(`MATCH ${o.round}`, CX, 40, '#ffcf6a', 'center', 16);
  txt(o.cpu ? `${o.who.toUpperCase()} (CPU) LOST: IT PICKS THE ARENA` : `${o.who.toUpperCase()} LOST: PICK THE ARENA`, CX, 70, '#e8dcc0', 'center');
  o.ids.forEach((id, i) => {
    const y = 104 + i * 24, on = i === o.sel;
    if (on) R(CX - 120, y - 5, 240, 18, 'rgba(255,207,106,.15)');
    txt(on ? `>  ${ARENA_NAME[id] || id}  <` : ARENA_NAME[id] || id, CX, y, on ? '#ffcf6a' : '#ddd', 'center');
  });
  if (!o.cpu) txt('UP/DOWN PICK  ENTER FIGHT', CX, 220, '#ddd', 'center');
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
export function drawResult(m, sel, t = 9, items = ['REMATCH', 'MATCH SETUP', 'TITLE']) {
  const r0 = m.result;
  if (r0.reason === 'brahmastra' && ART.fx.sun2) { t -= BRAHMA_AFTER; if (t < 0) return; } // let the second sun play out first
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
  if (SERIES) { // the tournament score, and who took it once someone has enough wins
    const need = Math.ceil(SERIES.bestOf / 2), champ = SERIES.wins.findIndex((w) => w >= need);
    txt(`BEST OF ${SERIES.bestOf}   ${m.players[0].ch.name.toUpperCase()} ${SERIES.wins[0]} - ${SERIES.wins[1]} ${m.players[1].ch.name.toUpperCase()}`, CX, 120, '#ffcf6a', 'center', 6);
    if (champ >= 0) txt(`${m.players[champ].ch.name.toUpperCase()} WINS THE TOURNAMENT`, CX, 60, m.players[champ].ch.color, 'center', 8);
  }
  items.forEach((s, i) => txt((i === sel ? '> ' : '  ') + s, CX, 176 + i * 14, i === sel ? '#ffcf6a' : '#ddd', 'center'));
  G.globalAlpha = 1;
}

// Drawing on a 480x270 canvas: the generated art (src/art.js) where it exists, grey-box shapes otherwise.
// Only reads the match state.
import { W, H, ARENA, TUNE } from './config.js';
import { ACTIONS, LABELS, KEYS, KEY_NAME, PAD, PAD_NAMES } from './input.js';
import { opponent, chargeOf } from './sim.js';
import { ART, drawSprite, drawFx as fxSprite, drawPortrait, POSES } from './art.js';
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
export function txt(s, x, y, c = '#fff', al = 'left', sz = 8, ol = 'rgba(0,0,0,.75)') {
  G.font = `${sz}px ${FONT}`; G.textAlign = al; G.textBaseline = 'top';
  if (ol) { G.fillStyle = ol; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) G.fillText(s, Math.round(x) + dx, Math.round(y) + dy); }
  G.fillStyle = c; G.fillText(s, Math.round(x), Math.round(y));
}
const short = (s) => s.toUpperCase().replace('SUDARSHANA ', '').replace('PINNING ARROW', 'PIN ARROW').replace('THIRD-EYE ', '');
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

function drawMark(mk) { // scuffs and traps share this exact drawing
  if (fxArt('scuff')) { const w = Z(mk.size) * 2.6; fxSprite(G, 'scuff', sx(mk.x), sy(mk.y), w, { h: w * SQ, flip: mk.rot > 0, alpha: 0.85 }); return; }
  const x = sx(mk.x), y = sy(mk.y), c = Math.cos(mk.rot) * Z(mk.size), s = Math.sin(mk.rot) * Z(mk.size) * SQ;
  line(x - c, y - s, x + c, y + s, 'rgba(50,40,30,.55)', 1);
  line(x - s * 0.6, y + c * 0.4, x + s * 0.6, y - c * 0.4, 'rgba(50,40,30,.45)', 1);
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
  } else if (w.look === 'hill') { // Govardhana: a mound that grows
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

function drawFighter(m, p, now) {
  const x = sx(p.x), y = sy(p.y), c = p.ch.color, o = opponent(m, p);
  ell(x, y + 1, 9, 4, 'rgba(0,0,0,.3)');
  if (p.effects.invuln && Math.floor(now * 20) % 2) G.globalAlpha = 0.4;
  let top = y - 30;
  if (useArt && ART.sheets[p.ch.id]) {
    ring(x, y + 1, Z(9), Z(9) * SQ, p.id === 0 ? 'rgba(90,160,255,.9)' : 'rgba(255,90,70,.9)', 1); // player ring
    const pose = poseOf(m, p);
    if (pose == null || !drawSprite(G, p.ch.id, 'act', pose, x, y + 1, p.face.x < 0)) {
      const moving = anim[p.id].moving, fps = moving ? 10 : 5, i = Math.floor(now * fps) % 4 + (moving ? 4 : 0);
      drawSprite(G, p.ch.id, 'walk', i, x, y + 1, p.face.x < 0);
    }
    top = y - ART_TOP;
  } else {
    ell(x, y - 4, 8, 7, c);
    ell(x, y - 13, 5, 5, c);
    ring(x, y - 4, 8, 7, 'rgba(0,0,0,.5)');
    line(x + p.face.x * 4, y - 4 + p.face.y * 3, x + p.face.x * 11, y - 4 + p.face.y * 7, '#fff', 2); // facing
    txt(p.ch.cls === 'god' ? 'K' : 'R', x, y - 8, '#fff', 'center', 8, null);
  }
  G.globalAlpha = 1;
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
    const k = p.med.meter / p.med.need, far = Math.hypot(p.x - o.x, p.y - o.y) > TUNE.meditate.dist;
    ring(x, y - 6, 14, 12, 'rgba(0,0,0,.4)', 3);
    ring(x, y - 6, 14, 12, '#ffd34a', 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    txt('MEDITATING', x, top, '#ffd34a', 'center'); top -= 10;
    if (!far) { txt('TOO CLOSE', x, top, '#ff7a6a', 'center'); top -= 10; }
  }
  if (p.msg) txt(p.msg.text, x, top, '#ffb4a8', 'center');
}

function drawProjectile(pr0, now) {
  const pr = { ...pr0, r: Z(pr0.r) };
  const x = sx(pr.x), y = sy(pr.y) - 6, a = Math.atan2(pr.vy * SQ, pr.vx), ca = Math.cos(a), sa = Math.sin(a);
  const name = { note: 'notes', chakra: 'chakra', wave: 'wave', tiger: 'tiger', fire: 'fire', spear: 'spear' }[pr.shape] || 'arrow';
  if (fxArt(name)) {
    const size = { notes: 11, chakra: pr0.r * 2.8, wave: pr0.r * 2.4, tiger: 30, fire: pr0.r * 4, spear: 18, arrow: 16 }[name] * SC;
    const hy = sy(pr.y) - 18; // shots fly at chest height, with a shadow on the sand
    ell(x, sy(pr.y), size * 0.3, size * 0.1, 'rgba(0,0,0,.25)');
    const flip = name === 'notes' && pr.vx < 0; // notes stay upright
    fxSprite(G, name, x, hy, size, name === 'chakra' ? { spin: now * 14 } : name === 'notes' ? { flip } : { rot: a, flip: name === 'wave' });
    return;
  }
  switch (pr.shape) {
    case 'note': ring(x, y, pr.r, pr.r, '#bfe3ff', 2); break;
    case 'chakra':
      ell(x, y, pr.r, pr.r * 0.8, '#ffd34a'); ring(x, y, pr.r, pr.r * 0.8, '#b0801a', 1);
      for (let i = 0; i < 4; i++) { const t = now * 20 + i * Math.PI / 2; line(x, y, x + Math.cos(t) * pr.r, y + Math.sin(t) * pr.r * 0.8, '#fff8d0'); }
      break;
    case 'wave': for (const k of [1, 0.6]) ring(x, y, pr.r * k, pr.r * k * 0.7, k === 1 ? '#c9b6ff' : '#e6dcff', 2, a - 1.1, a + 1.1); break;
    case 'tiger': ell(x, y, pr.r + 2, pr.r, '#ff8a1e'); line(x - ca * 16, y - sa * 16, x, y, '#ffcf6a', 3); txt('T', x, y - 4, '#3a1a00', 'center', 8, null); break;
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
function trackMotion(m) {
  const now = m.t; // match clock: poses freeze with the game
  for (const p of m.players) {
    const a = anim[p.id], d = Math.hypot(p.x - a.x, p.y - a.y), P = POSES[p.ch.id];
    if (d > 0.2) { a.moving = true; a.still = 0; } else if (++a.still > 4) a.moving = false;
    a.x = p.x; a.y = p.y;
    if (P && p.hp < a.hp - 0.01) { a.pose = P.hit; a.until = now + 0.3; }
    else if (P && a.cast && !p.cast) { // a cast just ended: hold the follow-through
      const after = { a1: P.shoot, s1: P.shoot, s2: p.ch.weapon === 'bow' ? P.shoot : null, a2: P.melee }[a.cast];
      if (after != null) { a.pose = after; a.until = now + 0.22; }
    }
    a.hp = p.hp; a.cast = p.cast ? p.cast.slot : null;
  }
}
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
  if (c.slot === 's2' && p.ch.id === 'krishna') return P.shootWind; // Venu Ganam: playing the flute
  if (c.move.kind === 'brahmastra') return P.chant ?? P.cast;
  return P.cast;
}

// fxNow: the clock the effects were stamped with (the fight clock, which stops during pauses and scenes)
export function drawFight(m, now, fx, tags = ['P1', 'P2'], fxNow = now) {
  trackMotion(m);
  drawBackdrop(now);
  drawArena();
  for (const w of m.waters) if (fxArt('water')) fxSprite(G, 'water', sx(w.x), sy(w.y), Z(w.r) * 2.3, { h: Z(w.r) * 2.3 * SQ }); else { ell(sx(w.x), sy(w.y), Z(w.r), Z(w.r) * SQ, 'rgba(60,140,220,.55)'); ring(sx(w.x), sy(w.y), Z(w.r), Z(w.r) * SQ, '#a8d8ff'); }
  for (const mk of m.marks) drawMark(mk);
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
  const order = [...m.players, ...m.walls].sort((a, b) => a.y - b.y); // back to front
  for (const o of order) if (o.ch) drawFighter(m, o, now); else drawWall(o);
  for (const pr of m.projectiles) drawProjectile(pr, now);
  for (const f of fx) if (!f.ground) drawFx(f, fxNow);
  drawHud(m, tags);
  if (m.scene) drawScene(m);
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
    case 'pop': txt(f.text, x, y - 34 - age * 20, f.color, 'center'); break;
    case 'clash': case 'flash': ring(x, y - 6, 4 + k * 12, (4 + k * 12) * 0.8, `rgba(255,255,255,${1 - k})`, 2); break;
    case 'swing': ring(x, y - 6, 12, 9, `rgba(255,255,255,${0.8 - k * 0.8})`, 2, f.a - 1, f.a + 1); break;
    case 'boom': ell(x, y, Z(22) * (0.5 + k), Z(22) * SQ * (0.5 + k), `rgba(255,140,40,${0.8 - k * 0.8})`); break;
    case 'rain': for (let i = 0; i < 9; i++) { const a = i * 2.4, r = (i / 9) * Z(f.r); line(x + Math.cos(a) * r, y + Math.sin(a) * r * SQ - 10 * (1 - k), x + Math.cos(a) * r, y + Math.sin(a) * r * SQ, '#f5e6c0'); } break;
    case 'trail': line(sx(f.x0), sy(f.y0) - 6, x, y - 6, `rgba(180,220,255,${1 - k})`, 3); break;
    case 'global': G.fillStyle = `rgba(255,220,120,${0.5 * (1 - k)})`; G.fillRect(0, 0, W, H); break;
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
const hpShown = [100, 100]; let hudLast = 0; // the health bar's red "just lost" part drains after a hit
function drawHud(m, tags) {
  const dt = Math.min(0.1, Math.max(0, m.t - hudLast)); hudLast = m.t;
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
    if (!drawPortrait(G, p.ch.id, pcx, pcy, 16)) txt(p.ch.cls === 'god' ? 'K' : 'R', pcx, pcy - 4, p.ch.color, 'center');
    ring(pcx, pcy, 17, 17, p.ch.color, 1.5); ring(pcx, pcy, 18.6, 18.6, '#c9a24a', 0.75);
    // name + tag
    txt(p.ch.name.toUpperCase(), X(46), 6, p.ch.color, al);
    G.font = `8px ${FONT}`; const nw = G.measureText(p.ch.name).width;
    txt(tags[p.id], X(46 + nw + 8), 6, tags[p.id] === 'CPU' ? '#b8b0c8' : '#fff', al);
    // health: red trail for what was just lost, then the colour bar
    hpShown[p.id] = p.hp > hpShown[p.id] ? p.hp : Math.max(p.hp, hpShown[p.id] - 30 * dt);
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
    txt(`${Math.ceil(p.hp)}%`, X(164), 16, '#fff', al);
    // power: gold, marked every 10%
    box(bx - 1, 28, 116, 5, 2, '#0d0812', '#5a4a2a');
    const pg = G.createLinearGradient(0, 29, 0, 32); pg.addColorStop(0, '#fff1a0'); pg.addColorStop(1, '#e0a21a');
    if (pw > 0) box(right ? bx + 114 * (1 - pw) : bx, 29, 114 * pw, 3, 1.5, pg);
    for (let i = 1; i < 10; i++) R(bx + 11.4 * i, 29, 0.5, 3, 'rgba(0,0,0,.45)');
    txt(`${Math.floor(p.power)}`, X(164), 27, '#ffd34a', al, 6);
    // boon / meditation line
    let info = '';
    if (p.ch.gods) info = `MEDITATIONS ${p.meditations}   ${p.boons.length ? `BOON: ${short(p.boons[0].name)}` : 'NO BOON'}`;
    else if (p.boons.length) info = p.boons.map((b) => short(b.name)).join(' ');
    if (info) txt(info, X(46), 36, p.boons.length ? '#ffcf6a' : '#c8bce0', al, 6);
  }
  // timer medallion
  const low = m.timeLeft <= 30, tg = G.createLinearGradient(0, 3, 0, 35);
  tg.addColorStop(0, 'rgba(60,34,20,.92)'); tg.addColorStop(1, 'rgba(24,12,10,.92)');
  box(CX - 34, 3, 68, 32, 8, tg, '#e8c060');
  box(CX - 31, 6, 62, 26, 6, null, 'rgba(232,192,96,.45)');
  txt(clock(m.timeLeft), CX, 11, low && Math.floor(m.t * 2) % 2 ? '#ff6a5a' : low ? '#ffb0a0' : '#fff6dc', 'center', 16);
}

// ---------- dramatic scenes (ground rule 4: the game pauses while one plays) ----------
// A 2.5 s cut-in: flash, the painting slides in on a slanted panel, letterbox bars close in, the camera
// drifts and zooms, light rays / streaks / sparks in the scene's colours, the move name slams in, white flash out.
// Paintings are art/scene_<key>.png; without one, a painted backdrop with the fighter drawn large stands in.
const SCENE_LOOK = {
  vishwaroopam: { at: [0.6, 0.16], glow: '255,214,120', spark: '255,236,170', bg: ['#2a1a5a', '#05030f'], sub: 'THE COSMIC FORM' },
  tiger_arrow: { at: [0.6, 0.33], glow: '255,130,50', spark: '255,196,96', bg: ['#7a1a10', '#140404'], sub: 'THE CHOLA TIGER' },
  brahmastra_krishna: { at: [0.42, 0.18], glow: '255,246,214', spark: '255,255,236', bg: ['#4a3a20', '#0a0806'], sub: 'THE FINAL WEAPON' },
  brahmastra_king: { at: [0.74, 0.38], glow: '255,246,214', spark: '255,255,236', bg: ['#4a3a20', '#0a0806'], sub: 'BOON OF BRAHMA' },
  pashupatastra: { at: [0.82, 0.37], glow: '160,215,255', spark: '210,240,255', bg: ['#1a2a6a', '#03050f'], sub: 'BOON OF SHIVA' },
};
export const sceneKey = (name, chId) => ({ Vishwaroopam: 'vishwaroopam', 'Tiger Arrow': 'tiger_arrow', Pashupatastra: 'pashupatastra',
  Brahmastra: chId === 'krishna' ? 'brahmastra_krishna' : 'brahmastra_king' })[name] || null;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - v) ** 3;

function drawScene(m) {
  const s = m.scene, p = m.players[s.pid], k = clamp01(s.t / s.dur), t = s.t;
  const key = sceneKey(s.name, p.ch.id), look = SCENE_LOOK[key] || { glow: '255,220,140', spark: '255,240,200', bg: [p.ch.color, '#000'], sub: '' };
  const img = useArt && key ? ART.scenes[key] : null;
  const inK = easeOut(clamp01(k / 0.12));                       // panel slide-in
  const hit = clamp01((t - 0.45) / 0.35);                       // title slam
  const shake = t > 0.45 && t < 0.9 ? (1 - (t - 0.45) / 0.45) * 2.5 : 0;
  G.save();
  G.translate(Math.sin(t * 90) * shake, Math.cos(t * 71) * shake);
  G.fillStyle = `rgba(0,0,0,${0.65 * inK})`; G.fillRect(-10, -10, W + 20, H + 20); // freeze-frame dims

  // the slanted panel slides in from the right
  const dx = (1 - inK) * (W + 80) - 40;
  G.save();
  G.beginPath(); G.moveTo(dx + 40, -10); G.lineTo(W + 60, -10); G.lineTo(W + 60, H + 10); G.lineTo(dx - 40, H + 10); G.closePath(); G.clip();
  const z = 1.0 + 0.07 * k, pan = -k * 14; // slow push-in and drift
  if (img) {
    const sc = Math.max(W / img.width, H / img.height) * z, w = img.width * sc, h = img.height * sc;
    G.imageSmoothingEnabled = true;
    G.drawImage(img, CX - w / 2 + pan, H / 2 - h / 2, w, h);
  } else {
    const g = G.createLinearGradient(0, 0, W, H); g.addColorStop(0, look.bg[0]); g.addColorStop(1, look.bg[1]);
    G.fillStyle = g; G.fillRect(-10, -10, W + 20, H + 20);
    if (useArt && ART.sheets[p.ch.id]) { // the fighter, big
      G.save(); G.translate(150 + pan, 250); G.scale(3.6 * z, 3.6 * z);
      drawSprite(G, p.ch.id, ART.sheets[p.ch.id].act ? 'act' : 'walk', ART.sheets[p.ch.id].act ? POSES[p.ch.id].cast : 0, 0, 0, false);
      G.restore();
    }
  }
  // light rays from where the power gathers
  const at = look.at || [0.64, 0.42], fx0 = W * at[0] + pan, fy0 = H * at[1], soft = img ? 0.55 : 1; // the painting carries most of it
  G.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const a = i * (Math.PI * 2 / 16) + t * 0.35, w = 0.06 + 0.04 * Math.sin(i * 3.1 + t * 2);
    G.fillStyle = `rgba(${look.glow},${(0.07 + 0.05 * Math.sin(t * 3 + i)) * soft})`;
    G.beginPath(); G.moveTo(fx0, fy0); G.arc(fx0, fy0, 420, a - w, a + w); G.closePath(); G.fill();
  }
  const core = G.createRadialGradient(fx0, fy0, 0, fx0, fy0, 90 + 30 * Math.sin(t * 6));
  core.addColorStop(0, `rgba(${look.glow},${0.45 * inK * soft})`); core.addColorStop(1, `rgba(${look.glow},0)`);
  G.fillStyle = core; G.fillRect(0, 0, W, H);
  // speed streaks rushing right, and sparks
  G.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const y = 34 + hash(i, 20) * (H - 68), sp = 300 + hash(i, 21) * 400, len = 20 + hash(i, 22) * 60;
    const x = ((t * sp + hash(i, 23) * (W + 200)) % (W + 200)) - 100;
    G.strokeStyle = `rgba(255,255,255,${0.12 + 0.18 * hash(i, 24)})`; G.lineWidth = 0.5 + hash(i, 25);
    G.beginPath(); G.moveTo(x - len, y); G.lineTo(x, y); G.stroke();
  }
  for (let i = 0; i < 46; i++) {
    const a = hash(i, 30) * Math.PI * 2, sp = 40 + hash(i, 31) * 120, life = (t * (0.6 + hash(i, 32)) + hash(i, 33)) % 1;
    const x = fx0 + Math.cos(a) * sp * life * 2.2, y = fy0 + Math.sin(a) * sp * life * 1.3 - life * 20, r = (1 - life) * (1 + hash(i, 34) * 1.6);
    G.fillStyle = `rgba(${look.spark},${(1 - life) * 0.9})`; G.beginPath(); G.arc(x, y, Math.max(0.2, r), 0, Math.PI * 2); G.fill();
  }
  G.globalCompositeOperation = 'source-over';
  // vignette
  const vg = G.createRadialGradient(CX, H / 2, H * 0.35, CX, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  G.fillStyle = vg; G.fillRect(0, 0, W, H);
  G.restore(); // panel clip
  // the panel's bright leading edge
  G.strokeStyle = `rgba(${look.glow},${0.9 * (1 - clamp01((k - 0.1) / 0.1))})`; G.lineWidth = 3;
  G.beginPath(); G.moveTo(dx + 40, -10); G.lineTo(dx - 40, H + 10); G.stroke();

  // letterbox bars
  const bar = 30 * inK;
  R(-10, -10, W + 20, bar + 10, '#000'); R(-10, H - bar, W + 20, bar + 10, '#000');
  // title: fighter, then the move name slamming down, then a gold line
  if (hit > 0) {
    const e = easeOut(hit), sz = 1 + 1.8 * (1 - e), y = H - 62;
    G.globalAlpha = e;
    txt(p.ch.name.toUpperCase(), CX, y - 14, p.ch.color, 'center');
    G.save(); G.translate(CX, y + 12); G.scale(sz, sz);
    txt(s.name.toUpperCase(), 0, -12, '#ffe7a0', 'center', 24, 'rgba(40,16,0,.9)');
    G.restore();
    const lw = 150 * easeOut(clamp01((t - 0.7) / 0.4));
    R(CX - lw, y + 38, lw * 2, 1, `rgba(${look.glow},.9)`);
    if (look.sub) txt(look.sub, CX, y + 44, `rgba(${look.spark},.9)`, 'center', 8, null);
    G.globalAlpha = 1;
  }
  G.restore(); // shake
  // flashes: a white pop at the start, and a white-out into the move going off
  const flash = Math.max(0, 1 - t / 0.12) * 0.9 + clamp01((k - 0.84) / 0.16) ** 2 * 0.95;
  if (flash > 0.01) { G.fillStyle = `rgba(255,252,240,${flash})`; G.fillRect(0, 0, W, H); }
}

// ---------- screens ----------
export function drawTitle(now, pads) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.72)');
  txt('MYTH FIGHTER', CX, 12, '#ffcf6a', 'center', 16);
  txt('KRISHNA (GOD)  VS  RAJA RAJA CHOLA (KING)', CX, 34, '#fff', 'center');
  const k3 = (k, n) => k.slice(0, n).map(KEY_NAME).join('+');
  const sp = (K) => ['s1', 's2', 's3'].map((s) => K[s][0]);
  const combos = {
    sig: ['Signature: all 3 specials', k3(sp(KEYS[0]), 3), k3(sp(KEYS[1]), 3), 'B+Y+LB'],
    boon: ['Use boon: 2 specials', k3(sp(KEYS[0]), 2), k3(sp(KEYS[1]), 2), 'B+Y'],
    cls: ['Meditate/Brahmastra: down+sp1', `S+${KEY_NAME(KEYS[0].s1[0])}`, `DN+${KEY_NAME(KEYS[1].s1[0])}`, 'DOWN+B'],
  };
  const rows = ['move', ...ACTIONS, 'sig', 'boon', 'cls'];
  let y = 62;
  txt('ACTION', 8, y, '#9aa'); txt('P1', 290, y, '#9aa'); txt('P2', 340, y, '#9aa'); txt('PAD', 400, y, '#9aa');
  y += 11;
  for (const a of rows) {
    const row = a === 'move' ? ['Move', 'WASD', 'ARROWS', 'STICK'] : combos[a]
      || [LABELS[a], KEYS[0][a].map(KEY_NAME).join('/'), KEYS[1][a].map(KEY_NAME).join('/'), PAD_NAMES[PAD[a]]];
    txt(row[0].toUpperCase().slice(0, 34), 8, y, combos[a] ? '#ffcf6a' : '#ddd');
    row.slice(1).forEach((s, i) => txt(s, [290, 340, 400][i], y, '#fff'));
    y += 11;
  }
  if (Math.floor(now * 2) % 2) txt('PRESS START / ENTER', CX, H - 14, '#ffcf6a', 'center');
  txt(`PADS: ${pads}`, W - 6, H - 14, '#9aa', 'right');
}

export function drawSetup(now, o) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.65)');
  txt('MATCH SETUP', CX, 40, '#ffcf6a', 'center', 16);
  const names = ['KRISHNA', 'RAJA RAJA CHOLA'];
  const show = {
    mode: ['PLAYERS', o.mode === '1p' ? '1 PLAYER VS CPU' : '2 PLAYERS'],
    side: ['YOU PLAY', names[o.side]],
    level: ['CPU LEVEL', o.levelName],
    length: ['LENGTH', `${o.minutes} MIN`],
  };
  o.rows.forEach((r, i) => {
    const y = 84 + i * 24, on = i === o.row, [label, val] = show[r];
    if (on) R(CX - 170, y - 5, 340, 18, 'rgba(255,207,106,.15)');
    txt(label, CX - 160, y, on ? '#ffcf6a' : '#ddd');
    txt(on ? `<  ${val}  >` : val, CX + 160, y, on ? '#ffcf6a' : '#fff', 'right');
  });
  const tip = o.mode === '1p' ? `CPU PLAYS ${names[1 - o.side]}. USE EITHER KEY SET OR PAD 1.` : 'P1: WASD + F G H Q E R T Y    P2: ARROWS + K L ; U J I O P';
  txt(tip, CX, 200, '#9aa', 'center');
  txt('UP/DOWN PICK  LEFT/RIGHT CHANGE  ENTER FIGHT  ESC BACK', CX, 220, '#ddd', 'center');
}

export function drawPause(sel) {
  R(0, 0, W, H, 'rgba(0,0,0,.6)');
  txt('PAUSED', CX, 90, '#fff', 'center', 16);
  ['RESUME', 'QUIT TO TITLE'].forEach((s, i) => txt((i === sel ? '> ' : '  ') + s, CX, 130 + i * 16, i === sel ? '#ffcf6a' : '#ddd', 'center'));
}

export function drawResult(m, sel) {
  R(0, 44, W, H - 44, 'rgba(0,0,0,.6)');
  const r = m.result, why = { ko: 'KNOCKOUT', time: 'TIME UP', double: 'DOUBLE KNOCKOUT', brahmastra: 'BRAHMASTRA' }[r.reason];
  txt(why, CX, 80, '#ddd', 'center');
  txt(r.winner == null ? 'DRAW' : `${m.players[r.winner].ch.name.toUpperCase()} WINS`, CX, 100, r.winner == null ? '#fff' : m.players[r.winner].ch.color, 'center', 16);
  m.players.forEach((p, i) => txt(`${p.ch.name}: ${Math.ceil(p.hp)}% health, dealt ${Math.round(p.stats.dealt)}%`, CX, 134 + i * 12, '#ddd', 'center'));
  ['REMATCH', 'MATCH SETUP', 'TITLE'].forEach((s, i) => txt((i === sel ? '> ' : '  ') + s, CX, 176 + i * 14, i === sel ? '#ffcf6a' : '#ddd', 'center'));
}

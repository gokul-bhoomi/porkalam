// Drawing on a 480x270 canvas: the generated art (src/art.js) where it exists, grey-box shapes otherwise.
// Only reads the match state.
import { W, H, RES, ARENA, TUNE } from './config.js';
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

function drawFighter(m, p, now) {
  const x = sx(p.x), y = sy(p.y), c = p.ch.color, o = opponent(m, p);
  ell(x, y + 1, 9, 4, 'rgba(0,0,0,.3)');
  if (p.effects.invuln && Math.floor(now * 20) % 2) G.globalAlpha = 0.4;
  let top = y - 30;
  if (useArt && ART.sheets[p.ch.id]) {
    ring(x, y + 1, Z(9), Z(9) * SQ, p.id === 0 ? 'rgba(90,160,255,.9)' : 'rgba(255,90,70,.9)', 1); // player ring
    const pose = poseOf(m, p);
    if (m.phase === 'done' && drawEnd(m, p, x, y + 1, now)) { /* knockout / victory */ }
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
    fxSprite(G, name, x, hy, size, name === 'chakra' ? { spin: now * 14 } : name === 'notes' ? { flip } : { rot: left ? a - Math.PI : a, flip: (name === 'wave') !== left });
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
    for (const p of m.players) Object.assign(anim[p.id], { x: p.x, y: p.y, moving: false, still: 0, hp: p.hp, cast: null, pose: null, until: 0, doneAt: null });
    hpShown[0] = hpShown[1] = 100;
  }
  for (const p of m.players) {
    const a = anim[p.id];
    if (m.phase !== 'done') a.doneAt = null;
    const d = Math.hypot(p.x - a.x, p.y - a.y), P = POSES[p.ch.id];
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
  return P.cast;
}

// fxNow: the clock the effects were stamped with (the fight clock, which stops during pauses and scenes)
export function drawFight(m, now, fx, tags = ['P1', 'P2'], fxNow = now, hints = [null, null]) {
  trackMotion(m);
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
  if (m.scene) sceneAura(m, now);
  G.restore();
  if (!m.scene) drawHud(m, tags, hints);
  else sceneTitle(m);
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
    case 'shatter': { // the island breaks: glowing fissures race out across the sand, chunks fly and fall, dust
      G.save(); G.beginPath(); G.ellipse(CX, CY, ARENA.r * SC, ARENA.r * SC * SQ, 0, 0, Math.PI * 2); G.clip();
      const run = easeOut(clamp01(age / 0.35)), glow = 1 - clamp01((age - 0.2) / 1.6);
      fissures(x, y, f.seed, run, glow);
      G.restore();
      for (let i = 0; i < 34; i++) { // chunks of sand and stone thrown up
        const a = hash(i, f.seed) * Math.PI * 2, sp = 30 + hash(i, f.seed + 1) * 70, up = (70 + hash(i, f.seed + 2) * 90) * age - 160 * age * age;
        if (up < -4) continue;
        const px = x + Z(Math.cos(a) * sp * age), py = y + Z(Math.sin(a) * sp * age) * SQ - Z(up), s2 = 1 + hash(i, f.seed + 3) * 2.2;
        G.fillStyle = i % 3 ? `rgba(196,140,80,${1 - k})` : `rgba(110,70,40,${1 - k})`;
        G.save(); G.translate(px, py); G.rotate(age * (4 + i)); G.fillRect(-s2 / 2, -s2 / 2, s2, s2 * 0.8); G.restore();
      }
      const dust = G.createRadialGradient(x, y - 6, 2, x, y - 6, Z(45) * (0.4 + k));
      dust.addColorStop(0, `rgba(230,200,150,${0.45 * (1 - k)})`); dust.addColorStop(1, 'rgba(230,200,150,0)');
      G.fillStyle = dust; G.beginPath(); G.ellipse(x, y - 6, Z(45) * (0.4 + k), Z(45) * (0.4 + k) * 0.7, 0, 0, Math.PI * 2); G.fill();
      break;
    }
    case 'scar': { // what the shattering leaves behind: dark fissures that slowly fade
      G.save(); G.beginPath(); G.ellipse(CX, CY, ARENA.r * SC, ARENA.r * SC * SQ, 0, 0, Math.PI * 2); G.clip();
      fissures(x, y, f.seed, 1, 0, Math.min(1, (f.life - age) / 10));
      G.restore();
      break;
    }
    case 'invoke': { // the god's light comes down on the fighter who called them
      const col = GOD_GLOW[f.god] || '255,225,150', a = Math.sin(Math.PI * Math.min(1, k * 1.1)), w = Z(9) * (1 + 0.3 * Math.sin(age * 14));
      const beam = G.createLinearGradient(x - w, 0, x + w, 0);
      beam.addColorStop(0, `rgba(${col},0)`); beam.addColorStop(0.5, `rgba(${col},${0.7 * a})`); beam.addColorStop(1, `rgba(${col},0)`);
      G.fillStyle = beam; G.fillRect(x - w, -10, w * 2, y + 10);
      for (let i = 0; i < 3; i++) { const t = (age * 1.4 + i / 3) % 1; ring(x, y, Z(6 + 22 * t), Z(6 + 22 * t) * SQ, `rgba(${col},${(1 - t) * a})`, 1.2); }
      for (let i = 0; i < 18; i++) { const t = (age * 0.9 + hash(i, 60)) % 1; G.fillStyle = `rgba(255,255,240,${(1 - t) * a})`; G.beginPath(); G.arc(x + (hash(i, 61) - 0.5) * Z(20), y - t * 70, 0.6 + hash(i, 62), 0, Math.PI * 2); G.fill(); }
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
const hpShown = [100, 100]; let hudLast = 0; // the health bar's red "just lost" part drains after a hit
function drawHud(m, tags, hints = [null, null]) {
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
    if (!drawPortrait(G, p.ch.id, pcx, pcy, 16)) txt(p.ch.cls === 'mage' ? 'M' : 'W', pcx, pcy - 4, p.ch.color, 'center');
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
    // devotion: 10 segments earned by meditating; a part-filled one only counts once it's full
    const MD = TUNE.meditate, segW = 7.2, dx0 = X(46, MD.segments * segW), part = p.med ? Math.min(1, p.med.meter / MD.segTime) : 0;
    for (let i = 0; i < MD.segments; i++) {
      const sxp = dx0 + (right ? MD.segments - 1 - i : i) * segW, full = i < p.devotion, tierEdge = MD.tiers.includes(i + 1);
      R(sxp, 36, segW - 1.2, 5, '#0d0812');
      if (full) R(sxp, 36, segW - 1.2, 5, i + 1 > MD.tiers[1] ? '#fff2b0' : i + 1 > MD.tiers[0] ? '#ffcf6a' : '#e0a040');
      else if (i === p.devotion && part > 0) R(sxp, 36 + 5 * (1 - part), segW - 1.2, 5 * part, 'rgba(255,207,106,.45)');
      if (tierEdge) R(sxp + segW - 1.2, 35, 0.6, 7, '#c9a24a');
    }
    const tierName = p.devotion >= MD.tiers[2] ? 'DIVINE' : p.devotion >= MD.tiers[1] ? 'MEDIUM' : p.devotion >= MD.tiers[0] ? 'SMALL' : '';
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
  siddhan_sig: { face: [0.3, 0.3], at: [0.62, 0.35], glow: '120,240,230', spark: '200,255,250', bg: ['#123a4a', '#03080c'], sub: 'THE MAGE AWAKENS' },
  veeran_elephant: { fallback: 'veeran_sig', face: [0.25, 0.3], at: [0.6, 0.33], glow: '255,130,50', spark: '255,196,96', bg: ['#7a1a10', '#140404'], sub: 'THE WAR ELEPHANT' },
  vishwaroopam: { face: [0.375, 0.21], at: [0.6, 0.16], glow: '255,214,120', spark: '255,236,170', bg: ['#2a1a5a', '#05030f'], sub: 'DIVINE BOON OF KRISHNA' },
  shakti_vel: { face: [0.4, 0.3], at: [0.7, 0.4], glow: '255,200,90', spark: '255,240,190', bg: ['#5a3a10', '#0a0604'], sub: 'DIVINE BOON OF MURUGAN' },
  brahmastra: { face: [0.4, 0.3], at: [0.7, 0.38], glow: '255,246,214', spark: '255,255,236', bg: ['#4a3a20', '#0a0806'], sub: 'DIVINE BOON OF BRAHMA' },
  pashupatastra: { face: [0.4, 0.3], at: [0.82, 0.37], glow: '160,215,255', spark: '210,240,255', bg: ['#1a2a6a', '#03050f'], sub: 'DIVINE BOON OF SHIVA' },
};
export const sceneKey = (name) => ({ 'Thousand-Arm Form': 'siddhan_sig', 'Gaja Arrow': 'veeran_elephant', Pashupatastra: 'pashupatastra',
  Brahmastra: 'brahmastra', 'Shakti Vel': 'shakti_vel', Vishwaroopam: 'vishwaroopam' })[name] || null;
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
  const dim = G.createRadialGradient(x, y - 20, 18, x, y - 20, 140);
  dim.addColorStop(0, 'rgba(0,0,0,0)'); dim.addColorStop(1, `rgba(5,3,12,${0.55 * fade})`);
  G.fillStyle = dim; G.fillRect(-300, -300, W + 600, H + 600);
  G.save(); G.globalCompositeOperation = 'lighter';
  const pulse = 0.75 + 0.25 * Math.sin(t * 12);
  const glow = G.createRadialGradient(x, y - 22, 2, x, y - 22, 34 * pulse);
  glow.addColorStop(0, `rgba(${look.glow},${0.55 * fade})`); glow.addColorStop(1, `rgba(${look.glow},0)`);
  G.fillStyle = glow; G.fillRect(x - 60, y - 90, 120, 120);
  ring(x, y + 1, Z(12) * (1 + 0.15 * Math.sin(t * 9)), Z(12) * SQ * (1 + 0.15 * Math.sin(t * 9)), `rgba(${look.glow},${0.9 * fade})`, 1.2);
  for (let i = 0; i < 26; i++) { // energy rising up the body
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
const TIER_LABEL = { small: 'A SMALL BOON', medium: 'A MEDIUM BOON', divine: 'A DIVINE WEAPON' };
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

// ---------- screens ----------
export function drawTitle(now, pads) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.72)');
  txt('MYTH FIGHTER', CX, 12, '#ffcf6a', 'center', 16);
  txt('SIDDHAN (MAGE)  VS  VEERAN (WARRIOR)', CX, 34, '#fff', 'center');
  txt('INSPIRED BY HINDU MYTHOLOGY', CX, 46, '#c9b07a', 'center');
  const k3 = (k, n) => k.slice(0, n).map(KEY_NAME).join('+');
  const sp = (K) => ['s1', 's2', 's3'].map((s) => K[s][0]);
  const combos = {
    sig: ['Signature: all 3 specials', k3(sp(KEYS[0]), 3), k3(sp(KEYS[1]), 3), 'B+Y+LB'],
    boon: ['Spend devotion: 2 specials', k3(sp(KEYS[0]), 2), k3(sp(KEYS[1]), 2), 'B+Y'],
    cls: ['Meditate: down+sp1', `S+${KEY_NAME(KEYS[0].s1[0])}`, `DN+${KEY_NAME(KEYS[1].s1[0])}`, 'DOWN+B'],
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
  txt('M: SOUND ON/OFF', 6, H - 14, '#9aa');
}

export function drawSetup(now, o) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.65)');
  txt('MATCH SETUP', CX, 40, '#ffcf6a', 'center', 16);
  const names = ['SIDDHAN (MAGE)', 'VEERAN (WARRIOR)'];
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

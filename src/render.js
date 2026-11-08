// Drawing on a 480x270 canvas: the generated art (src/art.js) where it exists, grey-box shapes otherwise.
// Only reads the match state.
import { W, H, ARENA, TUNE } from './config.js';
import { ACTIONS, LABELS, KEYS, KEY_NAME, PAD, PAD_NAMES } from './input.js';
import { opponent, chargeOf } from './sim.js';
import { ART, drawSprite } from './art.js';

export const FONT = '"Press Start 2P", monospace';
export const CX = 240;                // screen centre
export let CY = 160, SQ = 0.62, SC = 1; // arena centre on screen, y squash for the 3/4 view, screen px per world unit (set from the art)
export const sx = (x) => CX + x * SC, sy = (y) => CY + y * SQ * SC;
const Z = (r) => r * SC;              // a world-unit size on screen
export let useArt = true;             // false = grey-box shapes (?grey=1, or the G key)
export const setUseArt = (v) => { useArt = v; fitView(); };

// Line the world up with the arena floor in arena.png, then draw the picture at the matching scale.
let arenaDraw = null;
export function fitView() {
  const img = ART.arena, f = ART.fit;
  if (!useArt || !img) { CY = 160; SQ = 0.62; SC = 1; arenaDraw = null; return; }
  const s = Math.max(W / img.width, H / img.height); // the picture covers the whole screen
  const w = img.width * s, h = img.height * s, x = (W - w) / 2, y = (H - h) / 2;
  SC = (f.rx * img.width * s) / ARENA.r;             // the floor's half-width = the arena radius
  SQ = (f.ry * img.height) / (f.rx * img.width);
  CY = y + f.cy * img.height * s;
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
function drawBackdrop(now) {
  if (useArt && arenaDraw) { // the picture already has sky, clouds and arena
    R(0, 0, W, H, '#5a55a8');
    G.imageSmoothingEnabled = true;
    G.drawImage(ART.arena, arenaDraw.x, arenaDraw.y, arenaDraw.w, arenaDraw.h);
    G.imageSmoothingEnabled = false;
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
  if (w.look === 'hill') { // Govardhana: a mound that grows
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
    const moving = anim[p.id].moving, fps = moving ? 10 : 5, i = Math.floor(now * fps) % 4 + (moving ? 4 : 0);
    drawSprite(G, p.ch.id, i, x, y + 1, p.face.x < 0);
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
const anim = [{ x: 0, y: 0, moving: false, still: 0 }, { x: 0, y: 0, moving: false, still: 0 }];
const ART_TOP = 58;
function trackMotion(m) {
  for (const p of m.players) {
    const a = anim[p.id], d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d > 0.2) { a.moving = true; a.still = 0; } else if (++a.still > 4) a.moving = false;
    a.x = p.x; a.y = p.y;
  }
}

export function drawFight(m, now, fx) {
  trackMotion(m);
  drawBackdrop(now);
  drawArena();
  for (const w of m.waters) { ell(sx(w.x), sy(w.y), Z(w.r), Z(w.r) * SQ, 'rgba(60,140,220,.55)'); ring(sx(w.x), sy(w.y), Z(w.r), Z(w.r) * SQ, '#a8d8ff'); }
  for (const mk of m.marks) drawMark(mk);
  for (const a of m.areas) {
    const k = 1 - a.t / a.delay;
    ring(sx(a.x), sy(a.y), Z(a.r), Z(a.r) * SQ, '#ff4a3a', 1);
    ell(sx(a.x), sy(a.y), Z(a.r) * k, Z(a.r) * SQ * k, 'rgba(255,74,58,.3)');
  }
  for (const u of m.units) { ell(sx(u.x), sy(u.y) - 4, Z(u.r), Z(u.r), '#999'); txt(`${Math.ceil(u.hp)}`, sx(u.x), sy(u.y) - 20, '#fff', 'center'); }
  for (const f of fx) if (f.ground) drawFx(f, now);
  const order = [...m.players, ...m.walls].sort((a, b) => a.y - b.y); // back to front
  for (const o of order) if (o.ch) drawFighter(m, o, now); else drawWall(o);
  for (const pr of m.projectiles) drawProjectile(pr, now);
  for (const f of fx) if (!f.ground) drawFx(f, now);
  drawHud(m);
  if (m.scene) drawScene(m);
}

function drawFx(f, now) {
  const age = now - f.t0, k = age / f.life, x = sx(f.x), y = sy(f.y);
  switch (f.kind) {
    case 'pop': txt(f.text, x, y - 34 - age * 20, f.color, 'center'); break;
    case 'flash': ring(x, y - 6, 4 + k * 12, (4 + k * 12) * 0.8, `rgba(255,255,255,${1 - k})`, 2); break;
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
function drawHud(m) {
  R(0, 0, W, 42, 'rgba(10,12,20,.78)');
  for (const p of m.players) {
    const right = p.id === 1, x = right ? W - 6 : 6, al = right ? 'right' : 'left', BW = 150, bx = right ? W - 6 - BW : 6;
    txt(p.ch.name.toUpperCase(), x, 2, p.ch.color, al);
    bar(bx, 12, BW, 7, p.hp / 100, p.hp > 25 ? '#5ad15a' : '#e8402e', right);
    txt(`${Math.ceil(p.hp)}%`, right ? bx - 4 : bx + BW + 4, 11, '#fff', right ? 'right' : 'left');
    bar(bx, 22, BW, 4, p.power / p.ch.power.size, '#ffd34a', right);
    txt(`${Math.floor(p.power)}`, right ? bx - 4 : bx + BW + 4, 20, '#ffd34a', right ? 'right' : 'left');
    let info;
    if (p.ch.gods) {
      info = `MEDITATIONS ${p.meditations}  ${p.boons.length ? `BOON: ${short(p.boons[0].name)}` : 'NO BOON'}`;
    } else info = p.boons.length ? p.boons.map((b) => short(b.name)).join(' ') : '';
    txt(info, x, 31, '#e6dcff', al);
  }
  txt(clock(m.timeLeft), CX, 4, m.timeLeft <= 30 ? '#ff6a5a' : '#fff', 'center', 16);
}

function drawScene(m) {
  const s = m.scene, p = m.players[s.pid], k = s.t / s.dur;
  G.fillStyle = 'rgba(0,0,0,.55)'; G.fillRect(0, 0, W, H);
  R(0, 0, W, 50, '#000'); R(0, H - 50, W, 50, '#000');
  const g = G.createLinearGradient(0, 50, 0, H - 50);
  g.addColorStop(0, p.ch.color); g.addColorStop(1, '#000');
  G.globalAlpha = 0.5; G.fillStyle = g; G.fillRect(0, 50, W, H - 100); G.globalAlpha = 1;
  const zoom = 1 + k * 0.3;
  txt(p.ch.name.toUpperCase(), CX, 90, '#fff', 'center');
  txt(s.name.toUpperCase(), CX, 120 - k * 6, '#ffcf6a', 'center', Math.round(16 * zoom));
  txt('(DRAMATIC SCENE GOES HERE)', CX, 170, 'rgba(255,255,255,.6)', 'center');
  R(CX - 80, H - 30, 160 * k, 2, '#ffcf6a');
}

// ---------- screens ----------
export function drawTitle(now, pads) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.72)');
  txt('MYTH FIGHTER', CX, 12, '#ffcf6a', 'center', 16);
  txt('KRISHNA (GOD)  VS  RAJA RAJA CHOLA (KING)', CX, 34, '#fff', 'center');
  txt('GREY-BOX', CX, 46, '#9aa', 'center');
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

export function drawSetup(now, minutes) {
  drawBackdrop(now); drawArena();
  R(0, 0, W, H, 'rgba(10,12,20,.6)');
  txt('MATCH LENGTH', CX, 80, '#fff', 'center', 16);
  txt(`<  ${minutes} MIN  >`, CX, 120, '#ffcf6a', 'center', 16);
  txt('LEFT / RIGHT TO CHANGE (1-10)', CX, 160, '#ddd', 'center');
  txt('START / ENTER TO FIGHT    ESC BACK', CX, 176, '#ddd', 'center');
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
  ['REMATCH', 'CHANGE LENGTH', 'TITLE'].forEach((s, i) => txt((i === sel ? '> ' : '  ') + s, CX, 176 + i * 14, i === sel ? '#ffcf6a' : '#ddd', 'center'));
}

// Loads the generated art from art/*.png. Anything missing just leaves the grey-box drawing in place,
// so the game always runs. Sprite sheets are one row of frames on a flat key colour (magenta): the
// colour is keyed out here, the frames are found by the empty columns between them, and every frame
// is lined up on the same foot baseline.
import { RES } from './config.js';

export const ART = { arena: null, fit: null, sheets: {}, fx: {}, scenes: {}, sceneLayers: {}, gods: {}, cards: {}, title: null, arms: null, ready: false };
// Dramatic scene paintings (art/scene_<key>.png), drawn by drawScene in render.js.
const SCENES = ['siddhan_sig', 'veeran_sig', 'veeran_elephant', 'pashupatastra', 'brahmastra', 'shakti_vel', 'vishwaroopam'];
// The boon gods, painted blessing (art/god_<name>.png, and the figure alone on magenta in god_<name>_fg.png).
const GOD_ART = ['shiva', 'murugan', 'brahma', 'krishna'];

// Effect sprites (walls, shots, ground patches, bursts): two sheets of 8 square cells, same format as the fighters.
const FX_SHEETS = ['art/fx_sheet.png', 'art/fx2_sheet.png'];
const FX_NAMES = [
  ['hill', 'arrowWall', 'chakra', 'notes', 'arrow', 'tiger', 'fire', 'spear'],
  ['wave', 'water', 'scuff', 'burst', 'spark', 'rain', 'danger', 'clash'],
];

// Where the arena floor sits in arena.png, as fractions of the image: centre and half-axes.
// Measured by hand from the image; art/arena.json overrides it when present.
const DEFAULT_FIT = { cx: 0.5, cy: 0.58, rx: 0.23, ry: 0.115 };
// Per fighter: walk = 1-4 idle, 5-8 walk; act = the 8 action poses (see POSES).
const SHEETS = {
  siddhan: { walk: 'art/siddhan_sheet.png', act: 'art/siddhan_actions.png' },
  veeran: { walk: 'art/veeran_sheet.png', act: 'art/veeran_actions.png' },
};
// Frame numbers in each action sheet (0-based).
export const POSES = {
  siddhan: { shootWind: 0, shoot: 1, meleeWind: 2, melee: 3, block: 4, cast: 5, hit: 6, meditate: 7 },
  veeran: { shootWind: 0, shoot: 1, meleeWind: 2, melee: 3, block: 4, cast: 5, hit: 6, meditate: 7 },
};
export const SPRITE_H = 46; // on-screen height of a fighter, in layout units (x RES real pixels)

const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function keyOut(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  const k = [px[0], px[1], px[2]]; // the key colour is whatever the top-left corner is
  for (let i = 0; i < px.length; i += 4) {
    const dist = Math.abs(px[i] - k[0]) + Math.abs(px[i + 1] - k[1]) + Math.abs(px[i + 2] - k[2]);
    const magentaish = px[i] > 200 && px[i + 2] > 200 && px[i + 1] < 90; // anti-aliased edge pixels (not the pink shawl)
    if (dist < 100 || magentaish) px[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
  return { c, d };
}

// Find frames as runs of non-empty columns; fall back to equal cells if that doesn't give the expected count.
function frames(c, d, expect = 8) {
  const W = c.width, Hh = c.height, px = d.data, col = new Array(W).fill(0);
  let top = Hh, bottom = 0;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 40) { col[x]++; if (y < top) top = y; if (y > bottom) bottom = y; }
  const runs = [];
  for (let x = 0, s = -1; x <= W; x++) {
    const on = x < W && col[x] > 2;
    if (on && s < 0) s = x;
    if (!on && s >= 0) { if (x - s > W / expect / 6) runs.push([s, x]); s = -1; }
  }
  const square = W === Hh * expect; // the agreed format: 8 square cells, character centred in each
  const cells = !square && runs.length === expect ? runs : Array.from({ length: expect }, (_, i) => [Math.round((i * W) / expect), Math.round(((i + 1) * W) / expect)]);
  return { cells: cells.map(([a, b]) => ({ x: a, w: b - a, cx: (a + b) / 2 })), top, bottom };
}

// Shrink the whole sheet once, with smoothing (halving steps), so frames draw 1:1 and stay crisp.
function prescale(c, f, k) {
  let src = c, w = c.width, h = c.height;
  const tw = Math.round(c.width * k), th = Math.round(c.height * k);
  while (w / 2 > tw) { // step down by halves for a clean result
    const n = document.createElement('canvas'); n.width = Math.round(w / 2); n.height = Math.round(h / 2);
    const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, n.width, n.height);
    src = n; w = n.width; h = n.height;
  }
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);
  return {
    canvas: out, top: Math.floor(f.top * k), bottom: Math.ceil(f.bottom * k), base: Math.ceil((f.base ?? f.bottom) * k),
    cells: f.cells.map((cl) => ({ x: Math.floor(cl.x * k), w: Math.ceil(cl.w * k), cx: cl.cx * k })),
  };
}

export async function loadArt(base = '') {
  const [arena, fitJson] = await Promise.all([
    loadImg(base + 'art/arena.png'),
    fetch(base + 'art/arena.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  ART.arena = arena;
  ART.fit = { ...DEFAULT_FIT, ...(fitJson || {}) };
  for (const [id, src] of Object.entries(SHEETS)) {
    const [walkImg, actImg] = await Promise.all([loadImg(base + src.walk), loadImg(base + src.act)]);
    if (!walkImg) continue;
    const w = keyOut(walkImg), wf = frames(w.c, w.d);
    const k = (SPRITE_H * RES) / Math.max(1, wf.bottom - wf.top + 1); // the walk sheet sets the size...
    ART.sheets[id] = { walk: prescale(w.c, wf, k), act: null };
    if (actImg && actImg.width === walkImg.width && actImg.height === walkImg.height) {
      const a = keyOut(actImg), af = frames(a.c, a.d);
      ART.sheets[id].act = prescale(a.c, { ...af, base: wf.bottom }, k); // ...and the feet line for both sheets
    }
  }
  const sceneImgs = await Promise.all(SCENES.map((k) => loadImg(`${base}art/scene_${k}.png`)));
  SCENES.forEach((k, i) => { if (sceneImgs[i]) ART.scenes[k] = sceneImgs[i]; });
  // optional layers for parallax: backdrop (plain) and the figure (on magenta, keyed out here)
  await Promise.all(['siddhan_sig', 'veeran_sig', 'veeran_elephant'].map(async (k) => { // only the fighters' scenes have layers
    const [bg, fg] = await Promise.all([loadImg(`${base}art/scene_${k}_bg.png`), loadImg(`${base}art/scene_${k}_fg.png`)]);
    if (bg && fg) ART.sceneLayers[k] = { bg, fg: keyOut(fg).c };
  }));
  await Promise.all(GOD_ART.map(async (g) => {
    const [img, fg] = await Promise.all([loadImg(`${base}art/god_${g}.png`), loadImg(`${base}art/god_${g}_fg.png`)]);
    if (img) ART.gods[g] = { img, fg: fg ? keyOut(fg).c : null };
  }));
  await Promise.all(Object.keys(SHEETS).map(async (id) => { const c = await loadImg(`${base}art/card_${id}.png`); if (c) ART.cards[id] = c; })); // character-select cards
  ART.title = await loadImg(base + 'art/title.png'); // the title screen key art
  if (ART.sceneLayers.siddhan_sig) ART.arms = cutArms(ART.sceneLayers.siddhan_sig.bg); // the Thousand-Arm Form's spirit, for the arena
  const fxImgs = await Promise.all(FX_SHEETS.map((f) => loadImg(base + f)));
  fxImgs.forEach((img, si) => { if (img) Object.assign(ART.fx, cutFx(img, FX_NAMES[si])); });
  const hands = await loadImg(base + 'art/fx_hands.png'); // the Thousand-Arm Form: 4 arms, 4 striking palms
  if (hands) Object.assign(ART.fx, cutFx(hands, ['arm1', 'arm2', 'arm3', 'arm4', 'palm1', 'palm2', 'palm3', 'palm4']));
  const circleHands = await loadImg(base + 'art/fx_hands_circle.png');
  if (circleHands) Object.assign(ART.fx, cutFx(circleHands, ['circleArm', 'circlePalm']));
  const haloHands = await loadImg(base + 'art/fx_hands_halo.png');
  if (haloHands) Object.assign(ART.fx, cutFx(haloHands, ['haloArm', 'haloPalm']));
  const ele = await loadImg(base + 'art/fx_elephant.png'); // single sprite: the Gaja Arrow's war elephant
  if (ele) Object.assign(ART.fx, cutFx(ele, ['elephant']));
  ART.ready = true;
  return ART;
}

// Draw frame `i` of a fighter's walk or act sheet with its feet at (x, y). flip = facing left.
export function drawSprite(g, id, set, i, x, y, flip) {
  const s = ART.sheets[id]?.[set];
  if (!s) return false;
  const f = s.cells[i % s.cells.length], h = s.bottom - s.top + 1, up = s.base - s.top + 1;
  g.save();
  g.translate(Math.round(x * RES) / RES, Math.round(y * RES) / RES);
  if (flip) g.scale(-1, 1);
  g.imageSmoothingEnabled = true;
  g.drawImage(s.canvas, f.x, s.top, f.w, h, -(f.cx - f.x) / RES, -up / RES, f.w / RES, h / RES); // 1 sheet pixel = 1 screen pixel
  g.restore();
  return true;
}

// Key out an effect sheet, shrink it to half size (still more pixels than the screen needs), and
// find each cell's drawn area, so a sprite can be placed by its real edges.
function cutFx(img, names) {
  const { c, d } = keyOut(img), n = names.length, cw = c.width / n, px = d.data, out = {};
  const k = 0.5, small = document.createElement('canvas');
  small.width = Math.round(c.width * k); small.height = Math.round(c.height * k);
  const g = small.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, small.width, small.height);
  names.forEach((name, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += 2) for (let x = Math.round(i * cw); x < Math.round((i + 1) * cw); x += 2) {
      if (px[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    out[name] = { canvas: small, x: x0 * k, y: y0 * k, w: (x1 - x0 + 2) * k, h: (y1 - y0 + 2) * k };
  });
  return out;
}

// Draw an effect sprite. w = drawn width in layout units; h = height (default keeps the shape).
// anchor 'bottom' puts the bottom centre at (x, y) (things standing on the ground), 'center' the middle.
// rot = rotation in radians (sprites point right); m = optional [a, b, c, d] matrix applied after it (walls).
export function drawFx(g, name, x, y, w, o = {}) {
  const f = ART.fx[name];
  if (!f) return false;
  const h = o.h ?? (w * f.h) / f.w;
  g.save();
  g.translate(x, y);
  if (o.m) g.transform(o.m[0], o.m[1], o.m[2], o.m[3], 0, 0);
  if (o.rot) g.rotate(o.rot);
  if (o.spin != null) { // a flat disc seen from above: spin it in its own plane, then squash it back into perspective
    const q = h / w;
    g.scale(1, q); g.rotate(o.spin);
    g.imageSmoothingEnabled = true;
    g.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w / 2, -w / 2, w, w);
    g.restore();
    return true;
  }
  if (o.flip) g.scale(-1, 1);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.imageSmoothingEnabled = true;
  g.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w / 2, o.anchor === 'bottom' ? -h : -h / 2, w, h);
  g.restore();
  return true;
}

// A round head-and-shoulders portrait for the HUD, cut from the first idle frame.
export function drawPortrait(g, id, cx, cy, r) {
  const s = ART.sheets[id]?.walk;
  if (!s) return false;
  const c = s.cells[0], h = s.bottom - s.top, side = h * 0.42; // the top ~40% of the figure: head and crown
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(s.canvas, c.cx - side / 2, s.top, side, side, cx - r, cy - r, r * 2, r * 2);
  g.restore();
  return true;
}

// Keep only the glowing teal arms of the Thousand-Arm painting (bright, more green-blue than red), crop to
// the left part where the figure of arms is, and shrink it: a transparent spirit sprite for the arena.
function cutArms(img) {
  const sx = 0, sy = 0, sw = Math.round(img.width * 0.62), sh = Math.round(img.height * 0.9), k = 0.5;
  const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2], teal = Math.min(gg, b) - r * 0.7, bright = (gg + b) / 2;
    const j = i / 4, xx = j % c.width, yy = Math.floor(j / c.width);
    const edge = Math.min(1, xx / (c.width * 0.08), (c.width - xx) / (c.width * 0.3), yy / (c.height * 0.08), (c.height - yy) / (c.height * 0.2)); // soft edges, no hard crop line
    px[i + 3] = Math.max(0, Math.min(255, (teal - 30) * 2.2 * Math.min(1, bright / 140) * Math.max(0, edge)));
  }
  g.putImageData(d, 0, 0);
  return c;
}

// Loads the generated art from art/*.png. Anything missing just leaves the grey-box drawing in place,
// so the game always runs. Sprite sheets are one row of frames on a flat key colour (magenta): the
// colour is keyed out here, the frames are found by the empty columns between them, and every frame
// is lined up on the same foot baseline.
export const ART = { arena: null, fit: null, sheets: {}, ready: false };

// Where the arena floor sits in arena.png, as fractions of the image: centre and half-axes.
// Measured by hand from the image; art/arena.json overrides it when present.
const DEFAULT_FIT = { cx: 0.5, cy: 0.58, rx: 0.23, ry: 0.115 };
const SHEETS = { krishna: 'art/krishna_sheet.png', rajaraja: 'art/rajaraja_sheet.png' };
export const SPRITE_H = 46; // on-screen height of a fighter, in game pixels

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
  const cells = runs.length === expect ? runs : Array.from({ length: expect }, (_, i) => [Math.round((i * W) / expect), Math.round(((i + 1) * W) / expect)]);
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
    canvas: out, top: Math.floor(f.top * k), bottom: Math.ceil(f.bottom * k),
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
    const img = await loadImg(base + src);
    if (!img) continue;
    const { c, d } = keyOut(img);
    const f = frames(c, d);
    ART.sheets[id] = prescale(c, f, SPRITE_H / Math.max(1, f.bottom - f.top + 1));
  }
  ART.ready = true;
  return ART;
}

// Draw frame `i` of a fighter's sheet with its feet at (x, y). flip = facing left.
export function drawSprite(g, id, i, x, y, flip) {
  const s = ART.sheets[id];
  if (!s) return false;
  const f = s.cells[i % s.cells.length], h = s.bottom - s.top + 1;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (flip) g.scale(-1, 1);
  g.drawImage(s.canvas, f.x, s.top, f.w, h, Math.round(-(f.cx - f.x)), -h, f.w, h);
  g.restore();
  return true;
}

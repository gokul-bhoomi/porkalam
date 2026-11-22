// Loads the generated art from art/*.png. Anything missing just leaves the grey-box drawing in place,
// so the game always runs. Sprite sheets are one row of frames on a flat key colour (magenta): the
// colour is keyed out here, the frames are found by the empty columns between them, and every frame
// is lined up on the same foot baseline.
import { RES, ARENA } from './config.js';

export const ART = { theme: 'river', arena: null, fit: null, sheets: {}, fx: {}, scenes: {}, sceneLayers: {}, gods: {}, cards: {}, sand: {}, title: null, arms: null, ready: false };
// Dramatic scene paintings (art/scene_<key>.png), drawn by drawScene in render.js.
const SCENES = ['siddhan_sig', 'veeran_sig', 'veeran_elephant', 'pashupatastra', 'brahmastra', 'shakti_vel', 'vishwaroopam', 'tandava'];
// The boon gods, painted blessing (art/god_<name>.png, and the figure alone on magenta in god_<name>_fg.png).
const GOD_ART = ['shiva', 'murugan', 'brahma', 'krishna', 'narada'];

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
  siddhan: { walk: 'art/siddhan_sheet.png', walk8: 'art/siddhan_walk8d.png', idle8: 'art/siddhan_idle8.png', act: 'art/siddhan_actions.png', air: 'art/siddhan_fly.png', airBody: 1.15, ride: 'art/siddhan_peacock.png' }, // the fly art's body is ~87% of its height (a glow under the feet)
  veeran: { walk: 'art/veeran_sheet.png', walk8: 'art/veeran_walk8b.png', idle8: 'art/veeran_idle8.png', act: 'art/veeran_actions.png', air: 'art/veeran_jump.png', ride: 'art/veeran_peacock.png' },
};
// Off-the-ground poses (ground rule 17), 3 frames each (Codex, 2026-11-14):
// Mangulan's fly: lift-off, flying, casting in the air. Kanalan's jump: crouch, mid-air, landing.
export const AIR_POSES = { lift: 0, up: 1, cast: 2, crouch: 0, land: 2 };
// Frame numbers in each action sheet (0-based).
export const POSES = {
  siddhan: { shootWind: 0, shoot: 1, meleeWind: 2, melee: 3, block: 4, cast: 5, hit: 6, meditate: 7 },
  veeran: { shootWind: 0, shoot: 1, meleeWind: 2, melee: 3, block: 4, cast: 5, hit: 6, meditate: 7 },
};
export const SPRITE_H = 46; // on-screen height of a fighter, in layout units (x RES real pixels)
export const RIDE_SCALE = 1.2; // the peacock-and-rider drawing's height, in standing-fighter heights (see the ride sheets in loadArt)

const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function keyOut(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  const c0 = [px[0], px[1], px[2]], k = c0[0] > 200 && c0[2] > 200 && c0[1] < 90 ? c0 : [255, 0, 255]; // the key colour is the top-left corner, if that is magenta (art can fill the corner)
  for (let i = 0; i < px.length; i += 4) {
    const dist = Math.abs(px[i] - k[0]) + Math.abs(px[i + 1] - k[1]) + Math.abs(px[i + 2] - k[2]);
    const magentaish = px[i] > 200 && px[i + 2] > 200 && px[i + 1] < 90; // anti-aliased edge pixels (not the pink shawl)
    if (dist < 100 || magentaish) px[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
  return { c, d };
}

// Find frames as runs of non-empty columns; fall back to equal cells if that doesn't give the expected count.
function frames(c, d, expect = 8, even = false) {
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
  const cells = !even && !square && runs.length === expect ? runs : Array.from({ length: expect }, (_, i) => [Math.round((i * W) / expect), Math.round(((i + 1) * W) / expect)]);
  return { cells: cells.map(([a, b]) => ({ x: a, w: b - a, cx: (a + b) / 2 })), top, bottom };
}

// Median head-to-feet height of the figure, read in a band just left of each cell's centre (the staff or bow is held to the right).
function bodyHeight(c, d, f) {
  const W = c.width, H = c.height, px = d.data;
  const hs = f.cells.map((cl) => {
    let t = H, b = 0;
    const x0 = Math.round(cl.cx - cl.w * 0.18), x1 = Math.round(cl.cx + cl.w * 0.02);
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (px[(y * W + x) * 4 + 3] > 160) { if (y < t) t = y; if (y > b) b = y; }
    return b - t;
  }).sort((p, q) => p - q);
  return Math.max(1, hs[hs.length >> 1]);
}

// Shift each cell's centre so the head sits at the same spot in every frame (legs, staff and cloth move; the head should not drift).
function centreOnHead(c, d, f) {
  const W = c.width, H = c.height, px = d.data;
  const off = f.cells.map((cl) => {
    const x0 = Math.round(cl.cx - cl.w * 0.25), x1 = Math.round(cl.cx + cl.w * 0.05);
    let t = H, b = 0;
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (px[(y * W + x) * 4 + 3] > 160) { if (y < t) t = y; if (y > b) b = y; }
    const y1 = t + Math.round((b - t) * 0.22);
    let sx = 0, n = 0;
    for (let y = t; y < y1; y++) for (let x = x0; x < x1; x++) if (px[(y * W + x) * 4 + 3] > 160) { sx += x; n++; }
    return n ? sx / n - cl.cx : 0;
  });
  const mid = [...off].sort((p, q) => p - q)[off.length >> 1];
  f.cells.forEach((cl, i) => { cl.cx += off[i] - mid; });
}

// Height of the tallest drawn figure among n equal cells.
function tallestCell(c, d, n) {
  const W = c.width, Hh = c.height, px = d.data, cw = W / n;
  let best = 1;
  for (let i = 0; i < n; i++) {
    let t = Hh, b = 0;
    for (let y = 0; y < Hh; y++) for (let x = Math.round(i * cw); x < Math.round((i + 1) * cw); x++) if (px[(y * W + x) * 4 + 3] > 40) { if (y < t) t = y; if (y > b) b = y; }
    best = Math.max(best, b - t + 1);
  }
  return best;
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
  // ?arena=battlefield (or battlefield_big) tries another arena painting; each has its own floor fit json
  const pick = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('arena')) || '';
  const warOff = typeof location !== 'undefined' && new URLSearchParams(location.search).get('war') === '0';
  // the live battlefield (owner 2026-11-21): the painting without armies, so the war in src/war.js happens behind the arena
  const file = pick === 'battlefield' && !warOff ? 'arena_battlefield_live' : /^[a-z_]+$/.test(pick) ? 'arena_' + pick : 'arena';
  ART.theme = pick === 'battlefield' ? 'battlefield' : 'river'; // the arena's world: river water, or a dry battlefield (no water effects)
  ARENA.r = ARENA.sizes[ART.theme]; // each arena has its own size (owner, 2026-11-16)
  const [arena, fitJson] = await Promise.all([
    loadImg(base + `art/${file}.png`),
    fetch(base + `art/${file}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  ART.arena = arena;
  ART.fit = { ...DEFAULT_FIT, ...(fitJson || {}) };
  for (const [id, src] of Object.entries(SHEETS)) {
    const [walkImg, actImg, airImg] = await Promise.all([loadImg(base + src.walk), loadImg(base + src.act), src.air ? loadImg(base + src.air) : null]);
    if (!walkImg) continue;
    const w = keyOut(walkImg), wf = frames(w.c, w.d);
    const k = (SPRITE_H * RES) / Math.max(1, wf.bottom - wf.top + 1); // the walk sheet sets the size...
    ART.sheets[id] = { walk: prescale(w.c, wf, k), act: null };
    if (actImg && actImg.width === walkImg.width && actImg.height === walkImg.height) {
      const a = keyOut(actImg), af = frames(a.c, a.d);
      ART.sheets[id].act = prescale(a.c, { ...af, base: wf.bottom }, k); // ...and the feet line for both sheets
    }
    // smoother cycles (ChatGPT, 2026-11-17): 8-frame walk / idle sheets, each sized so its figure stands as tall as the old walk art
    for (const set of ['walk8', 'idle8']) {
      const img = src[set] && await loadImg(base + src[set]);
      if (!img) continue;
      const a = keyOut(img), af = frames(a.c, a.d, 8, true); // ChatGPT spaces these evenly: its grid holds the body steady (tight crops wobble ~4 px)
      // sized by the BODY (head to feet), not the whole drawing: a staff or bell drawn higher would otherwise shrink him when he starts walking
      centreOnHead(a.c, a.d, af); // ChatGPT's figures drift a few px within their cells: hold the head still
      ART.sheets[id][set] = prescale(a.c, af, k * bodyHeight(w.c, w.d, wf) / bodyHeight(a.c, a.d, af));
    }
    // Peacock Ride (2026-11-21): 8 frames of the fighter on Murugan's peacock, wings flapping in a loop. Measured: ChatGPT
    // drew each rider at ~0.68x his standing size (face 45 px vs 65 px). 1.45x (rider = standing size) made the bird far
    // too big, 0.95x made the rider look small (owner, 2026-11-21), so the rider is shown at ~85% of his standing size.
    const rideImg = src.ride && await loadImg(base + src.ride);
    if (rideImg) {
      const a = keyOut(rideImg), af = frames(a.c, a.d, 8, true);
      ART.sheets[id].ride = prescale(a.c, af, (SPRITE_H * RIDE_SCALE * RES) / Math.max(1, af.bottom - af.top + 1));
    }
    if (airImg && airImg.height === walkImg.height) { // same cell size and feet line as the walk sheet
      const a = keyOut(airImg), af = frames(a.c, a.d, 3);
      // the air art draws the fighter smaller in its cell than the walk art does: scale it so its tallest frame is
      // as tall as a standing fighter (a tucked jump would otherwise read as the fighter shrinking)
      const ka = k * Math.max(1, (wf.bottom - wf.top + 1) / tallestCell(a.c, a.d, 3)) * (src.airBody || 1);
      ART.sheets[id].air = prescale(a.c, { ...af, base: wf.bottom }, ka);
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
  const divineHalo = await loadImg(base + 'art/fx_divine_halo.png');
  if (divineHalo) Object.assign(ART.fx, cutFx(divineHalo, ['divineHalo'], 80));
  const crack = await loadImg(base + 'art/fx_tandava_crack.png'); // Shiva's Tandava: the glowing chasm (Codex, 2026-11-14)
  if (crack) Object.assign(ART.fx, cutFx(crack, ['tandavaCrack']));
  // Shiva's Tandava lava (ChatGPT, 2026-11-15): a tileable molten floor, and the torn cliff face on magenta
  const [lavaFloor, lavaCliff] = await Promise.all([loadImg(base + 'art/lava_floor.png'), loadImg(base + 'art/lava_cliff.png')]);
  if (lavaFloor) { // decoded now into a canvas, not lazily on the first Tandava (that stalled the game ~1 s)
    const c = document.createElement('canvas'); c.width = lavaFloor.width; c.height = lavaFloor.height;
    c.getContext('2d').drawImage(lavaFloor, 0, 0); ART.lavaFloor = c;
  }
  if (lavaCliff) ART.lavaCliff = keyOut(lavaCliff).c;
  const ele = await loadImg(base + 'art/fx_elephant.png'); // single sprite: the Gaja Arrow's war elephant
  if (ele) Object.assign(ART.fx, cutFx(ele, ['elephant']));
  // Blocks and meditation barriers (ChatGPT, 2026-11-15): 4 stage cells each, kept whole so the stages line up
  const cellSheet = async (file, names, prep, k) => { // k = kept resolution (1 for art drawn bigger than half size)
    const img = await loadImg(base + file);
    if (!img) return;
    const { c, d } = keyOut(img);
    if (prep) { prep(d, c.width); c.getContext('2d').putImageData(d, 0, 0); }
    Object.assign(ART.fx, fullCells(c, names, k));
  };
  await Promise.all([
    cellSheet('art/fx_yantra.png', ['yantra1', 'yantra2', 'yantra3', 'yantraCrack']),
    cellSheet('art/fx_flame.png', ['flame1', 'flame2', 'flame3', 'flame4', 'flame5', 'flame6', 'flame7', 'flame8']), // one flame, an 8-frame loop
    cellSheet('art/fx_smoke.png', ['smoke1', 'smoke2', 'smoke3', 'smoke4']),
    cellSheet('art/fx_arrow_parts.png', ['arrow1', 'arrow2', 'arrow3', 'arrow4', 'arrowStump1', 'arrowStump2', 'arrowTop1', 'arrowTop2']), // Kanalan's volley, one arrow at a time
    cellSheet('art/fx_arrow_volley.png', ['volley1', 'volley2', 'volley3', 'volleyBreak']),
    cellSheet('art/fx_shrine.png', ['shrineBack', 'shrineFront', 'shrineBackHurt', 'shrineFrontHurt'], null, 1),
    cellSheet('art/fx_fire_ring.png', ['ring1', 'ring2', 'ring3', 'ring4'], clearRingSand, 1),
  ]);
  await cellSheet('art/fx_yantra2.png', ['yantra1', 'yantra2', 'yantra3', 'yantraCrack'], null, 1);
  await Promise.all([ // built from pieces (2026-11-15): the shrine stone by stone, the yantra layer by layer
    cellSheet('art/fx_shrine_big.png', ['shrinePlatform', 'shrinePlatformHurt', 'shrineRoof', 'shrineRoofHurt'], null, 1),
    cellSheet('art/fx_shrine_pillar.png', ['pillar', 'pillarCracked', 'pillarCracked2', 'pillarStump', 'pillarTop', 'kalasam', 'rubble1', 'rubble2'], null, 1),
    cellSheet('art/fx_yantra_layers.png', ['yl1', 'yl2', 'yl3', 'yl4', 'yl5', 'yl6'], null, 1),
    // the divine weapons in the arena (2026-11-15)
    cellSheet('art/fx_pashupata.png', ['trident1', 'trident2', 'thirdEye', 'lightning'], null, 1), // no despill: lightning is meant to be blue-white
    cellSheet('art/fx_vel.png', ['vel', 'velTrail', 'velStuck', 'velBurst'], despill, 1),
    cellSheet('art/fx_vishwa.png', ['cosmos', 'cosmicHand', 'lightBeam', 'lightImpact'], null, 1), // full resolution: the cosmos fills the sky
    cellSheet('art/fx_brahma.png', ['brahmArrow', 'sun2', 'whiteRing', 'ash'], despillStrong, 1),
    cellSheet('art/fx_storm.png', ['storm'], null, 1), // the sky for the divine weapons: whole images, full resolution
    cellSheet('art/fx_sky_eye.png', ['skyEye'], null, 1),
    cellSheet('art/fx_cosmos_sky.png', ['cosmosSky'], null, 1), // Vishwaroopam's sky, one wide sharp image
    cellSheet('art/fx_cosmic_form.png', ['cosmicForm'], fadeBottom, 1),
    sandSheet(base + 'art/fx_sand_hits.png', ['crater', 'impact', 'skid', 'scuff']), // marks the fight leaves on the sand (2026-11-15)
    sandSheet(base + 'art/fx_sand_marks.png', ['foot', 'wet', 'glass', 'burn']),
  ]); // the richer crystal yantra (2026-11-15) replaces the first one
  if (ART.theme === 'battlefield') { // calm life over the battlefield painting (owner 2026-11-16: whole bobbing armies looked fake): banners, smoke, dust, arrow volleys
    const nums = (p, n) => Array.from({ length: n }, (_, i) => p + (i + 1));
    const rows = (file, prefix, n, cols = 1, fade = 0, strong = false) => loadImg(base + file).then((img) => { // n rows (x cols) of frames; strong = also clear magenta bleed from dust
      if (!img) return;
      const { c, d } = keyOut(img), rh = c.height / n, cw = c.width / cols;
      dePink(d.data);
      if (strong) despill(d.data, c.width, true);
      if (fade) for (let y = 0; y < c.height; y++) { // soften the bottom of every row so the band melts into the ground
        const k = Math.min(1, (rh - (y % rh)) / (rh * fade));
        if (k < 1) for (let x = 0; x < c.width; x++) d.data[(y * c.width + x) * 4 + 3] *= k;
      }
      c.getContext('2d').putImageData(d, 0, 0);
      for (let r = 0; r < n; r++) for (let k = 0; k < cols; k++) ART.fx[prefix + (cols > 1 ? r * cols + k + 1 : r + 1)] = { canvas: c, x: k * cw, y: r * rh, w: cw, h: rh };
    });
    await Promise.all([
      cellSheet('art/bf_smoke_loop.png', nums('smokeCol', 8), (d) => dePink(d.data), 1),
      rows('art/bf_sky_arrows.png', 'skyArrows', 8),
      rows('art/bf_dust_band.png', 'dustBand', 8, 1, 0.45), // its flat bottom edge fades out
      rows('art/bf_banner_tiger16.png', 'tigerFlag', 2, 8), // 16 small-step frames each (8-frame ones looked wobbly)
      rows('art/bf_banner_fish16.png', 'fishFlag', 2, 8),
      // the live war (owner 2026-11-21, art/prompts_battlefield_live.txt): frame strips src/war.js plays; a missing one = placeholder shapes
      rows('art/war_run_tiger.png', 'runT', 1, 8), rows('art/war_run_fish.png', 'runF', 1, 8),
      rows('art/war_elephant_charge.png', 'eleC', 1, 12, 0, true),
      rows('art/war_stagger_fall.png', 'stag', 1, 16), rows('art/war_horse_gallop.png', 'horse', 1, 8),
      rows('art/war_duel.png', 'duel', 1, 12), rows('art/war_arrow_land.png', 'arrowL', 1, 12),
      rows('art/war_cavalry_fish.png', 'cavF', 1, 8), rows('art/war_chariot.png', 'chariot', 1, 8),
      rows('art/war_stagger_fall_fish.png', 'stagF', 1, 16), rows('art/war_elephant_fall.png', 'eleF', 1, 12, 0, true), rows('art/war_elephant_swing.png', 'eleS', 1, 12, 0, true),
      rows('art/war_spear.png', 'spear', 1, 8), rows('art/war_dust.png', 'dustW', 1, 12, 0, true),
    ]);
    steady(nums('smokeCol', 8));
    steady(nums('tigerFlag', 16), false); steady(nums('fishFlag', 16), false); // the poles are already fixed in the art; the cloth would fool a sideways fix
    for (const b of ['skyArrows', 'dustBand']) steady(nums(b, 8), false); // bands: ground line only
  }
  ART.ready = true;
  return ART;
}

// Sand marks are painted on plain sand (#FDAB55), not on magenta. Each cell becomes two pictures measured against
// that plain sand: `dark` (white where nothing changes, drawn with 'multiply') and `light` (black where nothing
// changes, drawn with 'lighter'), so a mark darkens and brightens the real arena floor with no edge. The cell edges
// fade to nothing, so the painted sand never shows as a square.
async function sandSheet(file, names) {
  const img = await loadImg(file);
  if (!img) return;
  const n = names.length, cw = img.width / n, out = 256, c = document.createElement('canvas');
  c.width = out * n; c.height = out;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
  const all = g.getImageData(0, 0, c.width, c.height).data;
  names.forEach((name, i) => {
    const px = (x, y) => (y * c.width + i * out + x) * 4, edge = [[], [], []];
    for (let k = 0; k < out; k += 2) for (const [x, y] of [[k, 2], [k, out - 3], [2, k], [out - 3, k]]) for (let ch = 0; ch < 3; ch++) edge[ch].push(all[px(x, y) + ch]);
    const base = edge.map((v) => v.sort((a, b) => a - b)[v.length >> 1]); // the plain sand around the mark
    const mk = () => { const q = document.createElement('canvas'); q.width = q.height = out; return q; };
    const dc = mk(), lc = mk(), dd = dc.getContext('2d').createImageData(out, out), ld = lc.getContext('2d').createImageData(out, out);
    for (let y = 0; y < out; y++) for (let x = 0; x < out; x++) {
      const r = Math.hypot(x - out / 2 + 0.5, y - out / 2 + 0.5) / (out / 2), f = Math.max(0, Math.min(1, (1 - r) / 0.12)); // fade over the outer edge
      const s = px(x, y), o = (y * out + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = all[s + ch], b = Math.max(1, base[ch]);
        dd.data[o + ch] = 255 - (255 - Math.min(255, (v / b) * 255)) * f;
        ld.data[o + ch] = Math.max(0, v - b) * f;
      }
      dd.data[o + 3] = ld.data[o + 3] = 255;
    }
    dc.getContext('2d').putImageData(dd, 0, 0); lc.getContext('2d').putImageData(ld, 0, 0);
    ART.sand[name] = { dark: dc, light: lc };
  });
}

// Draw frame `i` of a fighter's walk or act sheet with its feet at (x, y). flip = facing left.
export function drawSprite(g, id, set, i, x, y, flip, scale = 1) {
  const s = ART.sheets[id]?.[set];
  if (!s) return false;
  const f = s.cells[i % s.cells.length], h = s.bottom - s.top + 1, up = s.base - s.top + 1;
  g.save();
  g.translate(Math.round(x * RES) / RES, Math.round(y * RES) / RES);
  if (flip) g.scale(-1, 1);
  if (scale !== 1) g.scale(scale, scale);
  g.imageSmoothingEnabled = true;
  g.drawImage(s.canvas, f.x, s.top, f.w, h, -(f.cx - f.x) / RES, -up / RES, f.w / RES, h / RES); // 1 sheet pixel = 1 screen pixel
  g.restore();
  return true;
}

// Key out an effect sheet, shrink it to half size (still more pixels than the screen needs), and
// find each cell's drawn area, so a sprite can be placed by its real edges.
function cutFx(img, names, minAlpha = 40) {
  const { c, d } = keyOut(img), n = names.length, cw = c.width / n, px = d.data, out = {};
  const k = 0.5, small = document.createElement('canvas');
  small.width = Math.round(c.width * k); small.height = Math.round(c.height * k);
  const g = small.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, small.width, small.height);
  names.forEach((name, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += 2) for (let x = Math.round(i * cw); x < Math.round((i + 1) * cw); x += 2) {
      if (px[(y * c.width + x) * 4 + 3] > minAlpha) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    out[name] = { canvas: small, x: x0 * k, y: y0 * k, w: (x1 - x0 + 2) * k, h: (y1 - y0 + 2) * k };
  });
  return out;
}

// Whole cells of a sheet (no cropping), at half size, so stages and layers stay lined up.
function fullCells(c, names, k = 0.5) {
  const small = document.createElement('canvas'), out = {};
  small.width = Math.round(c.width * k); small.height = Math.round(c.height * k);
  const g = small.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, small.width, small.height);
  const cw = small.width / names.length;
  names.forEach((name, i) => { out[name] = { canvas: small, x: i * cw, y: 0, w: cw, h: small.height }; });
  return out;
}

// Glowing art blends into the magenta behind it, leaving a pink fringe the key misses: fade out pixels that are
// warm but much bluer than green (pink), and pull their blue back. Not for art that is meant to be violet.
function despill(px, W, strong = false) {
  const [min, span] = strong ? [8, 60] : [25, 110];
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2], over = b - g;
    if (r > 150 && over > min) { px[i + 3] = Math.round(px[i + 3] * Math.max(0, 1 - over / span)); px[i + 2] = g; }
    else if (strong && r > 110 && b > g) px[i + 2] = g; // fire is never pink: any blue above green is magenta bleed
  }
}
// Painted art on magenta (the battlefield sheets): pixels the magenta bled into (pink/purple, blue and red both well
// above green) fade out by how pink they are, and lose the pink tint. The battlefield has no real violet in it.
function dePink(px) {
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2], pink = Math.min(r, b) - g;
    if (pink > 18 && b > 80) { px[i + 3] = Math.round(px[i + 3] * Math.max(0, 1 - (pink - 18) / 70)); px[i + 2] = Math.min(b, g + 20); }
  }
}
// ChatGPT paints every frame afresh, so the subject sits a few pixels differently in each: line the frames up by
// their feet (the lowest solid pixels) and, for sprites, by where those feet are across, so played in a row they
// don't hop about. Stored as dx, dy (sheet px) that drawFx adds.
function steady(names, across = true) {
  const fr = names.map((n) => ART.fx[n]).filter(Boolean);
  if (fr.length < 2) return;
  const g = fr[0].canvas.getContext('2d', { willReadFrequently: true });
  const feet = fr.map((f) => {
    const d = g.getImageData(Math.floor(f.x), Math.floor(f.y), Math.floor(f.w), Math.floor(f.h)).data, W = Math.floor(f.w), H = Math.floor(f.h);
    const solid = (x, y) => d[(y * W + x) * 4 + 3] > 160;
    let bottom = H - 1;
    for (; bottom > 0; bottom--) { let n = 0; for (let x = 0; x < W; x += 2) if (solid(x, bottom)) n++; if (n > W * 0.004 + 2) break; }
    let sx = 0, n = 0;
    if (across) for (let y = Math.max(0, bottom - Math.round(H * 0.12)); y <= bottom; y++) for (let x = 0; x < W; x += 2) if (solid(x, y)) { sx += x; n++; }
    return { bottom, cx: n ? sx / n : W / 2 };
  });
  const ref = feet.reduce((a, b) => ({ bottom: a.bottom + b.bottom / feet.length, cx: a.cx + b.cx / feet.length }), { bottom: 0, cx: 0 });
  fr.forEach((f, i) => { f.dy = ref.bottom - feet[i].bottom; f.dx = across ? ref.cx - feet[i].cx : 0; });
}
const despillStrong = (px, W) => despill(px, W, true); // fire on magenta: its red-pink edge goes too

// Fade the bottom of a picture to nothing (art cut off at the bottom edge, like the cosmic form at its chest).
function fadeBottom(px, W) {
  const H = px.length / 4 / W, from = Math.floor(H * 0.62);
  for (let y = from; y < H; y++) { const a = 1 - (y - from) / (H - from); for (let x = 0; x < W; x++) px[(y * W + x) * 4 + 3] *= a * a; }
}

// The fire ring's sheet has painted sand inside the ring: clear it (flood fill from the middle of each cell) so the arena shows through.
function clearRingSand(px, W) {
  const cells = W / 512, sand = (i) => px[i] > 200 && px[i + 1] > 115 && px[i + 1] < 215 && px[i + 2] > 25 && px[i + 2] < 135;
  for (let cell = 0; cell < cells; cell++) {
    const seen = new Uint8Array(512 * 512), st = [256, 340];
    while (st.length) {
      const y = st.pop(), x = st.pop();
      if (x < 0 || y < 0 || x >= 512 || y >= 512 || seen[y * 512 + x]) continue;
      seen[y * 512 + x] = 1;
      const i = (y * W + cell * 512 + x) * 4;
      if (!sand(i)) continue;
      px[i + 3] = 0;
      st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
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
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.spin != null) { // a flat disc seen from above: spin it in its own plane, then squash it back into perspective
    const q = h / w;
    g.scale(1, q); g.rotate(o.spin);
    g.imageSmoothingEnabled = true;
    g.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w / 2, -w / 2, w, w);
    g.restore();
    return true;
  }
  if (o.flip) g.scale(-1, 1);
  g.imageSmoothingEnabled = true;
  const ox = (f.dx || 0) * w / f.w * (o.flip ? -1 : 1), oy = (f.dy || 0) * h / f.h; // steady(): frames lined up
  g.drawImage(f.canvas, f.x, f.y, f.w, f.h, -w / 2 + ox, (o.anchor === 'bottom' ? -h : o.anchor === 'top' ? 0 : -h / 2) + oy, w, h);
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

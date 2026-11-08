import { W, H, STEP, TUNE } from './config.js';
import { createMatch, stepMatch, spawnUnit } from './sim.js';
import { setCtx, R, txt, drawFight, drawTitle, drawSetup, drawPause, drawResult, CX } from './render.js';
import { createInput } from './input.js';

const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
setCtx(ctx);

const input = createInput();
const qs = new URLSearchParams(location.search);
const S = {
  screen: 'title', minutes: 5, match: null, paused: false, sel: 0, now: 0, clock: 0, fx: [], banner: null, errors: [], pads: 0,
  seed: Number(qs.get('seed')) || 1 + Math.floor(Math.random() * 1e6), screenAt: 0,
};
const DBG = { paused: qs.get('pause') === '1', override: [null, null], menu: [] };

function startMatch() {
  S.match = createMatch({ seed: S.seed++, time: S.minutes * 60 });
  Object.assign(S, { screen: 'fight', paused: false, fx: [], banner: null, sel: 0, screenAt: S.now });
}
const go = (screen) => { S.screen = screen; S.sel = 0; S.screenAt = S.now; };

function onEvent(e, m) {
  const now = S.clock, add = (f) => S.fx.push({ t0: now, life: 0.8, ...f });
  if (e.type === 'hp') {
    if (e.dmg > 0) { add({ kind: 'pop', x: e.x, y: e.y, text: Number.isFinite(e.dmg) ? `-${Math.round(e.dmg * 10) / 10}` : 'X', color: '#ff6a5a' }); add({ kind: 'flash', x: e.x, y: e.y, life: 0.3 }); }
    if (e.heal > 0) add({ kind: 'pop', x: e.x, y: e.y, text: `+${e.heal}`, color: '#7aff8a' });
  }
  if (e.type === 'blocked') add({ kind: 'pop', x: e.x, y: e.y, text: `BLOCK ${Math.round(e.amount * 10) / 10}`, color: '#9fe07a' });
  if (e.type === 'clash') add({ kind: 'flash', x: e.x, y: e.y, life: 0.4 });
  if (e.type === 'swing') { const p = m.players[e.pid]; add({ kind: 'swing', x: p.x, y: p.y, a: Math.atan2(p.face.y, p.face.x), life: 0.2 }); }
  if (e.type === 'trap') add(e.kind === 'planted' ? { kind: 'boom', x: e.x, y: e.y, life: 0.5, ground: true } : { kind: 'flash', x: e.x, y: e.y, life: 0.5 });
  if (e.type === 'rain') add({ kind: 'rain', x: e.x, y: e.y, r: e.r, life: 0.35 });
  if (e.type === 'blink') add({ kind: 'trail', x0: e.x0, y0: e.y0, x: e.x, y: e.y, life: 0.3 });
  if (e.type === 'release' && e.name === 'Vishwaroopam') add({ kind: 'global', x: 0, y: 0, life: 0.6 });
  if (e.type === 'wall') add({ kind: 'pop', x: e.x, y: e.y - 8, text: 'WALL', color: '#ffb46a' });
  if (e.type === 'boon') S.banner = { text: `${m.players[e.pid].ch.name.toUpperCase()} GOT ${e.name.toUpperCase()}`, sub: `BOON FROM ${e.god.toUpperCase()}`, t0: S.now };
  if (e.type === 'boonUsed') S.banner = { text: `${e.name.toUpperCase()}!`, sub: 'BOON USED', t0: S.now };
}

function update(dt) {
  const inp = input.poll();
  S.pads = inp.pads;
  for (let i = 0; i < 2; i++) if (DBG.override[i]) inp.fight[i] = { ...DBG.override[i] };
  while (DBG.menu.length) { const { pid, action } = DBG.menu.shift(); inp.menu[pid][action] = true; }
  const m = inp.menu, any = (a) => m[0][a] || m[1][a];
  S.fx = S.fx.filter((f) => S.clock - f.t0 < f.life);

  if (S.screen === 'title') {
    if (any('confirm') || any('pause')) go('setup');
  } else if (S.screen === 'setup') {
    if (any('left')) S.minutes = Math.max(1, S.minutes - 1);
    if (any('right')) S.minutes = Math.min(TUNE.match.max / 60, S.minutes + 1);
    if (any('confirm')) startMatch();
    else if (any('back')) go('title');
  } else if (S.screen === 'fight') {
    const match = S.match;
    if (S.paused) {
      if (any('up') || any('down')) S.sel = 1 - S.sel;
      else if (any('confirm')) { if (S.sel === 0) S.paused = false; else go('title'); }
      else if (any('pause')) S.paused = false;
      return;
    }
    if (match.phase === 'done') {
      if (S.now - S.screenAt < 1.2) return;
      if (any('up')) S.sel = (S.sel + 2) % 3;
      if (any('down')) S.sel = (S.sel + 1) % 3;
      if (any('confirm')) { if (S.sel === 0) startMatch(); else go(S.sel === 1 ? 'setup' : 'title'); }
      return;
    }
    if (any('pause')) { S.paused = true; S.sel = 0; return; }
    if (!match.scene) S.clock += dt;
    stepMatch(match, inp.fight, dt);
    for (const e of match.events.splice(0)) onEvent(e, match);
    if (match.phase === 'done') { S.screenAt = S.now; S.sel = 0; }
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  R(0, 0, W, H, '#000');
  if (S.screen === 'title') drawTitle(S.now, S.pads);
  else if (S.screen === 'setup') drawSetup(S.now, S.minutes);
  else if (S.screen === 'fight') {
    drawFight(S.match, S.now, S.fx);
    if (S.banner && S.now - S.banner.t0 < 3) {
      R(0, H - 34, W, 30, 'rgba(10,12,20,.8)');
      txt(S.banner.text, CX, H - 30, '#ffcf6a', 'center');
      txt(S.banner.sub, CX, H - 18, '#ddd', 'center');
    }
    if (S.match.phase === 'done') drawResult(S.match, S.sel);
    if (S.paused) drawPause(S.sel);
  }
}

addEventListener('keydown', (e) => {
  if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) return;
  if (e.code === 'Backquote') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
});
addEventListener('error', (e) => S.errors.push(String(e.error?.stack || e.message)));

// ---------- debug API (used by the smoke test) ----------
const r1 = (v) => Math.round(v * 10) / 10;
window.__game = {
  get screen() { return S.screen; },
  errors: S.errors,
  debug: {
    pause() { DBG.paused = true; }, resume() { DBG.paused = false; },
    step(n = 1) { for (let i = 0; i < n; i++) update(STEP); render(); },
    setInput(pid, inp) { DBG.override[pid] = inp; }, clearInput() { DBG.override = [null, null]; },
    press(action, pid = 0) { DBG.menu.push({ pid, action }); },
    start(o = {}) { if (o.minutes) S.minutes = o.minutes; if (o.seed) S.seed = o.seed; startMatch(); },
    set(pid, fields) { Object.assign(S.match.players[pid], fields); },
    match() { return S.match; },
    unit(o) { return spawnUnit(S.match, o).id; },
    snapshot() {
      const m = S.match;
      return {
        screen: S.screen, paused: S.paused, minutes: S.minutes, fx: S.fx.map((f) => f.text || f.kind), banner: S.banner?.text || null,
        match: m && {
          phase: m.phase, result: m.result, timeLeft: r1(m.timeLeft), duration: m.duration, scene: m.scene?.name || null,
          projectiles: m.projectiles.length, marks: m.marks.length,
          players: m.players.map((p) => ({ id: p.id, name: p.ch.name, x: r1(p.x), y: r1(p.y), hp: r1(p.hp), power: r1(p.power), cast: p.cast?.move.name || null,
            block: !!p.block, med: !!p.med, boons: p.boons.map((b) => b.name), meditations: p.meditations, effects: Object.keys(p.effects) })),
        },
      };
    },
  },
};

if (qs.get('screen') === 'fight') startMatch();

let last = performance.now(), acc = 0;
function frame(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000)); last = ts; S.now += dt;
  try {
    if (!DBG.paused) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
    render();
  } catch (e) { S.errors.push(String(e?.stack || e)); console.error(e); }
  requestAnimationFrame(frame);
}
Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise((r) => setTimeout(r, 1500))]).finally(() => requestAnimationFrame(frame));

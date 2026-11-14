import { W, H, RES, STEP, TUNE, ARENA } from './config.js';
import { createMatch, stepMatch, spawnUnit } from './sim.js';
import { CHARS } from './chars/index.js';
import { setCtx, R, txt, isHurtPose, drawFight, drawOffer, drawSelect, drawInfo, drawTitle, drawSetup, drawPause, drawResult, drawRemap, drawTutorial, CX, fitView, setUseArt, useArt } from './render.js';
import { loadArt, ART } from './art.js';
import { createInput, KEYS, KEY_NAME, PAD, PAD_NAMES, REMAP, ACTIONS, RESERVED, PAD_RESERVED, setKey, setPad, resetControls } from './input.js';
import { createTutorial, startTutorial, nextLesson, frozen, beforeStep, afterStep, view as tutView, lesson } from './tutorial.js';
import * as sound from './audio.js';
import { createCpu, cpuInput, LEVELS, LEVEL_IDS } from './ai.js';

const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
setCtx(ctx);

const input = createInput();
const qs = new URLSearchParams(location.search);
const S = {
  screen: 'title', minutes: 5, mode: '1p', side: 0, level: 'normal', row: 0, cpu: null, match: null, paused: false, sel: 0, now: 0, clock: 0, fx: [], banner: null, errors: [], pads: 0,
  seed: Number(qs.get('seed')) || 1 + Math.floor(Math.random() * 1e6), screenAt: 0,
};
const DBG = { paused: qs.get('pause') === '1', override: [null, null], menu: [] };

// Setup screen rows. 1 player: you pick your fighter and the computer's level.
const CHAR_IDS = Object.keys(CHARS);
const ROWS = () => (S.mode === '1p' ? ['mode', 'level', 'length'] : ['mode', 'length']); // the fighters are picked on the select screen
function changeRow(dir) {
  const row = ROWS()[S.row];
  if (row === 'mode') { S.mode = S.mode === '1p' ? '2p' : '1p'; S.row = 0; }
  if (row === 'side') S.side = 1 - S.side;
  if (row === 'level') S.level = LEVEL_IDS[(LEVEL_IDS.indexOf(S.level) + dir + LEVEL_IDS.length) % LEVEL_IDS.length];
  if (row === 'length') S.minutes = Math.max(1, Math.min(TUNE.match.max / 60, S.minutes + dir));
}

function startMatch() {
  S.offer = null;
  const seed = S.seed++;
  S.match = createMatch({ seed, time: S.tutorial ? TUNE.match.max : S.minutes * 60, chars: S.chars || ['siddhan', 'veeran'] });
  S.cpu = S.mode === '1p' && !S.tutorial ? createCpu(1 - S.side, S.level, seed) : null; // the computer plays the other fighter
  Object.assign(S, { screen: 'fight', paused: false, fx: [], banner: null, sel: 0, screenAt: S.now });
  S.tut = null;
  if (S.tutorial) { S.side = 0; S.tut = createTutorial(); startTutorial(S.tut, S.match, S.now); }
}
// in 1 player mode either set of keys (and either pad) controls your fighter
function merge(a, b) {
  const f = { mx: a.mx || b.mx, my: a.my || b.my };
  for (const k of Object.keys({ ...a, ...b })) if (k !== 'mx' && k !== 'my') f[k] = !!(a[k] || b[k]);
  return f;
}
const go = (screen) => { S.screen = screen; S.sel = 0; S.screenAt = S.now; sound.play('tick'); };

// power moves that break the arena when they land
const POWER_MOVES = new Set(['Thousand-Arm Form', 'Gaja Arrow', 'Pashupatastra', 'Shakti Vel', 'Brahmastra', 'Vishwaroopam']);
function onEvent(e, m) {
  const now = S.clock, add = (f) => S.fx.push({ t0: now, life: 0.8, ...f });
  const crack = (x, y, size) => { // a crack in the sand that fades slowly; only the newest 16 stay
    add({ kind: 'crack', x, y, size, seed: Math.floor(Math.random() * 1e6), life: 30, ground: true });
    const cracks = S.fx.filter((f) => f.kind === 'crack');
    if (cracks.length > 16) S.fx.splice(S.fx.indexOf(cracks[0]), 1);
  };
  // ---- sounds ----
  const me = m.players[e.pid];
  if (e.type === 'cast' && e.slot === 'a1') sound.play(me?.ch.weapon === 'bow' ? 'bow' : 'bolt');
  if (e.type === 'release' && me && me.ch.weapon === 'bow' && e.name !== 'Gaja Arrow' && !POWER_MOVES.has(e.name)) sound.play('bow');
  if (e.type === 'cast' && /^s[123]$/.test(e.slot) && me?.ch.weapon !== 'bow') sound.play('bolt');
  if (e.type === 'swing') sound.play('whoosh');
  if (e.type === 'hp' && e.dmg > 0) sound.play('hit', Number.isFinite(e.dmg) ? Math.min(2, 0.6 + e.dmg / 12) : 2);
  if (e.type === 'blocked') sound.play('block');
  if (e.type === 'wallUp') sound.play('wallUp');
  if (e.type === 'clash') sound.play('clash');
  if (e.type === 'wall') sound.play('edge');
  if (e.type === 'rain') sound.play('rain');
  if (e.type === 'blink') sound.play('blink');
  if (e.type === 'meditate') sound.play('meditate');
  if (e.type === 'devotion') sound.play('devotion', e.devotion);
  if (e.type === 'medFull') sound.play('medFull');
  if (e.type === 'barrier') sound.play('barrier');
  if (e.type === 'medStop' && me?.msg?.text === 'BARRIER BROKEN') sound.play('shatter');
  if (e.type === 'boon') { sound.play('boon', e.tier === 'divine'); sound.duck(0.2, 2.4); }
  if (e.type === 'boonUsed' && e.tier !== 'divine') sound.play('powerLand');
  if (e.type === 'scene') { sound.play('powerUp'); sound.duck(0.15, 2.6); }
  if (e.type === 'release' && POWER_MOVES.has(e.name)) sound.play('powerLand');
  if (e.type === 'end') { sound.play(e.reason === 'ko' || e.reason === 'double' || e.reason === 'brahmastra' ? 'ko' : 'tick'); if (e.winner != null) setTimeout(() => sound.play('win'), 1200); }
  if (e.type === 'hp' && e.dmg > 0 && (e.srcs || []).some((s) => POWER_MOVES.has(s) && s !== 'Thousand-Arm Form')) { // a power move lands: the island shatters
    add({ kind: 'shatter', x: e.x, y: e.y, seed: Math.floor(Math.random() * 1e6), life: 2.2 });
    add({ kind: 'scar', x: e.x, y: e.y, seed: Math.floor(Math.random() * 1e6), life: 60, ground: true }); // the fissures stay
    for (let i = 0; i < 5; i++) { const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 40; crack(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 0.9 + Math.random() * 0.6); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3; add({ kind: 'splash', x: Math.cos(a) * ARENA.r, y: Math.sin(a) * ARENA.r, life: 1.4, big: 2.6 }); }
    add({ kind: 'shake', x: 0, y: 0, amp: 6, life: 0.9 });
    add({ kind: 'global', x: 0, y: 0, life: 0.35, color: '255,255,255' });
    S.slowmo = { t0: S.now, short: true }; // a heavy hit-stop
    sound.play('shatter2');
  }
  if (e.type === 'hp') {
    if (e.dmg >= 8 && !(e.srcs || []).includes('Thousand-Arm Form')) crack(e.x, e.y, Number.isFinite(e.dmg) ? Math.min(1.4, e.dmg / 25) : 1.6); // heavy hits break the sand
    if (e.dmg > 0) { add({ kind: 'pop', x: e.x, y: e.y, text: Number.isFinite(e.dmg) ? `-${Math.round(e.dmg * 10) / 10}` : 'X', color: '#ff6a5a' }); add({ kind: 'flash', x: e.x, y: e.y, life: 0.3 }); }
    if (e.heal > 0) add({ kind: 'pop', x: e.x, y: e.y, text: `+${e.heal}`, color: '#7aff8a' });
  }
  if (e.type === 'blocked') add({ kind: 'pop', x: e.x, y: e.y, text: `BLOCK ${Math.round(e.amount * 10) / 10}`, color: '#9fe07a' });
  if (e.type === 'clash') add({ kind: 'clash', x: e.x, y: e.y, life: 0.4 });
  if (e.type === 'swing') { const p = m.players[e.pid]; add({ kind: 'swing', x: p.x, y: p.y, a: Math.atan2(p.face.y, p.face.x), life: 0.2 }); }
  if (e.type === 'barrier') add({ kind: 'flash', x: e.x, y: e.y, life: 0.3 });
  if (e.type === 'medStop' && m.players[e.pid].msg?.text === 'BARRIER BROKEN') add({ kind: 'boom', x: m.players[e.pid].x, y: m.players[e.pid].y, life: 0.5, ground: true });
  if (e.type === 'rain') add({ kind: 'rain', x: e.x, y: e.y, r: e.r, life: 0.35 });
  if (e.type === 'tandava') { add({ kind: 'shake', x: 0, y: 0, amp: 5, life: 1.4 }); sound.play('shatter2'); } // the island tears in two
  if (e.type === 'blink') add({ kind: 'trail', x0: e.x0, y0: e.y0, x: e.x, y: e.y, life: 0.3 });
  if (e.type === 'release') { // power moves land with a bang in the arena, right after their scene
    const p = m.players[e.pid], shake = (amp, life) => add({ kind: 'shake', x: 0, y: 0, amp, life });
    if (e.name === 'Thousand-Arm Form') { // a serene jade-and-gold halo glides forward as one painted formation
      const o = m.players[1 - e.pid];
      add({ kind: 'arms', part: 'fan', ground: true, x: p.x, y: p.y, tx: o.x, ty: o.y, life: 1.6 }); // drawn behind the fighters
      add({ kind: 'arms', part: 'palms', x: p.x, y: p.y, tx: o.x, ty: o.y, life: 1.6 });          // drawn in front
      shake(0.7, 0.22); // a light accent; the golden impact ripples are drawn with the hands
    }
    if (e.name === 'Gaja Arrow') { add({ kind: 'shock', x: p.x, y: p.y, life: 0.6, color: '255,140,60', r: 60 }); shake(3, 0.4); }
    if (e.name === 'Shakti Vel') { add({ kind: 'shock', x: p.x, y: p.y, life: 0.6, color: '255,200,90', r: 60 }); shake(3, 0.4); }
    if (e.name === 'Pashupatastra') { add({ kind: 'bolt', x: p.x, y: p.y, life: 0.5 }); add({ kind: 'shock', x: p.x, y: p.y, life: 0.6, color: '170,220,255', r: 60 }); shake(3, 0.4); }
    if (e.name === 'Brahmastra') { for (const q of m.players) add({ kind: 'pillar', x: q.x, y: q.y, life: 1.2 }); add({ kind: 'global', x: 0, y: 0, life: 0.9, color: '255,255,255' }); shake(5, 1.0); }
  }
  if (e.type === 'wall') { add({ kind: 'pop', x: e.x, y: e.y - 8, text: 'WALL', color: '#ffb46a' }); add({ kind: 'splash', x: e.x, y: e.y, life: 0.9, big: 1 }); }
  if (e.type === 'boon') { // a god answers and reveals the boon: the fight slows, the god appears, blessing
    S.slowmo = { t0: S.now };
    add({ kind: 'god', god: e.godId, x: 0, y: 0, life: 2.4 });
    S.offer = { pid: e.pid, name: e.name, desc: e.desc, god: e.god, tier: e.tier, t0: S.now }; S.banner = null; // the boon card
  }
  if (e.type === 'boonUsed') { // the held boon is used: the god's light comes down on the caster
    const p = m.players[e.pid];
    add({ kind: 'invoke', god: e.godId, x: p.x, y: p.y, pid: e.pid, life: 1.2 });
    S.banner = { text: `${p.ch.name.toUpperCase()} USES ${e.name.toUpperCase()}`, sub: `${e.tier.toUpperCase()} BOON OF ${e.god.toUpperCase()}`, t0: S.now };
  }
  if (e.type === 'medFull') S.banner = { text: `${m.players[e.pid].ch.name.toUpperCase()}: DEVOTION FULL`, sub: 'A DIVINE WEAPON IS READY', t0: S.now };
}

// how this player uses a held boon (their two special keys, and the pad), or null for the computer
function useHint(pid) {
  if (S.cpu && S.cpu.pid === pid) return null;
  if (S.tut && pid === 1) return null; // the training dummy
  const K = KEYS[S.cpu || S.tut ? 0 : pid], k = (a) => KEY_NAME(K[a][0]);
  return { keys: `${k('s1')} + ${k('s2')}`, pad: `${PAD_NAMES[PAD.s1]} + ${PAD_NAMES[PAD.s2]}` };
}

const pauseItems = () => (S.tut && !S.tut.free ? ['RESUME', 'MOVES & BOONS', 'CONTROLS', 'NEXT LESSON', 'QUIT TO TITLE'] : ['RESUME', 'MOVES & BOONS', 'CONTROLS', 'QUIT TO TITLE']);

// ---------- Controls screen: remap each player's keys and the pad buttons ----------
// Rows: every remappable action, then RESET and BACK. Columns: P1 keys, P2 keys, pad. Confirm on a cell waits
// for the new key (or pad button); ESC cancels. A key that's already taken swaps with the action that had it.
const CTL_ROWS = [...REMAP, 'reset', 'back'];
function openControls(from) { S.ctl = { row: 0, col: 0, listen: false, msg: null, from }; S.screen = 'controls'; S.screenAt = S.now; sound.play('tick'); }
function closeControls() {
  input.cancelCapture();
  if (S.ctl.from === 'pause') { S.screen = 'fight'; S.paused = true; } else { S.screen = 'title'; }
  sound.play('tick');
}
const ACTION_NAME = { up: 'MOVE UP', down: 'MOVE DOWN', left: 'MOVE LEFT', right: 'MOVE RIGHT', a1: 'ATTACK 1', a2: 'ATTACK 2', block: 'BLOCK', s1: 'SPECIAL 1', s2: 'SPECIAL 2', s3: 'SPECIAL 3' };
function say(text, good) { S.ctl.msg = { text, good, t0: S.now }; }
function listen() {
  const c = S.ctl, action = CTL_ROWS[c.row];
  c.listen = true;
  if (c.col < 2) {
    const pid = c.col;
    input.capture({
      onKey: (code) => {
        c.listen = false;
        if (code === 'Escape') return say('CANCELLED');
        if (RESERVED.has(code)) return say(`${KEY_NAME(code)} IS USED BY THE GAME. PICK ANOTHER KEY`);
        const sw = setKey(pid, action, code);
        say(`P${pid + 1} ${ACTION_NAME[action]} = ${KEY_NAME(code)}${sw ? `  (SWAPPED WITH P${sw.pid + 1} ${ACTION_NAME[sw.action]})` : ''}`, true);
        sound.play('start');
      },
      onPad: () => { c.listen = false; say('CANCELLED: PRESS A KEY ON THE KEYBOARD FOR THIS COLUMN'); },
    });
  } else {
    const wait = () => input.capture({
      onKey: (code) => { if (code === 'Escape') { c.listen = false; say('CANCELLED'); } else wait(); },
      onPad: (btn) => {
        c.listen = false;
        if (PAD_RESERVED.has(btn)) return say(`${PAD_NAMES[btn] || 'START'} IS USED BY THE MENUS. PICK ANOTHER BUTTON`);
        const sw = setPad(action, btn);
        say(`PAD ${ACTION_NAME[action]} = ${PAD_NAMES[btn] || `BUTTON ${btn}`}${sw ? `  (SWAPPED WITH ${ACTION_NAME[sw]})` : ''}`, true);
        sound.play('start');
      },
    });
    wait();
  }
}
function updateControls(any) {
  const c = S.ctl;
  if (c.listen) { if (!input.capturing) c.listen = false; return; }
  const n = CTL_ROWS.length;
  if (any('up')) { c.row = (c.row + n - 1) % n; sound.play('tick'); }
  if (any('down')) { c.row = (c.row + 1) % n; sound.play('tick'); }
  if (any('left')) { c.col = (c.col + 2) % 3; sound.play('tick'); }
  if (any('right')) { c.col = (c.col + 1) % 3; sound.play('tick'); }
  if (any('back') || any('pause')) return closeControls();
  if (any('confirm')) {
    const row = CTL_ROWS[c.row];
    if (row === 'back') return closeControls();
    if (row === 'reset') { resetControls(); say('ALL CONTROLS ARE BACK TO THE DEFAULTS', true); sound.play('start'); return; }
    if (c.col === 2 && !ACTIONS.includes(row)) return say('ON A PAD YOU MOVE WITH THE LEFT STICK OR THE D-PAD');
    listen();
  }
}

function update(dt) {
  const inp = input.poll();
  if (inp.pads) sound.unlock(); // a pad press may count as a gesture in some browsers
  sound.setMusic(S.screen === 'fight' && !S.paused && S.match?.phase === 'fight' ? 'fight' : 'menu');
  S.pads = inp.pads;
  while (DBG.menu.length) { const { pid, action } = DBG.menu.shift(); inp.menu[pid][action] = true; }
  const m = inp.menu, any = (a) => m[0][a] || m[1][a];
  S.fx = S.fx.filter((f) => S.clock - f.t0 < f.life);

  if (S.screen === 'title') { // PLAY / TUTORIAL / CONTROLS
    S.titleSel ??= 0;
    if (any('up')) { S.titleSel = (S.titleSel + 2) % 3; sound.play('tick'); }
    if (any('down')) { S.titleSel = (S.titleSel + 1) % 3; sound.play('tick'); }
    if (any('confirm') || any('pause')) {
      if (S.titleSel === 0) { S.tutorial = false; go('setup'); }
      else if (S.titleSel === 1) { S.tutorial = true; S.mode = '1p'; go('select'); S.cursor = [0, CHAR_IDS.length > 1 ? 1 : 0]; S.locked = [false, false]; S.focus = 0; S.boonsPage = S.movesPage = false; }
      else openControls('title');
    }
  } else if (S.screen === 'controls') {
    updateControls(any);
  } else if (S.screen === 'setup') {
    S.tutorial = false;
    const n = ROWS().length;
    if (any('up')) S.row = (S.row + n - 1) % n;
    if (any('down')) S.row = (S.row + 1) % n;
    if (any('left')) changeRow(-1);
    if (any('right')) changeRow(1);
    if (any('confirm')) { go('select'); S.sel = 0; S.cursor = [0, CHAR_IDS.length > 1 ? 1 : 0]; S.locked = [false, false]; S.focus = 0; S.boonsPage = S.movesPage = false; }
    else if (any('back')) go('title');
  } else if (S.screen === 'select') { // character select: each player picks a card; in 1 player mode the computer takes the other one
    if (S.boonsPage || S.movesPage) { if (any('up') || any('back') || any('confirm') || any('down')) S.boonsPage = S.movesPage = false; return; }
    if (any('down')) { S.boonsPage = true; return; }
    if (any('up')) { S.movesPage = true; return; }
    const humans = S.mode === '1p' ? [0] : [0, 1], menu = (pid) => (S.mode === '1p' ? { ...m[1], ...Object.fromEntries(Object.entries(m[0]).filter(([, v]) => v)) } : m[pid]);
    for (const pid of humans) {
      const mm = menu(pid), n = CHAR_IDS.length;
      if (!S.locked[pid]) {
        if (mm.left) { S.cursor[pid] = (S.cursor[pid] + n - 1) % n; S.focus = pid; sound.play('tick'); }
        if (mm.right) { S.cursor[pid] = (S.cursor[pid] + 1) % n; S.focus = pid; sound.play('tick'); }
        if (mm.confirm) { S.locked[pid] = true; sound.play('start'); }
      } else if (mm.back) S.locked[pid] = false;
      else if (mm.confirm && humans.every((h) => S.locked[h])) break;
    }
    if (humans.every((h) => !S.locked[h]) && any('back')) { go(S.tutorial ? 'title' : 'setup'); return; }
    if (humans.every((h) => S.locked[h])) {
      if (S.mode === '1p') S.cursor[1] = (S.cursor[0] + 1) % CHAR_IDS.length; // the computer takes the other fighter
      S.chars = [CHAR_IDS[S.cursor[0]], CHAR_IDS[S.cursor[1]]]; S.side = 0;
      startMatch();
    }
  } else if (S.screen === 'fight') {
    const match = S.match;
    if (S.paused) {
      if (S.info != null) { // moves & boons pages: left/right flip, back closes
        if (any('left')) S.info = (S.info + 3) % 4;
        if (any('right')) S.info = (S.info + 1) % 4;
        if (any('back') || any('confirm') || any('pause')) S.info = null;
        return;
      }
      const items = pauseItems(), n = items.length;
      if (any('up')) S.sel = (S.sel + n - 1) % n;
      else if (any('down')) S.sel = (S.sel + 1) % n;
      else if (any('confirm')) {
        const it = items[S.sel];
        if (it === 'RESUME') S.paused = false;
        else if (it === 'MOVES & BOONS') S.info = 0;
        else if (it === 'CONTROLS') openControls('pause');
        else if (it === 'NEXT LESSON') { nextLesson(S.tut, match, S.now); S.paused = false; }
        else go('title');
      } else if (any('pause')) S.paused = false;
      return;
    }
    if (match.phase === 'done') {
      if (S.now - S.screenAt < 1.6) return; // let the knockout play before the menu takes input
      if (any('up')) S.sel = (S.sel + 2) % 3;
      if (any('down')) S.sel = (S.sel + 1) % 3;
      if (any('confirm')) { if (S.sel === 0) startMatch(); else go(S.sel === 1 ? 'setup' : 'title'); }
      return;
    }
    if (any('pause')) { S.paused = true; S.sel = 0; S.info = null; return; }
    const T = S.tut;
    if (T && frozen(T)) { // a lesson that explains: the fight waits for a confirm
      if (any('confirm')) { nextLesson(T, match, S.now); T.release = true; sound.play('tick'); }
      return;
    }
    if (!match.scene) S.clock += dt;
    let fight = inp.fight;
    if (S.cpu || T) {
      fight = [{}, {}];
      fight[S.side] = merge(inp.fight[0], inp.fight[1]);
      fight[1 - S.side] = S.cpu ? cpuInput(match, S.cpu, dt) : beforeStep(T, match, dt);
    }
    if (T?.release) { // the button that closed an explaining lesson doesn't also attack
      if (ACTIONS.some((a) => fight[0][a])) fight[0] = { mx: fight[0].mx, my: fight[0].my }; else T.release = false;
    }
    for (let i = 0; i < 2; i++) if (DBG.override[i]) fight[i] = { ...DBG.override[i] };
    stepMatch(match, fight, dt);
    const events = match.events.splice(0);
    if (T) afterStep(T, match, events, match.t); // sim time, so "well done" lasts the same at any frame rate
    for (const e of events) if (!(T && e.type === 'end')) onEvent(e, match);
    if (match.phase === 'done') { S.screenAt = S.now; S.sel = 0; }
  }
}

function render() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0); // draw in 480x270 layout units on the full-HD canvas
  R(0, 0, W, H, '#000');
  if (S.screen === 'title') drawTitle(S.now, S.pads, S.titleSel || 0);
  else if (S.screen === 'select') drawSelect(S.now, { ...S, ids: CHAR_IDS, chars: CHARS });
  else if (S.screen === 'setup') drawSetup(S.now, { ...S, rows: ROWS(), levelName: LEVELS[S.level].name });
  else if (S.screen === 'fight') {
    const hints = [0, 1].map(useHint);
    drawFight(S.match, S.now, S.fx, S.tut ? ['YOU', 'DUMMY'] : S.cpu ? (S.cpu.pid === 0 ? ['CPU', 'YOU'] : ['YOU', 'CPU']) : ['P1', 'P2'], S.clock, hints);
    if (S.tut && !S.paused && !S.match.scene) { const v = tutView(S.tut, S.match); if (v) drawTutorial(v, S.now); }
    if (S.offer && S.now - S.offer.t0 < 4.5) drawOffer(S.offer, S.match.players[S.offer.pid], hints[S.offer.pid], S.now - S.offer.t0);
    if (S.banner && S.now - S.banner.t0 < 3) {
      R(0, H - 34, W, 30, 'rgba(10,12,20,.8)');
      txt(S.banner.text, CX, H - 30, '#ffcf6a', 'center');
      txt(S.banner.sub, CX, H - 18, '#ddd', 'center');
    }
    if (S.match.phase === 'done') drawResult(S.match, S.sel, S.now - S.screenAt);
    if (S.paused) { drawPause(S.sel, pauseItems()); if (S.info != null) drawInfo(S.info, S.match.players.map((p) => p.ch)); }
  } else if (S.screen === 'controls') {
    if (S.ctl.from === 'pause' && S.match) { drawFight(S.match, S.now, S.fx, ['', ''], S.clock); }
    drawRemap(S.now, S.ctl, S.pads);
  }
}

addEventListener('keydown', (e) => {
  sound.unlock(); // browsers allow sound only after the first key press
  if (e.captured) return; // the Controls screen took this key
  if (e.code === 'KeyM') sound.toggleMute();
  if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) return;
  if (e.code === 'Digit0') setUseArt(!useArt); // 0 switches between the art and the grey-box
  if (e.code === 'Backquote') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
});
addEventListener('pointerdown', () => sound.unlock());
addEventListener('error', (e) => S.errors.push(String(e.error?.stack || e.message)));
// When the game can't be seen or played (window in the background, tab hidden, focus elsewhere), the browser
// slows its frames to about one a second and the fight would crawl and look frozen. Pause it instead.
function autoPause() {
  if (S.screen === 'fight' && S.match && S.match.phase === 'fight' && !S.paused && !DBG.paused) { S.paused = true; S.sel = 0; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
addEventListener('blur', autoPause);

// ---------- debug API (used by the smoke test) ----------
const r1 = (v) => Math.round(v * 10) / 10;
window.__game = {
  get screen() { return S.screen; },
  hurt(pid) { return S.match ? isHurtPose(S.match, pid) : false; },
  get boonsPage() { return !!S.boonsPage; },
  get tutorial() { return S.tut ? { lesson: lesson(S.tut)?.id || null, i: S.tut.i, free: S.tut.free, done: S.tut.doneAt != null } : null; },
  get controls() { return S.ctl ? { row: S.ctl.row, col: S.ctl.col, listen: S.ctl.listen, msg: S.ctl.msg?.text || null } : null; },
  get keys() { return KEYS.map((K) => Object.fromEntries(REMAP.map((a) => [a, K[a][0]]))); },
  get pad() { return { ...PAD }; },
  get sounds() { return [...sound.log]; },
  get audio() { return { state: sound.state(), muted: sound.isMuted() }; },
  get art() { return { ready: ART.ready, arena: !!ART.arena, fx: Object.keys(ART.fx).length, scenes: Object.keys(ART.scenes).length, sceneLayers: Object.keys(ART.sceneLayers).length, gods: Object.keys(ART.gods).length, sheets: Object.keys(ART.sheets), frames: Object.fromEntries(Object.entries(ART.sheets).map(([k, s]) => [k, s.walk.cells.length])), actions: Object.fromEntries(Object.entries(ART.sheets).map(([k, s]) => [k, s.act ? s.act.cells.length : 0])) }; },
  errors: S.errors,
  debug: {
    pause() { DBG.paused = true; }, resume() { DBG.paused = false; },
    step(n = 1) { for (let i = 0; i < n; i++) update(STEP); render(); },
    setInput(pid, inp) { DBG.override[pid] = inp; }, clearInput() { DBG.override = [null, null]; },
    press(action, pid = 0) { DBG.menu.push({ pid, action }); },
    controls(from = 'title') { openControls(from); },
    start(o = {}) { // debug starts default to 2 players; pass { mode: '1p', side, level } for the computer, { tutorial: true } for the tutorial
      if (o.minutes) S.minutes = o.minutes; if (o.seed) S.seed = o.seed;
      S.mode = o.tutorial ? '1p' : o.mode || '2p'; S.side = o.side ?? 0; S.level = o.level || 'normal'; S.tutorial = !!o.tutorial; if (o.chars) S.chars = o.chars; startMatch();
    },
    set(pid, fields) { Object.assign(S.match.players[pid], fields); },
    match() { return S.match; },
    unit(o) { return spawnUnit(S.match, o).id; },
    snapshot() {
      const m = S.match;
      return {
        screen: S.screen, paused: S.paused, minutes: S.minutes, mode: S.mode, side: S.side, level: S.level, cpu: S.cpu ? S.cpu.pid : null, fx: S.fx.map((f) => f.text || f.kind), banner: S.banner?.text || null,
        match: m && {
          phase: m.phase, result: m.result, timeLeft: r1(m.timeLeft), duration: m.duration, scene: m.scene?.name || null,
          projectiles: m.projectiles.length,
          players: m.players.map((p) => ({ id: p.id, name: p.ch.name, x: r1(p.x), y: r1(p.y), hp: r1(p.hp), power: r1(p.power), cast: p.cast?.move.name || null,
            block: !!p.block, med: !!p.med, barrier: p.med ? r1(p.med.barrier) : null, devotion: p.devotion, boon: p.boon?.name || null, effects: Object.keys(p.effects) })),
        },
      };
    },
  },
};

if (qs.get('screen') === 'fight') startMatch();

let last = performance.now(), acc = 0;
// Slow motion for a moment after a boon is invoked, so everyone sees what it is (render-side only: the sim
// still runs in fixed steps, just fewer of them per second).
function timeScale() {
  if (!S.slowmo || S.screen !== 'fight' || S.paused) return 1;
  const t = S.now - S.slowmo.t0;
  if (S.slowmo.short) { if (t > 0.6) { S.slowmo = null; return 1; } return t < 0.25 ? 0.1 : 0.1 + 0.9 * ((t - 0.25) / 0.35); } // impact hit-stop
  if (t > 1.5) { S.slowmo = null; return 1; }
  return t < 1.0 ? 0.3 : 0.3 + 0.7 * ((t - 1.0) / 0.5);
}
function frame(ts) {
  const gap = (ts - last) / 1000, dt = Math.min(0.1, Math.max(0, gap)); last = ts; S.now += dt;
  if (gap > 0.5) autoPause(); // frames came very late (throttled in the background): pause rather than crawl
  try {
    if (!DBG.paused) { acc += dt * timeScale(); while (acc >= STEP) { update(STEP); acc -= STEP; } }
    render();
    sound.tickMusic();
  } catch (e) { S.errors.push(String(e?.stack || e)); console.error(e); }
  requestAnimationFrame(frame);
}
if (qs.get('grey') === '1') setUseArt(false);
Promise.all([
  Promise.race([Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('900 20px "Noto Serif Tamil"', 'போர்க்களம்')]), new Promise((r) => setTimeout(r, 1500))]),
  loadArt().then(fitView).catch((e) => S.errors.push(String(e))),
]).finally(() => requestAnimationFrame((ts) => { last = ts; frame(ts); })); // start the clock on the first frame

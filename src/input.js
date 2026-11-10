// Keyboard + gamepads -> per-player button states for the sim, plus menu "just pressed" events.
// Gamepad 1 = P1, gamepad 2 = P2 (standard mapping). Every fighter uses the same layout (ground rule 14);
// players may remap their own keys (and the pad buttons) on the Controls screen. Saved in this browser.

// Combos are handled in the sim: 3 specials = signature, 2 specials = spend devotion on a boon, down + special 1 = meditate.
export const ACTIONS = ['a1', 'a2', 'block', 's1', 's2', 's3'];
export const REMAP = ['up', 'down', 'left', 'right', ...ACTIONS]; // what the Controls screen can change

export const LABELS = {
  a1: 'Basic attack 1', a2: 'Basic attack 2 (close)', block: 'Block',
  s1: 'Special 1', s2: 'Special 2', s3: 'Special 3',
};

// standard gamepad buttons: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 LS, 11 RS, 12-15 d-pad up/down/left/right
const DEFAULT_PAD = { a1: 0, a2: 2, s1: 1, s2: 3, s3: 4, block: 5 };
export const PAD = { ...DEFAULT_PAD };
export const PAD_NAMES = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'BACK', 10: 'LS', 11: 'RS', 12: 'D-UP', 13: 'D-DOWN', 14: 'D-LEFT', 15: 'D-RIGHT' };
export const PAD_RESERVED = new Set([9, 12, 13, 14, 15]); // Start pauses; the d-pad moves through menus

const DEFAULT_KEYS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a1: 'KeyF', a2: 'KeyG', block: 'KeyH', s1: 'KeyR', s2: 'KeyT', s3: 'KeyY' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a1: 'KeyK', a2: 'KeyL', block: 'Semicolon', s1: 'KeyI', s2: 'KeyO', s3: 'KeyP' },
];
// Keys the game itself uses: pause, sound, grey-box, fullscreen (and keys the browser or OS keep for themselves).
export const RESERVED = new Set(['Escape', 'KeyM', 'Digit0', 'Backquote', 'Tab', 'MetaLeft', 'MetaRight', 'CapsLock', 'ContextMenu', 'OSLeft', 'OSRight']);

// KEYS[pid][action] = [code]. Attack 1 also confirms in menus (plus Space/Enter); Escape is P1's back key.
export const KEYS = [{}, {}];
function rebuild(saved) {
  for (let i = 0; i < 2; i++) {
    const K = KEYS[i];
    for (const a of REMAP) K[a] = [saved?.[i]?.[a] || DEFAULT_KEYS[i][a]];
    K.confirm = i === 0 ? [K.a1[0], 'Space', 'Enter'] : [K.a1[0], 'Enter'];
    K.back = i === 0 ? ['Escape'] : [];
  }
}
const STORE = 'porkalam.controls.v1';
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ keys: KEYS.map((K) => Object.fromEntries(REMAP.map((a) => [a, K[a][0]]))), pad: PAD })); } catch { /* storage blocked: the change lasts until reload */ }
}
(function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { s = null; }
  const okKeys = Array.isArray(s?.keys) && s.keys.length === 2 && s.keys.every((k) => REMAP.every((a) => typeof k?.[a] === 'string' && !RESERVED.has(k[a])));
  rebuild(okKeys ? s.keys : null);
  if (s?.pad && ACTIONS.every((a) => Number.isInteger(s.pad[a]) && !PAD_RESERVED.has(s.pad[a]))) Object.assign(PAD, s.pad);
})();

// Bind a key. If another action (either player) already uses it, the two swap so nothing is left without a key.
// Returns what was swapped ({ pid, action }) or null.
export function setKey(pid, action, code) {
  const old = KEYS[pid][action][0];
  let swapped = null;
  for (let i = 0; i < 2; i++) for (const a of REMAP) {
    if ((i !== pid || a !== action) && KEYS[i][a][0] === code) { KEYS[i][a] = [old]; swapped = { pid: i, action: a }; }
  }
  const cur = KEYS.map((K) => Object.fromEntries(REMAP.map((a) => [a, K[a][0]])));
  cur[pid][action] = code;
  rebuild(cur); save();
  return swapped;
}
export function setPad(action, btn) {
  const old = PAD[action];
  let swapped = null;
  for (const a of ACTIONS) if (a !== action && PAD[a] === btn) { PAD[a] = old; swapped = a; }
  PAD[action] = btn; save();
  return swapped;
}
export function resetControls() { rebuild(null); Object.assign(PAD, DEFAULT_PAD); save(); }

const NAMES = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  Escape: 'ESC', Space: 'SPACE', Enter: 'ENTER', Backspace: 'BKSP', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'LCTRL', ControlRight: 'RCTRL', AltLeft: 'LALT', AltRight: 'RALT', IntlBackslash: '\\' };
export const KEY_NAME = (code) => NAMES[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'NUM').toUpperCase();

const MENU = ['up', 'down', 'left', 'right', 'confirm', 'back', 'pause'];

export function createInput() {
  const down = new Set(), tapped = new Set(); // tapped: pressed since the last poll, so a quick tap is never lost
  const prev = [{}, {}];
  let capture = null; // { onKey(code), onPad(btn) }: the Controls screen is waiting for a key or a pad button
  let padHeld = new Set();
  addEventListener('keydown', (e) => {
    if (capture) { e.preventDefault(); e.captured = true; if (!e.repeat) { const c = capture; capture = null; c.onKey(e.code); } return; }
    down.add(e.code); tapped.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());

  const pads = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);

  function readPad(gp) {
    if (!gp) return null;
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    let mx = gp.axes[0] || 0, my = gp.axes[1] || 0;
    if (Math.hypot(mx, my) < 0.2) mx = my = 0;
    const f = { mx, my };
    for (const a of ACTIONS) f[a] = b(PAD[a]);
    const menu = { up: b(12) || my < -0.5, down: b(13) || my > 0.5, left: b(14) || mx < -0.5, right: b(15) || mx > 0.5, confirm: b(0), back: b(1), pause: b(9) };
    return { f, menu };
  }
  function readKeys(K) {
    const h = (a) => (K[a] || []).some((k) => down.has(k) || tapped.has(k));
    const f = { mx: (h('right') ? 1 : 0) - (h('left') ? 1 : 0), my: (h('down') ? 1 : 0) - (h('up') ? 1 : 0) };
    for (const a of ACTIONS) f[a] = h(a);
    return { f, menu: { up: h('up'), down: h('down'), left: h('left'), right: h('right'), confirm: h('confirm'), back: h('back'), pause: down.has('Escape') || tapped.has('Escape') } };
  }

  function poll() {
    const ps = pads(), fight = [], menu = [];
    // pad buttons pressed this frame (on any pad): a waiting Controls screen takes the first new one
    const nowHeld = new Set();
    ps.forEach((gp, pi) => gp.buttons.forEach((b, bi) => { if (b && (b.pressed || b.value > 0.5)) nowHeld.add(`${pi}:${bi}`); }));
    if (capture?.onPad) for (const k of nowHeld) if (!padHeld.has(k)) { const c = capture; capture = null; c.onPad(Number(k.split(':')[1])); break; }
    padHeld = nowHeld;
    for (let i = 0; i < 2; i++) {
      const k = readKeys(KEYS[i]), g = readPad(ps[i]);
      const f = { ...k.f };
      if (g) {
        for (const a of ACTIONS) f[a] = f[a] || g.f[a];
        if (g.f.mx || g.f.my) { f.mx = g.f.mx; f.my = g.f.my; }
      }
      fight.push(f);
      const cur = {}, ev = {};
      for (const a of MENU) { cur[a] = !!(k.menu[a] || g?.menu[a]); ev[a] = cur[a] && !prev[i][a]; }
      prev[i] = cur;
      menu.push(ev);
    }
    tapped.clear();
    return { fight, menu, pads: ps.length };
  }

  return {
    poll, isDown: (code) => down.has(code),
    capture(c) { capture = c; down.clear(); tapped.clear(); }, // wait for the next key or new pad button
    cancelCapture() { capture = null; },
    get capturing() { return !!capture; },
  };
}

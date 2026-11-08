// Keyboard + gamepads -> per-player button states for the sim, plus menu "just pressed" events.
// Gamepad 1 = P1, gamepad 2 = P2 (standard mapping). Every fighter uses the same layout (ground rule 14).
// No controller vibration (ground rule 10: it would give traps away).

// No boon button: pressing two special buttons together uses the boon (handled in the sim).
export const ACTIONS = ['a1', 'a2', 'block', 'trapPlant', 'trapWater', 's1', 's2', 's3', 'sig', 'cls'];

export const LABELS = {
  a1: 'Basic attack 1', a2: 'Basic attack 2 (close)', block: 'Block', trapPlant: 'Hold + basic 2: planted trap', trapWater: 'Hold + basic 2: water trap',
  s1: 'Special 1', s2: 'Special 2', s3: 'Special 3', sig: 'Signature', cls: 'Class (meditate / Brahmastra)',
};

// standard gamepad buttons: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 12-15 d-pad up/down/left/right
export const PAD = { a1: 0, a2: 2, s1: 1, s2: 3, s3: 4, block: 5, trapWater: 6, trapPlant: 7, sig: 12, cls: 14 };
export const PAD_NAMES = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'BACK', 12: 'D-UP', 13: 'D-DOWN', 14: 'D-LEFT', 15: 'D-RIGHT' };

export const KEYS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    a1: ['KeyF'], a2: ['KeyG'], block: ['KeyH'], trapPlant: ['KeyQ'], trapWater: ['KeyE'], s1: ['KeyR'], s2: ['KeyT'], s3: ['KeyY'],
    sig: ['KeyV'], cls: ['KeyB'], confirm: ['KeyF', 'Space', 'Enter'], back: ['Escape'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    a1: ['KeyK'], a2: ['KeyL'], block: ['Semicolon'], trapPlant: ['KeyU'], trapWater: ['KeyJ'], s1: ['KeyI'], s2: ['KeyO'], s3: ['KeyP'],
    sig: ['KeyM'], cls: ['Comma'], confirm: ['KeyK', 'Enter'], back: [] },
];
export const KEY_NAME = (code) => code.replace(/^Key/, '').replace('Semicolon', ';').replace('Comma', ',').replace('Period', '.').replace('Slash', '/').replace('Quote', "'").replace('Escape', 'ESC');

const MENU = ['up', 'down', 'left', 'right', 'confirm', 'back', 'pause'];

export function createInput() {
  const down = new Set(), tapped = new Set(); // tapped: pressed since the last poll, so a quick tap is never lost
  const prev = [{}, {}];
  addEventListener('keydown', (e) => {
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

  return { poll, isDown: (code) => down.has(code) };
}

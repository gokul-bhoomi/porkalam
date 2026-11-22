// Test mode (?test): skip the menus, go straight into a match, and hand out any boon from a small panel.
// URL options:
//   ?test                         a 2-player match (you drive both fighters with the usual keys)
//   &cpu=1                        P2 is the computer instead
//   &boon=brahmastra              P1 starts holding this boon (any boon id from src/chars/gods.js)
//   &p=2                          ...give it to P2 instead
//   &refill=1                     give the boon back a moment after it is used, to repeat it quickly
//   &chars=veeran,siddhan         which fighters (P1,P2)
//   &minutes=9                    match length
//   &arena=battlefield            the battlefield: the panel then also has buttons that send each arena hazard in at once
// Only a testing aid: nothing here changes the game rules.
import { GODS } from './chars/gods.js';
import { CHARS } from './chars/index.js';
import { TUNE } from './config.js';
import { forceHazard } from './sim.js';

const TIER_NAMES = ['small', 'divine'];
const BOONS = Object.entries(GODS).flatMap(([godId, g]) => g.tiers.flatMap((t, ti) => t.map((b) => ({ b, godId, god: g.name, tier: TIER_NAMES[ti] }))));

export function createTestMode(qs, api) {
  if (!qs.has('test')) return null;
  const T = {
    boon: qs.get('boon') || 'brahmastra', pid: qs.get('p') === '2' ? 1 : 0, refill: qs.get('refill') === '1',
    chars: (qs.get('chars') || '').split(',').filter((c) => CHARS[c]), cpu: qs.get('cpu') === '1', minutes: Number(qs.get('minutes')) || 9,
    given: [0, 0], wait: [null, null], // the boon each fighter was given, and when it comes back (refill)
  };
  const give = (pid, id) => {
    const m = api.match();
    const e = BOONS.find((q) => q.b.id === id);
    if (!m || !e) return;
    m.players[pid].boon = { move: e.b, name: e.b.name, god: e.god, godId: e.godId, tier: e.tier };
    T.given[pid] = id;
  };
  T.start = () => {
    api.start({ mode: T.cpu ? '1p' : '2p', chars: T.chars.length === 2 ? T.chars : null, minutes: T.minutes });
    T.given = [0, 0];
    if (qs.get('boon')) give(T.pid, T.boon);
  };
  // the refill: a moment after the given boon is used (and the match is still on), it comes back
  T.tick = (now) => {
    const m = api.match();
    if (!T.refill || !m || m.result) return;
    for (const p of m.players) {
      const id = T.given[p.id];
      if (!id || p.boon) { T.wait[p.id] = null; continue; }
      T.wait[p.id] ??= now + 1.5;
      if (now >= T.wait[p.id]) { give(p.id, id); T.wait[p.id] = null; }
    }
  };

  // ---- the panel (top-left; click, then the keyboard goes back to the game) ----
  const el = (tag, css, parent, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; parent?.appendChild(e); return e; };
  const box = el('div', 'position:fixed;left:8px;bottom:8px;z-index:10;font:12px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.72);padding:8px;border-radius:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 32px)', document.body);
  const btnCss = 'font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #777;background:#222;color:#fff;cursor:pointer';
  el('b', 'margin-right:4px', box, 'TEST');
  const sel = el('select', btnCss, box);
  for (const g of Object.values(GODS)) {
    const og = el('optgroup', null, sel); og.label = g.name;
    for (const e of BOONS.filter((q) => q.god === g.name)) { const o = el('option', null, og, `${e.b.name}${e.tier === 'divine' ? ' ★' : ''}`); o.value = e.b.id; }
  }
  sel.value = T.boon;
  const back = () => document.activeElement?.blur(); // keep the arrow keys and space for the game
  sel.onchange = () => { T.boon = sel.value; back(); };
  const button = (label, fn) => { const b = el('button', btnCss, box, label); b.onclick = () => { fn(); back(); }; return b; };
  button('Give P1', () => give(0, T.boon));
  button('Give P2', () => give(1, T.boon));
  button('Full devotion', () => { const m = api.match(); if (m) for (const p of m.players) p.devotion = TUNE.meditate.segments; });
  button('Heal', () => { const m = api.match(); if (m && !m.result) for (const p of m.players) p.hp = 100; });
  const refill = el('label', 'display:flex;gap:4px;align-items:center;cursor:pointer', box);
  const cb = el('input', null, refill); cb.type = 'checkbox'; cb.checked = T.refill; cb.onchange = () => { T.refill = cb.checked; back(); };
  el('span', null, refill, 'Refill');
  const cpu = el('label', 'display:flex;gap:4px;align-items:center;cursor:pointer', box);
  const cc = el('input', null, cpu); cc.type = 'checkbox'; cc.checked = T.cpu; cc.onchange = () => { T.cpu = cc.checked; back(); };
  el('span', null, cpu, 'P2 computer');
  // the battlefield's arena hazards, on demand (owner 2026-11-22); only shown when the match has them (?arena=battlefield)
  const haz = el('span', 'display:flex;gap:4px;align-items:center', box);
  el('span', 'margin-left:6px;opacity:.8', haz, 'Hazard:');
  for (const [k, label] of [['arrows', 'Arrows'], ['soldier', 'Soldier'], ['spear', 'Spear'], ['horse', 'Horse'], ['elephant', 'Elephant']]) {
    const b = el('button', btnCss, haz, label); b.onclick = () => { const m = api.match(); if (m) forceHazard(m, k); back(); };
  }
  const showHaz = () => { haz.style.display = api.match()?.haz ? 'flex' : 'none'; requestAnimationFrame(showHaz); };
  showHaz();
  button('Restart', () => T.start());
  button('Hide', () => { box.style.display = 'none'; });
  return T;
}

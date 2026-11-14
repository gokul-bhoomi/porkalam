// Tutorial: a guided practice fight against a training dummy that explains every part of the game, one lesson
// at a time. Lessons marked `info` freeze the fight and wait for a confirm; the others wait until the player
// has done the thing. The tutorial bends the match only here, never in sim.js: the clock is stopped, nobody
// can be knocked out, and the player's power is topped up during the lessons so every move can be tried.
import { KEYS, KEY_NAME, PAD, PAD_NAMES } from './input.js';
import { TUNE } from './config.js';

const key = (a) => KEY_NAME(KEYS[0][a][0]);
const pad = (a) => PAD_NAMES[PAD[a]] || `BUTTON ${PAD[a]}`;
const DUMMY = 1, YOU = 0;

export const LESSONS = [
  { id: 'welcome', info: true, title: () => 'WELCOME TO PORKALAM',
    lines: () => ['Knock your opponent to 0% health to win.', 'This is practice: the dummy can\'t lose.'] },
  { id: 'hud', info: true, title: () => 'READING THE SCREEN',
    lines: () => ['Green bar = your health.', 'Gold bar = power. Every move uses some.', 'Small boxes = devotion. Used for boons.'] },
  { id: 'move', title: () => 'MOVE',
    lines: () => [`PRESS [${key('up')}] [${key('left')}] [${key('down')}] [${key('right')}] TO MOVE`, 'PAD: LEFT STICK'],
    enter: (T) => { T.moved = 0; T.last = null; },
    poll: (m, T) => { const p = m.players[YOU]; if (T.last) T.moved += Math.hypot(p.x - T.last.x, p.y - T.last.y); T.last = { x: p.x, y: p.y }; return T.moved >= 90; },
    progress: (m, T) => `${Math.min(100, Math.round(T.moved / 0.9))}%` },
  { id: 'a1', title: (ch) => `ATTACK 1: ${ch.moves.a1.name}`,
    lines: () => [`PRESS [${key('a1')}] TO ATTACK`, `HOLD TO CHARGE   PAD: ${pad('a1')}`],
    event: (e, m, ch) => e.type === 'hp' && e.pid === DUMMY && (e.srcs || []).includes(ch.moves.a1.name) },
  { id: 'a2', title: (ch) => `ATTACK 2: ${ch.moves.a2.name}`,
    lines: () => [`GET CLOSE, PRESS [${key('a2')}]`, `PAD: ${pad('a2')}`],
    event: (e, m, ch) => e.type === 'hp' && e.pid === DUMMY && (e.srcs || []).includes(ch.moves.a2.name) },
  { id: 'block', title: (ch) => `BLOCK: ${ch.defence.name}`,
    lines: () => [`HOLD [${key('block')}] TO BLOCK`, `THE DUMMY SHOOTS AT YOU   PAD: ${pad('block')}`],
    enter: (T, m) => { m.players[YOU].x = -45; m.players[YOU].y = 0; m.players[DUMMY].x = 45; m.players[DUMMY].y = 0; T.shootAt = 1; },
    event: (e) => e.type === 'blocked' && e.pid === YOU },
  { id: 'specials', title: () => 'SPECIAL MOVES',
    lines: () => [`PRESS [${key('s1')}] [${key('s2')}] [${key('s3')}]`, `ONE AT A TIME   PAD: ${pad('s1')} ${pad('s2')} ${pad('s3')}`],
    enter: (T) => { T.used = new Set(); },
    event: (e, m, ch, T) => { if (e.type === 'cast' && e.pid === YOU && /^s[123]$/.test(e.slot)) T.used.add(e.slot); return T.used.size >= 3; },
    progress: (m, T) => ['s1', 's2', 's3'].map((s) => `${key(s)}${T.used.has(s) ? '+' : '-'}`).join(' ') },
  { id: 'sig', title: (ch) => `SIGNATURE: ${ch.moves.sig.name}`,
    lines: () => [`PRESS [${key('s1')}]+[${key('s2')}]+[${key('s3')}] TOGETHER`, `ANY HIT BREAKS IT   PAD: ${pad('s1')}+${pad('s2')}+${pad('s3')}`],
    event: (e, m, ch) => e.type === 'release' && e.pid === YOU && e.name === ch.moves.sig.name },
  { id: 'meditate', title: () => 'MEDITATE',
    lines: () => [`HOLD [${key('down')}] + PRESS [${key('s1')}] TO MEDITATE`, `FILL ${TUNE.meditate.tiers[0]} DEVOTION   PAD: DOWN+${pad('s1')}`],
    enter: (T, m) => { m.players[YOU].air = null; }, // brought back down if still flying from the specials lesson (nobody meditates in the air)
    poll: (m) => m.players[YOU].devotion >= TUNE.meditate.tiers[0],
    progress: (m) => `${Math.min(m.players[YOU].devotion, TUNE.meditate.tiers[0])}/${TUNE.meditate.tiers[0]}` },
  { id: 'boons', info: true, title: () => 'BOONS',
    lines: () => [`Spend devotion to get a gift from a god.`,
      `${TUNE.meditate.tiers[0]} devotion = small boon.  ${TUNE.meditate.tiers[1]} = divine weapon.`,
      'Risk: a divine weapon can be the BRAHMASTRA.', 'It ends the match for BOTH of you: a draw.'] },
  { id: 'boon', title: () => 'ASK THE GODS FOR A BOON',
    lines: () => [`PRESS [${key('s1')}]+[${key('s2')}] FOR A BOON`, `PRESS AGAIN TO USE IT   PAD: ${pad('s1')}+${pad('s2')}`],
    enter: (T, m) => { const p = m.players[YOU]; if (!p.boon) p.devotion = Math.max(p.devotion, TUNE.meditate.tiers[0]); },
    event: (e) => e.type === 'boonUsed' && e.pid === YOU,
    progress: (m) => (m.players[YOU].boon ? 'NOW USE IT' : 'ASK') },
  { id: 'tips', info: true, title: () => 'GOOD TO KNOW',
    lines: () => ['Getting knocked into the edge costs health.', 'When the clock runs out, whoever has more health wins.'] },
  { id: 'done', info: true, title: () => 'YOU ARE READY',
    lines: () => ['Keep practising as long as you like.', 'Press ESC and quit when you want a real match.'] },
];

export function createTutorial() { return { i: 0, doneAt: null, free: false, enteredAt: 0 }; }
export const lesson = (T) => (T.free ? null : LESSONS[T.i]);

function enter(T, m, now) {
  T.doneAt = null; T.enteredAt = now;
  const L = LESSONS[T.i];
  if (!L) { T.free = true; return; }
  L.enter?.(T, m);
}
export function startTutorial(T, m, now) { T.i = 0; enter(T, m, now); }
export function nextLesson(T, m, now) {
  if (T.free) return;
  T.i++;
  if (T.i >= LESSONS.length) T.free = true; else enter(T, m, now);
}

// Info lessons freeze the fight until the player confirms.
export const frozen = (T) => !!lesson(T)?.info;

// Called before each fight step: keeps the practice going, and returns the dummy's buttons.
export function beforeStep(T, m, dt) {
  m.timeLeft = m.duration; // the clock is stopped
  for (const p of m.players) if (p.hp < 35) p.hp = p.ch.health; // nobody gets knocked out
  const you = m.players[YOU];
  if (!T.free && !you.cast && you.power < 70) you.power = you.ch.power.size; // power topped up during lessons
  const L = lesson(T), inp = {};
  if (L?.id === 'block' && !T.doneAt) { // the dummy fires a shot every 2.5 s: hold the button, then let go
    T.shootAt -= dt;
    const d = m.players[DUMMY];
    if (d.power < 20) d.power = d.ch.power.size;
    if (T.shootAt < 0.35 && T.shootAt > 0) inp.a1 = true;
    if (T.shootAt <= 0) T.shootAt = 2.5;
  }
  return inp;
}

// Called after each fight step with that step's events.
export function afterStep(T, m, events, now) {
  if (m.phase === 'done') { m.phase = 'fight'; m.result = null; for (const p of m.players) p.hp = p.ch.health; } // never ends
  m.timeLeft = m.duration;
  const L = lesson(T);
  if (!L || L.info) return;
  if (T.doneAt == null) {
    const ch = m.players[YOU].ch;
    if (L.event && events.some((e) => L.event(e, m, ch, T))) T.doneAt = now;
    if (L.poll && L.poll(m, T)) T.doneAt = now;
  } else if (now - T.doneAt > 1.6) nextLesson(T, m, now); // "well done" stays up for a moment
}

// What the renderer shows for the current lesson.
export function view(T, m) {
  const L = lesson(T);
  if (!L) return null;
  const ch = m.players[YOU].ch;
  return {
    n: T.i + 1, of: LESSONS.length, id: L.id, info: !!L.info, title: L.title(ch).toUpperCase(), lines: L.lines(ch),
    progress: L.progress ? L.progress(m, T) : null, done: T.doneAt != null,
    confirm: `${KEY_NAME(KEYS[0].a1[0])} / ENTER / PAD A`,
  };
}

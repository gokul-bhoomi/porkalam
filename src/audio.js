// Sound and music, all synthesized with the Web Audio API (no audio files).
// Music: a tanpura-style drone (Sa-Pa-Sa-Sa plucks) with a soft mridangam-like rhythm in raga Mohanam, louder
// in a fight. Effects: one short synth per game event. Divine moments (a boon granted, a divine weapon,
// a power-up) get temple bells, a choir swell and a conch. Browsers only allow sound after a key press,
// so everything starts on the first input. M mutes.

const SA = 146.83; // D3
const RAGA = [0, 2, 4, 7, 9]; // Mohanam: Sa Ri Ga Pa Dha (semitones)
const hz = (semi, oct = 0) => SA * 2 ** (semi / 12 + oct);

let ctx = null, master = null, musicBus = null, sfxBus = null, verb = null;
let muted = false, musicOn = false, musicLevel = 0, nextBeat = 0, beat = 0, lastPlay = {};
export const log = []; // names of played sounds (read by the smoke test)

function init() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  // a soft hall reverb, so bells and choir ring like in a temple
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
  verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master); musicBus.connect(verb);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  return true;
}

// call on any user input: creates/resumes the audio (browsers need a gesture first)
export function unlock() {
  if (!init()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
  return muted;
}
export const isMuted = () => muted;

// ---------- building blocks ----------
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(type, f, t, a, peak, d, out, { detune = 0, glide = null, wet = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
  env(g, t, a, peak, d); o.connect(g); g.connect(out);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  o.start(t); o.stop(t + a + d + 0.05);
}
function noise(t, d, peak, out, { type = 'bandpass', f = 1200, q = 1, f2 = null, a = 0.005 } = {}) {
  const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (d + a + 0.05)), ctx.sampleRate);
  const ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  n.buffer = buf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = ctx.createGain(); env(g, t, a, peak, d);
  n.connect(fl); fl.connect(g); g.connect(out); n.start(t); n.stop(t + a + d + 0.05);
}
// a temple bell: inharmonic partials that ring and fade
function bell(f, t, peak = 0.25, d = 2.2, out = sfxBus) {
  for (const [r, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.12], [0.5, 0.3]]) osc('sine', f * r, t, 0.002, peak * a, d / (r > 1 ? r ** 0.4 : 1), out, { wet: 0.8 });
}
// a choir-like swell: detuned voices on Sa, Pa and the upper Sa
function choir(t, d = 2.2, peak = 0.06, root = 0) {
  for (const s of [0, 7, 12, 16]) for (const det of [-9, 0, 8]) osc('triangle', hz(root + s, 1), t, d * 0.4, peak, d * 0.8, sfxBus, { detune: det, wet: 1 });
}
// a conch (shankha): a breathy horn rising into its note
function conch(t, d = 1.4, peak = 0.16) {
  const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(7, 0) * 0.94, t); o.frequency.linearRampToValueAtTime(hz(7, 0), t + 0.25);
  lfo.frequency.value = 5.5; lg.gain.value = 3; lfo.connect(lg); lg.connect(o.frequency);
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(500, t); fl.frequency.linearRampToValueAtTime(1600, t + 0.4); fl.Q.value = 4;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.25); g.gain.setValueAtTime(peak, t + d - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(fl); fl.connect(g); g.connect(sfxBus); g.connect(verb);
  o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  noise(t, d * 0.8, peak * 0.25, sfxBus, { f: 900, q: 2, a: 0.2 });
}
// a plucked string (tanpura / veena): a bright saw through a closing filter
function pluck(f, t, peak, d, out) {
  const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = f;
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 8, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + d); fl.Q.value = 6; // the buzzy jawari bridge
  env(g, t, 0.01, peak, d); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
}
function drum(t, low, peak) { // mridangam-like: a pitched thump, or a sharp 'ta'
  if (low) osc('sine', 110, t, 0.003, peak, 0.35, musicBus, { glide: 62 });
  else { osc('triangle', 330, t, 0.002, peak * 0.6, 0.12, musicBus, { glide: 300 }); noise(t, 0.06, peak * 0.5, musicBus, { f: 2600, q: 3 }); }
}

// ---------- music ----------
// `mode` = 'menu' (quiet drone) or 'fight' (drone + rhythm + a few melody notes); null = silence.
export function setMusic(mode) {
  musicOn = !!mode;
  musicLevel = mode === 'fight' ? 0.55 : mode === 'menu' ? 0.4 : 0;
  if (ctx) musicBus.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.4);
  musicMode = mode;
}
let musicMode = null;
export function duck(amount = 0.25, time = 1.6) { // quieter music under a big moment
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(musicLevel * amount, t, 0.08); musicBus.gain.setTargetAtTime(musicLevel, t + time, 0.5);
}
// called every frame: schedules the next music beats a little ahead
export function tickMusic() {
  if (!ctx || !musicOn || ctx.state !== 'running') return;
  const BEAT = 0.42, now = ctx.currentTime;
  if (nextBeat < now) nextBeat = now + 0.05;
  while (nextBeat < now + 0.3) {
    const t = nextBeat, b = beat % 16;
    if (b % 4 === 0) pluck([hz(7, -1), hz(0), hz(0), hz(0, -1)][(b / 4) % 4], t, 0.09, 2.2, musicBus); // tanpura: Pa Sa Sa Sa(low)
    if (musicMode === 'fight') {
      if ([0, 6, 8, 11, 14].includes(b)) drum(t, b === 0 || b === 8, b === 0 ? 0.3 : 0.18); // a gentle adi-talam-ish pattern
      if ([3, 7, 10].includes(b)) drum(t, false, 0.08);
      if (b % 8 === 2 && Math.random() < 0.6) { // a veena phrase of two or three raga notes
        let s = RAGA[Math.floor(Math.random() * RAGA.length)];
        for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { pluck(hz(s, 1), t + i * BEAT * 0.5, 0.05, 1.2, musicBus); s = RAGA[(RAGA.indexOf(s) + (Math.random() < 0.5 ? 1 : RAGA.length - 1)) % RAGA.length]; }
      }
    }
    nextBeat += BEAT; beat++;
  }
}

// ---------- effects ----------
const SFX = {
  bow: (t) => { osc('triangle', 220, t, 0.002, 0.18, 0.18, sfxBus, { glide: 120 }); noise(t, 0.12, 0.12, sfxBus, { f: 3000, f2: 900, q: 1 }); },
  bolt: (t) => { osc('sine', hz(12, 1), t, 0.005, 0.1, 0.25, sfxBus, { glide: hz(19, 1), wet: 0.4 }); osc('sine', hz(19, 1), t + 0.04, 0.005, 0.06, 0.3, sfxBus, { wet: 0.5 }); },
  whoosh: (t) => noise(t, 0.18, 0.16, sfxBus, { f: 600, f2: 2400, q: 0.8, a: 0.03 }),
  hit: (t, big = 1) => { osc('sine', 140, t, 0.002, 0.35 * big, 0.2 + 0.15 * big, sfxBus, { glide: 50 }); noise(t, 0.08 + 0.05 * big, 0.25 * big, sfxBus, { type: 'lowpass', f: 1800 }); },
  block: (t) => { osc('square', 180, t, 0.002, 0.08, 0.09, sfxBus, { glide: 140 }); noise(t, 0.05, 0.12, sfxBus, { f: 900, q: 3 }); },
  wallUp: (t) => { noise(t, 0.45, 0.18, sfxBus, { type: 'lowpass', f: 300, f2: 120, a: 0.05 }); osc('sine', 70, t, 0.05, 0.15, 0.4, sfxBus); },
  clash: (t) => { for (const f of [880, 1320, 1970]) osc('square', f, t, 0.001, 0.05, 0.3, sfxBus, { wet: 0.5 }); noise(t, 0.1, 0.15, sfxBus, { f: 4000, q: 2 }); },
  edge: (t) => { noise(t, 0.6, 0.18, sfxBus, { f: 700, f2: 2500, q: 0.6, a: 0.04 }); osc('sine', 90, t, 0.01, 0.2, 0.3, sfxBus, { glide: 45 }); }, // a splash
  rain: (t) => { for (let i = 0; i < 7; i++) noise(t + i * 0.04 + Math.random() * 0.03, 0.05, 0.1, sfxBus, { f: 2500 + Math.random() * 1500, q: 2 }); },
  blink: (t) => { osc('sine', hz(12, 1), t, 0.005, 0.08, 0.2, sfxBus, { glide: hz(24, 1), wet: 0.6 }); },
  meditate: (t) => { for (const det of [-6, 0, 6]) osc('triangle', hz(0, -1), t, 0.6, 0.06, 2.4, sfxBus, { detune: det, wet: 0.7 }); bell(hz(12, 1), t, 0.08, 2); }, // om
  devotion: (t, n = 1) => bell(hz(RAGA[(n - 1) % 5], 1 + Math.floor((n - 1) / 5)), t, 0.1, 1.6), // one chime per segment, rising up the raga
  medFull: (t) => { bell(hz(0, 1), t, 0.18); bell(hz(7, 1), t + 0.25, 0.15); bell(hz(0, 2), t + 0.5, 0.15); },
  barrier: (t) => osc('sine', hz(16, 2), t, 0.001, 0.06, 0.3, sfxBus, { wet: 0.7 }),
  shatter: (t) => { for (let i = 0; i < 6; i++) osc('square', 1800 + Math.random() * 2500, t + i * 0.025, 0.001, 0.04, 0.25, sfxBus, { wet: 0.4 }); noise(t, 0.3, 0.18, sfxBus, { f: 5000, q: 1 }); },
  // a god answers: bells and a choir; a divine weapon adds the conch
  boon: (t, divine = false) => { bell(hz(0, 1), t, 0.22, 2.8); bell(hz(7, 1), t + 0.18, 0.16, 2.6); choir(t + 0.05, divine ? 2.8 : 2.0, divine ? 0.06 : 0.045); if (divine) conch(t + 0.1, 1.8); },
  // a power-up: conch, choir, a rising swell and a deep hit
  powerUp: (t) => { conch(t, 1.6, 0.14); choir(t + 0.2, 2.2, 0.05, 7); noise(t, 2.0, 0.12, sfxBus, { f: 300, f2: 3000, q: 0.7, a: 1.6 }); },
  powerLand: (t) => { osc('sine', 80, t, 0.002, 0.5, 1.0, sfxBus, { glide: 30 }); noise(t, 0.6, 0.35, sfxBus, { type: 'lowpass', f: 1200, f2: 200 }); bell(hz(0, 0), t, 0.12, 2.5); },
  ko: (t) => { bell(hz(0, -1), t, 0.35, 4); osc('sine', 55, t, 0.01, 0.4, 1.5, sfxBus, { glide: 40 }); }, // a great temple gong
  win: (t) => { [0, 2, 4, 7, 9, 12].forEach((s, i) => pluck(hz(s, 1), t + i * 0.12, 0.09, 1.4, sfxBus)); bell(hz(12, 1), t + 0.8, 0.15); },
  tick: (t) => osc('sine', hz(12, 1), t, 0.001, 0.05, 0.06, sfxBus),
  start: (t) => { bell(hz(0, 1), t, 0.2); drum(t, true, 0.4); },
};

// play a named effect (rate-limited per name so a flurry of the same event doesn't stack into noise)
export function play(name, ...args) {
  log.push(name); if (log.length > 200) log.splice(0, 100);
  if (!ctx || muted || ctx.state !== 'running' || !SFX[name]) return;
  const now = ctx.currentTime;
  if (lastPlay[name] && now - lastPlay[name] < 0.04) return;
  lastPlay[name] = now;
  try { SFX[name](now, ...args); } catch { /* never let sound break the game */ }
}
export const state = () => (ctx ? ctx.state : 'none');

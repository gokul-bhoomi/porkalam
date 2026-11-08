// Sound and music, synthesized with the Web Audio API (no audio files; the owner chose not to download any).
// The sound is a fighting game's: dark and heavy. Music is a low drone with war drums (taiko-like booms, toms
// and rim hits) and a tense low string ostinato in a phrygian mode; menus get the drone and a slow drum.
// Effects are punchy and low: distorted punches, whooshes, metal clangs. Divine moments get a great gong,
// a deep choir and brass. Browsers only allow sound after a key press, so everything starts on the first input.
// M mutes.

const ROOT = 73.42; // D2
const hz = (semi, oct = 0) => ROOT * 2 ** (semi / 12 + oct);

let ctx = null, master = null, musicBus = null, sfxBus = null, verb = null, shaper = null;
let muted = false, musicOn = false, musicMode = null, musicLevel = 0, nextBeat = 0, beat = 0, lastPlay = {};
export const log = []; // names of played sounds (read by the smoke test)

function init() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor(); // glue and punch
  comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  comp.connect(master); master.connect(ctx.destination);
  verb = ctx.createConvolver(); // a large, dark hall
  const len = ctx.sampleRate * 3, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { lp = lp * 0.7 + (Math.random() * 2 - 1) * 0.3; d[i] = lp * (1 - i / len) ** 2.2; } }
  verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(comp);
  const mWet = ctx.createGain(); mWet.gain.value = 0.25; musicBus.connect(mWet); mWet.connect(verb);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(comp);
  shaper = ctx.createWaveShaper(); // soft saturation for punches and booms
  const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.5); }
  shaper.curve = curve; shaper.connect(sfxBus);
  return true;
}

export function unlock() { // call on any user input: browsers need a gesture before audio
  if (!init()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  return muted;
}
export const isMuted = () => muted;
export const state = () => (ctx ? ctx.state : 'none');

// ---------- building blocks ----------
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(type, f, t, a, peak, d, out, { glide = null, detune = 0, wet = 0, lp = null } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
  let node = o;
  if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp[0], t); if (lp[1]) fl.frequency.exponentialRampToValueAtTime(lp[1], t + a + d); fl.Q.value = lp[2] || 1; o.connect(fl); node = fl; }
  env(g, t, a, peak, d); node.connect(g); g.connect(out);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  o.start(t); o.stop(t + a + d + 0.05);
}
let noiseBuf = null;
function noise(t, d, peak, out, { type = 'bandpass', f = 1200, q = 1, f2 = null, a = 0.003, wet = 0 } = {}) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = ctx.createGain(); env(g, t, a, peak, d);
  n.connect(fl); fl.connect(g); g.connect(out);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
  n.start(t, Math.random() * 2); n.stop(t + a + d + 0.05);
}
// a war drum (taiko-like): a pitched boom through saturation, plus the skin's thud
function boom(t, peak = 0.6, f = 58, out = musicBus) {
  osc('sine', f * 1.6, t, 0.002, peak, 0.5, out === musicBus ? out : shaper, { glide: f * 0.7 });
  noise(t, 0.12, peak * 0.4, out, { type: 'lowpass', f: 500 });
}
function tom(t, peak, f, out = musicBus) { osc('sine', f, t, 0.002, peak, 0.25, out, { glide: f * 0.6 }); noise(t, 0.05, peak * 0.3, out, { f: 1500, q: 1 }); }
function rim(t, peak, out = musicBus) { noise(t, 0.03, peak, out, { f: 3500, q: 4 }); osc('triangle', 900, t, 0.001, peak * 0.4, 0.04, out); }
// a great gong: low inharmonic partials with a long shimmering tail
function gong(t, peak = 0.35, f = 55) {
  for (const [r, a, d] of [[1, 1, 4], [1.48, 0.6, 3.5], [2.03, 0.45, 3], [2.74, 0.3, 2.5], [3.9, 0.2, 2]]) osc('sine', f * r, t, 0.01, peak * a, d, sfxBus, { wet: 0.9 });
  noise(t, 1.5, peak * 0.2, sfxBus, { f: 900, q: 0.8, a: 0.05, wet: 1 });
}
// a deep choir / low brass swell on D and A
function choir(t, d = 2.4, peak = 0.07) {
  for (const s of [0, 7, 12, 15]) for (const det of [-8, 0, 7]) osc('sawtooth', hz(s, 1), t, d * 0.45, peak / 2, d * 0.7, sfxBus, { detune: det, wet: 0.8, lp: [500, 900, 1] });
}
function brass(t, d = 1.2, peak = 0.12, s = 0) { // a low horn blast
  for (const det of [-6, 6]) osc('sawtooth', hz(s, 1), t, 0.12, peak, d, sfxBus, { detune: det, wet: 0.6, lp: [300, 1400, 2] });
}

// ---------- music ----------
export function setMusic(mode) { // 'menu', 'fight', or null
  if (mode === musicMode) return;
  musicMode = mode; musicOn = !!mode;
  musicLevel = mode === 'fight' ? 0.5 : mode === 'menu' ? 0.35 : 0;
  if (ctx) musicBus.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.5);
}
export function duck(amount = 0.25, time = 1.6) {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(musicLevel * amount, t, 0.06); musicBus.gain.setTargetAtTime(musicLevel, t + time, 0.6);
}
let droneNodes = null;
function drone(on) { // a low, slowly breathing drone on D and A
  if (on && !droneNodes) {
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.09, ctx.currentTime, 1.5); g.connect(musicBus);
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 260; fl.Q.value = 2; fl.connect(g);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 120; lfo.connect(lg); lg.connect(fl.frequency); lfo.start();
    const os = [hz(0, -1), hz(0, 0), hz(7, -1)].map((f, i) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = i * 4 - 4; o.connect(fl); o.start(); return o; });
    droneNodes = { g, os, lfo };
  } else if (!on && droneNodes) {
    const d = droneNodes; droneNodes = null; d.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => { d.os.forEach((o) => o.stop()); d.lfo.stop(); }, 2000);
  }
}
const OSTINATO = [0, 0, 1, 0, 3, 0, 1, -2]; // D D Eb D F D Eb C: phrygian tension
export function tickMusic() {
  if (!ctx || ctx.state !== 'running') return;
  drone(musicOn);
  if (!musicOn) return;
  const STEP8 = 60 / 96 / 2, now = ctx.currentTime; // eighth notes at 96 bpm
  if (nextBeat < now) nextBeat = now + 0.05;
  while (nextBeat < now + 0.25) {
    const t = nextBeat, b = beat % 16;
    if (musicMode === 'menu') { if (b === 0) boom(t, 0.35, 50); if (b === 8) tom(t, 0.15, 90); }
    else {
      if (b === 0 || b === 6 || b === 10) boom(t, b === 0 ? 0.55 : 0.4, 55);           // war drum
      if (b === 4 || b === 12) tom(t, 0.3, 110);                                       // toms
      if (b === 14) { tom(t, 0.22, 140); tom(t + STEP8 / 2, 0.2, 120); }
      if (b % 2 === 1) rim(t, 0.05);                                                   // driving rim
      osc('sawtooth', hz(OSTINATO[b % 8], 1), t, 0.005, 0.045, STEP8 * 0.8, musicBus, { lp: [700, 250, 3] }); // tense low strings
      if (beat % 64 === 0) brass(t, 1.6, 0.05, 0);                                     // a horn every few bars
    }
    nextBeat += STEP8; beat++;
  }
}

// ---------- effects ----------
const SFX = {
  bow: (t) => { noise(t, 0.04, 0.3, sfxBus, { f: 4000, q: 3 }); osc('triangle', 160, t, 0.001, 0.3, 0.12, shaper, { glide: 90 }); noise(t + 0.02, 0.2, 0.15, sfxBus, { f: 2500, f2: 700, q: 1.5 }); },
  bolt: (t) => { noise(t, 0.3, 0.25, sfxBus, { f: 2200, f2: 300, q: 2, a: 0.02 }); osc('sine', 110, t, 0.01, 0.25, 0.3, shaper, { glide: 55 }); },
  whoosh: (t) => noise(t, 0.2, 0.3, sfxBus, { f: 400, f2: 1800, q: 1.2, a: 0.04 }),
  hit: (t, big = 1) => { // a punch: saturated low thump, a crack, a body thud
    osc('sine', 150, t, 0.001, 0.5 * Math.min(1.4, big), 0.18 + 0.12 * big, shaper, { glide: 42 });
    noise(t, 0.04, 0.4, sfxBus, { f: 2500, q: 1 });
    noise(t, 0.1 + 0.08 * big, 0.3 * Math.min(1.4, big), sfxBus, { type: 'lowpass', f: 900, f2: 200 });
  },
  block: (t) => { osc('square', 120, t, 0.001, 0.15, 0.1, shaper, { glide: 70 }); noise(t, 0.08, 0.25, sfxBus, { f: 700, q: 2 }); },
  wallUp: (t) => { noise(t, 0.6, 0.3, sfxBus, { type: 'lowpass', f: 250, f2: 80, a: 0.05 }); osc('sine', 50, t, 0.05, 0.3, 0.5, shaper); },
  clash: (t) => { for (const f of [310, 470, 683]) osc('square', f, t, 0.001, 0.06, 0.35, sfxBus, { wet: 0.5, lp: [3000, 800, 1] }); noise(t, 0.08, 0.25, sfxBus, { f: 3000, q: 1.5 }); osc('sine', 90, t, 0.001, 0.25, 0.15, shaper, { glide: 50 }); },
  edge: (t) => { noise(t, 0.7, 0.3, sfxBus, { f: 500, f2: 1600, q: 0.6, a: 0.03 }); osc('sine', 70, t, 0.01, 0.3, 0.3, shaper, { glide: 40 }); },
  rain: (t) => { for (let i = 0; i < 8; i++) { const tt = t + i * 0.045 + Math.random() * 0.03; noise(tt, 0.04, 0.2, sfxBus, { f: 3000, q: 3 }); osc('sine', 120, tt, 0.001, 0.12, 0.08, shaper, { glide: 60 }); } },
  blink: (t) => { noise(t, 0.25, 0.2, sfxBus, { f: 300, f2: 3000, q: 3 }); osc('sine', 80, t, 0.01, 0.15, 0.25, sfxBus, { glide: 200 }); },
  meditate: (t) => { for (const det of [-5, 0, 5]) osc('sawtooth', hz(0, 0), t, 0.8, 0.05, 2.5, sfxBus, { detune: det, wet: 0.7, lp: [220, 160, 2] }); },
  devotion: (t) => { osc('sine', hz(12, 1), t, 0.005, 0.08, 1.8, sfxBus, { wet: 0.8 }); osc('sine', hz(12, 1) * 2.7, t, 0.005, 0.03, 1.2, sfxBus, { wet: 0.8 }); }, // a low singing bowl
  medFull: (t) => { gong(t, 0.25, 73); },
  barrier: (t) => { osc('sine', 330, t, 0.001, 0.08, 0.2, sfxBus, { wet: 0.6 }); noise(t, 0.06, 0.12, sfxBus, { f: 1800, q: 4 }); },
  shatter: (t) => { noise(t, 0.4, 0.4, sfxBus, { f: 3000, f2: 800, q: 0.7 }); osc('sine', 100, t, 0.001, 0.35, 0.3, shaper, { glide: 40 }); },
  // a god answers: a great gong and a deep choir; a divine weapon adds a horn blast and a war drum
  boon: (t, divine = false) => { gong(t, 0.35); choir(t + 0.1, divine ? 3 : 2.2, divine ? 0.09 : 0.06); if (divine) { brass(t + 0.15, 1.8, 0.16); boom(t, 0.7, 50, sfxBus); } },
  // a power-up: horn, choir, a rising rumble and a drum roll
  powerUp: (t) => {
    brass(t, 2.0, 0.15, 0); brass(t + 0.6, 1.5, 0.12, 7); choir(t + 0.2, 2.2, 0.07);
    noise(t, 2.1, 0.25, sfxBus, { type: 'lowpass', f: 120, f2: 1200, a: 1.8 });
    for (let i = 0; i < 12; i++) tom(t + 1.2 + i * 0.09, 0.15 + i * 0.02, 100 + (i % 2) * 20, sfxBus);
  },
  powerLand: (t) => { boom(t, 0.9, 45, sfxBus); noise(t, 0.9, 0.4, sfxBus, { type: 'lowpass', f: 1500, f2: 120 }); },
  shatter2: (t) => { // the island breaking: a huge saturated boom, a long rumble and debris rattling down
    osc('sine', 70, t, 0.001, 0.9, 1.2, shaper, { glide: 28 });
    noise(t, 1.6, 0.45, sfxBus, { type: 'lowpass', f: 900, f2: 60, wet: 0.6 });
    for (let i = 0; i < 14; i++) noise(t + 0.15 + Math.random() * 1.1, 0.04, 0.12 + Math.random() * 0.1, sfxBus, { f: 1500 + Math.random() * 2500, q: 3 });
  },
  ko: (t) => { boom(t, 1, 40, sfxBus); gong(t + 0.05, 0.4, 49); },
  win: (t) => { for (let i = 0; i < 6; i++) tom(t + i * 0.11, 0.25, 130 - i * 8, sfxBus); boom(t + 0.7, 0.7, 50, sfxBus); brass(t + 0.7, 1.8, 0.14, 0); brass(t + 0.7, 1.8, 0.1, 7); },
  tick: (t) => { osc('sine', 180, t, 0.001, 0.12, 0.05, sfxBus, { glide: 120 }); },
  start: (t) => { boom(t, 0.8, 50, sfxBus); brass(t, 1.2, 0.12); },
};

export function play(name, ...args) { // rate-limited per name so a flurry of one event doesn't stack into mush
  log.push(name); if (log.length > 200) log.splice(0, 100);
  if (!ctx || muted || ctx.state !== 'running' || !SFX[name]) return;
  const now = ctx.currentTime;
  if (lastPlay[name] && now - lastPlay[name] < 0.04) return;
  lastPlay[name] = now;
  try { SFX[name](now, ...args); } catch { /* never let sound break the game */ }
}

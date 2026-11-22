// Sound and music, synthesized with the Web Audio API (no audio files; the owner chose not to download any).
// The sound is a fighting game's: dark and heavy. The music is fast bass and drums (see the music section).
// Effects are punchy and low: distorted punches, whooshes, metal clangs. Divine moments get a great gong,
// a deep choir and brass. Browsers only allow sound after a key press, so everything starts on the first input.
// M mutes.

const ROOT = 73.42; // D2
const hz = (semi, oct = 0) => ROOT * 2 ** (semi / 12 + oct);

let ctx = null, master = null, musicBus = null, sfxBus = null, verb = null, shaper = null;
let muted = false, musicOn = false, musicMode = null, musicLevel = 0, lastPlay = {};
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
function osc(type, f, t, a, peak, d, out, { glide = null, gt = null, detune = 0, wet = 0, lp = null } = {}) { // gt = glide time
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + (gt ?? a + d));
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
// "Hybrid" (owner, 2026-11-21, picked from review/music-sketches.html; the slow cinematic pads felt nothing like a
// fighting game). Bass and drums only, no lead tune (the owner disliked the nadaswaram-style lead and a busy melody).
// 148 bpm in Natabhairavi (D natural minor; NOT Mayamalavagowla, which sounded like snake-charmer music):
//  - arcade synth bass bouncing octaves in eighths, a low drone on D and A
//  - kick and snare backbeat, thavil thumps and slaps on the off-beats, a war-drum boom every 4 bars with a parai roll into it
//  - menus: drone, bass and soft thavil only
//  - final stretch (last 30 s, or someone at 25% health or less): 7% faster, busier slaps and hi-hats
const BPM = 148;
const ROOTS = [0, -4, -2, 0, 0, -4, -7, -5]; // one bar each: Dm Bb C Dm | Dm Bb Gm Am (semitones from D)
let step = 0, nextStep = 0, hot = false;
export function setMusic(mode, final = false) { // 'menu', 'fight', 'manthan' or null; final = the last stretch of a fight (for 'manthan': Shiva's moment)
  hot = (mode === 'fight' || mode === 'manthan') && final;
  if (mode === musicMode) return;
  if (mode === 'manthan' || musicMode === 'manthan') step = 0; // the churning's theme starts (and the fight's comes back) on a downbeat
  musicMode = mode; musicOn = !!mode;
  musicLevel = mode === 'fight' ? 0.5 : mode === 'manthan' ? 0.6 : mode === 'menu' ? 0.4 : 0;
  if (ctx) musicBus.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.6);
}
export function duck(amount = 0.25, time = 1.6) {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(musicLevel * amount, t, 0.06); musicBus.gain.setTargetAtTime(musicLevel, t + time, 0.6);
}
const M = {
  kick: (t, v = 1) => { osc('sine', 150, t, 0.002, 0.9 * v, 0.3, musicBus, { glide: 42, gt: 0.09 }); osc('square', 1200, t, 0.001, 0.04 * v, 0.01, musicBus); },
  snare: (t, v = 1) => { noise(t, 0.14, 0.38 * v, musicBus, { f: 1900, q: 0.9 }); osc('triangle', 210, t, 0.001, 0.18 * v, 0.07, musicBus, { glide: 160 }); },
  hat: (t, v = 1) => noise(t, 0.03, 0.09 * v, musicBus, { type: 'highpass', f: 7500 }),
  thavil: (t, v = 1) => { osc('sine', 170, t, 0.002, 0.75 * v, 0.28, musicBus, { glide: 68, gt: 0.07 }); noise(t, 0.03, 0.12 * v, musicBus, { type: 'lowpass', f: 900 }); },
  slap: (t, v = 1) => { noise(t, 0.06, 0.32 * v, musicBus, { f: 2600, q: 2.2 }); osc('triangle', 620, t, 0.001, 0.08 * v, 0.04, musicBus); },
  parai: (t, v = 1) => { noise(t, 0.1, 0.42 * v, musicBus, { type: 'highpass', f: 1400, q: 0.8 }); osc('triangle', 330, t, 0.001, 0.12 * v, 0.06, musicBus, { glide: 220 }); },
  boom: (t, v = 1) => { osc('sine', 90, t, 0.002, 1.0 * v, 1.1, musicBus, { glide: 34, gt: 0.25 }); noise(t, 0.5, 0.25 * v, musicBus, { type: 'lowpass', f: 400 }); },
  bass: (t, f, d, peak) => { osc('sawtooth', f, t, 0.003, peak, d, musicBus, { lp: [1400, 220, 6] }); osc('square', f / 2, t, 0.003, peak * 0.4, d, musicBus, { lp: [400] }); },
  drone: (t, d) => { for (const s of [0, 7]) osc('sawtooth', hz(s), t, 0.3, 0.035, d, musicBus, { lp: [520] }); },
  // Samudra Manthan's theme: a dark Phrygian drone (D with the Eb above rubbing against it) and a deep swelling pad
  darkDrone: (t, d) => { for (const s of [0, 1, 7]) osc('sawtooth', hz(s, -1), t, 0.6, s === 1 ? 0.02 : 0.045, d, musicBus, { lp: [380] }); },
  pad: (t, d, root) => { for (const s of [0, 3, 7]) for (const det of [-9, 0, 8]) osc('sawtooth', hz(root + s, 0), t, d * 0.4, 0.018, d * 0.7, musicBus, { detune: det, lp: [420, 700, 1] }); },
  war: (t, v = 1) => { osc('sine', 70, t, 0.002, 1.1 * v, 1.6, musicBus, { glide: 30, gt: 0.4 }); noise(t, 0.7, 0.3 * v, musicBus, { type: 'lowpass', f: 300 }); },
};
const DARK = [0, 1, 0, -2]; // D, Eb, D, C: one per two bars
export function tickMusic() {
  if (!ctx || ctx.state !== 'running' || !musicOn) return;
  const now = ctx.currentTime;
  if (nextStep < now) nextStep = now + 0.05;
  while (nextStep < now + 0.2) {
    const t = nextStep, sd = 60 / (BPM * (hot ? 1.07 : 1)) / 4; // one sixteenth
    const s = step % 128, i = s % 16, root = ROOTS[Math.floor(s / 16)], fight = musicMode === 'fight';
    if (musicMode === 'manthan') { // the ocean is churned: slow and immense, war drums heaving like the pull on Vasuki
      const r = DARK[Math.floor(s / 32) % 4];
      if (i === 0) { M.darkDrone(t, sd * 16); if (s % 32 === 0) M.pad(t, sd * 32, r); }
      if (hot) { // Shiva drinks: almost silence, a slow heartbeat
        if (i === 0) M.war(t, 0.7);
        if (i === 3) M.war(t, 0.45);
      } else {
        if (i === 0 || i === 8) M.war(t, i === 0 ? 1 : 0.75);
        if (i === 6 || i === 14) M.thavil(t, 0.6);
        if (i === 11) M.thavil(t, 0.4);
        if (s % 32 >= 28) M.parai(t, 0.35 + (s % 32 - 28) * 0.15); // a roll into every heave
        if (i === 0 || i === 8) M.bass(t, hz(r, 0), sd * 7, 0.2);
      }
      nextStep += sd; step++;
      continue;
    }
    if (i === 0) M.drone(t, sd * 16);
    if (fight) {
      if (i === 0 || i === 8 || i === 10) M.kick(t);
      if (i === 4 || i === 12) M.snare(t, 0.85);
      if (i === 3 || i === 6 || i === 14) M.thavil(t, 0.7);
      if (i === 2 || i === 5 || i === 11 || i === 15) M.slap(t, 0.7);
      else if (hot && i % 2 === 1) M.slap(t, 0.4);
      if (hot && i % 2 === 0) M.hat(t, 0.7);
      if (s % 64 === 0) M.boom(t, 0.6);
      if (s % 64 === 60) for (let k = 0; k < 4; k++) M.parai(t + k * sd, 0.5 + k * 0.15); // roll into the top
      if (i % 2 === 0) M.bass(t, hz(root, i % 4 === 2 ? 1 : 0), sd * 1.8, 0.17);
    } else {
      if (i === 0 || i === 8) M.thavil(t, 0.5);
      if (i === 6 || i === 14) M.slap(t, 0.35);
      if (s % 64 === 0) M.boom(t, 0.4);
      if (i % 4 === 0) M.bass(t, hz(root), sd * 3, 0.12);
    }
    nextStep += sd; step++;
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

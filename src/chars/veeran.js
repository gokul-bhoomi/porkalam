// Veeran (Warrior, bow): a South Indian archer-warrior. An original character; the game is inspired by Indian mythology.
// Numbers are first guesses, to be tuned in play with the owner.
import { POWER } from '../config.js';

export default {
  id: 'veeran', name: 'Veeran', cls: 'warrior', color: '#e0653a',
  health: 100,
  power: POWER,
  speed: 80,
  bio: 'A fast archer-warrior who keeps his distance and picks his shots.',
  // the card (ground rule 16: every fighter spends the same budget across these five, 1-5 each)
  traits: { range: 4, speed: 5, defence: 2, control: 3, burst: 3 },
  strong: 'Speed, long shots', weak: 'Blocking, a long fight',
  defence: { type: 'barrier', short: 'Hold to raise a wall', desc: 'Hold block: arrows stick into the ground in front of him, more the longer he holds. Let go and the wall stands for 3 s.', name: 'Arrow wall', strength: 4, growth: 7, max: 18, cost: 1, look: 'arrows' },
  weapon: 'bow',
  moves: {
    // falloff (owner, 2026-11-14): full damage up to 100, half by 200, so poking from the far edge is weak
    // shot cost 1.5 -> 3 and speed 230 -> 170 (owner, 2026-11-08): arrow spam was too strong, and moving should dodge it
    a1: { name: 'Shot', short: 'Arrow - hold to charge', desc: 'Tap for a quick arrow, hold to charge it (up to 10%). Flies slow enough to dodge, and weakens past 100: half damage by 200.', kind: 'projectile', weapon: 'bow', range: 'midlong', cost: { power: 3 }, req: {}, cast: 0.12, damage: 3, knockback: 30,
      charge: { max: 1.2, damage: 10 }, falloff: { full: 100, half: 200 }, speed: 170, radius: 3, life: 1.5, shape: 'arrow' },
    a2: { name: 'Knife attack', short: 'Close slash', desc: 'A close-range slash with knockback.', kind: 'melee', weapon: 'bow', range: 'close', cost: { power: 3 }, req: {}, cast: 0.12, damage: 3, knockback: 150, reach: 46 },
    s1: { name: 'Pinning arrow', short: 'Pins the foe for 1.5 s', desc: 'An arrow that pins the opponent in place for 1.5 s.', kind: 'projectile', weapon: 'bow', special: true, range: 'midlong', cost: { power: 18 }, req: {}, cast: 0.5, damage: 3, knockback: 0,
      speed: 240, radius: 3, life: 1.5, effect: { kind: 'hold', time: 1.5 }, shape: 'arrow' },
    // Jump replaced split shot (owner, 2026-11-14): his dodge. On special 2, because down + special 1 is meditation
    // and a jump needs every direction. Shots, melee and arrow rain pass under him;
    // homing moves turn and find him after he lands.
    s2: { name: 'Jump', short: 'Hop over shots', desc: 'A quick hop the way you hold (sideways if none). Shots, melee and arrow rain pass under him; homing moves still find him after he lands.', kind: 'jump', special: true, range: 'anywhere', cost: { power: 6 }, req: {}, cast: 0, damage: 0, knockback: 0,
      time: 0.5, distance: 55 },
    s3: { name: 'Arrow rain', short: 'Arrows fall on a spot', desc: 'Marks where the opponent stands; a second later arrows fall there. Walk out of the red circle.', kind: 'area', weapon: 'bow', special: true, range: 'mid', cost: { power: 20 }, req: {}, cast: 0.8, damage: 10, knockback: 40,
      radius: 22, delay: 1 },
    sig: { name: 'Gaja Arrow', short: 'Elephant arrow, 35%', desc: 'A 2 s draw, then a spectral war elephant rides the arrow: 35%, through any block. Costs 10% health.', kind: 'projectile', weapon: 'bow', special: true, signature: true, scene: true, range: 'long', cost: { power: 60, health: 10 }, req: {},
      cast: 2, damage: 35, knockback: 160, speed: 260, radius: 8, life: 2, pierceBlock: true, pierceUnits: true, shape: 'elephant' }, // a spectral war elephant rides the arrow; draw 4 -> 2 s (owner, 2026-11-09)
    cls: { name: 'Meditation', short: 'Earn devotion for boons', desc: 'Sit behind a barrier and fill devotion, one segment at a time.', kind: 'meditate', range: 'anywhere', cost: { power: 2 }, req: {}, cast: 0, damage: 0, knockback: 0 },
  },
};

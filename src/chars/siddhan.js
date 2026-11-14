// Mangulan (Mage): a wandering mystic-sorcerer. An original character; the game is inspired by Indian mythology.
// Numbers are first guesses, to be tuned in play with the owner.
// Slots: a1/a2 basic, s1-s3 specials, sig = all 3 specials together, cls = down + special 1 (meditate).
// Move fields (ground rule 4): cost {power, health}, req, range, cast (s), damage (%), knockback (world units/s).
import { POWER } from '../config.js';

export default {
  id: 'siddhan', name: 'Mangulan', cls: 'mage', color: '#3fc7c0',
  health: 100,
  power: POWER,
  speed: 42,
  bio: 'A slow but powerful young mystic who wins from range, with patience.',
  // the card (ground rule 16: every fighter spends the same budget across these five, 1-5 each)
  traits: { range: 3, speed: 2, defence: 5, control: 4, burst: 3 },
  strong: 'Holding ground, flying', weak: 'Speed, close up',
  defence: { type: 'barrier', short: 'Hold to raise a wall', desc: 'Hold block: a mound of earth rises in front of him and grows. Let go and it stands for 3 s.', name: 'Rising earth', strength: 6, growth: 5, max: 24, cost: 1, look: 'hill' },
  weapon: null,
  moves: {
    // mantra bolt cost 2 -> 3 (owner, 2026-11-07): cut spam. Hold to charge, like the Warrior's shot (owner, 2026-11-08).
    a1: { name: 'Mantra bolt', short: 'Orb shot - hold to charge', desc: 'A glowing teal orb. Tap for a quick bolt, hold to charge it (up to 11%). Weakens past 80: half damage by 150.', kind: 'projectile', range: 'mid', cost: { power: 3 }, req: {}, cast: 0.2, damage: 4, knockback: 30,
      charge: { max: 1.4, damage: 11 }, falloff: { full: 80, half: 150 }, speed: 150, radius: 4, life: 1.6, shape: 'orb' }, // falloff: owner, 2026-11-14 (it out-traded the arrow at range)
    a2: { name: 'Palm push', short: 'Shove, big knockback', desc: 'A close-range shove: little damage, but throws the opponent far back.', kind: 'melee', range: 'close', cost: { power: 3 }, req: {}, cast: 0.15, damage: 3, knockback: 240, reach: 46 },
    s1: { name: 'Spinning chakra', short: 'Homing disc', desc: 'A disc that flies in three legs, turning toward the opponent between them.', kind: 'projectile', special: true, range: 'anywhere', cost: { power: 18 }, req: {}, cast: 0.6, damage: 12, knockback: 90, // cost 30 -> 18 (owner, 2026-11-14): his homing answer to a fast opponent at range
      speed: 120, radius: 6, life: 3, legs: 3, legTime: 0.9, shape: 'chakra' },
    // Fly replaced the binding chant (owner, 2026-11-14: the chant did little in real fights). Press to take off,
    // press again to land. Fast in the air and can still attack; melee and arrow rain can't reach him, shots can.
    s2: { name: 'Fly', short: 'Take off / land', desc: 'Press to rise (0.3 s), press again to land. Flies fast and still attacks. Melee and arrow rain miss him; shots still hit. Costs power while up.', kind: 'fly', special: true, range: 'anywhere', cost: { power: 4 }, req: {}, cast: 0, damage: 0, knockback: 0,
      lift: 0.3, speed: 80, drain: 12 }, // drain 9 -> 12 (2026-11-14): about 11 s up from a full bar
    s3: { name: 'Blink', short: 'Short teleport', desc: 'Teleport a short way in the direction you hold (away from the opponent if none).', kind: 'blink', special: true, range: 'anywhere', cost: { power: 8 }, req: {}, cast: 0, damage: 0, knockback: 0, distance: 45 },
    sig: { name: 'Thousand-Arm Form', short: 'Whole arena, 35%', desc: 'A 2 s cast, then spectral arms strike across the whole arena: 35%. Costs 10% health.', kind: 'global', special: true, signature: true, scene: true, range: 'anywhere', cost: { power: 60, health: 10 }, req: {}, cast: 2, // 4 -> 2 s (owner, 2026-11-09)
      damage: 35, knockback: 60, strikeDelay: 0.4 }, // the arms take 0.4 s to reach
    cls: { name: 'Meditation', short: 'Earn devotion for boons', desc: 'Sit behind a barrier and fill devotion, one segment at a time.', kind: 'meditate', range: 'anywhere', cost: { power: 2 }, req: {}, cast: 0, damage: 0, knockback: 0 },
  },
};

// Siddhan (Mage): a wandering mystic-sorcerer. An original character; the game is inspired by Hindu mythology.
// Numbers are first guesses, to be tuned in play with the owner.
// Slots: a1/a2 basic, s1-s3 specials, sig = all 3 specials together, cls = down + special 1 (meditate).
// Move fields (ground rule 4): cost {power, health}, req, range, cast (s), damage (%), knockback (world units/s).
import { POWER } from '../config.js';

export default {
  id: 'siddhan', name: 'Siddhan', cls: 'mage', color: '#3fc7c0',
  health: 100,
  power: POWER,
  speed: 42,
  bio: 'A slow but powerful young mystic who wins from range, with patience.',
  defence: { type: 'barrier', desc: 'Hold block: a mound of earth rises in front of him and grows. Let go and it stands for 3 s.', name: 'Rising earth', strength: 6, growth: 5, max: 24, cost: 1, look: 'hill' },
  weapon: null,
  moves: {
    // mantra bolt cost 2 -> 3 (owner, 2026-11-07): cut spam. Hold to charge, like the Warrior's shot (owner, 2026-11-08).
    a1: { name: 'Mantra bolt', desc: 'A glowing teal orb. Tap for a quick bolt, hold to charge it (up to 11%). Fades past mid range.', kind: 'projectile', range: 'mid', cost: { power: 3 }, req: {}, cast: 0.2, damage: 4, knockback: 30,
      charge: { max: 1.4, damage: 11 }, speed: 150, radius: 4, life: 1.6, shape: 'orb' },
    a2: { name: 'Palm push', desc: 'A close-range shove: little damage, but throws the opponent far back.', kind: 'melee', range: 'close', cost: { power: 2 }, req: {}, cast: 0.15, damage: 3, knockback: 240, reach: 46 },
    s1: { name: 'Spinning chakra', desc: 'A disc that flies in three legs, turning toward the opponent between them.', kind: 'projectile', special: true, range: 'anywhere', cost: { power: 30 }, req: {}, cast: 0.6, damage: 12, knockback: 90,
      speed: 120, radius: 6, life: 3, legs: 3, legTime: 0.9, shape: 'chakra' },
    s2: { name: 'Binding chant', desc: 'A 2 s chant, then a slow wave: whoever it touches is held still for 3 s.', kind: 'projectile', special: true, range: 'mid', cost: { power: 18 }, req: {}, cast: 2, damage: 2, knockback: 0,
      speed: 90, radius: 12, life: 2, effect: { kind: 'hold', time: 3 }, shape: 'wave' },
    s3: { name: 'Blink', desc: 'Teleport a short way in the direction you hold (away from the opponent if none).', kind: 'blink', special: true, range: 'anywhere', cost: { power: 8 }, req: {}, cast: 0, damage: 0, knockback: 0, distance: 45 },
    sig: { name: 'Thousand-Arm Form', desc: 'A 4 s cast, then spectral arms strike across the whole arena: 35%. Costs 10% health.', kind: 'global', special: true, signature: true, scene: true, range: 'anywhere', cost: { power: 60, health: 10 }, req: {}, cast: 4,
      damage: 35, knockback: 60 },
    cls: { name: 'Meditation', desc: 'Sit behind a barrier and fill devotion, one segment at a time.', kind: 'meditate', range: 'anywhere', cost: { power: 2 }, req: {}, cast: 0, damage: 0, knockback: 0 },
  },
};

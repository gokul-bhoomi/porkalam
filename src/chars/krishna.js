// Krishna (God). Numbers are first guesses, to be tuned in play with the owner.
// Slots: a1/a2 basic, s1-s3 specials, sig = all 3 specials together, cls = down + special 1.
// Move fields (ground rule 4): cost {power, health}, req, range, cast (s), damage (%), knockback (world units/s).
import { POWER } from '../config.js';

export default {
  id: 'krishna', name: 'Krishna', cls: 'god', color: '#4a86e8',
  health: 100,
  power: POWER,
  speed: 42,
  defence: { type: 'barrier', name: 'Govardhana', strength: 6, growth: 5, max: 24, cost: 1, look: 'hill' },
  weapon: null,
  moves: {
    // flute note cost 2 -> 3 (owner, 2026-11-07): cut note spam
    a1: { name: 'Flute note', kind: 'projectile', range: 'mid', cost: { power: 3 }, req: {}, cast: 0.2, damage: 4, knockback: 30,
      speed: 150, radius: 4, life: 1.6, shape: 'note' },
    a2: { name: 'Palm push', kind: 'melee', range: 'close', cost: { power: 2 }, req: {}, cast: 0.15, damage: 3, knockback: 240, reach: 46 },
    s1: { name: 'Sudarshana Chakra', kind: 'projectile', special: true, range: 'anywhere', cost: { power: 30 }, req: {}, cast: 0.6, damage: 12, knockback: 90,
      speed: 120, radius: 6, life: 3, legs: 3, legTime: 0.9, shape: 'chakra' },
    s2: { name: 'Venu Ganam', kind: 'projectile', special: true, range: 'mid', cost: { power: 18 }, req: {}, cast: 2, damage: 2, knockback: 0,
      speed: 90, radius: 12, life: 2, effect: { kind: 'hold', time: 3 }, shape: 'wave' },
    s3: { name: 'Blink', kind: 'blink', special: true, range: 'anywhere', cost: { power: 8 }, req: {}, cast: 0, damage: 0, knockback: 0, distance: 45 },
    sig: { name: 'Vishwaroopam', kind: 'global', special: true, signature: true, scene: true, range: 'anywhere', cost: { power: 60, health: 10 }, req: {}, cast: 4,
      damage: 30, knockback: 60 },
    cls: { name: 'Brahmastra', kind: 'brahmastra', ultimate: true, scene: true, selfKO: true, range: 'anywhere', cost: { power: 'all' },
      req: { maxHealth: 5, fullPower: true }, cast: 5, damage: Infinity, knockback: 0 },
  },
};

// Raja Raja Chola (King, bow). Numbers are first guesses, to be tuned in play with the owner.
import { POWER } from '../config.js';

export default {
  id: 'rajaraja', name: 'Raja Raja Chola', cls: 'king', color: '#e0653a',
  health: 100,
  power: POWER,
  speed: 80,
  defence: { type: 'barrier', name: 'Arrow wall', strength: 4, growth: 7, max: 18, cost: 1, look: 'arrows' },
  weapon: 'bow',
  gods: ['shiva', 'murugan', 'brahma'], // the god who answers a meditation is random
  moves: {
    a1: { name: 'Shot', kind: 'projectile', weapon: 'bow', range: 'midlong', cost: { power: 1.5 }, req: {}, cast: 0.12, damage: 3, knockback: 30,
      charge: { max: 1.2, damage: 10 }, speed: 230, radius: 3, life: 1.5, shape: 'arrow' },
    a2: { name: 'Knife attack', kind: 'melee', weapon: 'bow', range: 'close', cost: { power: 1.5 }, req: {}, cast: 0.12, damage: 3, knockback: 150, reach: 46 },
    s1: { name: 'Split shot', kind: 'projectile', weapon: 'bow', special: true, range: 'mid', cost: { power: 10 }, req: {}, cast: 0.3, damage: 4, knockback: 30,
      count: 3, spread: 0.28, speed: 200, radius: 3, life: 1.2, shape: 'arrow' },
    s2: { name: 'Pinning arrow', kind: 'projectile', weapon: 'bow', special: true, range: 'midlong', cost: { power: 18 }, req: {}, cast: 0.5, damage: 3, knockback: 0,
      speed: 240, radius: 3, life: 1.5, effect: { kind: 'hold', time: 1.5 }, shape: 'arrow' },
    s3: { name: 'Arrow rain', kind: 'area', weapon: 'bow', special: true, range: 'mid', cost: { power: 20 }, req: {}, cast: 0.8, damage: 10, knockback: 40,
      radius: 22, delay: 1 },
    sig: { name: 'Tiger Arrow', kind: 'projectile', weapon: 'bow', special: true, signature: true, scene: true, range: 'long', cost: { power: 60, health: 10 }, req: {},
      cast: 4, damage: 30, knockback: 160, speed: 260, radius: 8, life: 2, pierceBlock: true, pierceUnits: true, shape: 'tiger' },
    cls: { name: 'Meditation', kind: 'meditate', range: 'anywhere', cost: { power: 2 }, req: { maxBoons: 1 }, cast: 0, damage: 0, knockback: 0 },
  },
};

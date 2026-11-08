// Boon lists per god. The game is inspired by Indian mythology: the real gods appear only as givers of boons.
// A fighter spends devotion (earned by meditating) on a boon from a random god: tiers[0] = small (3 segments),
// tiers[1] = medium (6), tiers[2] = divine weapon (10). Divine weapons go through a meditation barrier.
// Each boon is a single-use move with the same fields as any other move.
export const GODS = {
  shiva: {
    name: 'Shiva',
    tiers: [
      [{ id: 'spark', name: 'Third-eye spark', desc: 'A FIREBALL: 8% DAMAGE', kind: 'projectile', range: 'midlong', cost: { power: 0 }, req: {}, cast: 0.3, damage: 8, knockback: 60, speed: 210, radius: 4, life: 1.5, shape: 'fire' }],
      [{ id: 'damaru', name: 'Damaru', desc: 'STUNS THE OPPONENT: NO MOVES OR BLOCK FOR 1.5 SECONDS', kind: 'projectile', range: 'mid', cost: { power: 0 }, req: {}, cast: 0.4, damage: 2, knockback: 0, speed: 160, radius: 10, life: 1.5, effect: { kind: 'stun', time: 1.5 }, shape: 'wave' }],
      [{ id: 'pashupatastra', name: 'Pashupatastra', desc: '45% DAMAGE FROM ANYWHERE, THROUGH ANY BARRIER', kind: 'projectile', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 45, knockback: 160, speed: 300, radius: 7, life: 2, shape: 'fire' }],
    ],
  },
  murugan: {
    name: 'Murugan',
    tiers: [
      [{ id: 'vel', name: 'Vel throw', desc: 'A SPEAR THROW: 9% DAMAGE', kind: 'projectile', range: 'midlong', cost: { power: 0 }, req: {}, cast: 0.3, damage: 9, knockback: 80, speed: 260, radius: 3, life: 1.5, shape: 'spear' }],
      [], // Peacock dash removed (owner, 2026-11-08)
      [{ id: 'shakti', name: 'Shakti Vel', desc: '35% DAMAGE, PIERCES ANY BLOCK', kind: 'projectile', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.6, damage: 35, knockback: 140, speed: 260, radius: 5, life: 2, pierceBlock: true, shape: 'spear' }],
    ],
  },
  brahma: {
    name: 'Brahma',
    tiers: [
      [{ id: 'kamandalu', name: 'Kamandalu', desc: 'HEALS 10% HEALTH', kind: 'heal', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.5, damage: 0, knockback: 0, heal: 10 }],
      [{ id: 'lotus', name: 'Lotus seat', desc: 'YOUR NEXT MEDITATION FILLS TWICE AS FAST', kind: 'lotus', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.3, damage: 0, knockback: 0 }],
      [{ id: 'brahmastra', name: 'Brahmastra', desc: 'BOTH FIGHTERS FALL: THE MATCH IS A DRAW', kind: 'brahmastra', divine: true, scene: true, selfKO: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 5, damage: Infinity, knockback: 0 }],
    ],
  },
  // Krishna joined as a boon god on 2026-11-08 (owner).
  krishna: {
    name: 'Krishna',
    tiers: [
      [], // Flute charm removed (owner, 2026-11-08)
      [{ id: 'sudarshana', name: 'Sudarshana Chakra', desc: 'A HOMING DISC: 14% DAMAGE', kind: 'projectile', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.5, damage: 14, knockback: 90, speed: 130, radius: 6, life: 3, legs: 3, legTime: 0.9, shape: 'chakra' }],
      [{ id: 'vishwaroopam', name: 'Vishwaroopam', desc: '40% DAMAGE ACROSS THE WHOLE ARENA', kind: 'global', divine: true, scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 40, knockback: 60, strikeDelay: 0.4 }],
    ],
  },
};

export const findBoon = (id) => {
  for (const g of Object.values(GODS)) for (const t of g.tiers) for (const b of t) if (b.id === id) return b;
  return null;
};

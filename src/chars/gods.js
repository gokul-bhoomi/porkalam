// Boon lists per god, used by a meditating King. tiers[0] = 1st meditation (small),
// tiers[1] = 2nd (medium), tiers[2] = 3rd and later (big). A boon is picked at random from its tier.
// Each boon is a single-use move with the same fields as any other move.
// Praying to Krishna is left out of this version on purpose.
export const GODS = {
  shiva: {
    name: 'Shiva',
    tiers: [
      [{ id: 'spark', name: 'Third-eye spark', kind: 'projectile', range: 'midlong', cost: { power: 0 }, req: {}, cast: 0.3, damage: 8, knockback: 60, speed: 210, radius: 4, life: 1.5, shape: 'fire' }],
      [{ id: 'damaru', name: 'Damaru', kind: 'projectile', range: 'mid', cost: { power: 0 }, req: {}, cast: 0.4, damage: 2, knockback: 0, speed: 160, radius: 10, life: 1.5, effect: { kind: 'stun', time: 1.5 }, shape: 'wave' }],
      [{ id: 'pashupatastra', name: 'Pashupatastra', kind: 'projectile', scene: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 1, damage: 35, knockback: 160, speed: 300, radius: 7, life: 2, shape: 'fire' }],
    ],
  },
  murugan: {
    name: 'Murugan',
    tiers: [
      [{ id: 'vel', name: 'Vel throw', kind: 'projectile', range: 'midlong', cost: { power: 0 }, req: {}, cast: 0.3, damage: 9, knockback: 80, speed: 260, radius: 3, life: 1.5, shape: 'spear' }],
      [{ id: 'peacock', name: 'Peacock dash', kind: 'dash', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0, damage: 0, knockback: 0, speed: 300, time: 0.25, invuln: 0.45 }],
      [{ id: 'shakti', name: 'Shakti Vel', kind: 'projectile', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.6, damage: 25, knockback: 140, speed: 260, radius: 5, life: 2, pierceBlock: true, shape: 'spear' }],
    ],
  },
  brahma: {
    name: 'Brahma',
    tiers: [
      [{ id: 'kamandalu', name: 'Kamandalu', kind: 'heal', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.5, damage: 0, knockback: 0, heal: 10 }],
      [{ id: 'lotus', name: 'Lotus seat', kind: 'lotus', range: 'anywhere', cost: { power: 0 }, req: {}, cast: 0.3, damage: 0, knockback: 0 }],
      [{ id: 'brahmastra', name: 'Brahmastra', kind: 'brahmastra', scene: true, selfKO: true, range: 'anywhere', cost: { power: 0 }, req: {}, cast: 5, damage: Infinity, knockback: 0 }],
    ],
  },
};

export const findBoon = (id) => {
  for (const g of Object.values(GODS)) for (const t of g.tiers) for (const b of t) if (b.id === id) return b;
  return null;
};

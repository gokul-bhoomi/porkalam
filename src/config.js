// Every amount is a percentage of a 100% bar. Every time is in seconds.
// World units: the arena is a circle of radius ARENA.r around (0, 0). The renderer squashes y for a 3/4 view.
export const W = 480, H = 270;   // game layout units
export const RES = 4;             // the canvas is W*RES x H*RES (1920x1080) so the art stays sharp
export const STEP = 1 / 60;

export const ARENA = { r: 110 };

// Class rule: power bar size and refill speed are the same for every class.
export const POWER = { size: 100, refill: 4 }; // % of the bar, % per second

// Range requirements, as [min, max] distance between the two fighters (world units).
export const RANGES = {
  close: [0, 40],
  mid: [30, 150],
  midlong: [30, Infinity],
  long: [30, Infinity],
  anywhere: [0, Infinity],
};

export const TUNE = {
  match: { default: 300, min: 60, max: 600 },
  fighterR: 8,
  startX: 75,           // fighters start this far left/right of the centre
  startPower: 0.5,      // half power at the start
  kbFriction: 6,        // knockback speed fades by e^-6 per second
  wallKb: 60,           // knocked into the wall faster than this = wall damage
  wallDmg: 4,
  // Block builds a wall in front of the fighter. It grows while block is held (prepMult x faster while the
  // opponent prepares an attack), for at most buildTime s. When block is let go, the wall stays where it is,
  // at the size it reached, for standTime s.
  block: { prepMult: 2, buildTime: 3, standTime: 3, gap: 14, halfWidth: [8, 20] },
  chord: 0.08,          // special buttons pressed within this time count as one combo (boon / signature)
  // Meditation (ground rule 11, owner 2026-11-08): fills a devotion bar of `segments` parts, segTime s each,
  // only while the opponent is further than `dist`. Only full segments count. A barrier of `barrier` strength
  // goes up around the meditating fighter. Boons cost `tiers` segments: small, medium, divine weapon.
  meditate: { dist: 90, cost: 2, segments: 10, segTime: 2.5, barrier: 25, tiers: [3, 6, 10] },
  scene: 2.5,           // dramatic scene length for power moves; the whole game pauses
};

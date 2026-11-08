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
  trap: { max: 3, delay: [5, 30], cost: 4, plantedDmg: 12, plantedR: 20, plantedKb: 120, waterR: 22, waterTime: 8, waterSlow: 0.5 },
  mark: { life: [5, 30], max: 40, offset: 12 }, // floor marks (scuffs and traps look the same)
  maxBoons: 1,          // ground rule 11
  chord: 0.08,          // special buttons pressed within this time count as one combo (boon / signature)
  meditate: { dist: 90, times: [5, 7.5, 10], cost: 2 },
  scene: 2.5,           // dramatic scene length for power moves; the whole game pauses
};

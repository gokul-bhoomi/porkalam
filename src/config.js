// Every amount is a percentage of a 100% bar. Every time is in seconds.
// World units: the arena is a circle of radius ARENA.r around (0, 0). The renderer squashes y for a 3/4 view.
export const W = 480, H = 270;
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
  block: { prepMult: 2, maxTime: 3 }, // grows this many times faster while the opponent prepares an attack; disappears after maxTime s
  frontDot: 0.2,        // a block covers hits coming from in front of the fighter
  trap: { max: 3, delay: [5, 30], cost: 4, plantedDmg: 12, plantedR: 20, plantedKb: 120, waterR: 22, waterTime: 8, waterSlow: 0.5 },
  mark: { life: [5, 30], max: 40, offset: 12 }, // floor marks (scuffs and traps look the same)
  maxBoons: 1,          // ground rule 11
  chord: 0.08,          // two special buttons pressed within this time = use the boon
  meditate: { dist: 90, times: [5, 7.5, 10], cost: 2 },
  scene: 2.5,           // dramatic scene length for power moves; the whole game pauses
};

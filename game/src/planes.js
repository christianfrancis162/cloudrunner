// Cloudrunner — hangar: the two flyable planes.
// One job: name each plane, its character and its numbers, so the pilot's
// choice changes how the sortie flies — the Kestrel is nimble but thirsty,
// the Albatross is steady, long-legged and slow to turn. Picking a plane
// is picking a way to fly the valley, not a paint job.
import { PLANE } from './config.js';

export const PLANES = {
  kestrel: {
    id: 'kestrel',
    name: 'Kestrel K-2 "Cloudrunner"',
    short: 'KESTREL K-2',
    tagline: 'Nimble stunt plane — tight turns, quick climb, 85 fuel. The valley runabout.',
    paint: 0xe23b2e,
    accent: 0xf5ead2,
    wingSpan: 9.2,
    tuning: {
      rollRate: 2.7, // rad/s — flicks into a bank
      pitchRate: 1.3,
      yawFromBank: 0.62,
      maxBank: 1.2,
      minSpeed: 24,
      maxSpeed: 92,
      accel: 28,
      drag: 0.011,
      fuelCapacity: 85, // thirsty: rings matter more
      fuelBurn: 1.7,
    },
  },
  albatross: {
    id: 'albatross',
    name: 'Albatross A-4 "Steadywing"',
    short: 'ALBATROSS A-4',
    tagline: 'Steady tourer — slow turns, long legs, 135 fuel, 105 top speed. The distance flyer.',
    paint: 0x2e6fb0,
    accent: 0xdfeef8,
    wingSpan: 10.8,
    tuning: {
      rollRate: 1.8, // rad/s — turns like a truck, on purpose
      pitchRate: 0.9,
      yawFromBank: 0.45,
      maxBank: 0.9,
      minSpeed: 28,
      maxSpeed: 105,
      accel: 22,
      drag: 0.010,
      fuelCapacity: 135, // long legs: fuel stops being the worry
      fuelBurn: 1.4,
    },
  },
  falcon: {
    id: 'falcon',
    name: 'Falcon F-3 "Dart"',
    short: 'FALCON F-3',
    tagline: 'Hot rod — twitchy, thirsty, 70 fuel. The ring-chaser: fastest to speed, hardest to hold steady.',
    paint: 0x7a4fd0,
    accent: 0xffe9a8,
    wingSpan: 8.4,
    tuning: {
      rollRate: 3.1, // rad/s — flicks over if you breathe on the stick
      pitchRate: 1.5,
      yawFromBank: 0.7,
      maxBank: 1.3,
      minSpeed: 22,
      maxSpeed: 98,
      accel: 32, // quickest off the mark in the valley
      drag: 0.012,
      fuelCapacity: 70, // thirstiest: rings are fuel stops, not bonuses
      fuelBurn: 1.9,
    },
  },
};

export const PLANE_ORDER = ['kestrel', 'albatross', 'falcon'];

export function planeById(id) {
  return PLANES[id] ?? PLANES.kestrel;
}

// Full flight tuning for a plane: the shared constants with this plane's
// numbers over them, so physics reads one object either way.
export function planeTuning(id) {
  return { ...PLANE, ...planeById(id).tuning };
}

// One line per plane for the hangar card on the title screen.
export function planeCard(id) {
  const plane = planeById(id);
  const t = plane.tuning;
  return {
    id: plane.id,
    name: plane.name,
    short: plane.short,
    tagline: plane.tagline,
    stats: [
      { label: 'TURN', value: t.rollRate >= 2.4 ? 'Nimble' : 'Steady' },
      { label: 'TOP SPEED', value: `${Math.round(t.maxSpeed * 1.944)} kt` },
      { label: 'FUEL', value: `${t.fuelCapacity}` },
      { label: 'WING', value: `${plane.wingSpan.toFixed(1)} m` },
    ],
  };
}

// Head-to-head rows for the hangar: the same numbers, side by side, so
// the choice reads at a glance.
export function comparePlanes() {
  const rows = [
    { label: 'Turn rate', key: 'rollRate', format: (v) => `${v.toFixed(1)} rad/s` },
    { label: 'Top speed', key: 'maxSpeed', format: (v) => `${Math.round(v * 1.944)} kt` },
    { label: 'Fuel', key: 'fuelCapacity', format: (v) => `${v} units` },
    { label: 'Climb (accel)', key: 'accel', format: (v) => `${v} m/s²` },
    { label: 'Min flying speed', key: 'minSpeed', format: (v) => `${v} m/s` },
  ];
  return rows.map((row) => ({
    label: row.label,
    kestrel: row.format(PLANES.kestrel.tuning[row.key]),
    albatross: row.format(PLANES.albatross.tuning[row.key]),
    falcon: row.format(PLANES.falcon.tuning[row.key]),
  }));
}

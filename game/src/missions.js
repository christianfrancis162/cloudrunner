// Cloudrunner — missions: the four sorties flown over Kestrel Valley.
// One job: name each mission, its goal and its scoring, and place the
// mission targets (cargo drop zones, the rescue pad) in the world.
// The setting is one coherent place: Kestrel Valley, a golden-hour alpine
// valley with Kestrel Field airfield, Lake Solenne and the Kestrel Hut
// refuge on the west ridge. Nothing here copies a competitor's names,
// aircraft or setting.
import * as THREE from 'three';

export const SETTING = {
  valley: 'Kestrel Valley',
  airfield: 'Kestrel Field',
  lake: 'Lake Solenne',
  river: 'Solenne River',
  hut: 'Kestrel Hut',
  aircraft: 'Kestrel K-2 "Cloudrunner"',
  callsign: 'KESTREL-7',
};

// Cargo drop zones: three marked meadows around the valley. A drop counts
// when the crate lands inside a zone; closer to the centre scores more.
export const DROP_ZONES = [
  { name: 'Lakeside Meadow', position: new THREE.Vector3(260, 0, 480), radius: 40 },
  { name: 'South Meadow', position: new THREE.Vector3(-140, 0, 480), radius: 40 },
  { name: 'East Clearing', position: new THREE.Vector3(520, 0, 120), radius: 40 },
];

// Rescue pickup: land on the marked pad beside Kestrel Hut on the west
// ridge, hold still, and the stranded hiker climbs aboard.
export const RESCUE_PAD = {
  name: 'Kestrel Hut Pad',
  position: new THREE.Vector3(-480, 0, 220),
  radius: 22,
};

export const MISSIONS = {
  'ring-run': {
    id: 'ring-run',
    name: 'Ring Run',
    short: 'RING RUN',
    tagline: 'Thread all 8 rings over Kestrel Valley, then land on Kestrel Field.',
    objective: 'Fly the 8 rings, then land on the runway.',
    parTime: null,
    crates: 0,
  },
  cargo: {
    id: 'cargo',
    name: 'Cargo Drop',
    short: 'CARGO DROP',
    tagline: 'Drop a supply crate into each of the 3 marked meadows, then land.',
    objective: 'Drop crates on all 3 meadows (C to drop), then land.',
    parTime: null,
    crates: 3,
  },
  rescue: {
    id: 'rescue',
    name: 'Rescue Pickup',
    short: 'RESCUE',
    tagline: 'Land on the Kestrel Hut pad, pick up the stranded hiker, fly home.',
    objective: 'Land on the hut pad, wait for pickup, then land on the runway.',
    parTime: null,
    crates: 0,
  },
  sprint: {
    id: 'sprint',
    name: 'Timed Sprint',
    short: 'TIMED SPRINT',
    tagline: 'All 8 rings against the clock — beat the 2:30 par for a time bonus.',
    objective: 'Fly all 8 rings inside the 2:30 par, then land.',
    parTime: 150,
    crates: 0,
  },
};

export const MISSION_ORDER = ['ring-run', 'cargo', 'rescue', 'sprint'];

export function missionById(id) {
  return MISSIONS[id] ?? MISSIONS['ring-run'];
}

// Score for a crate by how close it lands to the zone centre.
export function dropScore(distance, radius) {
  if (distance <= radius * 0.375) return 200; // bullseye
  if (distance <= radius * 0.75) return 120;
  if (distance <= radius) return 50;
  return 0;
}

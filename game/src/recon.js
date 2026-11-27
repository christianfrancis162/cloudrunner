// Cloudrunner — Photo Recon: the eighth sortie, and the one that makes
// the pilot look at the valley instead of through it. One job: name four
// landmarks, put a gold beacon over each, and score the photograph.
//
// The valley already has its places — Kestrel Field, Lake Solenne, the
// Kestrel Hut, the Solenne River bridge — and Recon asks the pilot to
// photograph all four and bring the pictures home. A photo counts only
// inside the frame: close enough to the landmark, inside the altitude
// band, wings near level so the shot is straight. A frame-filling shot
// (close in, low and level) pays 200; a wide one pays 50; a photo taken
// too high, too far or banked hard is no photo at all. Press C to shoot —
// the same key as the cargo drop, because the camera rides where the
// crate used to. Rings still pay in Recon: the valley course is always
// there to fly.
//
// Beacons are gold octahedrons on a light beam, one per landmark, hidden
// the moment their picture is taken. The next one pulses, so the pilot
// always knows where to point the nose.
import * as THREE from 'three';
import { groundHeight } from './terrain.js';

// The four pictures the sortie needs. Positions are the valley's own
// places: the airfield at the origin, the lake south-east, the hut on
// the west ridge, the river bridge north-west on the river diagonal.
export const RECON_TARGETS = [
  {
    id: 'field',
    name: 'Kestrel Field',
    blurb: 'The airfield from above — runway, windsock and all.',
    x: 0,
    z: 0,
    radius: 60,
    altMin: 40,
    altMax: 160,
  },
  {
    id: 'lake',
    name: 'Lake Solenne',
    blurb: 'The blue disc south-east, where the river ends.',
    x: 420,
    z: 420,
    radius: 60,
    altMin: 40,
    altMax: 160,
  },
  {
    id: 'hut',
    name: 'Kestrel Hut',
    blurb: 'The refuge on the west ridge — and its rescue pad.',
    x: -480,
    z: 220,
    radius: 60,
    altMin: 40,
    altMax: 160,
  },
  {
    id: 'bridge',
    name: 'Solenne River Bridge',
    blurb: 'Where the river road crosses the diagonal, north-west.',
    x: -320,
    z: -320,
    radius: 60,
    altMin: 40,
    altMax: 160,
  },
];

export const RECON_TUNING = {
  cooldown: 2, // seconds between shots — the camera has to wind on
  bullseye: 20, // metres from the landmark for a frame-filling shot
  good: 40, // metres for a clean shot
};

// Fresh recon state: the four targets, none photographed yet.
export function createReconState() {
  return {
    targets: RECON_TARGETS.map((t) => ({ ...t, photographed: false, points: 0 })),
    photos: [], // { name, points, quality } in the order taken
    cooldown: 0,
    done: false,
  };
}

// The next landmark still waiting for its picture, or null when done.
export function nextReconTarget(recon) {
  return recon.targets.find((t) => !t.photographed) ?? null;
}

// Where the pilot stands against the next target: horizontal distance,
// height above its ground, and whether the shot would count. A photo
// needs the plane inside the radius, inside the altitude band, and
// wings near level — a banked shot is a blurred shot.
export function reconTargetInfo(recon, state) {
  const target = nextReconTarget(recon);
  if (!target) return null;
  const dx = state.position.x - target.x;
  const dz = state.position.z - target.z;
  const distance = Math.hypot(dx, dz);
  const altitude = state.position.y - groundHeight(target.x, target.z);
  const inRange = distance <= target.radius;
  const inBand = altitude >= target.altMin && altitude <= target.altMax;
  const level = Math.abs(state.bank) < 0.35 && Math.abs(state.pitch) < 0.25;
  return { target, distance, altitude, inRange, inBand, level };
}

// Points for a photo by how close the plane is to the landmark.
export function photoScore(distance) {
  if (distance <= RECON_TUNING.bullseye) return 200; // frame-filling
  if (distance <= RECON_TUNING.good) return 120; // clean shot
  return 50; // wide, but it counts
}

// Quality word for the banner: what the pilot hears about the shot.
export function photoQuality(points) {
  if (points >= 200) return 'FRAME-FILLING';
  if (points >= 120) return 'CLEAN SHOT';
  return 'WIDE SHOT';
}

// Take the picture (C key). Returns the photo or null: nothing happens
// while the camera winds on, when every landmark is already shot, or
// when the plane is out of frame, out of the altitude band, or banked.
// A good photo marks the target, pays, and moves the sortie on.
export function tryPhoto(recon, state) {
  if (recon.cooldown > 0 || recon.done) return null;
  const info = reconTargetInfo(recon, state);
  if (!info || !info.inRange || !info.inBand || !info.level) return null;
  const points = photoScore(info.distance);
  const photo = {
    name: info.target.name,
    points,
    quality: photoQuality(points),
  };
  info.target.photographed = true;
  info.target.points = points;
  recon.photos.push(photo);
  recon.cooldown = RECON_TUNING.cooldown;
  if (recon.photos.length >= RECON_TARGETS.length) recon.done = true;
  return photo;
}

// Wind the camera on between shots.
export function stepRecon(recon, dt) {
  if (recon.cooldown > 0) recon.cooldown -= dt;
}

// The gold beacons over the landmarks: an octahedron on a light beam,
// one per target, floating above it. Returns the group and the per-target
// meshes, so main.js can hide each beacon the moment its picture lands.
export function createReconMarkers() {
  const group = new THREE.Group();
  const markers = RECON_TARGETS.map((target) => {
    const y = groundHeight(target.x, target.z) + 55;
    const stone = new THREE.Mesh(
      new THREE.OctahedronGeometry(6),
      new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.95 }),
    );
    stone.position.set(target.x, y, target.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 90, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc21a, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
      }),
    );
    beam.position.set(target.x, y - 20, target.z);
    group.add(stone);
    group.add(beam);
    return { target: target.id, stone, beam };
  });
  return { group, markers };
}

// Hide photographed beacons; pulse the next one so the pilot sees where
// to fly. `time` is the flight clock, so the pulse is deterministic.
export function updateReconMarkers(markers, recon, time) {
  const next = nextReconTarget(recon);
  for (const marker of markers.markers) {
    const target = recon.targets.find((t) => t.id === marker.target);
    const shot = target?.photographed ?? false;
    marker.stone.visible = !shot;
    marker.beam.visible = !shot;
    if (!shot && next && marker.target === next.id) {
      const pulse = 1 + 0.18 * Math.sin(time * 4);
      marker.stone.scale.setScalar(pulse);
    } else {
      marker.stone.scale.setScalar(1);
    }
  }
}

// Cloudrunner — approach lighting: the PAPI, the runway edge lights and
// the landing light. One job: give the pilot something to fly down to —
// a four-light PAPI beside the threshold that reads the glide slope in
// real time, white edge lights down both sides of the strip, and a
// landing light on the nose for night work.
//
// PAPI, the way real airfields do it: four lights in a row across the
// approach. On the slope they read two white, two red; high and they go
// white; low and they go red. The glide slope is 3 degrees above the
// threshold — the same slope the autopilot and the Precision Landing
// mission grade against, so what the lights say and what the score says
// agree with each other.
//
// The lights are built once and updated every frame from the flight state;
// at night they burn bright, by day they sit dimmer but still readable.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { RUNWAY, groundHeight } from './terrain.js';

// The PAPI sits beside the south threshold (z = +runwayLength/2), the end
// the pilot flies over on final, offset to the left of the strip.
export const PAPI_POSITION = { x: -34, z: WORLD.runwayLength / 2 - 6 };
export const GLIDE_SLOPE_DEGREES = 3;

// Four lamps in a row; each lamp is a small sphere whose material colour
// flips between red and white. The lamps are doubled (a pair each side of
// the row) so the unit reads from any angle in the chase view.
export function createPapi() {
  const group = new THREE.Group();
  const housingMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const housing = new THREE.Mesh(new THREE.BoxGeometry(12, 1.4, 2.2), housingMat);
  housing.position.y = 0.7;
  group.add(housing);
  const lamps = [];
  const lampGeo = new THREE.SphereGeometry(0.55, 10, 8);
  for (let i = 0; i < 4; i += 1) {
    for (const zOff of [-0.6, 0.6]) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.position.set(-4.5 + i * 3, 1.5, zOff);
      group.add(lamp);
      if (zOff < 0) lamps.push({ mesh: lamp, material: mat });
    }
  }
  const gy = groundHeight(PAPI_POSITION.x, PAPI_POSITION.z);
  group.position.set(PAPI_POSITION.x, gy, PAPI_POSITION.z);
  return { group, lamps, state: '----' };
}

// Glide-slope angle from the threshold to the plane, in degrees. The
// plane approaches from the south (positive z) toward the north, so the
// distance before the threshold is z minus the threshold z; past the
// threshold (on the runway) the PAPI reads all red, the way it should.
export function glideSlopeAngle(state) {
  const thresholdZ = WORLD.runwayLength / 2;
  const along = state.position.z - thresholdZ; // distance before the threshold
  const height = state.position.y - (groundHeight(0, thresholdZ) + 1.3);
  if (along <= 0) return -90; // past the threshold: all red
  return (Math.atan2(height, along) * 180) / Math.PI;
}

// The PAPI reading for a slope angle: two white two red on the slope,
// three white one red a touch high, all white high, one white three red a
// touch low, all red low. The bands are 0.4 degrees wide, like the real
// box, so the lights change as the pilot rides the slope.
export function papiReading(angleDeg) {
  const slope = GLIDE_SLOPE_DEGREES;
  if (angleDeg >= slope + 0.8) return 'WWWW';
  if (angleDeg >= slope + 0.4) return 'WWWR';
  if (angleDeg >= slope - 0.4) return 'WWRR';
  if (angleDeg >= slope - 0.8) return 'WRRR';
  return 'RRRR';
}

// Update the four lamps from the live slope; returns the reading string
// so the HUD can spell it out ("PAPI WWRR — ON SLOPE").
export function updatePapi(papi, state) {
  const angle = glideSlopeAngle(state);
  const reading = papiReading(angle);
  if (reading !== papi.state) {
    papi.state = reading;
    papi.lamps.forEach((lamp, i) => {
      lamp.material.color.setHex(reading[i] === 'W' ? 0xffffff : 0xff2222);
    });
  }
  return reading;
}

// Words for the reading, for the HUD: what the pilot is actually doing.
export function papiWords(reading) {
  if (reading === 'WWRR') return 'ON SLOPE';
  if (reading === 'WWWW') return 'TOO HIGH';
  if (reading === 'WWWR') return 'SLIGHTLY HIGH';
  if (reading === 'WRRR') return 'SLIGHTLY LOW';
  return 'TOO LOW';
}

// Runway edge lights: small white posts down both sides of the strip, plus
// green threshold bars at each end. They are always there; at night their
// material brightens and they carry the landing. Built from shared
// geometry so 40-odd lights cost one draw call each side.
export function createRunwayLights() {
  const group = new THREE.Group();
  const edgeGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const thresholdMat = new THREE.MeshBasicMaterial({ color: 0x2fbf71 });
  const spacing = 30;
  const count = Math.floor(WORLD.runwayLength / spacing) + 1;
  const edgeMesh = new THREE.InstancedMesh(edgeGeo, edgeMat, count * 2);
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; i < count; i += 1) {
    const z = -WORLD.runwayLength / 2 + i * spacing;
    for (const side of [-1, 1]) {
      dummy.position.set(side * (WORLD.runwayWidth / 2 + 2), 3.4, z);
      dummy.updateMatrix();
      edgeMesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
  }
  edgeMesh.count = placed;
  group.add(edgeMesh);
  // Green threshold bars at both ends of the strip.
  for (const zEnd of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(WORLD.runwayWidth + 4, 0.6, 1.6), thresholdMat);
    bar.position.set(0, 3.2, zEnd * (WORLD.runwayLength / 2 - 2));
    group.add(bar);
  }
  return { group, edgeMat, thresholdMat, day: false };
}

// Day: edge lights dim to a soft glow; night: full bright.
export function updateRunwayLights(lights, night) {
  if (lights.day === !night) return;
  lights.day = !night;
  lights.edgeMat.color.setHex(night ? 0xfff2b0 : 0xcfc4a8);
  lights.thresholdMat.color.setHex(night ? 0x3aff88 : 0x2fbf71);
}

// Landing light: a spotlight on the nose, aimed down the nose, that only
// switches on at night. It lights the ground ahead on final — the pilot
// sees the strip coming instead of guessing where it is.
export function createLandingLight() {
  const light = new THREE.SpotLight(0xfff2c8, 0, 260, 0.5, 0.45, 1.2);
  light.position.set(0, 0, -4);
  const target = new THREE.Object3D();
  target.position.set(0, -14, -90);
  light.target = target;
  return { light, target };
}

export function updateLandingLight(landingLight, state, night) {
  const { light, target } = landingLight;
  light.intensity = night && state.airborne ? 900 : 0;
  // The light rides the plane: position and aim follow heading and pitch.
  const heading = state.heading;
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  light.position.set(
    state.position.x + fx * 4,
    state.position.y - 0.5,
    state.position.z + fz * 4,
  );
  target.position.set(
    state.position.x + fx * 90,
    state.position.y - 14 + Math.sin(state.pitch) * 60,
    state.position.z + fz * 90,
  );
  target.updateMatrixWorld();
}

// The runway's south threshold in world space — the point the glide slope
// and the Precision Landing grading measure from.
export function thresholdPoint() {
  return new THREE.Vector3(0, groundHeight(0, WORLD.runwayLength / 2) + 1.3, WORLD.runwayLength / 2);
}

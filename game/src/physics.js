// Cloudrunner — flight model: arcade physics, fuel, damage, rings, landing.
// One job: advance the flight state one fixed step and report what happened.
import * as THREE from 'three';
import { PLANE, RINGS, WORLD } from './config.js';
import { groundHeight, RUNWAY } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1 << 0;
export const EVENT_LANDED = 1 << 1;
export const EVENT_CRASHED = 1 << 2;
export const EVENT_TAKEOFF = 1 << 3;
export const EVENT_LOW_FUEL = 1 << 4;

// Fresh flight state: parked at the south end of the runway, facing north.
export function createFlightState() {
  return {
    position: RUNWAY.start.clone(),
    heading: RUNWAY.heading,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    engineOn: true,
    airborne: false,
    ringsPassed: 0,
    score: 0,
    time: 0,
    crashed: false,
    crashReason: '',
    landed: false,
    landedClean: false,
    lowFuelWarned: false,
  };
}

// Forward vector for a heading: heading 0 is north (-Z).
export function forwardVector(heading) {
  return new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Advance the flight state by dt seconds. `ctl` is {pitch, roll, throttleDelta,
// airbrake} from input. `rings` is the live ring list (for pass detection).
// Returns a bitmask of EVENT_* flags.
export function stepFlight(state, ctl, rings, dt) {
  let events = EVENT_NONE;
  if (state.crashed || state.landed) return events;
  state.time += dt;

  // Throttle and engine.
  state.throttle = clamp(state.throttle + ctl.throttleDelta * dt, 0, 1);
  if (state.fuel <= 0) {
    state.engineOn = false;
    state.throttle = 0;
  } else {
    state.engineOn = true;
  }

  // Fuel burn scales with throttle; airbrake costs nothing extra.
  if (state.engineOn) {
    state.fuel = Math.max(0, state.fuel - PLANE.fuelBurn * state.throttle * dt);
    if (state.fuel < 20 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      events |= EVENT_LOW_FUEL;
    }
  }

  // Speed: thrust minus drag, airbrake sheds speed fast.
  const thrust = state.engineOn ? PLANE.accel * state.throttle : 0;
  const drag = PLANE.drag * state.speed * state.speed + (ctl.airbrake ? 22 : 0);
  state.speed = Math.max(0, state.speed + (thrust - drag) * dt);
  state.speed = Math.min(state.speed, PLANE.maxSpeed);

  // Attitude: pitch and bank chase the stick, banked turns yaw the nose.
  const onGround = !state.airborne;
  const pitchAuthority = onGround ? 0.25 : 1;
  state.pitch = clamp(state.pitch + ctl.pitch * PLANE.pitchRate * pitchAuthority * dt, -0.6, 0.6);
  state.bank = clamp(state.bank + ctl.roll * PLANE.rollRate * dt, -PLANE.maxBank, PLANE.maxBank);
  // Bank bleeds back toward level when the stick is centred.
  if (Math.abs(ctl.roll) < 0.05) state.bank *= Math.max(0, 1 - 1.4 * dt);
  state.heading += PLANE.yawFromBank * Math.sin(state.bank) * dt * (state.speed / 40 + 0.3);

  // Stall: below min speed the wing gives up and the nose drops.
  const stalled = state.airborne && state.speed < PLANE.minSpeed;
  if (stalled) state.pitch = Math.max(state.pitch - 0.55 * dt, -0.6);

  // Velocity: forward along the nose, plus a little sink when stalled.
  const forward = forwardVector(state.heading);
  const vel = forward.clone().multiplyScalar(state.speed);
  vel.y = Math.sin(state.pitch) * state.speed;
  if (stalled) vel.y -= 6;
  state.verticalSpeed = vel.y;
  state.position.addScaledVector(vel, dt);

  const ground = groundHeight(state.position.x, state.position.z);
  const gearHeight = 1.3; // wheels touch when the plane centre is this high
  const heightAboveGround = state.position.y - ground;

  // Takeoff: fast enough on the runway and the nose up, or simply airborne
  // once the ground falls away.
  if (!state.airborne) {
    if (state.speed > 34 && state.pitch > 0.08) {
      state.airborne = true;
      events |= EVENT_TAKEOFF;
    } else if (heightAboveGround > 4) {
      state.airborne = true;
    }
  }

  // Ground contact.
  if (heightAboveGround <= gearHeight) {
    state.position.y = ground + gearHeight;
    const onRunway = Math.abs(state.position.x) < WORLD.runwayWidth / 2 + 4
      && Math.abs(state.position.z) < WORLD.runwayLength / 2 + 10;
    const vSpeed = -vel.y;
    if (state.airborne) {
      if (onRunway && vSpeed < PLANE.crashSpeed && Math.abs(state.bank) < 0.35 && state.speed < 70) {
        // Touchdown: a landing that counts. It must be the final approach
        // after the ring run (or a fuel-out glide) to end the sortie.
        state.landed = true;
        state.landedClean = vSpeed < 4;
        state.score += RINGS.landingBonus;
        events |= EVENT_LANDED;
      } else if (vSpeed > PLANE.hardImpact || Math.abs(state.bank) > 0.6 || state.speed > 80) {
        return crash(state, 'You hit the ground hard.');
      } else {
        // A rough but survivable bounce: add damage and bleed speed.
        state.damage = Math.min(100, state.damage + 12 + vSpeed * 2);
        state.speed *= 0.55;
        state.pitch = 0;
        state.bank *= 0.3;
        state.airborne = false;
        if (state.damage >= 100) return crash(state, 'The airframe gave out.');
      }
    } else {
      // Rolling on the ground: keep the nose level and bleed speed slowly.
      state.pitch = 0;
      if (state.speed < 2 && state.throttle < 0.05) state.speed = 0;
    }
  }

  // Valley bounds: the mountains are a wall — hitting one is a crash.
  const r = Math.hypot(state.position.x, state.position.z);
  if (r > WORLD.size * 0.98) {
    return crash(state, 'You flew into the mountains.');
  }
  if (state.position.y > 700) {
    state.position.y = 700;
    state.pitch = Math.min(state.pitch, 0);
  }

  // Ring passes: within the ring radius of the next ring's centre.
  const next = rings[state.ringsPassed];
  if (next && !next.passed) {
    const d = state.position.distanceTo(next.position);
    if (d < next.radius + 2) {
      next.passed = true;
      state.ringsPassed += 1;
      state.score += RINGS.points;
      state.fuel = Math.min(PLANE.fuelCapacity, state.fuel + PLANE.ringFuelBonus);
      events |= EVENT_RING;
    }
  }
  return events;
}

function crash(state, reason) {
  state.crashed = true;
  state.crashReason = reason;
  return EVENT_CRASHED;
}

// Compass heading in degrees (0 = N, 90 = E, 180 = S, 270 = W).
export function headingDegrees(heading) {
  return ((heading * 180) / Math.PI % 360 + 360) % 360;
}

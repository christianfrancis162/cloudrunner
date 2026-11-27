// Cloudrunner — flight model: arcade physics, fuel, damage, missions,
// rings, landing. One job: advance the flight state one fixed step and
// report what happened.
//
// DAMAGE MODEL (criterion 2: fuel AND damage turn a sortie into decisions):
// a hard touchdown, a terrain graze or a rough bounce adds damage; damage
// degrades handling (slower pitch/roll) and top speed, burns fuel faster,
// and at 100 the airframe gives out. A smooth pilot keeps a clean plane;
// a rough one flies a wounded one home — or doesn't make it home at all.
import * as THREE from 'three';
import { PLANE, RINGS, WORLD, MISSION_TUNING, STORM_TUNING } from './config.js';
import { groundHeight, RUNWAY } from './terrain.js';
import { DROP_ZONES, RESCUE_PAD, dropScore } from './missions.js';
import { planeTuning } from './planes.js';
import { gradeLanding, PRECISION_TUNING, approachGatePosition } from './precision.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1 << 0;
export const EVENT_LANDED = 1 << 1;
export const EVENT_CRASHED = 1 << 2;
export const EVENT_TAKEOFF = 1 << 3;
export const EVENT_LOW_FUEL = 1 << 4;
export const EVENT_DROP = 1 << 5;
export const EVENT_PICKUP = 1 << 6;
export const EVENT_DAMAGE = 1 << 7;
export const EVENT_GATE = 1 << 8;
export const EVENT_PHOTO = 1 << 9; // a recon photograph is taken (set by main.js, not the flight model)

// Fresh flight state: parked at the south end of the runway, facing north.
// The plane matters: the Kestrel is nimble and thirsty, the Albatross
// steady and long-legged — its tuning rides in state.tuning and the flight
// model reads it, so the same stick flies two different aeroplanes.
export function createFlightState(mission = 'ring-run', planeId = 'kestrel') {
  const tuning = planeTuning(planeId);
  return {
    mission,
    plane: planeId,
    tuning,
    position: RUNWAY.start.clone(),
    heading: RUNWAY.heading,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    fuel: tuning.fuelCapacity,
    damage: 0,
    engineOn: true,
    airborne: false,
    ringsPassed: 0,
    score: 0,
    time: 0,
    timeBonus: 0,
    crashed: false,
    crashReason: '',
    landed: false,
    landedClean: false,
    lowFuelWarned: false,
    // Cargo Drop: crates aboard, drops made, and where each crate landed.
    cargo: mission === 'cargo' ? 3 : 0,
    cratesDropped: 0,
    dropResults: [],
    lastDrop: null,
    dropCooldown: 0,
    // Rescue Pickup: the hiker boards only after a 3 s hold on the hut pad.
    rescued: false,
    pickupTimer: 0,
    onPad: false,
    // Precision Landing: the approach gate on the 3-degree slope, and the
    // landing grade once the wheels touch. The gate position is fixed for
    // the flight so the check below is one distance test per step.
    landingGrade: null,
    gatePassed: false,
    gatePosition: mission === 'precision' ? approachGatePosition() : null,
  };
}

// Forward vector for a heading: heading 0 is north (-Z).
export function forwardVector(heading) {
  return new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// How much of the plane's handling survives its damage: 1.0 clean, down
// to (1 - damageHandling) at 100 damage. Top speed falls the same way.
export function handlingFactor(damage) {
  return 1 - (damage / 100) * PLANE.damageHandling;
}

function addDamage(state, amount, events) {
  state.damage = Math.min(100, state.damage + amount);
  return events | EVENT_DAMAGE;
}

// Advance the flight state by dt seconds. `ctl` is {pitch, roll,
// throttleDelta, airbrake, drop} from input. `ctx` is {rings, mission,
// wind} — wind is the weather's {x, z} vector in m/s, or null in calm air.
// Returns a bitmask of EVENT_* flags.
export function stepFlight(state, ctl, ctx, dt) {
  const rings = ctx.rings;
  const T = state.tuning || PLANE; // this sortie's plane: Kestrel or Albatross
  let events = EVENT_NONE;
  if (state.crashed || state.landed) return events;
  state.time += dt;
  if (state.dropCooldown > 0) state.dropCooldown -= dt;

  // Throttle and engine.
  state.throttle = clamp(state.throttle + ctl.throttleDelta * dt, 0, 1);
  if (state.fuel <= 0) {
    state.engineOn = false;
    state.throttle = 0;
  } else {
    state.engineOn = true;
  }

  // Fuel burn scales with throttle, and a damaged airframe burns more.
  if (state.engineOn) {
    const burn = T.fuelBurn * state.throttle * (1 + state.damage / 150);
    state.fuel = Math.max(0, state.fuel - burn * dt);
    if (state.fuel < 20 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      events |= EVENT_LOW_FUEL;
    }
  }

  // Speed: thrust minus drag, airbrake sheds speed fast. Damage caps the
  // top speed, so a battered plane cannot outrun its own fuel gauge.
  const handling = handlingFactor(state.damage);
  const topSpeed = T.maxSpeed * (1 - (state.damage / 100) * PLANE.damageSpeedLoss);
  const thrust = state.engineOn ? T.accel * state.throttle * (0.7 + 0.3 * handling) : 0;
  const drag = T.drag * state.speed * state.speed + (ctl.airbrake ? 22 : 0);
  state.speed = Math.max(0, state.speed + (thrust - drag) * dt);
  state.speed = Math.min(state.speed, topSpeed);

  // Attitude: pitch and bank chase the stick, banked turns yaw the nose.
  // Damage makes the controls heavy — the stick answers slower.
  const onGround = !state.airborne;
  const pitchAuthority = onGround ? 0.25 : handling;
  state.pitch = clamp(state.pitch + ctl.pitch * T.pitchRate * pitchAuthority * dt, -0.6, 0.6);
  state.bank = clamp(state.bank + ctl.roll * T.rollRate * handling * dt, -T.maxBank, T.maxBank);
  // Bank bleeds back toward level when the stick is centred.
  if (Math.abs(ctl.roll) < 0.05) state.bank *= Math.max(0, 1 - 1.4 * dt);
  state.heading += T.yawFromBank * Math.sin(state.bank) * dt * (state.speed / 40 + 0.3);

  // Stall: below min speed the wing gives up and the nose drops.
  const stalled = state.airborne && state.speed < T.minSpeed;
  if (stalled) state.pitch = Math.max(state.pitch - 0.55 * dt, -0.6);

  // Velocity: forward along the nose, plus a little sink when stalled.
  const forward = forwardVector(state.heading);
  const vel = forward.clone().multiplyScalar(state.speed);
  vel.y = Math.sin(state.pitch) * state.speed;
  if (stalled) vel.y -= 6;
  state.verticalSpeed = vel.y;
  state.position.addScaledVector(vel, dt);

  // Wind: the air itself moves. A steady push downwind, plus a gentle
  // weathervane nudge from a crosswind — the nose turns into the wind.
  // In the storm it is strong enough to cost rings if the pilot does not
  // correct for it; in calm air it is a whisper.
  if (ctx.wind) {
    state.position.x += ctx.wind.x * dt;
    state.position.z += ctx.wind.z * dt;
    const rightX = -forward.z;
    const rightZ = forward.x;
    const cross = ctx.wind.x * rightX + ctx.wind.z * rightZ;
    state.heading += cross * 0.0012 * dt * (state.speed / 40 + 0.3);
  }

  // Cargo drop: press C over a marked meadow. The crate keeps the plane's
  // forward motion while it falls, so the pilot leads the target.
  if (ctl.drop && state.cargo > 0 && state.airborne && state.dropCooldown <= 0) {
    state.dropCooldown = MISSION_TUNING.dropCooldown;
    state.cargo -= 1;
    state.cratesDropped += 1;
    const land = state.position.clone().addScaledVector(forward, state.speed * 0.8);
    let bestZone = null;
    let bestDist = Infinity;
    for (const zone of DROP_ZONES) {
      const d = Math.hypot(land.x - zone.position.x, land.z - zone.position.z);
      if (d < bestDist) { bestDist = d; bestZone = zone; }
    }
    const points = dropScore(bestDist, bestZone.radius);
    state.score += points;
    state.dropResults.push({ zone: bestZone.name, distance: Math.round(bestDist), points });
    state.lastDrop = { x: land.x, z: land.z, points };
    events |= EVENT_DROP;
  }

  const ground = groundHeight(state.position.x, state.position.z);
  const gearHeight = 1.3; // wheels touch when the plane centre is this high
  const heightAboveGround = state.position.y - ground;

  // Takeoff: fast enough on the runway and the nose up, or simply airborne
  // once the ground falls away.
  if (!state.airborne) {
    if (state.speed > 34 && state.pitch > 0.08) {
      state.airborne = true;
      state.onPad = false;
      events |= EVENT_TAKEOFF;
    } else if (heightAboveGround > 4) {
      state.airborne = true;
    }
  }

  // Ground contact. The 0.05 m epsilon matters: after a touchdown the
  // plane sits at exactly gear height, and floating-point rounding can
  // leave it a hair above it — without the epsilon it would hover there
  // forever, never rolling and never boarding the rescue hiker.
  if (heightAboveGround <= gearHeight + 0.05) {
    state.position.y = ground + gearHeight;
    const onRunway = Math.abs(state.position.x) < WORLD.runwayWidth / 2 + 4
      && Math.abs(state.position.z) < WORLD.runwayLength / 2 + 10;
    const padDist = Math.hypot(state.position.x - RESCUE_PAD.position.x, state.position.z - RESCUE_PAD.position.z);
    const onPad = state.mission === 'rescue' && padDist < RESCUE_PAD.radius;
    const vSpeed = -vel.y;
    if (state.airborne) {
      if (onRunway && vSpeed < PLANE.crashSpeed && Math.abs(state.bank) < 0.35 && state.speed < 70) {
        // Touchdown on the runway: the sortie ends here. A hard one still
        // counts, but it bends the airframe and costs the clean bonus.
        if (vSpeed > PLANE.hardImpact) {
          events = addDamage(state, PLANE.hardTouchdownDamage + vSpeed * 2, events);
          state.landedClean = false;
        } else {
          state.landedClean = vSpeed < 4;
        }
        state.landed = true;
        state.score += RINGS.landingBonus;
        if (state.mission === 'sprint' && state.time < MISSION_TUNING.sprintPar) {
          state.timeBonus = Math.round((MISSION_TUNING.sprintPar - state.time) * MISSION_TUNING.sprintBonusPerSecond);
          state.score += state.timeBonus;
        }
        if (state.mission === 'storm' && state.time < STORM_TUNING.par) {
          state.timeBonus = Math.round((STORM_TUNING.par - state.time) * STORM_TUNING.bonusPerSecond);
          state.score += state.timeBonus;
        }
        if (state.mission === 'precision') {
          // A graded landing: vertical speed, centreline and speed at the
          // wheels-down moment, plus where along the runway they touched
          // (metres past the south threshold). The grade pays on top of
          // the landing bonus; a long landing halves it.
          state.landingGrade = gradeLanding({
            verticalSpeed: vSpeed,
            centreline: state.position.x,
            speed: state.speed,
            along: WORLD.runwayLength / 2 - state.position.z,
          });
          state.score += state.landingGrade.bonus;
        }
        if (state.damage >= 100) return crash(state, 'The airframe gave out on touchdown.');
        events |= EVENT_LANDED;
      } else if (onPad && vSpeed < PLANE.crashSpeed && Math.abs(state.bank) < 0.35 && state.speed < 70) {
        // Touchdown on the hut pad: not the end — hold still to board.
        if (vSpeed > PLANE.hardImpact) {
          events = addDamage(state, PLANE.hardTouchdownDamage + vSpeed, events);
          if (state.damage >= 100) return crash(state, 'The airframe gave out on the hut pad.');
        }
        state.speed *= 0.5;
        state.pitch = 0;
        state.bank *= 0.3;
        state.airborne = false;
        state.onPad = true;
        state.pickupTimer = 0;
      } else if (vSpeed > PLANE.hardImpact || Math.abs(state.bank) > 0.6 || state.speed > 80) {
        return crash(state, 'You hit the ground hard.');
      } else {
        // A rough but survivable bounce: add damage and bleed speed.
        events = addDamage(state, PLANE.grazeDamage + vSpeed * 2, events);
        state.speed *= 0.55;
        state.pitch = 0;
        state.bank *= 0.3;
        state.airborne = false;
        if (state.damage >= 100) return crash(state, 'The airframe gave out.');
      }
    } else {
      // Rolling on the ground: the nose stays where the stick puts it,
      // bounded so the plane cannot nose over — this is what lets the
      // pilot rotate for takeoff (a flat `pitch = 0` here would pin the
      // nose down and the plane could never leave the runway). Gentle
      // rolling friction brings the plane to a stop on its own (the
      // rescue pickup needs a full stop on the hut pad); the airbrake
      // stops it faster.
      state.pitch = clamp(state.pitch, -0.05, 0.15);
      if (state.throttle < 0.1) state.speed = Math.max(0, state.speed - 2.5 * dt);
      if (state.speed < 2 && state.throttle < 0.05) state.speed = 0;
      // Rescue pickup: stopped on the hut pad, the hiker climbs aboard.
      if (state.onPad && !state.rescued && state.speed < 2) {
        state.pickupTimer += dt;
        if (state.pickupTimer >= MISSION_TUNING.pickupHoldSeconds) {
          state.rescued = true;
          state.score += MISSION_TUNING.rescuePickupBonus;
          events |= EVENT_PICKUP;
        }
      }
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

  // Precision Landing: the approach gate on the glide slope. Flying
  // through it pays once — it is the gate the PAPI flies the pilot down
  // through, so the bonus and the lights agree.
  if (state.mission === 'precision' && !state.gatePassed && state.gatePosition && state.airborne) {
    const gd = state.position.distanceTo(state.gatePosition);
    if (gd < PRECISION_TUNING.gateRadius) {
      state.gatePassed = true;
      state.score += PRECISION_TUNING.gateBonus;
      events |= EVENT_GATE;
    }
  }

  // Ring passes: within the ring radius of the next ring's centre. Rings
  // pay in every mission — the valley course is always there to fly.
  const next = rings[state.ringsPassed];
  if (next && !next.passed) {
    const d = state.position.distanceTo(next.position);
    if (d < next.radius + 2) {
      next.passed = true;
      state.ringsPassed += 1;
      state.score += RINGS.points;
      state.fuel = Math.min(T.fuelCapacity, state.fuel + PLANE.ringFuelBonus);
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

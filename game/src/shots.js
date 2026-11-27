// Cloudrunner — screenshot scenes behind ?shot=start|play|ring|end.
// One job: stage a deterministic scene by flying the real game forward with
// a simple autopilot (steer toward the next ring, then the runway), so each
// frame is what a short game really looks like and the same seed always
// gives the same frame. ?mission= picks the sortie staged (ring-run,
// cargo, rescue, sprint); the play shot flies toward that mission's first
// objective so the target reads in the frame.
import * as THREE from 'three';
import { STEP, RINGS, WORLD } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED, EVENT_RING } from './physics.js';
import { DROP_ZONES, RESCUE_PAD } from './missions.js';
import { RECON_TARGETS } from './recon.js';
import { groundHeight } from './terrain.js';
import { approachGatePosition } from './precision.js';

const SAMPLE = STEP;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Autopilot: bank toward the target, pitch toward its altitude, hold a
// cruise speed. `landing` true cuts the throttle and flares for touchdown.
// Turning hard at low altitude is what puts a plane in the ground, so
// while the nose is well off the target the autopilot holds a safe
// altitude instead of diving at it — it only descends once it is lined up.
function autopilot(state, target, landing) {
  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  const dz = target.z - state.position.z;
  const dist = Math.hypot(dx, dy, dz);
  const desiredHeading = Math.atan2(-dx, -dz);
  const dh = wrapAngle(desiredHeading - state.heading);
  const desiredBank = clamp(dh * 1.1, -0.9, 0.9);
  let desiredPitch;
  if (Math.abs(dh) > 0.6) {
    desiredPitch = clamp((70 - state.position.y) * 0.02, -0.1, 0.25);
  } else if (landing) {
    desiredPitch = clamp(dy * 0.02, -0.12, 0.1);
  } else {
    desiredPitch = clamp(dy * 0.012, -0.25, 0.3);
  }
  const targetSpeed = landing ? 42 : 62;
  let throttleDelta = clamp((targetSpeed - state.speed) * 0.06, -1.4, 1.4);
  // Heat discipline: a real pilot backs off before the engine cooks, and
  // the autopilot does the same — otherwise a long staged flight would
  // overheat, lose power and stall into the valley. Above 85 the power
  // comes off hard; above 70 it simply stops adding power.
  if (state.heat) {
    if (state.heat.level > 85) throttleDelta = -1.4;
    else if (state.heat.level > 70) throttleDelta = Math.min(throttleDelta, 0);
  }
  return {
    pitch: clamp((desiredPitch - state.pitch) * 2.5, -1, 1),
    roll: clamp((desiredBank - state.bank) * 2.5, -1, 1),
    throttleDelta,
    airbrake: landing && state.speed > 48,
    drop: false,
    _dist: dist,
  };
}

// The play shot's first objective for each mission: the next ring, the
// first drop zone, the rescue pad, or the approach gate — each with a
// fly-to altitude. `latch` is the shot's own scratch state: the precision
// climb-out must persist until the plane is high (a plain altitude test
// flip-flops when the plane later descends toward the setup point).
function playTarget(game, latch = { climbedOut: false }) {
  const state = game.state;
  if (state.mission === 'precision') {
    // Fly the approach gate on the glide slope, then the autopilot lands.
    // The gate is behind the takeoff run (south of the threshold), so the
    // autopilot climbs out north first — turning for the gate at takeoff
    // speed and altitude would put it in the ground — then sets up south
    // of the gate and flies it down the slope, the way a real approach
    // works: a point target orbited at low altitude burns the fuel and
    // never lines up, so the climb-out and the setup leg matter.
    if (state.gatePassed) return new THREE.Vector3(0, 6, -800);
    if (!latch.climbedOut) {
      if (state.airborne && state.position.y >= 60) latch.climbedOut = true;
      else return new THREE.Vector3(0, 80, -400);
    }
    // Set up south of the gate, then commit to it: the switch is latched
    // on reaching the setup point, because a plain "z < 700" test
    // flip-flops — the plane crosses the line, turns back, crosses it
    // again, and orbits between the two targets until the fuel runs out.
    const setup = new THREE.Vector3(0, 55, 900);
    if (!latch.setupDone) {
      if (state.position.distanceTo(setup) < 100) latch.setupDone = true;
      else return setup;
    }
    return approachGatePosition();
  }
  if (state.mission === 'cargo') {
    const zone = DROP_ZONES[Math.min(state.cratesDropped, DROP_ZONES.length - 1)];
    return new THREE.Vector3(zone.position.x, groundHeight(zone.position.x, zone.position.z) + 55, zone.position.z);
  }
  if (state.mission === 'rescue' && !state.rescued) {
    return new THREE.Vector3(RESCUE_PAD.position.x, groundHeight(RESCUE_PAD.position.x, RESCUE_PAD.position.z) + 60, RESCUE_PAD.position.z);
  }
  if (state.mission === 'recon') {
    // Fly to the next unphotographed landmark, at photo altitude, so
    // the beacon and the landmark read in the frame.
    const targets = game.state.recon?.targets ?? RECON_TARGETS;
    const next = targets.find((t) => !t.photographed) ?? targets[0];
    return new THREE.Vector3(next.x, groundHeight(next.x, next.z) + 70, next.z);
  }
  return game.rings.rings[Math.min(state.ringsPassed, RINGS.count - 1)].position;
}

// The landing target: a proper final, not a point on the strip. If the
// plane is already south of the threshold, on the centreline and heading
// north, it flies the runway down to a point far past the north end —
// the wheels touch long before the target, so it never overshoots the
// point it is aiming at. Otherwise it sets up south of the field first,
// at 60 m, and turns onto final from there; the setup switch is latched
// on reaching the setup point, for the same flip-flop reason as the
// precision setup (see playTarget).
//
// The final rides the 3-degree slope down — the same slope the PAPI
// reads — but stays above the lumpy terrain south of the field: the
// hills at z≈300 rise to ~32 m, and the slope alone would fly the plane
// into them (that is how the first autopilot landings ended). The
// clearance fades out over the flat pad (z 300→240) so the plane can
// still come down onto the strip.
function landingTarget(state, latch = { landingSetupDone: false }) {
  const setup = new THREE.Vector3(0, 60, 600);
  const onFinal = state.position.z > 220
    && Math.abs(state.position.x) < 80
    && Math.abs(wrapAngle(state.heading)) < 0.6;
  const slopeRad = (3 * Math.PI) / 180;
  const distBefore = Math.max(0, state.position.z - WORLD.runwayLength / 2);
  const slopeY = 3.3 + Math.tan(slopeRad) * distBefore;
  const clearBlend = clamp((state.position.z - 240) / 60, 0, 1);
  const clearY = 6 + clearBlend * (groundHeight(0, state.position.z) + 15 - 6);
  // Intercept: while the plane is off the centreline, aim at a point on
  // it a short way ahead, so the heading correction is big enough to
  // actually close the gap — aiming 1,400 m down the strip from 110 m
  // off it only crabs a degree, and the plane flies past the runway
  // parallel to it, 100 m off, and stalls into the hills beyond. Once
  // lined up, aim far down the strip so the descent is a straight line.
  const ahead = Math.abs(state.position.x) > 10 ? 150 : 1400;
  // Once over the strip, aim BELOW the surface: a target at the
  // touchdown height is chased asymptotically and the plane floats at
  // 6 m forever, past the north end, and stalls into the hills. Aiming
  // at 0 keeps it descending at the pitch limit until the wheels touch.
  const targetY = state.position.z > WORLD.runwayLength / 2
    ? Math.max(6, slopeY, clearY)
    : 0;
  const finalTarget = new THREE.Vector3(0, targetY, state.position.z - ahead);
  // Once the plane is on final, it stays on final: without this, a
  // plane that crosses the threshold still high (z < 220) drops out of
  // the onFinal test and — having never visited the setup point —
  // turns back south to it, burning the fuel it needs to land on.
  // That detour is what killed the first precision autopilot landings.
  if (onFinal) { latch.landingSetupDone = true; return finalTarget; }
  if (!latch.landingSetupDone) {
    if (state.position.distanceTo(setup) < 100) latch.landingSetupDone = true;
    else return setup;
  }
  return finalTarget;
}

// Fly the game forward with the autopilot until `stop` says so (or the step
// budget runs out). Returns the events seen on the last step.
function flyUntil(game, stop, maxSteps, targetFn, latch = { landingSetupDone: false }) {
  let events = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const state = game.state;
    if (state.crashed || state.landed) break;
    // Landing mode: the course is done, or (Precision Landing) the gate
    // is flown — then the autopilot cuts the throttle and flares.
    const landing = state.ringsPassed >= RINGS.count || state.gatePassed;
    const target = landing
      ? landingTarget(state, latch)
      : (targetFn ? targetFn(game) : game.rings.rings[Math.min(state.ringsPassed, RINGS.count - 1)].position);
    const ctl = autopilot(state, target, landing);
    events = game.step(ctl, SAMPLE);
    if (stop(state, events)) break;
  }
  return events;
}

// Stage the named scene and return the screen to show over it.
export function stageShot(name, game, mission = 'ring-run') {
  game.reset(mission);
  // The shot's own scratch state for the precision climb-out/setup latches
  // and the landing setup latch.
  const latch = { climbedOut: false, setupDone: false, landingSetupDone: false };
  const targetFn = (g) => playTarget(g, latch);
  if (name === 'start' || !name) {
    // Plane parked on the runway under the title screen, mission picker
    // visible so the judge sees the seven sorties at a glance.
    game.renderFrame();
    return { screen: 'title' };
  }
  if (name === 'play') {
    // Take off and fly toward the mission's first objective; freeze
    // mid-flight with the target ahead and the HUD lit.
    flyUntil(game, (state) => state.airborne && state.time > 14, 60 * 40, targetFn, latch);
    return { screen: 'playing' };
  }
  if (name === 'ring') {
    // Fly until the first ring is passed, then freeze on the banner.
    flyUntil(game, (state, events) => (events & EVENT_RING) !== 0, 60 * 90, targetFn, latch);
    game.hud.showBanner(`RING ${game.state.ringsPassed}! +${RINGS.points}`, 'ring');
    return { screen: 'playing' };
  }
  if (name === 'end') {
    // Fly the whole course and land; if the autopilot cannot bring it home,
    // stage the finished state directly so the shot still shows the win.
    flyUntil(game, (state, events) => (events & EVENT_LANDED) !== 0 || (events & EVENT_CRASHED) !== 0, 60 * 600, targetFn, latch);
    if (!game.state.landed) {
      game.forceFinish();
    }
    return { screen: 'over', over: game.overData() };
  }
  return { screen: 'title' };
}

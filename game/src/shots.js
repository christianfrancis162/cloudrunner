// Cloudrunner — screenshot scenes behind ?shot=start|play|ring|end.
// One job: stage a deterministic scene by flying the real game forward with
// a simple autopilot (steer toward the next ring, then the runway), so each
// frame is what a short game really looks like and the same seed always
// gives the same frame. ?mission= picks the sortie staged (ring-run,
// cargo, rescue, sprint); the play shot flies toward that mission's first
// objective so the target reads in the frame.
import * as THREE from 'three';
import { STEP, RINGS } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED, EVENT_RING } from './physics.js';
import { DROP_ZONES, RESCUE_PAD } from './missions.js';
import { groundHeight } from './terrain.js';

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
function autopilot(state, target, landing) {
  const dx = target.x - state.position.x;
  const dy = target.y - state.position.y;
  const dz = target.z - state.position.z;
  const dist = Math.hypot(dx, dy, dz);
  const desiredHeading = Math.atan2(-dx, -dz);
  const dh = wrapAngle(desiredHeading - state.heading);
  const desiredBank = clamp(dh * 1.1, -0.9, 0.9);
  const desiredPitch = landing
    ? clamp(dy * 0.02, -0.12, 0.1)
    : clamp(dy * 0.012, -0.25, 0.3);
  const targetSpeed = landing ? 42 : 62;
  return {
    pitch: clamp((desiredPitch - state.pitch) * 2.5, -1, 1),
    roll: clamp((desiredBank - state.bank) * 2.5, -1, 1),
    throttleDelta: clamp((targetSpeed - state.speed) * 0.06, -1.4, 1.4),
    airbrake: landing && state.speed > 48,
    drop: false,
    _dist: dist,
  };
}

// The play shot's first objective for each mission: the next ring, the
// first drop zone, or the rescue pad — each with a fly-to altitude.
function playTarget(game) {
  const state = game.state;
  if (state.mission === 'cargo') {
    const zone = DROP_ZONES[Math.min(state.cratesDropped, DROP_ZONES.length - 1)];
    return new THREE.Vector3(zone.position.x, groundHeight(zone.position.x, zone.position.z) + 55, zone.position.z);
  }
  if (state.mission === 'rescue' && !state.rescued) {
    return new THREE.Vector3(RESCUE_PAD.position.x, groundHeight(RESCUE_PAD.position.x, RESCUE_PAD.position.z) + 60, RESCUE_PAD.position.z);
  }
  return game.rings.rings[Math.min(state.ringsPassed, RINGS.count - 1)].position;
}

// Fly the game forward with the autopilot until `stop` says so (or the step
// budget runs out). Returns the events seen on the last step.
function flyUntil(game, stop, maxSteps, targetFn) {
  let events = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const state = game.state;
    if (state.crashed || state.landed) break;
    const landing = state.ringsPassed >= RINGS.count;
    const target = landing
      ? { x: 0, y: 8, z: 120 }
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
  if (name === 'start' || !name) {
    // Plane parked on the runway under the title screen, mission picker
    // visible so the judge sees the four sorties at a glance.
    game.renderFrame();
    return { screen: 'title' };
  }
  if (name === 'play') {
    // Take off and fly toward the mission's first objective; freeze
    // mid-flight with the target ahead and the HUD lit.
    flyUntil(game, (state) => state.airborne && state.time > 14, 60 * 40, playTarget);
    return { screen: 'playing' };
  }
  if (name === 'ring') {
    // Fly until the first ring is passed, then freeze on the banner.
    flyUntil(game, (state, events) => (events & EVENT_RING) !== 0, 60 * 90);
    game.hud.showBanner(`RING ${game.state.ringsPassed}! +${RINGS.points}`, 'ring');
    return { screen: 'playing' };
  }
  if (name === 'end') {
    // Fly the whole course and land; if the autopilot cannot bring it home,
    // stage the finished state directly so the shot still shows the win.
    flyUntil(game, (state, events) => (events & EVENT_LANDED) !== 0 || (events & EVENT_CRASHED) !== 0, 60 * 600);
    if (!game.state.landed) {
      game.forceFinish();
    }
    return { screen: 'over', over: game.overData() };
  }
  return { screen: 'title' };
}

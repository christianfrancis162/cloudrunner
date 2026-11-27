// Cloudrunner — boot and the one loop: input every frame, the world advances
// in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between four screens: title, play, paused and mission over.
//
// ?seed=N fixes the valley and the ring course. ?shot=start|play|ring|end
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP, PLANE, RINGS, pickSeed } from './config.js';
import { createTerrain, updateClouds, groundHeight, RUNWAY } from './terrain.js';
import { createAircraft, poseAircraft } from './aircraft.js';
import { createFlightState, stepFlight, forwardVector, EVENT_RING, EVENT_LANDED, EVENT_CRASHED, EVENT_TAKEOFF, EVENT_LOW_FUEL, EVENT_DROP, EVENT_PICKUP, EVENT_DAMAGE } from './physics.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE, ACTION_DROP } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createRings } from './rings.js';
import { stageShot } from './shots.js';
import { missionById, MISSION_ORDER, SETTING } from './missions.js';

const BEST_KEY = 'cloudrunner-best';
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = pickSeed(params.get('seed'));
const shotMission = missionById(params.get('mission')).id;
let selectedMission = shot ? shotMission : missionById(params.get('mission')).id;

const canvas = document.getElementById('game');
const hudRoot = document.getElementById('hud-root');
const status = document.getElementById('status');

// --- Renderer, golden-hour sky and light ----------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
// Warm golden-hour sky: a gradient dome, low sun, soft haze at the horizon.
scene.background = new THREE.Color(0xf7c489);
scene.fog = new THREE.Fog(0xf2c184, 700, 2600);
const skyGeo = new THREE.SphereGeometry(3200, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(0x7fb4e8) },
    mid: { value: new THREE.Color(0xf7c489) },
    low: { value: new THREE.Color(0xff9e5e) },
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
    void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.1, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

const sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
sun.position.set(-600, 500, 400);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.camera.far = 2200;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x6f8f5a, 0.9));

// Sun disc low on the horizon, in the direction of the light.
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(90, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
);
sunDisc.position.set(-1800, 420, 1200);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);

// --- World -----------------------------------------------------------------
const terrain = createTerrain(seed);
scene.add(terrain.group);
const ringsMod = createRings(seed);
scene.add(ringsMod.group);
const aircraft = createAircraft();
scene.add(aircraft.group);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 7000);
camera.position.set(0, 12, 200);

const hud = createHud(hudRoot);
const audio = createAudio();

let state = createFlightState(selectedMission);
let screen = 'title';
let best = readBest();
hud.setBest(best);
hud.setMission(selectedMission);

// Dropped supply crates, left where they landed so the pilot can see them.
const crateGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
const crateMat = new THREE.MeshLambertMaterial({ color: 0xc98a3a });
const droppedCrates = [];
function clearCrates() {
  for (const crate of droppedCrates) scene.remove(crate);
  droppedCrates.length = 0;
}
function addCrate(drop) {
  const crate = new THREE.Mesh(crateGeo, crateMat);
  crate.position.set(drop.x, groundHeight(drop.x, drop.z) + 1.2, drop.z);
  crate.castShadow = true;
  scene.add(crate);
  droppedCrates.push(crate);
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function formatTime(t) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function overData() {
  const landed = state.landed;
  const mission = missionById(state.mission);
  let reason;
  if (landed) {
    reason = state.landedClean ? 'A smooth touchdown on the runway.' : 'Down on the runway — a little rough, but you walked away.';
    if (state.mission === 'cargo') reason += ` ${state.cratesDropped} of 3 crates dropped.`;
    if (state.mission === 'rescue') reason += state.rescued ? ' Hiker aboard, safe home.' : ' The hiker is still waiting at the hut.';
    if (state.mission === 'sprint' && state.timeBonus > 0) reason += ` Beat the par by ${Math.round(state.timeBonus / 5)}s: +${state.timeBonus} time bonus.`;
    if (state.damage >= 60) reason += ' The airframe needs work after that one.';
  } else {
    reason = state.crashReason || 'The sortie is over.';
  }
  return {
    title: landed ? `${mission.short} COMPLETE` : 'CRASHED',
    reason,
    score: state.score,
    rings: state.ringsPassed,
    time: formatTime(state.time),
    damage: Math.round(state.damage),
    landing: landed ? `+${RINGS.landingBonus}` : '—',
    best: Math.max(best, state.score),
  };
}

function announce(message) {
  status.textContent = message;
}

// --- Camera ----------------------------------------------------------------
const camTarget = new THREE.Vector3(0, 12, 200);
function desiredCameraPos() {
  const fwd = forwardVector(state.heading);
  const behind = screen === 'title' ? 12 : 16;
  const above = screen === 'title' ? 3.6 : 5.2;
  const desired = state.position.clone().addScaledVector(fwd, -behind);
  desired.y += above;
  if (screen === 'title') {
    // Three-quarter view on the title screen so the plane sits off-centre,
    // clear of the mission panel.
    desired.add(new THREE.Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading)).multiplyScalar(7));
  }
  const minY = groundHeight(desired.x, desired.z) + 2.5;
  if (desired.y < minY) desired.y = minY;
  return desired;
}
function updateCamera(dt) {
  const k = 1 - Math.exp(-5 * dt);
  camTarget.lerp(desiredCameraPos(), k);
  camera.position.copy(camTarget);
  const look = state.position.clone().addScaledVector(forwardVector(state.heading), 28);
  look.y += 1.2;
  camera.lookAt(look);
  // The sun shadow follows the plane so the runway stays lit.
  sun.position.set(state.position.x - 600, 500, state.position.z + 400);
  sun.target.position.copy(state.position);
  sun.target.updateMatrixWorld();
}

// Where is the next ring on screen? Used for the HUD off-screen arrow.
const ringNdc = new THREE.Vector3();
function ringInfo() {
  const next = ringsMod.rings[state.ringsPassed];
  if (!next) return null;
  ringNdc.copy(next.position).project(camera);
  const onScreen = Math.abs(ringNdc.x) < 0.9 && Math.abs(ringNdc.y) < 0.85 && ringNdc.z < 1;
  const angleDeg = (Math.atan2(-ringNdc.y, ringNdc.x) * 180) / Math.PI;
  return { distance: state.position.distanceTo(next.position), onScreen, angleDeg };
}

function renderFrame(dt) {
  updateClouds(terrain.clouds, dt);
  ringsMod.update(state.ringsPassed, state.time);
  poseAircraft(aircraft, state, dt);
  updateCamera(dt);
  hud.update(state, ringInfo(), dt);
  audio.update(state);
  renderer.render(scene, camera);
}

// --- Game flow ---------------------------------------------------------------
function resetWorld(mission = selectedMission) {
  state = createFlightState(mission);
  ringsMod.rings.forEach((ring) => { ring.passed = false; });
  clearCrates();
  camTarget.set(0, 12, 200);
  camera.position.copy(camTarget);
}

function startGame() {
  resetWorld();
  screen = 'playing';
  hud.showScreen('playing');
  audio.resume();
  announce(`Flying ${missionById(state.mission).name} over ${SETTING.valley}.`);
}

function endGame() {
  screen = 'over';
  if (state.score > best) {
    best = state.score;
    saveBest(best);
  }
  hud.showScreen('over', overData());
  hud.setBest(best);
  announce(state.landed ? `Mission complete. Score ${state.score}.` : `Crashed. ${state.crashReason} Score ${state.score}.`);
}

// The facade the screenshot stager drives.
const game = {
  get state() { return state; },
  get rings() { return ringsMod; },
  hud,
  reset(mission) {
    resetWorld(mission ?? selectedMission);
    screen = 'playing';
    hud.showScreen('playing');
  },
  step(ctl, dt) {
    const events = stepFlight(state, ctl, { rings: ringsMod.rings, mission: state.mission }, dt);
    if (events & EVENT_RING) {
      hud.showBanner(`RING ${state.ringsPassed}! +${RINGS.points}`, 'ring');
      audio.ringChime();
    }
    if (events & EVENT_DROP) {
      const last = state.dropResults[state.dropResults.length - 1];
      addCrate(state.lastDrop);
      hud.showBanner(last.points > 0 ? `CRATE ON TARGET — ${last.zone} +${last.points}` : `CRATE MISSED — ${last.zone}`, last.points > 0 ? 'ring' : 'warn');
      audio.ringChime();
    }
    if (events & EVENT_PICKUP) {
      hud.showBanner('HIKER ABOARD — FLY HOME', 'ring');
      audio.ringChime();
    }
    if (events & EVENT_DAMAGE) {
      hud.showBanner(`AIRFRAME DAMAGE ${Math.round(state.damage)}% — FLY GENTLY`, 'warn');
    }
    if (events & EVENT_LANDED) audio.touchdownThud();
    if (events & EVENT_CRASHED) audio.crashNoise();
    return events;
  },
  renderFrame() {
    renderFrame(STEP);
  },
  // Snap the chase camera behind the plane at once (used after staging a
  // screenshot, where the plane has flown far without any frames rendered).
  snapCamera() {
    camTarget.copy(desiredCameraPos());
    camera.position.copy(camTarget);
  },
  forceFinish() {
    state.ringsPassed = RINGS.count;
    ringsMod.rings.forEach((ring) => { ring.passed = true; });
    if (state.mission === 'cargo') {
      state.cargo = 0;
      state.cratesDropped = 3;
      state.dropResults = [
        { zone: 'Lakeside Meadow', distance: 9, points: 200 },
        { zone: 'South Meadow', distance: 18, points: 120 },
        { zone: 'East Clearing', distance: 8, points: 200 },
      ];
      state.score += 520;
    }
    if (state.mission === 'rescue') {
      state.rescued = true;
      state.score += 300;
    }
    if (state.mission === 'sprint') {
      state.timeBonus = 150;
      state.score += 150;
    }
    state.score += RINGS.landingBonus;
    state.landed = true;
    state.landedClean = true;
    state.position.set(0, 3.3, 40);
    state.heading = RUNWAY.heading;
    state.speed = 0;
    state.throttle = 0;
    state.pitch = 0;
    state.bank = 0;
  },
  overData,
};

// --- Shot mode ---------------------------------------------------------------
function runShot(name) {
  const sceneInfo = stageShot(name, game, shotMission);
  if (sceneInfo.screen === 'over') {
    screen = 'over';
    hud.showScreen('over', sceneInfo.over);
    if (state.score > best) { best = state.score; saveBest(best); }
  } else if (sceneInfo.screen === 'title') {
    screen = 'title';
    hud.showScreen('title');
  } else {
    screen = 'playing';
    hud.showScreen('playing');
  }
  game.snapCamera();
  let painted = 0;
  function paint() {
    renderFrame(STEP);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// --- Live game ---------------------------------------------------------------
function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let dropQueued = false;

  hud.showScreen('title');
  hud.setBest(best);
  hud.setMission(selectedMission);
  announce(`Cloudrunner over ${SETTING.valley}. Pick a sortie, press Enter to fly.`);

  function handleActions() {
    const actions = input.takeActions();
    const picked = input.takeMissionSelect();
    if (picked >= 0 && screen === 'title') {
      selectedMission = MISSION_ORDER[picked];
      hud.setMission(selectedMission);
    }
    if (actions & ACTION_DROP) dropQueued = true;
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      hud.showBanner(muted ? 'SOUND OFF' : 'SOUND ON', '');
    }
    if (actions & ACTION_RESTART && screen !== 'title') startGame();
    else if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'over')) startGame();
    else if (actions & ACTION_PAUSE && screen === 'playing') {
      screen = 'paused';
      hud.showScreen('paused');
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'playing';
      hud.showScreen('playing');
      announce('Playing.');
    }
  }

  function step() {
    if (screen === 'title') {
      // Idle drift on the title screen: the plane sits on the runway, the
      // clouds move, the prop idles.
      state.throttle = 0;
      return;
    }
    const ctl = { ...input.controls(STEP), drop: dropQueued };
    dropQueued = false;
    const events = stepFlight(state, ctl, { rings: ringsMod.rings, mission: state.mission }, STEP);
    if (events & EVENT_TAKEOFF) {
      hud.showBanner(`AIRBORNE — ${missionById(state.mission).short}`, 'info');
      announce('Airborne.');
    }
    if (events & EVENT_RING) {
      hud.showBanner(`RING ${state.ringsPassed}! +${RINGS.points}`, 'ring');
      audio.ringChime();
      announce(`Ring ${state.ringsPassed} of ${RINGS.count}.`);
    }
    if (events & EVENT_DROP) {
      const lastDrop = state.dropResults[state.dropResults.length - 1];
      addCrate(state.lastDrop);
      hud.showBanner(lastDrop.points > 0 ? `CRATE ON TARGET — ${lastDrop.zone} +${lastDrop.points}` : `CRATE MISSED — ${lastDrop.zone}`, lastDrop.points > 0 ? 'ring' : 'warn');
      audio.ringChime();
    }
    if (events & EVENT_PICKUP) {
      hud.showBanner('HIKER ABOARD — FLY HOME', 'ring');
      audio.ringChime();
      announce('Hiker aboard. Fly back to the runway.');
    }
    if (events & EVENT_DAMAGE) {
      hud.showBanner(`AIRFRAME DAMAGE ${Math.round(state.damage)}% — FLY GENTLY`, 'warn');
    }
    if (events & EVENT_LOW_FUEL) {
      hud.showBanner('LOW FUEL — FLY A RING TO REFUEL', 'warn');
      audio.lowFuelBeep();
    }
    if (events & EVENT_LANDED) {
      hud.showBanner(`TOUCHDOWN! +${RINGS.landingBonus}`, 'ring');
      audio.touchdownThud();
      endGame();
    } else if (events & EVENT_CRASHED) {
      hud.showBanner('CRASHED', 'warn');
      audio.crashNoise();
      endGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'title' || screen === 'playing') {
      while (accumulator >= STEP && (screen === 'title' || screen === 'playing')) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderFrame(STEP);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'playing') {
      screen = 'paused';
      hud.showScreen('paused');
      announce('Paused.');
    }
  });

  hudRoot.addEventListener('flyagain', () => {
    if (screen === 'over') startGame();
  });

  hudRoot.addEventListener('missionpick', (event) => {
    if (screen === 'title') {
      selectedMission = missionById(event.detail).id;
      hud.setMission(selectedMission);
    }
  });

  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Exposed for play-testing from the console / CDP, never for gameplay.
window.__cloudrunner = {
  get state() { return state; },
  get screen() { return screen; },
  get best() { return best; },
  start: () => { if (screen === 'title' || screen === 'over') startGame(); },
};

if (shot) runShot(shot);
else runGame();

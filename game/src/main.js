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
import { createFlightState, stepFlight, forwardVector, EVENT_RING, EVENT_LANDED, EVENT_CRASHED, EVENT_TAKEOFF, EVENT_LOW_FUEL, EVENT_DROP, EVENT_PICKUP, EVENT_DAMAGE, EVENT_GATE, EVENT_PHOTO } from './physics.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE, ACTION_DROP } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createRings } from './rings.js';
import { stageShot } from './shots.js';
import { missionById, MISSION_ORDER, SETTING } from './missions.js';
import { STORM_TUNING } from './config.js';
import { loadDaylight, saveDaylight, applyDaylight, isNight, daylightById } from './daylight.js';
import { createPapi, updatePapi, createRunwayLights, updateRunwayLights, createLandingLight, updateLandingLight } from './papi.js';
import { gradeWords, approachGatePosition, PRECISION_TUNING } from './precision.js';
import { recordCampaignResult, MEDAL_NAMES } from './campaign.js';
import { checkAchievements, achievementContext } from './achievements.js';
import { createTutorial, tutorialTick, schoolResultLine, SCHOOL_STEP_POINTS, TUTORIAL_STEPS } from './tutorial.js';
import {
  createWeather, updateWeather, windVector, windKnots, windCompass,
  createWindSock, updateWindSock, createRain, updateRain, setRainVisible,
  createStormClouds, updateStormClouds, createLightning, updateLightning,
} from './weather.js';
import { recordFlight, loadLog, clearLog, logSummary, recentFlights } from './log.js';
import { planeById } from './planes.js';
import { createHeat, stepHeat, HEAT_EVENT_WARN, HEAT_EVENT_OVERHEAT, HEAT_EVENT_RECOVERED } from './heat.js';
import { createReconState, tryPhoto, stepRecon, createReconMarkers, updateReconMarkers, nextReconTarget, reconTargetInfo } from './recon.js';
import { createRadio, radioSay, radioTick, createRadioPanel, updateRadioPanel } from './radio.js';

const BEST_KEY = 'cloudrunner-best';
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = pickSeed(params.get('seed'));
const shotMission = missionById(params.get('mission')).id;
let selectedMission = shot ? shotMission : missionById(params.get('mission')).id;
let selectedPlane = 'kestrel';
let daylightId = loadDaylight();
let weather = createWeather(seed, selectedMission);

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
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6f8f5a, 0.9);
scene.add(hemi);

// Sun disc low on the horizon, in the direction of the light.
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(90, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }),
);
sunDisc.position.set(-1800, 420, 1200);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);

// --- Time of day and approach lighting -----------------------------------
// The hour paints the whole valley (daylight.js owns the palette); the
// PAPI reads the glide slope, the runway edge lights carry the strip at
// night, and the landing light rides the nose. The gold approach gate
// hangs on the 3-degree slope south of the threshold, for Precision
// Landing only — hidden in every other mission.
applyDaylight(daylightId, { scene, sun, sunDisc, hemi, skyMat });
const papi = createPapi();
scene.add(papi.group);
const runwayLights = createRunwayLights();
scene.add(runwayLights.group);
const landingLight = createLandingLight();
scene.add(landingLight.light);
scene.add(landingLight.target);
const gateGeo = new THREE.TorusGeometry(PRECISION_TUNING.gateRadius, 1.1, 10, 40);
const gateMat = new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.9 });
const gateMesh = new THREE.Mesh(gateGeo, gateMat);
gateMesh.position.copy(approachGatePosition());
gateMesh.visible = selectedMission === 'precision';
scene.add(gateMesh);

// A mission can ask for an hour: Precision Landing always flies at night.
function applyMissionDaylight(missionId) {
  const wanted = missionById(missionId).daylight;
  if (!wanted) return;
  daylightId = daylightById(wanted).id;
  saveDaylight(daylightId);
  applyDaylight(daylightId, { scene, sun, sunDisc, hemi, skyMat });
  hud.setDaylight(daylightId);
}

// --- Weather dressing ------------------------------------------------------
// A windsock by the runway that reads the live wind, rain that falls only
// in the Storm Run, and a low dark storm layer that rides the wind.
const windSock = createWindSock();
windSock.group.position.set(46, 2, -150);
scene.add(windSock.group);
const rain = createRain();
scene.add(rain.points);
const stormClouds = createStormClouds(seed);
scene.add(stormClouds.group);
const lightning = createLightning(seed);

function applyWeatherVisuals() {
  setRainVisible(rain, weather.storm);
  stormClouds.group.visible = weather.storm;
  gateMesh.visible = selectedMission === 'precision';
}
applyWeatherVisuals();

// --- World -----------------------------------------------------------------
const terrain = createTerrain(seed);
scene.add(terrain.group);
const ringsMod = createRings(seed);
scene.add(ringsMod.group);
let aircraft = createAircraft(selectedPlane);
scene.add(aircraft.group);

// Swap the hangar choice: pull the old plane out, put the new one in.
function swapPlane(planeId) {
  scene.remove(aircraft.group);
  aircraft = createAircraft(planeId);
  scene.add(aircraft.group);
}

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 7000);
camera.position.set(0, 12, 200);

const hud = createHud(hudRoot);
const audio = createAudio();
applyMissionDaylight(selectedMission);

let state = createFlightState(selectedMission, selectedPlane);
let screen = 'title';
let best = readBest();
hud.setBest(best);
hud.setMission(selectedMission);

// v5 systems: engine heat, the Photo Recon targets, and the tower radio.
// Heat and recon ride on the flight state so the HUD reads them straight
// off it; the radio keeps its own log and paints its own panel.
let heat = createHeat();
let recon = createReconState();
let radio = createRadio();
state.heat = heat;
state.recon = recon;
const reconMarkers = createReconMarkers();
scene.add(reconMarkers.group);
const radioPanel = createRadioPanel(hudRoot);

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

function overData(extra = {}) {
  const landed = state.landed;
  const mission = missionById(state.mission);
  let reason;
  if (landed) {
    reason = state.landedClean ? 'A smooth touchdown on the runway.' : 'Down on the runway — a little rough, but you walked away.';
    if (state.mission === 'cargo') reason += ` ${state.cratesDropped} of 3 crates dropped.`;
    if (state.mission === 'rescue') reason += state.rescued ? ' Hiker aboard, safe home.' : ' The hiker is still waiting at the hut.';
    if (state.mission === 'sprint' && state.timeBonus > 0) reason += ` Beat the par by ${Math.round(state.timeBonus / 5)}s: +${state.timeBonus} time bonus.`;
    if (state.mission === 'storm' && state.timeBonus > 0) reason += ` Beat the storm par by ${Math.round(state.timeBonus / 6)}s: +${state.timeBonus} time bonus.`;
    if (state.mission === 'storm') reason += ' Flown through the storm — gusts, rain and all.';
    if (state.mission === 'precision' && state.landingGrade) reason += ` ${gradeWords(state.landingGrade)}`;
    if (state.mission === 'school') reason += ` ${schoolResultLine(tutorial, true)}`;
    if (state.mission === 'recon') reason += recon.done ? ` All four landmarks photographed — the valley, on film.` : ` ${recon.photos.length} of 4 landmarks photographed.`;
    if (heat.max >= 85) reason += ` Engine peaked at ${Math.round(heat.max)} heat${heat.overheatedEver ? ' — it overheated and you still brought her home.' : '.'}`;
    if (extra.tour && extra.tour.improved) reason += ` Valley Tour: new ${MEDAL_NAMES[extra.tour.earned]} medal for ${mission.name}.`;
    if (extra.newly && extra.newly.length) reason += ` Achievements: ${extra.newly.map((a) => a.name).join(', ')}.`;
    if (state.damage >= 60) reason += ' The airframe needs work after that one.';
  } else {
    reason = state.crashReason || 'The sortie is over.';
    if (state.mission === 'school') reason += ` ${schoolResultLine(tutorial, false)}`;
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

// Shared per-tick bookkeeping for the live game and the screenshot
// stager alike: the Flight School coach advances (each finished lesson
// step pays) and achievements are checked the moment they happen, so a
// feat is toasted in the frame it happens, not at the end of the sortie.
let tutorial = createTutorial();
function noteFlightEvent(events) {
  if (state.mission === 'school' && !state.landed && !state.crashed) {
    const before = tutorial.step;
    const current = tutorialTick(tutorial, state, events);
    if (current.index > before) {
      const gained = (current.index - before) * SCHOOL_STEP_POINTS;
      state.score += gained;
      hud.showBanner(`LESSON STEP ${current.index}/${current.total} +${gained}`, 'ring');
    }
    state.coachLine = current.finished
      ? 'Lesson complete — bring her home and land.'
      : `${current.coach}`;
  }
  const newly = [];
  if (events & EVENT_RING) newly.push(...checkAchievements('ring', achievementContext(state)));
  if (events & EVENT_DROP) newly.push(...checkAchievements('drop', achievementContext(state)));
  if (events & EVENT_PICKUP) newly.push(...checkAchievements('pickup', achievementContext(state)));
  if (events & EVENT_PHOTO) newly.push(...checkAchievements('photo', achievementContext(state, { photosTaken: recon.photos.length })));
  for (const a of newly) hud.toastAchievement(a);
}

// v5 per-tick systems, shared by the live loop and the screenshot
// stager's facade step: engine heat (with its throttle clamp and
// overheat damage), the recon camera (C shoots in Photo Recon), and
// the tower radio (which speaks for the events of this tick). Returns
// the events bitmask with EVENT_PHOTO added when a picture lands, and
// the heat flags for the caller's banners.
function stepV5Systems(events, ctl, dt) {
  const heatResult = stepHeat(heat, state, dt);
  if (heatResult.damage > 0) {
    state.damage = Math.min(100, state.damage + heatResult.damage);
  }
  if (heat.overheat) {
    // Power out: the throttle cannot stay up while the engine cooks.
    state.throttle = Math.min(state.throttle, 0.35);
  }
  stepRecon(recon, dt);
  let photo = null;
  if (ctl.drop && state.mission === 'recon' && state.airborne && !state.landed && !state.crashed) {
    photo = tryPhoto(recon, state);
    if (photo) {
      state.score += photo.points;
      events |= EVENT_PHOTO;
    }
  }
  radioTick(radio, events, {
    heatWarn: (heatResult.events & HEAT_EVENT_WARN) !== 0,
    overheat: (heatResult.events & HEAT_EVENT_OVERHEAT) !== 0,
    recovered: (heatResult.events & HEAT_EVENT_RECOVERED) !== 0,
    photo: photo !== null,
  });
  return { events, heatEvents: heatResult.events, photo };
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
  updateWindSock(windSock, weather);
  if (weather.storm) {
    updateRain(rain, state.position, dt);
    updateStormClouds(stormClouds, weather, dt);
    updateLightning(lightning, dt, true);
  } else {
    updateLightning(lightning, dt, false);
  }
  state.lightningFlash = lightning.flash;
  // The wind gauge reads the live weather, straight off the flight state.
  state.wind = { knots: windKnots(weather), dir: windCompass(weather).label };
  // Approach lighting: the PAPI reads the live glide slope, the runway
  // lights and the landing light follow the hour, and the gold gate
  // pulses when it is the mission's target.
  hud.setPapi(updatePapi(papi, state));
  updateRunwayLights(runwayLights, isNight(daylightId));
  updateLandingLight(landingLight, state, isNight(daylightId));
  if (gateMesh.visible) gateMat.opacity = 0.7 + 0.25 * Math.sin(state.time * 5);
  ringsMod.update(state.ringsPassed, state.time);
  // v5 dressing: the gold recon beacons only show in Photo Recon, and
  // the next one pulses; the radio panel paints the last three calls.
  reconMarkers.group.visible = state.mission === 'recon';
  if (reconMarkers.group.visible) updateReconMarkers(reconMarkers, recon, state.time);
  updateRadioPanel(radioPanel, radio);
  poseAircraft(aircraft, state, dt);
  updateCamera(dt);
  hud.update(state, ringInfo(), dt, ringsMod.rings);
  audio.update(state);
  renderer.render(scene, camera);
}

// --- Game flow ---------------------------------------------------------------
function resetWorld(mission = selectedMission) {
  state = createFlightState(mission, selectedPlane);
  weather = createWeather(seed, mission);
  applyWeatherVisuals();
  tutorial = createTutorial();
  // v5 systems reset with the sortie: a cool engine, four fresh
  // landmarks to photograph, and a quiet radio.
  heat = createHeat();
  recon = createReconState();
  radio = createRadio();
  state.heat = heat;
  state.recon = recon;
  updateReconMarkers(reconMarkers, recon, 0);
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
  radioSay(radio, 'KESTREL TOWER', `Kestrel-7, ${missionById(state.mission).name} — wind ${windKnots(weather)} knots. Have a good one.`);
  announce(`Flying ${missionById(state.mission).name} over ${SETTING.valley}.`);
}

function endGame() {
  screen = 'over';
  if (state.score > best) {
    best = state.score;
    saveBest(best);
  }
  // The Pilot Log remembers every sortie, win or wreck.
  recordFlight({
    mission: state.mission,
    plane: state.plane,
    score: state.score,
    time: state.time,
    rings: state.ringsPassed,
    landed: state.landed,
    crashed: state.crashed,
    damage: state.damage,
  });
  // The Valley Tour takes the medal for this sortie, and the achievements
  // the flight earned are checked last — the 'end' checks read the log
  // count and the medal just earned.
  const tour = recordCampaignResult(state.mission, state.score, state.landed);
  const logFlights = loadLog().length;
  // v5 facts for the end checks: how hot the engine got, whether it
  // overheated, and how many landmarks were photographed.
  const endExtra = {
    logFlights,
    medalEarned: tour.earned,
    heatMax: Math.round(heat.max),
    overheated: heat.overheatedEver,
    photosTaken: recon.photos.length,
  };
  const newly = checkAchievements('end', achievementContext(state, endExtra));
  for (const a of newly) hud.toastAchievement(a);
  hud.showScreen('over', overData({ tour, newly }));
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
    updateWeather(weather, dt);
    let events = stepFlight(state, ctl, { rings: ringsMod.rings, mission: state.mission, wind: windVector(weather) }, dt);
    const v5 = stepV5Systems(events, ctl, dt);
    events = v5.events;
    noteFlightEvent(events);
    if (events & EVENT_RING) {
      hud.showBanner(`RING ${state.ringsPassed}! +${RINGS.points}`, 'ring');
      audio.ringChime();
    }
    if (events & EVENT_GATE) {
      hud.showBanner(`APPROACH GATE +${PRECISION_TUNING.gateBonus}`, 'ring');
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
    if (v5.photo) {
      hud.showBanner(`${v5.photo.quality} — ${v5.photo.name} +${v5.photo.points}`, 'ring');
      audio.ringChime();
    }
    if (v5.heatEvents & HEAT_EVENT_OVERHEAT) {
      hud.showBanner('ENGINE OVERHEAT — POWER OUT', 'warn');
    } else if (v5.heatEvents & HEAT_EVENT_WARN) {
      hud.showBanner('ENGINE HOT — EASE OFF THE THROTTLE', 'warn');
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
    if (state.mission === 'recon') {
      // A staged finished recon: all four landmarks photographed, each
      // a clean shot, so the end screen shows the full set.
      for (const target of recon.targets) {
        if (!target.photographed) {
          target.photographed = true;
          target.points = 120;
          recon.photos.push({ name: target.name, points: 120, quality: 'CLEAN SHOT' });
        }
      }
      recon.done = true;
      state.score += recon.photos.reduce((sum, p) => sum + p.points, 0);
    }
    if (state.mission === 'sprint') {
      state.timeBonus = 150;
      state.score += 150;
    }
    if (state.mission === 'storm') {
      state.timeBonus = 120;
      state.score += 120;
    }
    if (state.mission === 'school') {
      // The lesson steps the autopilot did not finish yet pay out here,
      // so the staged finish shows a completed lesson, not a half one.
      const remaining = Math.max(0, TUTORIAL_STEPS.length - tutorial.step);
      state.score += remaining * SCHOOL_STEP_POINTS;
      tutorial.step = TUTORIAL_STEPS.length;
    }
    if (state.mission === 'precision') {
      // A staged perfect landing: through the gate, grade A, in the zone.
      state.gatePassed = true;
      state.score += PRECISION_TUNING.gateBonus;
      state.landingGrade = {
        vsScore: 100, centreScore: 100, speedScore: 100, grade: 100, letter: 'A',
        inZone: true, bonus: PRECISION_TUNING.maxGradeBonus,
        verticalSpeed: 2.5, centreline: 1, speed: 43, along: 100,
      };
      state.score += state.landingGrade.bonus;
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
  hud.setPlane(selectedPlane);
  announce(`Cloudrunner over ${SETTING.valley}. Pick a sortie, press Enter to fly.`);

  // The Pilot Log is an overlay on the title screen: Enter closes it
  // instead of starting a sortie while it is open.
  let logOpen = false;

  function handleActions() {
    const actions = input.takeActions();
    const picked = input.takeMissionSelect();
    if (picked >= 0 && screen === 'title') {
      selectedMission = MISSION_ORDER[picked];
      weather = createWeather(seed, selectedMission);
      applyWeatherVisuals();
      applyMissionDaylight(selectedMission);
      hud.setMission(selectedMission);
    }
    if (actions & ACTION_DROP) dropQueued = true;
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      hud.showBanner(muted ? 'SOUND OFF' : 'SOUND ON', '');
    }
    if (actions & ACTION_CONFIRM && logOpen) {
      logOpen = false;
      hud.showScreen('title');
    } else if (actions & ACTION_RESTART && screen !== 'title') startGame();
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
    updateWeather(weather, STEP);
    let events = stepFlight(state, ctl, { rings: ringsMod.rings, mission: state.mission, wind: windVector(weather) }, STEP);
    const v5 = stepV5Systems(events, ctl, STEP);
    events = v5.events;
    noteFlightEvent(events);
    if (v5.photo) {
      hud.showBanner(`${v5.photo.quality} — ${v5.photo.name} +${v5.photo.points}`, 'ring');
      audio.ringChime();
      announce(`Photographed ${v5.photo.name}. ${recon.photos.length} of 4.`);
    }
    if (v5.heatEvents & HEAT_EVENT_OVERHEAT) {
      hud.showBanner('ENGINE OVERHEAT — POWER OUT', 'warn');
      announce('Engine overheated. Power is out — glide her cool.');
    } else if (v5.heatEvents & HEAT_EVENT_WARN) {
      hud.showBanner('ENGINE HOT — EASE OFF THE THROTTLE', 'warn');
    } else if (v5.heatEvents & HEAT_EVENT_RECOVERED) {
      hud.showBanner('ENGINE COOL — POWER BACK', 'info');
    }
    if (events & EVENT_TAKEOFF) {
      hud.showBanner(`AIRBORNE — ${missionById(state.mission).short}`, 'info');
      announce('Airborne.');
    }
    if (events & EVENT_RING) {
      hud.showBanner(`RING ${state.ringsPassed}! +${RINGS.points}`, 'ring');
      audio.ringChime();
      announce(`Ring ${state.ringsPassed} of ${RINGS.count}.`);
    }
    if (events & EVENT_GATE) {
      hud.showBanner(`APPROACH GATE +${PRECISION_TUNING.gateBonus}`, 'ring');
      audio.ringChime();
      announce('Approach gate flown. Now land in the touchdown zone.');
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
      weather = createWeather(seed, selectedMission);
      applyWeatherVisuals();
      applyMissionDaylight(selectedMission);
      hud.setMission(selectedMission);
    }
  });

  hudRoot.addEventListener('daylightpick', (event) => {
    daylightId = daylightById(event.detail).id;
    saveDaylight(daylightId);
    applyDaylight(daylightId, { scene, sun, sunDisc, hemi, skyMat });
    announce(`Time of day: ${daylightById(daylightId).name}.`);
  });

  hudRoot.addEventListener('planepick', (event) => {
    if (screen === 'title') {
      selectedPlane = planeById(event.detail).id;
      swapPlane(selectedPlane);
      hud.setPlane(selectedPlane);
      announce(`Flying the ${planeById(selectedPlane).name}.`);
    }
  });

  hudRoot.addEventListener('logopen', () => {
    if (screen === 'title') {
      logOpen = true;
      const log = loadLog();
      hud.showScreen('log', null, { summary: logSummary(log), recent: recentFlights(log) });
      announce('Pilot Log open.');
    }
  });

  hudRoot.addEventListener('logclear', () => {
    clearLog();
    const log = loadLog();
    hud.showScreen('log', null, { summary: logSummary(log), recent: recentFlights(log) });
    announce('Pilot Log cleared.');
  });

  hudRoot.addEventListener('logback', () => {
    if (screen === 'title') {
      logOpen = false;
      hud.showScreen('title');
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

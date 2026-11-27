// Cloudrunner — time of day: dawn, golden hour, dusk and night over
// Kestrel Valley. One job: know what the sky, the sun and the light look
// like at a chosen hour, and apply it to the scene — so the same valley
// reads four different ways, and night flying is a real thing: the runway
// lights and the PAPI glow, the nav lights carry, and the pilot lands by
// instruments and light, not by daylight.
//
// The presets are plain data (colours as hex, sun as a direction), so the
// renderer in main.js stays the one place that touches the scene: this
// module only answers "what should it look like now?". The pilot's choice
// survives between visits in localStorage; missions can ask for a default
// (Precision Landing always flies at night).
import * as THREE from 'three';

const DAYLIGHT_KEY = 'cloudrunner-daylight';

// Sun elevation is a direction, not a clock: x/z place it around the
// valley, y lifts it. Golden hour keeps the low warm sun v3 shipped with;
// dawn lifts it a little cooler, dusk drops it red on the far ridge, and
// night puts the moon high and the valley in blue dark.
export const DAYLIGHT_PRESETS = {
  dawn: {
    id: 'dawn',
    name: 'Dawn',
    short: 'DAWN',
    tagline: 'First light — cool air, long shadows, the valley waking up.',
    sunPosition: [-900, 260, 700],
    sunColor: 0xffd9a0,
    sunIntensity: 1.7,
    hemiSky: 0xa8c8e8,
    hemiGround: 0x5a6b52,
    hemiIntensity: 0.7,
    skyTop: 0x6fa8dc,
    skyMid: 0xf2d5a8,
    skyLow: 0xffb27a,
    fogColor: 0xeec9a0,
    fogNear: 800,
    fogFar: 2800,
    sunDiscColor: 0xfff6d8,
    night: false,
  },
  golden: {
    id: 'golden',
    name: 'Golden Hour',
    short: 'GOLDEN',
    tagline: 'Late sun, warm haze — the valley as the posters show it.',
    sunPosition: [-600, 500, 400],
    sunColor: 0xffe0b0,
    sunIntensity: 2.4,
    hemiSky: 0xbfd9ff,
    hemiGround: 0x6f8f5a,
    hemiIntensity: 0.9,
    skyTop: 0x7fb4e8,
    skyMid: 0xf7c489,
    skyLow: 0xff9e5e,
    fogColor: 0xf2c184,
    fogNear: 700,
    fogFar: 2600,
    sunDiscColor: 0xfff2c8,
    night: false,
  },
  dusk: {
    id: 'dusk',
    name: 'Dusk',
    short: 'DUSK',
    tagline: 'The sun is down behind the west ridge — red sky, dark ground.',
    sunPosition: [-1400, 120, 900],
    sunColor: 0xff8a4a,
    sunIntensity: 1.3,
    hemiSky: 0x7a6a9a,
    hemiGround: 0x4a4038,
    hemiIntensity: 0.55,
    skyTop: 0x2e3a6e,
    skyMid: 0xe86a4a,
    skyLow: 0xff7a3c,
    fogColor: 0xc98a6a,
    fogNear: 600,
    fogFar: 2200,
    sunDiscColor: 0xffb27a,
    night: false,
  },
  night: {
    id: 'night',
    name: 'Night',
    short: 'NIGHT',
    tagline: 'Moonlight and runway lights — fly the PAPI down, not the view.',
    sunPosition: [500, 900, -600],
    sunColor: 0x9ab8e8,
    sunIntensity: 0.7,
    hemiSky: 0x2a3a5e,
    hemiGround: 0x1a2028,
    hemiIntensity: 0.4,
    skyTop: 0x060a18,
    skyMid: 0x101a33,
    skyLow: 0x1c2a4a,
    fogColor: 0x0e1626,
    fogNear: 500,
    fogFar: 1800,
    sunDiscColor: 0xe8f0ff,
    night: true,
  },
};

export const DAYLIGHT_ORDER = ['dawn', 'golden', 'dusk', 'night'];

export function daylightById(id) {
  return DAYLIGHT_PRESETS[id] ?? DAYLIGHT_PRESETS.golden;
}

// The pilot's saved hour, or golden hour when nothing is saved yet.
export function loadDaylight() {
  try {
    const saved = window.localStorage.getItem(DAYLIGHT_KEY);
    if (saved && DAYLIGHT_PRESETS[saved]) return saved;
  } catch {
    // Storage off: golden hour it is.
  }
  return 'golden';
}

export function saveDaylight(id) {
  try {
    window.localStorage.setItem(DAYLIGHT_KEY, daylightById(id).id);
  } catch {
    // Storage off: the choice lasts this visit only.
  }
}

// Apply a preset to the scene pieces main.js owns: the gradient sky dome,
// the sun and its disc, the hemisphere fill, the fog, and the page
// background behind the canvas. Colours are set in place — no new objects,
// so switching hour mid-flight is just a repaint.
export function applyDaylight(presetId, sceneParts) {
  const preset = daylightById(presetId);
  const { scene, sun, sunDisc, hemi, skyMat } = sceneParts;
  if (sun) {
    sun.position.set(preset.sunPosition[0], preset.sunPosition[1], preset.sunPosition[2]);
    sun.color.setHex(preset.sunColor);
    sun.intensity = preset.sunIntensity;
  }
  if (hemi) {
    hemi.color.setHex(preset.hemiSky);
    hemi.groundColor.setHex(preset.hemiGround);
    hemi.intensity = preset.hemiIntensity;
  }
  if (skyMat) {
    skyMat.uniforms.top.value.setHex(preset.skyTop);
    skyMat.uniforms.mid.value.setHex(preset.skyMid);
    skyMat.uniforms.low.value.setHex(preset.skyLow);
  }
  if (scene) {
    scene.fog.color.setHex(preset.fogColor);
    scene.fog.near = preset.fogNear;
    scene.fog.far = preset.fogFar;
  }
  if (sunDisc) {
    sunDisc.material.color.setHex(preset.sunDiscColor);
    // The disc sits where the sun is, far out so it reads on the horizon.
    const dir = new THREE.Vector3(...preset.sunPosition).normalize();
    sunDisc.position.copy(dir.multiplyScalar(1800));
    sunDisc.position.y = Math.max(120, sunDisc.position.y);
    sunDisc.lookAt(0, 0, 0);
  }
  return preset;
}

// Is this hour a night one — the hour the runway lights, the PAPI and the
// landing light switch on for?
export function isNight(presetId) {
  return daylightById(presetId).night;
}

// One line per preset for the title-screen picker.
export function daylightCard(id) {
  const preset = daylightById(id);
  return { id: preset.id, name: preset.name, short: preset.short, tagline: preset.tagline };
}

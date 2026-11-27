// Cloudrunner — weather: valley wind, gusts, rain and storm cloud.
// One job: know the wind at any moment and show it (HUD gauge, windsock,
// drifting storm cloud, rain), and push the plane around for real — the
// wind drifts the aircraft and nudges its heading, so a storm sortie
// flies differently from a calm one.
//
// The wind is deterministic for a flight: a steady base flow plus gusts
// built from sines of flight time, so the same seed and the same flight
// time always give the same wind.
import * as THREE from 'three';
import { createRandom, STORM_TUNING, CALM_WIND } from './config.js';

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createWeather(seed, mission = 'ring-run') {
  const random = createRandom(seed ^ 0x9e3779b9);
  const storm = mission === 'storm';
  // Base flow: a unit vector in a seeded direction, so every seed blows
  // somewhere different but the same seed always blows the same way.
  let bx = random() * 2 - 1;
  let bz = random() * 2 - 1;
  const len = Math.hypot(bx, bz) || 1;
  bx /= len;
  bz /= len;
  return {
    mission,
    storm,
    time: 0,
    baseSpeed: storm ? STORM_TUNING.windBase : CALM_WIND.base,
    baseX: bx,
    baseZ: bz,
    gustAmp: storm ? STORM_TUNING.gustAmp : CALM_WIND.gustAmp,
    gustPhase1: random() * Math.PI * 2,
    gustPhase2: random() * Math.PI * 2,
    gustFreq1: 0.11 + random() * 0.08, // Hz — the fast chop
    gustFreq2: 0.031 + random() * 0.03, // Hz — the slow swell
    swingPhase: random() * Math.PI * 2,
    rain: storm,
    wind: { x: 0, z: 0 },
    windSpeed: 0,
  };
}

// Advance the weather by dt seconds and recompute the wind vector: the
// base flow, gusting in strength, slowly swinging direction in a storm.
export function updateWeather(w, dt) {
  w.time += dt;
  const gust = w.gustAmp * (
    0.6 * Math.sin(w.gustPhase1 + w.time * w.gustFreq1 * Math.PI * 2)
    + 0.4 * Math.sin(w.gustPhase2 + w.time * w.gustFreq2 * Math.PI * 2)
  );
  const speed = Math.max(0, w.baseSpeed + gust);
  w.windSpeed = speed;
  // In a storm the flow swings ±17° over ~2 minutes; in calm air it holds.
  const swing = w.storm ? 0.3 * Math.sin(w.swingPhase + w.time * 0.05) : 0;
  const cos = Math.cos(swing);
  const sin = Math.sin(swing);
  const ux = w.baseX * cos - w.baseZ * sin;
  const uz = w.baseX * sin + w.baseZ * cos;
  w.wind.x = ux * speed;
  w.wind.z = uz * speed;
  return w.wind;
}

export function windVector(w) {
  return w.wind;
}

export function windKnots(w) {
  return Math.round(w.windSpeed * 1.944);
}

// Where the wind blows FROM, as a compass heading (0 = N, 90 = E).
export function windCompass(w) {
  const deg = (((Math.atan2(-w.wind.x, w.wind.z) * 180) / Math.PI) % 360 + 360) % 360;
  return { degrees: Math.round(deg), label: COMPASS_POINTS[Math.round(deg / 45) % 8] };
}

// A windsock by the runway that points downwind and flies flat in a
// strong wind, hangs in calm air.
export function createWindSock() {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 6), poleMat);
  pole.position.y = 7;
  group.add(pole);
  const pivot = new THREE.Group();
  pivot.position.y = 14;
  const sockMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 8), sockMat);
  cone.rotation.z = -Math.PI / 2; // cone points +X
  cone.position.x = 3.5;
  pivot.add(cone);
  group.add(pivot);
  return { group, pivot, cone };
}

export function updateWindSock(sock, w) {
  const speed = w.windSpeed;
  // Pivot +X onto the wind's travel direction.
  sock.pivot.rotation.y = Math.atan2(-w.wind.z, w.wind.x);
  // Calm air: the sock hangs; strong wind: it flies flat.
  const droop = 0.55 * (1 - Math.min(1, speed / 12));
  sock.cone.rotation.z = -Math.PI / 2 - droop;
}

// Rain: a box of falling streaks that follows the plane, visible only in
// the storm. The streaks are visual; the wind is what moves the plane.
export function createRain(count = 700) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 140;
    positions[i * 3 + 1] = Math.random() * 70;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 140;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9fc4e8, size: 0.5, transparent: true, opacity: 0.75, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  return { points, count, fallSpeed: 55 };
}

export function updateRain(rain, centre, dt) {
  const pos = rain.points.geometry.attributes.position;
  for (let i = 0; i < rain.count; i += 1) {
    let y = pos.getY(i) - rain.fallSpeed * dt;
    if (y < -5) y = 65;
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  rain.points.position.set(centre.x, centre.y - 10, centre.z);
}

export function setRainVisible(rain, on) {
  rain.points.visible = on;
}

// Storm cloud: a low, dark layer riding the wind over the valley, only
// in the Storm Run. Fair-weather cloud stays where it is.
export function createStormClouds(seed) {
  const random = createRandom(seed ^ 0x51ab3c);
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x556270, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const r = 20 + random() * 26;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
      puff.position.set((random() - 0.5) * 90, (random() - 0.5) * 12, (random() - 0.5) * 40);
      puff.scale.y = 0.4;
      cloud.add(puff);
    }
    cloud.position.set(
      (random() - 0.5) * 2400,
      120 + random() * 70,
      (random() - 0.5) * 2400,
    );
    cloud.userData.drift = 6 + random() * 8;
    clouds.push(cloud);
    group.add(cloud);
  }
  group.visible = false;
  return { group, clouds };
}

export function updateStormClouds(sc, w, dt) {
  // Storm cloud rides the wind downwind, faster than fair-weather cloud.
  for (const cloud of sc.clouds) {
    const k = (cloud.userData.drift / 10) * 0.9;
    cloud.position.x += w.wind.x * k * dt;
    cloud.position.z += w.wind.z * k * dt;
    if (cloud.position.x > 1300) cloud.position.x = -1300;
    if (cloud.position.x < -1300) cloud.position.x = 1300;
    if (cloud.position.z > 1300) cloud.position.z = -1300;
    if (cloud.position.z < -1300) cloud.position.z = 1300;
  }
}

// Lightning: in the storm, the sky flashes every few seconds — a white
// blink over the whole view, no damage, just weather with teeth. The
// strike timer is seeded so a storm always flashes, never on a schedule
// the pilot can set a watch by.
export function createLightning(seed) {
  const random = createRandom(seed ^ 0x1eaf);
  return {
    nextStrike: 3 + random() * 5, // seconds to the first flash
    flash: 0, // 1 at the strike, fading to 0
    strikes: 0,
  };
}

export function updateLightning(L, dt, storm) {
  if (!storm) {
    L.flash = 0;
    return false;
  }
  L.nextStrike -= dt;
  if (L.nextStrike <= 0) {
    L.flash = 1;
    L.strikes += 1;
    L.nextStrike = 5 + Math.random() * 9; // next flash in 5–14 s
    return true;
  }
  // The flash fades fast — a blink, not a floodlight.
  L.flash = Math.max(0, L.flash - dt * 2.5);
  return false;
}

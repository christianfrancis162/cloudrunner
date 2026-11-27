// Cloudrunner — shared tuning constants and the seeded RNG.
// One job: every number the rest of the game agrees on lives here.
export const STEP = 1 / 60;
export const WORLD = {
  size: 2600, // valley is a square, side in metres, centred on the airfield
  mountainHeight: 520,
  hillHeight: 90,
  runwayLength: 420,
  runwayWidth: 26,
  runwayHeading: 0, // runway runs north (+Z is south in world space; see terrain.js)
};

export const PLANE = {
  minSpeed: 26, // m/s — below this the wing stops flying and the nose drops
  maxSpeed: 95,
  cruiseThrottle: 0.62,
  accel: 26, // m/s^2 at full throttle
  drag: 0.012,
  pitchRate: 1.15, // rad/s at full stick
  rollRate: 2.4,
  yawFromBank: 0.55, // turn rate per radian of bank
  maxBank: 1.1,
  fuelCapacity: 100,
  fuelBurn: 1.6, // units/s at full throttle
  ringFuelBonus: 12,
  crashSpeed: 14, // vertical speed (m/s) above which a touchdown is a crash
  hardImpact: 6, // vertical speed that starts adding damage
  // Damage model: a battered airframe flies worse, so damage is a decision,
  // not just a number. Handling authority and top speed fall as damage
  // rises; at 100 the airframe gives out.
  damageHandling: 0.45, // fraction of handling lost at 100 damage
  damageSpeedLoss: 0.18, // fraction of top speed lost at 100 damage
  hardTouchdownDamage: 8, // base damage for a hard (but survivable) touchdown
  grazeDamage: 10, // base damage for scraping terrain without crashing
};

export const MISSION_TUNING = {
  sprintPar: 150, // seconds: Timed Sprint par time; each second under pays +5
  sprintBonusPerSecond: 5,
  rescuePickupBonus: 300,
  pickupHoldSeconds: 3, // stopped on the hut pad this long to board the hiker
  dropCooldown: 1.5, // seconds between crate drops
};

// Weather: a calm valley breeze most days; the Storm Run is another valley.
export const CALM_WIND = {
  base: 4, // m/s steady breeze
  gustAmp: 3, // m/s gust swing
};

export const STORM_TUNING = {
  par: 120, // seconds: Storm Run par time; each second under pays +6
  bonusPerSecond: 6,
  windBase: 14, // m/s steady storm wind
  gustAmp: 9, // m/s gust swing in the storm
  rain: true,
};

export const RINGS = {
  count: 8,
  radius: 11,
  points: 100,
  landingBonus: 250,
  timeBonusPerSecond: 2,
};

export const SCORE = {
  ring: 100,
  landing: 250,
};

// Deterministic RNG (mulberry32) so a seed always builds the same valley,
// the same ring course and the same screenshots.
export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickSeed(param) {
  const n = Number.parseInt(param ?? '', 10);
  return Number.isInteger(n) ? n : Math.floor(Math.random() * 4294967296);
}

// Cloudrunner — precision landing: the approach gate and the landing
// grade. One job: say how good a touchdown was, in numbers the pilot can
// read — vertical speed, centreline, speed — and turn it into a grade
// and a score, so landing well is a skill with a payoff, not just a way
// to end the sortie.
//
// The Precision Landing mission flies at night, through one approach gate
// on the 3-degree glide slope, then down onto a marked touchdown zone on
// the runway. The grade is pure arithmetic on the touchdown state, so the
// same landing always grades the same: each of the three measures scores
// 0–100, the grade is their mean, and the mission bonus pays the grade.
//
// The gate is a ring like the course rings, hung on the glide slope 300 m
// out from the threshold at the slope height, so the pilot flies the PAPI
// down through it.
import * as THREE from 'three';
import { WORLD, PLANE } from './config.js';
import { groundHeight } from './terrain.js';
import { GLIDE_SLOPE_DEGREES } from './papi.js';

export const PRECISION_TUNING = {
  gateDistance: 300, // metres before the threshold, on the glide slope
  gateRadius: 14, // a wider ring than the course rings: it is a gate, not a test
  gateBonus: 150, // flying the gate pays, on top of the landing grade
  touchdownZoneStart: 30, // metres past the threshold: the zone starts here
  touchdownZoneEnd: 170, // and ends here — long landings overshoot it
  maxGradeBonus: 400, // a perfect landing pays this on top of the landing bonus
  parTime: null,
};

// Where the approach gate hangs: on the 3-degree slope, gateDistance out
// from the threshold — south of it, since the landing runs north. The
// height is measured from the threshold's elevation, not the local
// ground, so the gate sits exactly on the slope the PAPI reads: fly the
// PAPI down and the gate is where the lights say it is. The floor of
// local ground + 8 m keeps the ring clear of the terrain underneath.
export function approachGatePosition() {
  const thresholdZ = WORLD.runwayLength / 2;
  const slope = (GLIDE_SLOPE_DEGREES * Math.PI) / 180;
  const thresholdHeight = groundHeight(0, thresholdZ) + 1.3;
  const slopeHeight = thresholdHeight + Math.tan(slope) * PRECISION_TUNING.gateDistance;
  const gateZ = thresholdZ + PRECISION_TUNING.gateDistance;
  const ground = groundHeight(0, gateZ);
  return new THREE.Vector3(0, Math.max(slopeHeight, ground + 8), gateZ);
}

// Score one measure 0–100: full marks inside the good band, falling
// linearly to zero at the edge of the acceptable band.
function bandScore(value, good, edge) {
  if (value <= good) return 100;
  if (value >= edge) return 0;
  return Math.round(100 * (1 - (value - good) / (edge - good)));
}

// Grade a touchdown. `touch` is the landing state at the moment the
// wheels touch: vertical speed (m/s down), centreline offset (m),
// speed (m/s), and where along the runway the wheels touched (m past the
// threshold). Returns the three sub-scores, the mean grade, a letter, and
// the bonus the grade pays.
export function gradeLanding(touch) {
  const vs = Math.max(0, touch.verticalSpeed);
  const centre = Math.abs(touch.centreline);
  const speed = touch.speed;
  // A gentle touchdown: under 3 m/s down is perfect, over 8 is a slam.
  const vsScore = bandScore(vs, 3, 8);
  // On the centreline: within 3 m is perfect, past 12 m is off the strip.
  const centreScore = bandScore(centre, 3, 12);
  // On speed: 38–48 m/s is the window; slower risks a stall, faster
  // floats past the zone.
  const speedScore = speed >= 38 && speed <= 48
    ? 100
    : bandScore(Math.abs(speed - 43), 0, 18);
  const grade = Math.round((vsScore + centreScore + speedScore) / 3);
  const letter = grade >= 90 ? 'A' : grade >= 75 ? 'B' : grade >= 60 ? 'C' : grade >= 40 ? 'D' : 'F';
  // Landing inside the touchdown zone pays the grade; outside it, the
  // grade is halved — a long landing is a landing in the wrong place.
  const inZone = touch.along >= PRECISION_TUNING.touchdownZoneStart
    && touch.along <= PRECISION_TUNING.touchdownZoneEnd;
  const bonus = Math.round((PRECISION_TUNING.maxGradeBonus * grade) / 100 * (inZone ? 1 : 0.5));
  return {
    vsScore, centreScore, speedScore, grade, letter, inZone, bonus,
    verticalSpeed: Math.round(vs * 10) / 10,
    centreline: Math.round(centre),
    speed: Math.round(speed),
    along: Math.round(touch.along),
  };
}

// Words for a grade, for the results screen: what the pilot did right.
export function gradeWords(result) {
  if (!result) return '';
  const parts = [];
  if (result.vsScore >= 90) parts.push('a feather-light touchdown');
  else if (result.vsScore < 40) parts.push('a hard slam on the gear');
  if (result.centreScore >= 90) parts.push('dead on the centreline');
  else if (result.centreScore < 40) parts.push('well off the centreline');
  if (result.speedScore >= 90) parts.push('on speed');
  else if (result.speedScore < 40) parts.push('off speed');
  if (!result.inZone) parts.push('past the touchdown zone');
  return parts.length ? `Landing grade ${result.letter} (${result.grade}) — ${parts.join(', ')}.` : `Landing grade ${result.letter} (${result.grade}).`;
}

// The crash line for a precision touchdown that was too hard: the grade
// is the reason, not just the speed.
export function precisionCrashLine(vs) {
  return `Too hard on the runway — ${vs.toFixed(1)} m/s down breaks the ${PLANE.crashSpeed} m/s limit.`;
}

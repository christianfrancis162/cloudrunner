// Cloudrunner — engine heat: the third leg of the fuel/heat/damage trio.
// One job: track how hot the engine runs and make throttle a decision.
//
// A cool engine is free speed; a hot one is a bill coming due. Heat climbs
// with the square of the throttle — full power is fine in bursts, ruinous
// held open — and cools when the pilot backs off or the slipstream does
// the work at speed. Past 85 the tower warns; at 100 the engine overheats:
// the throttle is forced down, the airframe takes damage every second it
// stays cooked, and only cooling below 60 brings the power back. The
// Falcon runs hottest, the Albatross coolest — the hangar choice changes
// how hard the pilot can lean on the throttle.
//
// Heat never touches physics.js: main.js steps it once per tick after the
// flight model, clamps the throttle while overheated, and folds the
// overheat damage into state.damage. The HUD reads heat.level straight.
export const HEAT_WARN_AT = 85; // tower warns at this heat
export const HEAT_OVERHEAT_AT = 100; // engine gives up at this heat
export const HEAT_RECOVER_AT = 60; // power returns once cooled this far

// How hot each airframe runs: the hot rod cooks fastest, the tourer
// slowest. The Kestrel is the baseline the numbers were tuned against.
export const HEAT_PLANE_FACTOR = {
  kestrel: 1.0,
  albatross: 0.85,
  falcon: 1.25,
};

// Heat events, returned as a bitmask from stepHeat (own bits, separate
// from the flight model's EVENT_* flags).
export const HEAT_EVENT_NONE = 0;
export const HEAT_EVENT_WARN = 1 << 0; // crossed the warning line
export const HEAT_EVENT_OVERHEAT = 1 << 1; // engine overheated
export const HEAT_EVENT_RECOVERED = 1 << 2; // cooled back into service

export function createHeat() {
  return {
    level: 0, // 0..100, the needle the HUD shows
    overheat: false, // power limited while true
    warned: false, // warning already given for this climb
    max: 0, // hottest this sortie got — the Pilot Log remembers it
    overheatedEver: false, // this sortie cooked the engine at least once
  };
}

// One word for the needle: what the HUD prints beside the gauge.
export function heatWords(level, overheat) {
  if (overheat) return 'OVERHEAT';
  if (level >= HEAT_WARN_AT) return 'CRITICAL';
  if (level >= 70) return 'HOT';
  if (level >= 50) return 'WARM';
  return 'COOL';
}

// Advance the heat by dt seconds. `state` is the flight state (throttle,
// speed, damage, plane). Returns { events, damage } — damage is the
// airframe damage accrued this tick while overheated, for main.js to
// fold into state.damage. The throttle clamp while overheated is the
// caller's job: heat.overheat tells it when to hold the power down.
export function stepHeat(heat, state, dt) {
  const factor = HEAT_PLANE_FACTOR[state.plane] ?? 1.0;
  // Full throttle cooks at ~5/s; cruise throttle barely warms the
  // engine; backed off, the slipstream cools it fast. A damaged
  // airframe runs hotter — a wounded plane cannot lean on the power.
  const gain = 5.0 * state.throttle * state.throttle * factor
    * (1 + state.damage / 200);
  const loss = heat.overheat
    ? 6.0 // engine cut: cools fast while the power is out
    : (state.throttle < 0.5 ? 4.0 : 1.0) + state.speed * 0.02;
  heat.level = Math.min(100, Math.max(0, heat.level + (gain - loss) * dt));
  if (heat.level > heat.max) heat.max = heat.level;

  let events = HEAT_EVENT_NONE;
  let damage = 0;
  if (!heat.overheat && heat.level >= HEAT_OVERHEAT_AT) {
    heat.overheat = true;
    heat.overheatedEver = true;
    events |= HEAT_EVENT_OVERHEAT;
  }
  if (!heat.overheat && !heat.warned && heat.level >= HEAT_WARN_AT) {
    heat.warned = true;
    events |= HEAT_EVENT_WARN;
  }
  if (heat.level < 70) heat.warned = false;
  if (heat.overheat) {
    // Cooked: the airframe takes damage every second it stays hot, and
    // the power stays out until the needle falls back below the line.
    damage = 1.5 * dt;
    if (heat.level < HEAT_RECOVER_AT) {
      heat.overheat = false;
      events |= HEAT_EVENT_RECOVERED;
    }
  }
  return { events, damage };
}

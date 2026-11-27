// Cloudrunner — Flight School: the coach for a first flight. One job:
// teach the sortie in steps, one instruction at a time, and say when
// each step is done — so a pilot who has never flown can take off, turn,
// thread a ring and land without reading a manual first.
//
// A step is a line of coaching plus a `done` rule that reads the flight
// state (and the events of this tick). The school mission runs the normal
// flight model — the coach only watches — so the lesson is a real flight:
// throttle up, rotate, climb, bank toward the first ring, fly it, then
// come home and land. Steps advance in order; a step already passed
// never comes back. When the last step is done, the lesson is the
// landing, and the sortie ends the usual way.
//
// The coach's current line is drawn by the HUD over the objective bar,
// so the pilot reads it without looking away from the sky.

// done(state, events): true when the pilot has done what the step asks.
export const TUTORIAL_STEPS = [
  {
    id: 'throttle',
    coach: 'Hold SHIFT to spool the throttle up — watch the gauge climb past 60%.',
    hint: 'SHIFT — throttle up',
    done: (state) => state.throttle >= 0.6,
  },
  {
    id: 'rotate',
    coach: 'At speed, pull back gently (W) — the nose rises, the runway falls away.',
    hint: 'W — pull back to lift off',
    done: (state) => state.airborne === true,
  },
  {
    id: 'climb',
    coach: 'Climb to 150 ft and hold it — keep the horizon level, throttle steady.',
    hint: 'Climb to 150 ft',
    done: (state) => state.airborne && (state.position.y - 2) * 3.281 >= 150,
  },
  {
    id: 'turn',
    coach: 'Bank toward the gold ring ahead (A / D, or steer with the mouse) — the arrow points the way.',
    hint: 'A / D — bank toward the gold ring',
    done: (state) => {
      // Facing the first ring within about 25 degrees counts as turning in.
      const dx = 0 - state.position.x;
      const dz = -350 - state.position.z;
      const desired = Math.atan2(-dx, -dz);
      let diff = desired - state.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return state.airborne && Math.abs(diff) < 0.44;
    },
  },
  {
    id: 'ring',
    coach: 'Fly through the gold ring — straight through the middle, wings level.',
    hint: 'Fly through ring 1',
    done: (state) => state.ringsPassed >= 1,
  },
  {
    id: 'home',
    coach: 'Ring flown. Now bring her home: line up on the runway and land gently.',
    hint: 'Land on the runway',
    done: (state) => state.landed === true,
  },
];

export function createTutorial() {
  return { step: 0, finished: false };
}

// Advance the tutorial by one tick. Returns the step the coach is
// showing now: { index, total, coach, hint, done, finished }. Steps only
// move forward — the pilot cannot fail a step, only take longer on it.
export function tutorialTick(tutorial, state, events) {
  if (tutorial.finished) {
    return { ...tutorialSummary(tutorial), finished: true };
  }
  let step = tutorial.step;
  while (step < TUTORIAL_STEPS.length) {
    let done = false;
    try {
      done = !!TUTORIAL_STEPS[step].done(state, events);
    } catch {
      done = false;
    }
    if (!done) break;
    step += 1;
  }
  tutorial.step = step;
  if (step >= TUTORIAL_STEPS.length) {
    tutorial.finished = true;
    return { ...tutorialSummary(tutorial), finished: true };
  }
  return { ...tutorialSummary(tutorial), finished: false };
}

function tutorialSummary(tutorial) {
  const step = TUTORIAL_STEPS[Math.min(tutorial.step, TUTORIAL_STEPS.length - 1)];
  return {
    index: tutorial.step,
    total: TUTORIAL_STEPS.length,
    coach: step.coach,
    hint: step.hint,
    stepId: step.id,
  };
}

// The school sortie's scoring: every lesson step finished pays, on top
// of the ring and the landing bonus — so a lesson done well scores like
// a sortie, and the Valley Tour can medal it. main.js adds these points
// as the coach advances.
export const SCHOOL_STEP_POINTS = 100;

// The coach line for the results screen: what the lesson came to.
export function schoolResultLine(tutorial, landed) {
  const finished = Math.min(tutorial.step, TUTORIAL_STEPS.length);
  if (landed && finished >= TUTORIAL_STEPS.length) {
    return 'Flight School complete — first flight, first ring, first landing. The valley is open.';
  }
  if (landed) return `Flight School: ${finished} of ${TUTORIAL_STEPS.length} lesson steps done, and a landing to finish.`;
  return `Flight School: ${finished} of ${TUTORIAL_STEPS.length} lesson steps done before the sortie ended.`;
}

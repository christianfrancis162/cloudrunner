// Cloudrunner — achievements: the moments worth remembering. One job:
// name the feats a pilot can pull off in the valley, notice when one
// happens, and remember it — so a first ring, a bullseye drop or a storm
// survived is celebrated the moment it happens and kept on the record
// afterwards.
//
// An achievement is a small rule: an id, a name, a line of text, and a
// `check` that reads the flight's end state (or a live event) and says
// yes or no. The game calls `checkAchievements` once per event and once
// at the end of every sortie; anything newly unlocked comes back in a
// list, and the HUD toasts it. The unlocked set lives in localStorage
// next to the Pilot Log, and the title screen lists what is still to do.
//
// Checks read only the facts the flight already produced — score, rings,
// damage, mission, weather, daylight, the log totals — so they never
// change how a sortie flies, only what it remembers.
import { missionById } from './missions.js';

const ACHIEVEMENTS_KEY = 'cloudrunner-achievements';

// `when` is one of: 'ring' (a ring is passed), 'drop' (a crate lands),
// 'pickup' (the hiker boards), 'land' (a landing), 'end' (any sortie
// ends, landed or crashed), 'damage' (damage is taken).
export const ACHIEVEMENTS = [
  {
    id: 'first-ring',
    name: 'First Ring',
    text: 'Threaded your first ring over Kestrel Valley.',
    when: 'ring',
    check: (c) => c.ringsPassed >= 1,
  },
  {
    id: 'ring-master',
    name: 'Ring Master',
    text: 'All 8 rings in one sortie — the full valley course.',
    when: 'ring',
    check: (c) => c.ringsPassed >= 8,
  },
  {
    id: 'bullseye',
    name: 'Bullseye',
    text: 'A crate dead centre on a meadow — 200 points, first try.',
    when: 'drop',
    check: (c) => c.lastDropPoints >= 200,
  },
  {
    id: 'hat-trick',
    name: 'Hat Trick',
    text: 'All three crates on target in one Cargo Drop.',
    when: 'end',
    check: (c) => c.mission === 'cargo' && c.landed && c.dropResults.filter((d) => d.points > 0).length >= 3,
  },
  {
    id: 'rescuer',
    name: 'Rescuer',
    text: 'Brought the stranded hiker home from Kestrel Hut.',
    when: 'pickup',
    check: (c) => c.rescued === true,
  },
  {
    id: 'storm-survivor',
    name: 'Storm Survivor',
    text: 'Landed the Storm Run — gusts, rain and lightning, and home.',
    when: 'end',
    check: (c) => c.mission === 'storm' && c.landed,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    text: 'A night landing, by PAPI and landing light.',
    when: 'end',
    check: (c) => c.mission === 'precision' && c.landed,
  },
  {
    id: 'smooth-operator',
    name: 'Smooth Operator',
    text: 'Landed with zero airframe damage — not a scratch.',
    when: 'end',
    check: (c) => c.landed && c.damage <= 0,
  },
  {
    id: 'ace',
    name: 'Ace Landing',
    text: 'A grade-A precision landing — on slope, on centreline, on speed.',
    when: 'end',
    check: (c) => c.mission === 'precision' && c.landed && c.landingGrade && c.landingGrade.letter === 'A',
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    text: 'Scored 1,500 or more in a single sortie.',
    when: 'end',
    check: (c) => c.score >= 1500,
  },
  {
    id: 'graduate',
    name: 'Graduate',
    text: 'Finished Flight School — first flight, first landing.',
    when: 'end',
    check: (c) => c.mission === 'school' && c.landed,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    text: 'Ten sorties on record in the Pilot Log.',
    when: 'end',
    check: (c) => (c.logFlights ?? 0) >= 10,
  },
  {
    id: 'wounded-home',
    name: 'Wounded Home',
    text: 'Brought a plane home with 60% damage or worse — and landed it.',
    when: 'end',
    check: (c) => c.landed && c.damage >= 60,
  },
  {
    id: 'gold-tour',
    name: 'Golden Tour',
    text: 'A gold medal in the Valley Tour — one sortie flown perfectly.',
    when: 'end',
    check: (c) => c.medalEarned === 3,
  },
];

export function loadAchievements() {
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAchievements(unlocked) {
  try {
    window.localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
  } catch {
    // Storage off: achievements last this visit only.
  }
}

// Check every achievement that fires `when` against this flight's facts.
// Returns the newly unlocked ones (in definition order), and saves them.
// Already-unlocked achievements never fire twice.
export function checkAchievements(when, context) {
  const unlocked = loadAchievements();
  const newly = [];
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.when !== when) continue;
    if (unlocked.includes(achievement.id)) continue;
    let earned = false;
    try {
      earned = !!achievement.check(context);
    } catch {
      earned = false;
    }
    if (earned) {
      unlocked.push(achievement.id);
      newly.push(achievement);
    }
  }
  if (newly.length) saveAchievements(unlocked);
  return newly;
}

export function clearAchievements() {
  try {
    window.localStorage.removeItem(ACHIEVEMENTS_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
  return [];
}

// The full list with unlocked state, for the title screen: earned ones
// first, then the ones still to chase, each with its line.
export function achievementList() {
  const unlocked = loadAchievements();
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    text: a.text,
    unlocked: unlocked.includes(a.id),
  }));
}

export function achievementSummary() {
  const unlocked = loadAchievements();
  return { unlocked: unlocked.length, total: ACHIEVEMENTS.length };
}

// The flight facts a check reads, built from the flight state at the end
// of a sortie (or a live event). One shape for every check, so adding a
// new achievement never touches the game loop.
export function achievementContext(state, extra = {}) {
  return {
    mission: state.mission,
    score: state.score,
    ringsPassed: state.ringsPassed,
    damage: Math.round(state.damage),
    landed: state.landed,
    crashed: state.crashed,
    rescued: state.rescued,
    dropResults: state.dropResults ?? [],
    lastDropPoints: state.lastDrop ? state.lastDrop.points : 0,
    landingGrade: state.landingGrade ?? null,
    ...extra,
  };
}

// Cloudrunner — Valley Tour campaign: the seven sorties as one tour.
// One job: turn seven separate missions into a career — fly them in
// order, earn a medal per sortie from the score, and keep the tour's
// progress between visits, so there is always a next thing to chase
// after the first landing.
//
// Medals are scored, not timed: a medal needs a landing (crashes earn
// nothing) and a score at or above the sortie's bar. The bars are set
// from what a clean flight pays: 8 rings (800) + landing (250) is the
// floor of a good sortie, so bronze sits just above it and gold needs a
// genuinely good flight — a bullseye cargo run, a sprint under par, a
// storm survived with the bonus. The bars live here, one table, so
// tuning them never touches the missions.
//
// The campaign is the pilot's own record (localStorage, like the Pilot
// Log): best medal per sortie, the tour's total, and which sortie is
// next. Nothing here changes how a sortie flies — it only remembers
// what the pilot did.
import { missionById, MISSION_ORDER } from './missions.js';

const CAMPAIGN_KEY = 'cloudrunner-campaign';

export const CAMPAIGN_NAME = 'Valley Tour';
export const CAMPAIGN_TAGLINE = 'Seven sorties over Kestrel Valley, from first flight to night landing.';

// Medal bars per sortie: [bronze, silver, gold] scores. A landing is
// required — the medal is for finishing, not for trying.
export const MEDAL_BARS = {
  school: [400, 700, 1000],
  'ring-run': [900, 1100, 1300],
  cargo: [1100, 1400, 1700],
  rescue: [1000, 1200, 1500],
  sprint: [1000, 1250, 1500],
  storm: [1000, 1250, 1500],
  precision: [500, 700, 900],
};

export const MEDALS = ['—', '🥉', '🥈', '🥇'];
export const MEDAL_NAMES = ['No medal', 'Bronze', 'Silver', 'Gold'];

// The medal a score earns on a sortie: 0 none, 1 bronze, 2 silver,
// 3 gold. Crashes and unfinished sorties earn nothing, whatever the
// score was when it ended.
export function medalFor(missionId, score, landed) {
  if (!landed) return 0;
  const bars = MEDAL_BARS[missionId] ?? MEDAL_BARS['ring-run'];
  if (score >= bars[2]) return 3;
  if (score >= bars[1]) return 2;
  if (score >= bars[0]) return 1;
  return 0;
}

// The campaign record: best medal per sortie (0–3) and the best score
// that earned it, plus the tour total. Stored as one small object.
export function loadCampaign() {
  try {
    const raw = window.localStorage.getItem(CAMPAIGN_KEY);
    if (!raw) return { medals: {}, bestScores: {}, flights: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { medals: {}, bestScores: {}, flights: 0 };
    return {
      medals: parsed.medals ?? {},
      bestScores: parsed.bestScores ?? {},
      flights: parsed.flights ?? 0,
    };
  } catch {
    return { medals: {}, bestScores: {}, flights: 0 };
  }
}

function saveCampaign(record) {
  try {
    window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(record));
  } catch {
    // Storage off: the tour lasts this visit only.
  }
}

// Record a finished sortie in the tour. Returns the medal earned this
// flight and whether it is a new best for that sortie — the HUD only
// celebrates a new medal, not a repeat.
export function recordCampaignResult(missionId, score, landed) {
  const record = loadCampaign();
  const earned = medalFor(missionId, score, landed);
  const previous = record.medals[missionId] ?? 0;
  record.flights += 1;
  if (earned > previous) record.medals[missionId] = earned;
  const prevScore = record.bestScores[missionId] ?? 0;
  if (score > prevScore) record.bestScores[missionId] = Math.round(score);
  saveCampaign(record);
  return { earned, previous, improved: earned > previous, record };
}

export function clearCampaign() {
  try {
    window.localStorage.removeItem(CAMPAIGN_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
  return loadCampaign();
}

// The tour at a glance: medals won out of the seven, the tour total
// (best score per sortie added up), and the next sortie without a medal
// — the one the pilot should fly next. When every sortie has a medal,
// the next is the lowest medal, to upgrade.
export function campaignSummary(record) {
  const medals = MISSION_ORDER.map((id) => record.medals[id] ?? 0);
  const won = medals.filter((m) => m > 0).length;
  const total = MISSION_ORDER.reduce((sum, id) => sum + (record.bestScores[id] ?? 0), 0);
  const golds = medals.filter((m) => m === 3).length;
  let next = null;
  for (const id of MISSION_ORDER) {
    if ((record.medals[id] ?? 0) === 0) { next = id; break; }
  }
  if (!next) {
    let lowest = 3;
    for (const id of MISSION_ORDER) {
      const m = record.medals[id] ?? 0;
      if (m < lowest) { lowest = m; next = id; }
    }
  }
  return {
    won,
    total: MISSION_ORDER.length,
    golds,
    tourScore: total,
    next,
    nextName: next ? missionById(next).name : null,
    medals,
  };
}

// One row per sortie for the tour table: name, medal, best score, and
// the bar for the next medal up — so the pilot can see what to beat.
export function campaignRows(record) {
  return MISSION_ORDER.map((id) => {
    const medal = record.medals[id] ?? 0;
    const bars = MEDAL_BARS[id];
    const nextBar = medal >= 3 ? null : bars[medal];
    return {
      id,
      name: missionById(id).name,
      medal,
      medalEmoji: MEDALS[medal],
      medalName: MEDAL_NAMES[medal],
      bestScore: record.bestScores[id] ?? 0,
      nextBar,
    };
  });
}

// One line for the title screen: the tour's state in a sentence.
export function campaignLine(record) {
  const summary = campaignSummary(record);
  if (summary.won === 0) return `Valley Tour: ${CAMPAIGN_TAGLINE} No medals yet — start with Flight School.`;
  if (summary.won === summary.total && summary.golds === summary.total) {
    return `Valley Tour complete — all seven sorties gold, tour score ${summary.tourScore}. The valley is yours.`;
  }
  return `Valley Tour: ${summary.won}/${summary.total} medals (${summary.golds} gold) · tour score ${summary.tourScore} · next: ${summary.nextName}.`;
}

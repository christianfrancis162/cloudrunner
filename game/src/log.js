// Cloudrunner — Pilot Log: every flight on record.
// One job: remember sorties (localStorage), and answer "what are my best
// times?" and "how much have I flown?" for the records page. The log is
// the pilot's own history — best score and best time per mission, total
// flights and hours, landings against crashes — and it survives between
// visits until the pilot clears it.
import { missionById, MISSION_ORDER } from './missions.js';

const LOG_KEY = 'cloudrunner-log';
const MAX_ENTRIES = 200;

export function loadLog() {
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLog(entries) {
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // Storage off: the log lasts this visit only.
  }
}

// Record one finished sortie. Newest first, capped so the log never grows
// without bound.
export function recordFlight({ mission, plane, score, time, rings, landed, crashed, damage }) {
  const log = loadLog();
  const entry = {
    date: new Date().toISOString(),
    mission: missionById(mission).id,
    plane,
    score: Math.round(score),
    time: Math.round(time * 10) / 10,
    rings,
    landed: !!landed,
    crashed: !!crashed,
    damage: Math.round(damage),
  };
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.length = MAX_ENTRIES;
  saveLog(log);
  return entry;
}

export function clearLog() {
  try {
    window.localStorage.removeItem(LOG_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
  return [];
}

export function formatFlightTime(t) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatLogDate(iso) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

// The most recent flights, newest first, for the records table.
export function recentFlights(log, count = 8) {
  return log.slice(0, count);
}

// Best (shortest) landed time on one mission, or null if never landed there.
export function missionBestTime(log, missionId) {
  const landed = log.filter((e) => e.mission === missionId && e.landed);
  if (!landed.length) return null;
  return Math.min(...landed.map((e) => e.time));
}

// Totals + best per mission, for the records page.
export function logSummary(log) {
  const perMission = MISSION_ORDER.map((id) => {
    const rows = log.filter((e) => e.mission === id);
    const landed = rows.filter((e) => e.landed);
    return {
      id,
      name: missionById(id).name,
      flights: rows.length,
      bestScore: rows.reduce((best, e) => Math.max(best, e.score), 0),
      bestTime: landed.length ? Math.min(...landed.map((e) => e.time)) : null,
    };
  });
  const totalSeconds = log.reduce((sum, e) => sum + (e.time || 0), 0);
  return {
    flights: log.length,
    hours: totalSeconds / 3600,
    landings: log.filter((e) => e.landed).length,
    crashes: log.filter((e) => e.crashed).length,
    bestScore: log.reduce((best, e) => Math.max(best, e.score), 0),
    perMission,
  };
}

// One line for the records page header: the pilot's career at a glance.
export function logStatsLine(summary) {
  const hours = summary.hours < 1
    ? `${Math.round(summary.hours * 60)} min`
    : `${summary.hours.toFixed(1)} hrs`;
  return `${summary.flights} flights · ${hours} in the air · ${summary.landings} landings · ${summary.crashes} crashes · best score ${summary.bestScore}`;
}

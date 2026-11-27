// Cloudrunner — HUD: the lit instruments and banners over the 3D view.
// One job: turn the flight state into readable DOM, updated every frame.
// v3 adds the wind gauge (the weather, read live), the hangar picker on
// the title screen and the Pilot Log records page.
import { headingDegrees } from './physics.js';
import { PLANE, MISSION_TUNING, STORM_TUNING } from './config.js';
import { missionById, MISSION_ORDER } from './missions.js';
import { PLANE_ORDER, planeById, planeCard } from './planes.js';
import { formatFlightTime, formatLogDate } from './log.js';

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHud(root) {
  root.innerHTML = `
  <div id="hud" class="hidden">
    <div class="hud-top">
      <div class="hud-box" id="hud-speed"><label>AIRSPEED</label><b id="hud-knots">0</b><span>kt</span></div>
      <div class="hud-box" id="hud-alt"><label>ALTITUDE</label><b id="hud-feet">0</b><span>ft</span></div>
      <div class="hud-box" id="hud-vsi"><label>VERT SPEED</label><b id="hud-vs">0</b><span>ft/min</span></div>
      <div class="hud-box" id="hud-compass"><label>HEADING</label><b id="hud-hdg">000°</b><span id="hud-cardinal">N</span></div>
      <div class="hud-box" id="hud-wind"><label>WIND</label><b id="hud-wind-knots">0</b><span>kt</span><span id="hud-wind-dir">N</span></div>
      <div class="hud-box" id="hud-ring"><label>RING</label><b id="hud-ringcount">0/8</b><span id="hud-ringdist"></span></div>
      <div class="hud-box" id="hud-score"><label>SCORE</label><b id="hud-points">0</b><span id="hud-time">0:00</span></div>
      <div class="hud-box hud-mission-box" id="hud-mission"><label>MISSION</label><b id="hud-mission-name">RING RUN</b><span id="hud-mission-progress"></span></div>
    </div>
    <div class="hud-objective" id="hud-objective"></div>
    <div class="hud-left">
      <div class="hud-gauge" id="hud-throttle-gauge">
        <label>THROTTLE</label>
        <div class="gauge-track"><div class="gauge-fill" id="hud-throttle-fill"></div></div>
        <b id="hud-throttle-pct">0%</b>
      </div>
      <div class="hud-gauge" id="hud-fuel-gauge">
        <label>FUEL</label>
        <div class="gauge-track"><div class="gauge-fill fuel" id="hud-fuel-fill"></div></div>
        <b id="hud-fuel-pct">100%</b>
      </div>
      <div class="hud-gauge" id="hud-damage-gauge">
        <label>DAMAGE</label>
        <div class="gauge-track"><div class="gauge-fill damage" id="hud-damage-fill"></div></div>
        <b id="hud-damage-pct">0%</b>
      </div>
      <div class="hud-horizon" id="hud-horizon">
        <div class="horizon-inner">
          <div class="horizon-sky"></div>
          <div class="horizon-ground"></div>
        </div>
        <div class="horizon-line"></div>
        <div class="horizon-plane">✈</div>
      </div>
    </div>
    <div class="hud-arrow" id="hud-arrow">➤</div>
    <div class="hud-banner" id="hud-banner"></div>
    <div class="hud-flash" id="hud-flash"></div>
  </div>
  <div id="screen-title" class="screen">
    <h1>CLOUDRUNNER</h1>
    <p class="tagline">Golden-hour stunt flying over Kestrel Valley — Kestrel Field, Lake Solenne &amp; the Kestrel Hut</p>
    <div class="mission">
      <b id="mission-title">MISSION — RING RUN</b>
      <p id="mission-desc">Take off from the runway, fly through all 8 glowing rings across the valley,
      then land back on the runway for the touchdown bonus. Rings refuel you — an empty
      tank means a glide home. Hard hits damage the airframe.</p>
      <div class="mission-picker" id="mission-picker"></div>
      <p class="mission-keys">Press <b>1–5</b> or click to pick a sortie</p>
      <div class="plane-picker" id="plane-picker"></div>
      <p class="mission-keys" id="plane-desc">Kestrel K-2 — nimble stunt plane, 85 fuel</p>
      <p><button class="mission-btn" id="btn-log">PILOT LOG — RECORDS</button></p>
    </div>
    <div class="controls">
      <div><b>W / S</b> pitch &nbsp; <b>A / D</b> roll &nbsp; <b>Mouse</b> steer</div>
      <div><b>Shift</b> throttle up &nbsp; <b>Ctrl</b> throttle down &nbsp; <b>Space</b> airbrake &nbsp; <b>C</b> drop cargo</div>
      <div><b>P</b> pause &nbsp; <b>R</b> restart &nbsp; <b>M</b> mute</div>
    </div>
    <p class="press">Press <b>ENTER</b> to fly</p>
    <p class="best" id="hud-best"></p>
  </div>
  <div id="screen-paused" class="screen hidden">
    <h1>PAUSED</h1>
    <p>Press <b>P</b> or <b>Enter</b> to keep flying · <b>R</b> to restart</p>
  </div>
  <div id="screen-over" class="screen hidden">
    <h1 id="over-title">MISSION COMPLETE</h1>
    <p id="over-reason"></p>
    <div class="results" id="over-results"></div>
    <button id="btn-again">FLY AGAIN</button>
    <p class="press">or press <b>Enter</b></p>
  </div>
  <div id="screen-log" class="screen hidden">
    <h1>PILOT LOG</h1>
    <p id="log-summary"></p>
    <div class="log-wrap" id="log-wrap"></div>
    <div class="log-actions">
      <button id="btn-log-clear" class="mission-btn">CLEAR LOG</button>
      <button id="btn-log-back" class="mission-btn">BACK</button>
    </div>
    <p class="press" id="log-confirm"></p>
  </div>`;

  const el = (id) => root.querySelector(`#${id}`);
  const refs = {
    hud: el('hud'),
    knots: el('hud-knots'),
    feet: el('hud-feet'),
    vs: el('hud-vs'),
    hdg: el('hud-hdg'),
    cardinal: el('hud-cardinal'),
    ringcount: el('hud-ringcount'),
    ringdist: el('hud-ringdist'),
    points: el('hud-points'),
    time: el('hud-time'),
    throttleFill: el('hud-throttle-fill'),
    throttlePct: el('hud-throttle-pct'),
    fuelFill: el('hud-fuel-fill'),
    fuelPct: el('hud-fuel-pct'),
    damageFill: el('hud-damage-fill'),
    damagePct: el('hud-damage-pct'),
    horizon: el('hud-horizon'),
    arrow: el('hud-arrow'),
    banner: el('hud-banner'),
    flash: el('hud-flash'),
    title: el('screen-title'),
    paused: el('screen-paused'),
    over: el('screen-over'),
    overTitle: el('over-title'),
    overReason: el('over-reason'),
    overResults: el('over-results'),
    best: el('hud-best'),
    again: el('btn-again'),
    missionName: el('hud-mission-name'),
    missionProgress: el('hud-mission-progress'),
    objective: el('hud-objective'),
    missionTitle: el('mission-title'),
    missionDesc: el('mission-desc'),
    missionPicker: el('mission-picker'),
    windKnots: el('hud-wind-knots'),
    windDir: el('hud-wind-dir'),
    planePicker: el('plane-picker'),
    planeDesc: el('plane-desc'),
    logBtn: el('btn-log'),
    logScreen: el('screen-log'),
    logSummary: el('log-summary'),
    logWrap: el('log-wrap'),
    logClear: el('btn-log-clear'),
    logBack: el('btn-log-back'),
    logConfirm: el('log-confirm'),
  };

  // Mission picker on the title screen: one button per sortie.
  let selectedMission = 'ring-run';
  for (const id of MISSION_ORDER) {
    const m = missionById(id);
    const btn = document.createElement('button');
    btn.className = 'mission-btn';
    btn.dataset.mission = id;
    btn.textContent = `${MISSION_ORDER.indexOf(id) + 1} · ${m.name}`;
    btn.addEventListener('click', () => {
      setMission(id);
      root.dispatchEvent(new CustomEvent('missionpick', { bubbles: true, detail: id }));
    });
    refs.missionPicker.appendChild(btn);
  }

  function setMission(id) {
    selectedMission = missionById(id).id;
    refs.missionTitle.textContent = `MISSION — ${missionById(selectedMission).short}`;
    refs.missionDesc.textContent = missionById(selectedMission).tagline;
    for (const btn of refs.missionPicker.querySelectorAll('.mission-btn')) {
      btn.classList.toggle('picked', btn.dataset.mission === selectedMission);
    }
  }
  setMission(selectedMission);

  // Hangar picker on the title screen: one button per plane, with the
  // picked plane's tagline under it.
  let selectedPlane = 'kestrel';
  for (const id of PLANE_ORDER) {
    const card = planeCard(id);
    const btn = document.createElement('button');
    btn.className = 'mission-btn plane-btn';
    btn.dataset.plane = id;
    btn.textContent = card.short;
    btn.title = card.tagline;
    btn.addEventListener('click', () => {
      setPlane(id);
      root.dispatchEvent(new CustomEvent('planepick', { bubbles: true, detail: id }));
    });
    refs.planePicker.appendChild(btn);
  }

  function setPlane(id) {
    selectedPlane = planeById(id).id;
    const card = planeCard(selectedPlane);
    refs.planeDesc.textContent = `${card.name} — ${card.tagline}`;
    for (const btn of refs.planePicker.querySelectorAll('.plane-btn')) {
      btn.classList.toggle('picked', btn.dataset.plane === selectedPlane);
    }
  }
  setPlane(selectedPlane);

  // Pilot Log: open the records page, clear it (with a confirm step),
  // or go back to the title screen.
  refs.logBtn.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('logopen', { bubbles: true }));
  });
  refs.logBack.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('logback', { bubbles: true }));
  });
  let clearArmed = false;
  refs.logClear.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      refs.logConfirm.textContent = 'Press CLEAR LOG again to wipe every flight on record.';
      return;
    }
    clearArmed = false;
    refs.logConfirm.textContent = '';
    root.dispatchEvent(new CustomEvent('logclear', { bubbles: true }));
  });

  let bannerTimer = 0;

  function showBanner(text, kind) {
    refs.banner.textContent = text;
    refs.banner.className = `hud-banner show ${kind || ''}`;
    bannerTimer = 2.2;
  }

  function update(state, ringInfo, dt) {
    const knots = Math.round(state.speed * 1.944);
    const feet = Math.round((state.position.y - 2) * 3.281);
    const vsFpm = Math.round(state.verticalSpeed * 196.85);
    refs.knots.textContent = String(knots);
    refs.feet.textContent = String(Math.max(0, feet));
    refs.vs.textContent = (vsFpm >= 0 ? '+' : '') + vsFpm;
    const hdg = Math.round(headingDegrees(state.heading));
    refs.hdg.textContent = String(hdg).padStart(3, '0') + '°';
    refs.cardinal.textContent = COMPASS_POINTS[Math.round(hdg / 45) % 8];
    // Wind gauge: live from the weather — speed in knots, where it blows from.
    if (state.wind) {
      refs.windKnots.textContent = String(state.wind.knots);
      refs.windDir.textContent = state.wind.dir;
    }
    refs.ringcount.textContent = `${state.ringsPassed}/8`;
    refs.ringdist.textContent = ringInfo ? `${Math.round(ringInfo.distance)} m` : '';
    refs.points.textContent = String(state.score);
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60);
    refs.time.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    refs.throttleFill.style.width = `${Math.round(state.throttle * 100)}%`;
    refs.throttlePct.textContent = `${Math.round(state.throttle * 100)}%`;
    refs.fuelFill.style.width = `${Math.round(state.fuel)}%`;
    refs.fuelPct.textContent = `${Math.round(state.fuel)}%`;
    refs.fuelFill.classList.toggle('low', state.fuel < 20);
    refs.damageFill.style.width = `${Math.round(state.damage)}%`;
    refs.damagePct.textContent = `${Math.round(state.damage)}%`;
    refs.damageFill.classList.toggle('high', state.damage >= 60);
    // Mission box: name plus live progress for this sortie.
    const mission = missionById(state.mission);
    refs.missionName.textContent = mission.short;
    let progress = '';
    if (state.mission === 'cargo') progress = `${state.cratesDropped}/3 CRATES`;
    else if (state.mission === 'rescue') progress = state.rescued ? 'HIKER ABOARD' : state.onPad ? 'BOARDING…' : 'TO HUT PAD';
    else if (state.mission === 'sprint') {
      const left = Math.max(0, MISSION_TUNING.sprintPar - state.time);
      progress = `PAR ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    } else if (state.mission === 'storm') {
      const left = Math.max(0, STORM_TUNING.par - state.time);
      progress = `STORM PAR ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    } else progress = `${state.ringsPassed}/8 RINGS`;
    refs.missionProgress.textContent = progress;
    refs.objective.textContent = mission.objective;
    // Artificial horizon: the sky/ground split tilts with bank and shifts with pitch.
    // A left bank (positive bank) tilts the horizon clockwise in the gauge.
    const horizonEl = refs.horizon;
    horizonEl.style.setProperty('--bank', `${state.bank}rad`);
    horizonEl.style.setProperty('--pitch', `${state.pitch * 40}px`);
    // Off-screen ring arrow: rotate toward the next ring's screen direction.
    if (ringInfo) {
      refs.arrow.style.display = ringInfo.onScreen ? 'none' : 'block';
      refs.arrow.style.transform = `translate(-50%, -50%) rotate(${ringInfo.angleDeg}deg)`;
    } else {
      refs.arrow.style.display = 'none';
    }
    // Lightning flash: a white blink over the whole view in the storm.
    if (state.lightningFlash > 0) {
      refs.flash.style.opacity = String(Math.min(0.55, state.lightningFlash * 0.55));
    } else {
      refs.flash.style.opacity = '0';
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) refs.banner.className = 'hud-banner';
    }
  }

  function showScreen(name, overData, logData) {
    refs.title.classList.toggle('hidden', name !== 'title');
    refs.paused.classList.toggle('hidden', name !== 'paused');
    refs.over.classList.toggle('hidden', name !== 'over');
    refs.logScreen.classList.toggle('hidden', name !== 'log');
    refs.hud.classList.toggle('hidden', name !== 'playing' && name !== 'paused');
    if (name === 'log' && logData) showLog(logData);
    if (name === 'over' && overData) {
      refs.overTitle.textContent = overData.title;
      refs.overReason.textContent = overData.reason || '';
      refs.overResults.innerHTML = `
        <div><label>SCORE</label><b>${overData.score}</b></div>
        <div><label>RINGS</label><b>${overData.rings}/8</b></div>
        <div><label>TIME</label><b>${overData.time}</b></div>
        <div><label>DAMAGE</label><b>${overData.damage}%</b></div>
        <div><label>LANDING</label><b>${overData.landing}</b></div>
        <div><label>BEST</label><b>${overData.best}</b></div>`;
    }
  }

  // Pilot Log records page: career totals, best per mission, recent flights.
  function showLog(logData) {
    const { summary, recent } = logData;
    refs.logSummary.textContent = summary.flights > 0
      ? `${summary.flights} flights · ${summary.hours < 1 ? `${Math.round(summary.hours * 60)} min` : `${summary.hours.toFixed(1)} hrs`} in the air · ${summary.landings} landings · ${summary.crashes} crashes · best score ${summary.bestScore}`
      : 'No flights on record yet — fly a sortie and it lands here.';
    const bestRows = summary.perMission.map((m) => `
      <tr><td>${m.name}</td><td>${m.flights}</td><td>${m.bestScore}</td><td>${m.bestTime != null ? formatFlightTime(m.bestTime) : '—'}</td></tr>`).join('');
    const recentRows = recent.map((e) => `
      <tr><td>${formatLogDate(e.date)}</td><td>${missionById(e.mission).name}</td><td>${e.landed ? 'Landed' : e.crashed ? 'Crashed' : '—'}</td><td>${e.score}</td><td>${formatFlightTime(e.time)}</td></tr>`).join('');
    refs.logWrap.innerHTML = `
      <table class="log-table">
        <thead><tr><th>MISSION</th><th>FLIGHTS</th><th>BEST SCORE</th><th>BEST TIME</th></tr></thead>
        <tbody>${bestRows}</tbody>
      </table>
      ${recent.length ? `
      <table class="log-table">
        <thead><tr><th>DATE</th><th>MISSION</th><th>OUTCOME</th><th>SCORE</th><th>TIME</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>` : '<p class="log-empty">No flights yet.</p>'}`;
    refs.logConfirm.textContent = '';
  }

  function setBest(best) {
    refs.best.textContent = best > 0 ? `Best score: ${best}` : '';
  }

  refs.again.addEventListener('click', () => {
    refs.again.dispatchEvent(new CustomEvent('flyagain', { bubbles: true }));
  });

  return { update, showBanner, showScreen, setBest, setMission, setPlane, PLANE_FUEL_CAPACITY: PLANE.fuelCapacity };
}

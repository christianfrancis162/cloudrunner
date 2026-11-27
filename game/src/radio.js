// Cloudrunner — Kestrel Tower radio: the valley talks back. One job:
// turn the flight's own events into tower chatter, so a sortie feels
// flown with someone instead of alone.
//
// The tower is Kestrel Tower, the pilot is Kestrel-7, and the exchange
// follows the sortie: clearance on takeoff, a call on every ring, a
// warning when the fuel or the engine turns, a welcome home on landing,
// and silence — then a worried repeat — after a crash. Lines rotate, so
// the second ring does not sound like the first. Nothing here changes
// how the plane flies; it only says what happened out loud.
//
// The panel is its own DOM: radio.js builds it and paints the last three
// exchanges into it, so the HUD never has to know the radio exists.
import {
  EVENT_TAKEOFF, EVENT_RING, EVENT_DROP, EVENT_PICKUP, EVENT_DAMAGE,
  EVENT_LOW_FUEL, EVENT_GATE, EVENT_LANDED, EVENT_CRASHED,
} from './physics.js';

const TOWER = 'KESTREL TOWER';
const PILOT = 'KESTREL-7';

// One line per event, two variants where the moment repeats, picked by
// the radio's own sequence number so the chatter never repeats twice
// running. `s` is the pilot's own line back, when the moment has one.
const LINES = {
  takeoff: [
    [TOWER, 'Kestrel-7, cleared for takeoff, runway 36. Wind calm, valley is yours.'],
    [TOWER, 'Kestrel-7, you are clear to go. Keep it smooth over the lake.'],
  ],
  ring: [
    [TOWER, 'Ring clear, Kestrel-7. Nice flying — next one is on your nose.'],
    [TOWER, 'That one counts. The valley course is yours, keep the speed up.'],
  ],
  drop: [
    [TOWER, 'Crate away, Kestrel-7. Eyes on the meadow — tell me where it lands.'],
    [TOWER, 'Supply drop confirmed. One less hungry meadow in the valley.'],
  ],
  pickup: [
    [TOWER, 'Hiker aboard, Kestrel-7. Bring them home gentle — they have had a long day.'],
    [PILOT, 'Hiker aboard. Heading home, tower.'],
  ],
  damage: [
    [TOWER, 'Kestrel-7, you are trailing smoke. Ease off and bring her home gentle.'],
    [TOWER, 'That sounded expensive, Kestrel-7. Check your gauges and fly her straight.'],
  ],
  lowFuel: [
    [TOWER, 'Kestrel-7, fuel is low. Fly a ring to top up — the course is your petrol station.'],
    [TOWER, 'Watch the gauge, Kestrel-7. A ring buys you twelve more.'],
  ],
  heatWarn: [
    [TOWER, 'Kestrel-7, your engine is running hot. Back the throttle off before she cooks.'],
    [TOWER, 'Temperature is climbing, Kestrel-7. Ease off the power and let her breathe.'],
  ],
  overheat: [
    [TOWER, 'Kestrel-7, engine overheat — power is out. Glide her cool and bring her down.'],
    [TOWER, 'She is cooked, Kestrel-7. Nose down, find the runway, and do not rush it.'],
  ],
  recovered: [
    [TOWER, 'Temperature is back down, Kestrel-7. Power is yours again — spend it wisely.'],
    [TOWER, 'Engine is cool, Kestrel-7. She forgives you this once.'],
  ],
  photo: [
    [TOWER, 'Picture received, Kestrel-7. That one is a keeper — next landmark, please.'],
    [TOWER, 'Got the shot, Kestrel-7. The valley looks good from up there.'],
  ],
  gate: [
    [TOWER, 'Approach gate flown, Kestrel-7. You are on the slope — ride it down.'],
    [TOWER, 'Through the gate, clean. PAPI agrees with you. Bring her in.'],
  ],
  landed: [
    [TOWER, 'Kestrel-7, welcome home. Tower out — the valley will be here tomorrow.'],
    [TOWER, 'Down safe, Kestrel-7. Nice flying. Park her and tell us the story.'],
  ],
  crashed: [
    [TOWER, 'Kestrel-7, do you read? Kestrel-7, respond.'],
    [TOWER, 'Kestrel-7, this is tower. Come back, please — the valley is quiet without you.'],
  ],
};

export function createRadio() {
  return {
    log: [], // { who, text } newest last, capped at 5
    seq: 0, // counts the calls, so variants rotate
  };
}

// Say one line on the radio. The log keeps the last five exchanges.
export function radioSay(radio, who, text) {
  radio.log.push({ who, text });
  if (radio.log.length > 5) radio.log.shift();
  radio.seq += 1;
}

// Speak for one event kind, rotating the variants.
function sayKind(radio, kind) {
  const variants = LINES[kind];
  if (!variants) return;
  const [who, text] = variants[radio.seq % variants.length];
  radioSay(radio, who, text);
}

// The flight's events, as bit flags, in the shape main.js passes them:
// the physics EVENT_* bits, plus heat and photo bits carried in their
// own fields. One call per tick; only the bits set this tick speak.
export function radioTick(radio, events, extra = {}) {
  if (events & EVENT_TAKEOFF) sayKind(radio, 'takeoff');
  if (events & EVENT_RING) sayKind(radio, 'ring');
  if (events & EVENT_DROP) sayKind(radio, 'drop');
  if (events & EVENT_PICKUP) sayKind(radio, 'pickup');
  if (events & EVENT_DAMAGE) sayKind(radio, 'damage');
  if (events & EVENT_LOW_FUEL) sayKind(radio, 'lowFuel');
  if (events & EVENT_GATE) sayKind(radio, 'gate');
  if (events & EVENT_LANDED) sayKind(radio, 'landed');
  if (events & EVENT_CRASHED) sayKind(radio, 'crashed');
  if (extra.heatWarn) sayKind(radio, 'heatWarn');
  if (extra.overheat) sayKind(radio, 'overheat');
  if (extra.recovered) sayKind(radio, 'recovered');
  if (extra.photo) sayKind(radio, 'photo');
}

// The radio panel: a small transcript pinned to the bottom-left of the
// view, under the gauges. It paints itself from the log, newest last.
export function createRadioPanel(root) {
  const panel = document.createElement('div');
  panel.className = 'radio-panel';
  panel.id = 'radio-panel';
  root.appendChild(panel);
  return panel;
}

export function updateRadioPanel(panel, radio) {
  const lines = radio.log.slice(-3).map((entry) => {
    const who = entry.who === TOWER ? 'TOWER' : 'YOU';
    return `<div class="radio-line"><b>${who}</b> ${entry.text}</div>`;
  });
  panel.innerHTML = lines.join('');
}

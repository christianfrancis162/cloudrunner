// Cloudrunner — minimap: the valley from above, in the corner of the
// HUD. One job: show the pilot where they are and where the next thing
// is — the plane as an arrow, the runway, the lake, the next ring, the
// drop zones and the rescue pad — so a sortie is never flown blind and
// the next target is always findable without the off-screen arrow alone.
//
// The map is a 2D canvas drawn every frame from the live state: north is
// up, the valley is a square, and everything is placed by the same world
// coordinates the physics uses, so the map and the world never disagree.
// It costs one small canvas and a few dozen path draws a frame — nothing
// the frame budget notices.
import { WORLD } from './config.js';
import { DROP_ZONES, RESCUE_PAD } from './missions.js';
import { headingDegrees } from './physics.js';

const MAP_SIZE = 190; // px square
const LAKE = { x: 420, z: 420, r: 150 };

// Project a world (x, z) onto the canvas: the valley square maps to the
// canvas square, north (-Z) at the top.
function project(x, z) {
  const half = WORLD.size;
  const px = ((x + half) / (half * 2)) * MAP_SIZE;
  const py = ((z + half) / (half * 2)) * MAP_SIZE;
  return [px, py];
}

export function createMinimap(canvas) {
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

// Draw the whole map for this frame: ground, lake, river band, runway,
// drop zones, rescue pad, rings, then the plane arrow on top. `nextRing`
// is the next ring's position (or null when the course is done);
// `targets` names which mission markers to emphasise.
export function updateMinimap(minimap, state, rings, mission) {
  const { ctx } = minimap;
  if (!ctx) return;
  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

  // Ground: dark valley green, with a lighter floor where the airfield is.
  ctx.fillStyle = 'rgba(16, 42, 28, 0.82)';
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = 'rgba(46, 107, 52, 0.5)';
  const [ax0, ay0] = project(-200, -300);
  const [ax1, ay1] = project(200, 300);
  ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);

  // Lake Solenne and the river band down the diagonal.
  const [lx, ly] = project(LAKE.x, LAKE.z);
  ctx.fillStyle = 'rgba(63, 143, 210, 0.85)';
  ctx.beginPath();
  ctx.arc(lx, ly, (LAKE.r / (WORLD.size * 2)) * MAP_SIZE, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74, 154, 216, 0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const [r0x, r0y] = project(-750, -750);
  const [r1x, r1y] = project(750, 750);
  ctx.moveTo(r0x, r0y);
  ctx.lineTo(r1x, r1y);
  ctx.stroke();

  // Runway: a pale strip, north-south, with the threshold marked.
  const [rw0x, rw0y] = project(-WORLD.runwayWidth / 2, -WORLD.runwayLength / 2);
  const [rw1x, rw1y] = project(WORLD.runwayWidth / 2, WORLD.runwayLength / 2);
  ctx.fillStyle = 'rgba(230, 230, 220, 0.9)';
  ctx.fillRect(rw0x, rw0y, rw1x - rw0x, rw1y - rw0y);

  // Cargo drop zones: orange rings; the rescue pad: a green disc.
  if (mission === 'cargo' || mission === 'school') {
    for (const zone of DROP_ZONES) {
      const [zx, zy] = project(zone.position.x, zone.position.z);
      const zr = (zone.radius / (WORLD.size * 2)) * MAP_SIZE;
      ctx.strokeStyle = 'rgba(255, 122, 26, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (mission === 'rescue' || mission === 'school') {
    const [px, py] = project(RESCUE_PAD.position.x, RESCUE_PAD.position.z);
    const pr = (RESCUE_PAD.radius / (WORLD.size * 2)) * MAP_SIZE;
    ctx.fillStyle = 'rgba(47, 191, 113, 0.8)';
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // The ring course: passed rings green, the next one pulsing gold, the
  // rest pale cyan. Only the next ring gets the pulse — the eye goes there.
  if (rings && rings.length) {
    rings.forEach((ring, i) => {
      const [rx, ry] = project(ring.position.x, ring.position.z);
      if (i < state.ringsPassed) {
        ctx.fillStyle = 'rgba(47, 191, 113, 0.9)';
      } else if (i === state.ringsPassed) {
        const pulse = 0.65 + 0.35 * Math.sin(state.time * 5);
        ctx.fillStyle = `rgba(255, 194, 26, ${pulse.toFixed(2)})`;
      } else {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.45)';
      }
      ctx.beginPath();
      ctx.arc(rx, ry, i === state.ringsPassed ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // The plane: a white arrow rotated to the heading, with a short trail
  // of where it has just been — the trail is the last heading, drawn as
  // a stub behind the arrow.
  const [px, py] = project(state.position.x, state.position.z);
  const hdg = (headingDegrees(state.heading) * Math.PI) / 180;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(hdg);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Border and the north tick.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, MAP_SIZE - 1, MAP_SIZE - 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', MAP_SIZE / 2, 11);
}

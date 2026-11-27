// Cloudrunner — terrain: Kestrel Valley, its airfield, river, lake, pines
// and clouds. One job: build the world geometry and answer "how high is
// the ground here?".
// The setting is one named place: Kestrel Valley, a golden-hour alpine
// valley — Kestrel Field airfield on the valley floor, the Solenne River
// running down to Lake Solenne, and the Kestrel Hut refuge on the west
// ridge, where the rescue pickup lands.
import * as THREE from 'three';
import { WORLD, createRandom } from './config.js';
import { DROP_ZONES, RESCUE_PAD } from './missions.js';

// Height of the terrain at world (x, z). Deterministic: pure function of x/z,
// so physics, the runway and the mesh always agree. Valley floor near the
// centre, rolling hills, then a ring of snow-capped mountains at the edge.
// The runway strip (a flat pad around the airfield) is carved flat.
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const nx = x / WORLD.size;
  const nz = z / WORLD.size;
  let h = 0;
  // Rolling hills, a few octaves of smooth sine noise.
  h += 26 * Math.sin(nx * 9.1 + 1.3) * Math.cos(nz * 7.7 - 0.6);
  h += 14 * Math.sin(nx * 17.3 - nz * 12.9 + 2.1);
  h += 6 * Math.sin(nx * 31.0 + nz * 27.0);
  // Mountain ring: rises steeply beyond ~55% of the half-size.
  const edge = Math.max(0, (r - WORLD.size * 0.55) / (WORLD.size * 0.45));
  h += WORLD.mountainHeight * edge * edge * (0.75 + 0.25 * Math.sin(Math.atan2(z, x) * 5 + 1.0));
  // River valley carve: a gentle dip along a diagonal band so the river reads.
  const riverD = Math.abs((x - z) * 0.7071);
  h -= 9 * Math.exp(-(riverD * riverD) / (2 * 90 * 90)) * Math.max(0, 1 - r / (WORLD.size * 0.6));
  // Airfield pad: flat near the runway (a strip along Z at x near 0, z in [-260, 260]).
  const pad = smoothstep(90, 40, Math.abs(x)) * smoothstep(300, 240, Math.abs(z));
  h = h * (1 - pad) + 2 * pad;
  return h;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Vertex colours for the terrain: green valley grass, rock and snow on the
// mountains, sandy riverbank along the river band.
function groundColor(x, z, h) {
  const r = Math.hypot(x, z);
  const riverD = Math.abs((x - z) * 0.7071);
  const c = new THREE.Color();
  if (h > 300) c.setHex(0xf4f7f5); // snow
  else if (h > 170) c.setHex(0x8a7f74); // rock
  else if (riverD < 26 && r < WORLD.size * 0.6) c.setHex(0xc9b489); // riverbank sand
  else {
    // Patchy meadow green.
    const patch = 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.043);
    c.setHex(0x5da244).lerp(new THREE.Color(0x79b657), patch * 0.7);
  }
  return c;
}

export function createTerrain(seed) {
  const group = new THREE.Group();
  const random = createRandom(seed);

  // Ground mesh: a displaced plane, flat-shaded, vertex colours.
  const segments = 128;
  const geo = new THREE.PlaneGeometry(WORLD.size * 2, WORLD.size * 2, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const c = groundColor(x, z, h);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  ground.receiveShadow = true;
  group.add(ground);

  // Lake Solenne: a flat blue disc in the river valley, south-east of the airfield.
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(150, 40),
    new THREE.MeshLambertMaterial({ color: 0x3f8fd2, transparent: true, opacity: 0.92 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(420, 3.2, 420);
  group.add(lake);

  // River: one ribbon of quads following the diagonal band, hugging the terrain.
  const riverMat = new THREE.MeshLambertMaterial({ color: 0x4a9ad8 });
  const riverPositions = [];
  const riverIndices = [];
  const perpX = 0.7071;
  const perpZ = -0.7071;
  const halfWidth = 15;
  let riverCount = 0;
  for (let t = -750; t <= 750; t += 50) {
    const cx = t * 0.7071;
    const cz = t * 0.7071;
    const lx = cx - perpX * halfWidth;
    const lz = cz - perpZ * halfWidth;
    const rx = cx + perpX * halfWidth;
    const rz = cz + perpZ * halfWidth;
    riverPositions.push(lx, groundHeight(lx, lz) + 0.8, lz, rx, groundHeight(rx, rz) + 0.8, rz);
    if (riverCount > 0) {
      const a = (riverCount - 1) * 2;
      riverIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    riverCount += 1;
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3));
  riverGeo.setIndex(riverIndices);
  riverGeo.computeVertexNormals();
  group.add(new THREE.Mesh(riverGeo, riverMat));

  // Runway: dark asphalt strip with white centre dashes and threshold bars.
  const runway = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.runwayWidth, WORLD.runwayLength),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 2.6;
  runway.add(strip);
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ea });
  for (let z = -WORLD.runwayLength / 2 + 20; z < WORLD.runwayLength / 2 - 10; z += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 18), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 2.7, z);
    runway.add(dash);
  }
  for (const zEnd of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 10), dashMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(k * 4.6, 2.7, zEnd * (WORLD.runwayLength / 2 - 14));
      runway.add(bar);
    }
  }
  group.add(runway);

  // Windsocks and hangar at the airfield.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const sockMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  for (const [sx, sz] of [[-40, -190], [40, 190]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 6), poleMat);
    pole.position.set(sx, 9, sz);
    group.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 8), sockMat);
    sock.rotation.z = -Math.PI / 2;
    sock.position.set(sx + 3.5, 15, sz);
    group.add(sock);
  }
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(34, 12, 22),
    new THREE.MeshLambertMaterial({ color: 0xb8452e }),
  );
  hangar.position.set(-52, 8, 60);
  group.add(hangar);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 34, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x8f3524 }),
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.set(-52, 14, 60);
  group.add(hangarRoof);

  // Cargo drop zones: orange target rings on the three marked meadows,
  // each with a windsock flag so the pilot can spot them from the air.
  const zoneRingGeo = new THREE.RingGeometry(30, 40, 32);
  const zoneInnerGeo = new THREE.RingGeometry(6, 10, 24);
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, side: THREE.DoubleSide });
  const zoneInnerMat = new THREE.MeshBasicMaterial({ color: 0xffc21a, side: THREE.DoubleSide });
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  for (const zone of DROP_ZONES) {
    const gy = groundHeight(zone.position.x, zone.position.z);
    const ring = new THREE.Mesh(zoneRingGeo, zoneMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zone.position.x, gy + 0.7, zone.position.z);
    group.add(ring);
    const inner = new THREE.Mesh(zoneInnerGeo, zoneInnerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(zone.position.x, gy + 0.8, zone.position.z);
    group.add(inner);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 6), poleMat);
    pole.position.set(zone.position.x + 42, gy + 6, zone.position.z);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 6), flagMat);
    flag.rotation.z = -Math.PI / 2;
    flag.position.set(zone.position.x + 45, gy + 13, zone.position.z);
    group.add(flag);
  }

  // Rescue pad beside Kestrel Hut: a green H-marked circle on the west
  // ridge, and the hut itself — red roof, stone walls — just off the pad.
  const padY = groundHeight(RESCUE_PAD.position.x, RESCUE_PAD.position.z);
  const padDisc = new THREE.Mesh(
    new THREE.CircleGeometry(RESCUE_PAD.radius, 32),
    new THREE.MeshLambertMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.55 }),
  );
  padDisc.rotation.x = -Math.PI / 2;
  padDisc.position.set(RESCUE_PAD.position.x, padY + 0.7, RESCUE_PAD.position.z);
  group.add(padDisc);
  const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (const [hx, hz, rot] of [
    [RESCUE_PAD.position.x - 8, RESCUE_PAD.position.z, 0],
    [RESCUE_PAD.position.x + 8, RESCUE_PAD.position.z, 0],
    [RESCUE_PAD.position.x, RESCUE_PAD.position.z, Math.PI / 2],
  ]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), hMat);
    bar.rotation.x = -Math.PI / 2;
    bar.rotation.z = rot;
    bar.position.set(hx, padY + 0.8, hz);
    group.add(bar);
  }
  const hutX = RESCUE_PAD.position.x + 34;
  const hutZ = RESCUE_PAD.position.z + 18;
  const hutY = groundHeight(hutX, hutZ);
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(12, 7, 9),
    new THREE.MeshLambertMaterial({ color: 0x9a8f80 }),
  );
  hut.position.set(hutX, hutY + 3.5, hutZ);
  group.add(hut);
  const hutRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 5.2, 12.5, 3, 1),
    new THREE.MeshLambertMaterial({ color: 0xb8452e, flatShading: true }),
  );
  hutRoof.rotation.z = Math.PI / 2;
  hutRoof.rotation.y = Math.PI / 2;
  hutRoof.position.set(hutX, hutY + 7, hutZ);
  group.add(hutRoof);

  // Pine trees: cones on cylinders, scattered on the valley floor, kept clear
  // of the runway strip and the lake.
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.0, 5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const pineGeo = new THREE.ConeGeometry(4.2, 13, 7);
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34, flatShading: true });
  const pineMat2 = new THREE.MeshLambertMaterial({ color: 0x35793c, flatShading: true });
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, 260);
  const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, 260);
  const pineMesh2 = new THREE.InstancedMesh(pineGeo, pineMat2, 260);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < 260 && guard < 4000) {
    guard += 1;
    const x = (random() - 0.5) * WORLD.size * 1.5;
    const z = (random() - 0.5) * WORLD.size * 1.5;
    const h = groundHeight(x, z);
    if (h > 150) continue; // no trees on the rock/snow
    if (Math.abs(x) < 70 && Math.abs(z) < 300) continue; // keep the runway clear
    if (Math.hypot(x - 420, z - 420) < 170) continue; // keep the lake clear
    const s = 0.8 + random() * 0.9;
    dummy.position.set(x, h + 2.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (2.5 + 6.5) * s;
    dummy.updateMatrix();
    (placed % 2 === 0 ? pineMesh : pineMesh2).setMatrixAt(Math.floor(placed / 2), dummy.matrix);
    placed += 1;
  }
  trunkMesh.count = placed;
  pineMesh.count = Math.ceil(placed / 2);
  pineMesh2.count = Math.floor(placed / 2);
  group.add(trunkMesh, pineMesh, pineMesh2);

  // Clouds: flat-shaded white blobs drifting above the valley.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const r = 18 + random() * 26;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), cloudMat);
      puff.position.set((random() - 0.5) * 80, (random() - 0.5) * 10, (random() - 0.5) * 36);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(
      (random() - 0.5) * WORLD.size * 1.8,
      230 + random() * 150,
      (random() - 0.5) * WORLD.size * 1.8,
    );
    cloud.userData.drift = 1.5 + random() * 2.5;
    clouds.push(cloud);
    group.add(cloud);
  }

  return { group, clouds };
}

// Drift the clouds slowly across the valley; wrap around at the edge.
export function updateClouds(clouds, dt) {
  for (const cloud of clouds) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > WORLD.size) cloud.position.x = -WORLD.size;
  }
}

// The runway's world-space centre and heading (north = -Z). Takeoff runs
// from the south end toward the north end.
export const RUNWAY = {
  start: new THREE.Vector3(0, 2, WORLD.runwayLength / 2 - 30),
  end: new THREE.Vector3(0, 2, -WORLD.runwayLength / 2 + 30),
  heading: 0, // facing -Z (north)
};

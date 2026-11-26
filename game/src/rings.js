// Cloudrunner — rings: the Ring Run course across the valley.
// One job: place the 8 rings deterministically and render them.
import * as THREE from 'three';
import { RINGS } from './config.js';
import { groundHeight } from './terrain.js';
import { createRandom } from './config.js';

// Ring centres follow a tour of valley landmarks so the course reads:
// over the river, past the lake, around the hills, back to the airfield.
const COURSE = [
  [0, 55, -350], // straight ahead off the runway, low
  [-260, 70, -520],
  [-520, 95, -260],
  [-480, 120, 220],
  [-140, 85, 480],
  [300, 110, 420], // over the lake
  [560, 95, 60],
  [260, 70, -260], // final approach, lined up on the runway
];

export function createRings(seed) {
  const random = createRandom(seed + 777);
  const rings = COURSE.map(([x, y, z], index) => {
    const jitter = index === 0 || index === RINGS.count - 1 ? 0 : 1;
    const px = x + (random() - 0.5) * 24 * jitter;
    const pz = z + (random() - 0.5) * 24 * jitter;
    const ground = groundHeight(px, pz);
    const py = Math.max(y, ground + 30);
    return {
      index,
      position: new THREE.Vector3(px, py, pz),
      radius: RINGS.radius,
      passed: false,
    };
  });

  const group = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(RINGS.radius, 1.1, 10, 40);
  const beaconGeo = new THREE.CylinderGeometry(1.6, 1.6, 260, 8, 1, true);
  const meshes = rings.map((ring) => {
    const material = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(ringGeo, material);
    mesh.position.copy(ring.position);
    // Face the ring along the course: toward the previous ring (or the runway
    // for ring 1, toward the runway for the last ring).
    const from = ring.index === 0
      ? new THREE.Vector3(0, 2, 180)
      : rings[ring.index - 1].position;
    mesh.lookAt(from.x, from.y, from.z);
    group.add(mesh);
    // A vertical beacon of light marks the next ring from anywhere.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.copy(ring.position);
    group.add(beacon);
    return { mesh, beacon, material, beaconMat };
  });

  // Dim the rings already passed; the next one pulses bright, later ones dimmer.
  function update(currentIndex, time) {
    meshes.forEach((m, i) => {
      if (i < currentIndex) {
        m.material.color.setHex(0x2fbf71);
        m.material.opacity = 0.45;
        m.beaconMat.opacity = 0.0;
        m.mesh.visible = true;
      } else if (i === currentIndex) {
        m.material.color.setHex(0xffc21a);
        m.material.opacity = 0.85 + 0.15 * Math.sin(time * 5);
        m.beaconMat.color.setHex(0xffc21a);
        m.beaconMat.opacity = 0.22;
      } else {
        m.material.color.setHex(0x22d3ee);
        m.material.opacity = 0.55;
        m.beaconMat.opacity = 0.06;
      }
    });
  }

  return { rings, group, update };
}

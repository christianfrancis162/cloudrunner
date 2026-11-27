// Cloudrunner — aircraft: a low-poly stunt plane built from primitives.
// One job: build the plane mesh, pose it from the flight state, spin the prop.
// The hangar picks the plane: the Kestrel flies red with a short wing, the
// Albatross blue with a longer one — the paint and the span are the plane.
import * as THREE from 'three';
import { planeById } from './planes.js';

export function createAircraft(planeId = 'kestrel') {
  const plane = planeById(planeId);
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: plane.paint, flatShading: true });
  const cream = new THREE.MeshLambertMaterial({ color: plane.accent, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ef, flatShading: true });

  // Fuselage: a tapered body — nose cone, main tube, tail cone.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.4, 8), paint);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 8), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.5;
  group.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 8), paint);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 3.6;
  group.add(tailCone);

  // Canopy: a glass bubble over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), glass);
  canopy.scale.set(0.85, 0.7, 1.6);
  canopy.position.set(0, 0.72, -0.6);
  group.add(canopy);

  // Main wing (low wing) and tailplane, with cream tips. The Albatross
  // carries a longer wing than the Kestrel — it shows in the silhouette.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(plane.wingSpan, 0.16, 1.7), paint);
  wing.position.set(0, -0.15, -0.4);
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 1.7), cream);
    tip.position.set(side * (plane.wingSpan / 2 - 0.35), -0.15, -0.4);
    group.add(tip);
  }
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.1), cream);
  tailplane.position.set(0, 0.25, 3.9);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.4), paint);
  fin.position.set(0, 0.9, 3.9);
  group.add(fin);

  // Landing gear: two fixed wheels and a tail wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), dark);
    strut.position.set(side * 0.9, -0.75, -0.9);
    strut.rotation.z = side * 0.35;
    group.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.15, -1.25, -0.9);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 8), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.55, 3.9);
  group.add(tailWheel);

  // Propeller: spinner cone plus two blades in a group that spins.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 8), dark);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.5;
  prop.add(spinner);
  const bladeGeo = new THREE.BoxGeometry(0.22, 2.6, 0.08);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.position.z = -4.3;
    blade.rotation.z = angle;
    prop.add(blade);
  }
  prop.position.z = 0;
  group.add(prop);

  // Navigation lights: red left, green right, white tail — on the wingtips.
  const lightMat = (color) => new THREE.MeshBasicMaterial({ color });
  const leftLight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lightMat(0xff2222));
  leftLight.position.set(-plane.wingSpan / 2, -0.15, -0.4);
  const rightLight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lightMat(0x22ff66));
  rightLight.position.set(plane.wingSpan / 2, -0.15, -0.4);
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), lightMat(0xffffff));
  tailLight.position.set(0, 0.3, 4.55);
  group.add(leftLight, rightLight, tailLight);

  group.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  return { group, prop };
}

// Pose the plane from the flight state: position, heading, pitch and bank.
// The model is built facing -Z, matching the physics forward vector.
export function poseAircraft(aircraft, state, dt) {
  const { group, prop } = aircraft;
  group.position.copy(state.position);
  group.rotation.order = 'YXZ';
  group.rotation.y = state.heading;
  group.rotation.x = state.pitch;
  group.rotation.z = state.bank;
  // Propeller spins faster with throttle; windmills slowly when gliding.
  const spin = (0.6 + state.throttle * 26) * (state.engineOn ? 1 : 0.15);
  prop.rotation.z += spin * dt;
}

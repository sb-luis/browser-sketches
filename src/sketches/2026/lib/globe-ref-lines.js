import * as THREE from 'three';

const LINE_RADIUS = 1.001;
const SEGMENTS = 128;

/** Converts lat/lon degrees to a 3D point just above the globe surface. */
function latLonToVec3(lat, lon, r = LINE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function makeLatitudeLine(lat, material) {
  const points = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    points.push(latLonToVec3(lat, -180 + (360 * i) / SEGMENTS));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function makeMeridian(lon, material) {
  const points = [];
  for (let i = 0; i <= SEGMENTS / 2; i++) {
    points.push(latLonToVec3(-90 + (180 * i) / (SEGMENTS / 2), lon));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

/**
 * Adds a reference line grid to `scene` (or any Object3D).
 *
 * Options:
 *   meridianStep        — longitude spacing in degrees (default 30)
 *   parallelStep        — latitude spacing in degrees (default 30)
 *   accentOpacity       — opacity for key lines: equator, prime meridian, date line (default 0.85)
 *   dimOpacity          — opacity for the regular grid (default 0.25)
 */
export function addGlobeRefLines(scene, {
  meridianStep = 30,
  parallelStep = 30,
  accentOpacity = 0.85,
  dimOpacity = 0.25,
  showArcticAntarctic = false,
  showPoles = false,
} = {}) {
  const accentLine = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: accentOpacity,
    depthTest: true, depthWrite: false,
  });
  const dimLine = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: dimOpacity,
    depthTest: true, depthWrite: false,
  });

  // Key reference lines
  scene.add(makeLatitudeLine(0, accentLine));   // equator
  scene.add(makeMeridian(0, accentLine));       // prime meridian
  scene.add(makeMeridian(180, accentLine));     // international date line

  // Meridian grid
  for (let lon = -180; lon < 180; lon += meridianStep) {
    if (lon === 0 || lon === -180) continue;
    scene.add(makeMeridian(lon, dimLine));
  }

  // Parallel grid (skip lines already drawn as accent above)
  const accentLats = new Set([0, ...(showArcticAntarctic ? [66.5, -66.5] : [])]);
  for (let lat = -90 + parallelStep; lat < 90; lat += parallelStep) {
    if (accentLats.has(lat)) continue;
    scene.add(makeLatitudeLine(lat, dimLine));
  }
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addGlobeRefLines } from '../lib/globe-ref-lines.js';
import { fetchGeo } from '../lib/geo-fetch.js';
import { createMetrics } from '../lib/geo-metrics.js';
import { C_OCEAN, C_BACKGROUND, C_REF_LINE } from '../lib/geo-color-palette.js';

const CAMERA_DIST = 3;
const MIN_FOV     = 0.3;
const MAX_FOV     = 80;
const LINE_RADIUS = 1.001;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const LEVELS = [
  { fovMin: 20, res: 110, url: '/geo/collections/ne_110m_admin_0_countries/items?limit=10000' },
  { fovMin: 4,  res: 50,  url: '/geo/collections/ne_50m_admin_0_countries/items?limit=10000' },
  { fovMin: 0,  res: 10,  url: '/geo/collections/ne_10m_admin_0_countries/items?limit=10000' },
];

function lodForFov(fov) {
  if (fov > LEVELS[0].fovMin) return 0;
  if (fov > LEVELS[1].fovMin) return 1;
  return 2;
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function latLonToVec3(lat, lon, r = LINE_RADIUS) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function vec3ToLatLon(v) {
  const lat = Math.asin(v.y) * (180 / Math.PI);
  let theta = Math.atan2(v.z, -v.x);
  if (theta < 0) theta += 2 * Math.PI;
  const lon = theta * (180 / Math.PI) - 180;
  return { lat, lon };
}

// ─── Point-in-polygon ────────────────────────────────────────────────────────
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function hitTestFeature(lon, lat, feature) {
  const { type, coordinates } = feature.geometry;
  const polys = type === 'Polygon' ? [coordinates] : coordinates;
  for (const poly of polys) {
    if (!pointInRing(lon, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lon, lat, poly[h])) { inHole = true; break; }
    }
    if (!inHole) return feature.properties?.NAME ?? feature.properties?.ADMIN ?? 'Unknown';
  }
  return null;
}

function pickCountry(lon, lat, features) {
  for (const feature of features) {
    const name = hitTestFeature(lon, lat, feature);
    if (name !== null) return name;
  }
  return null;
}

// ─── Scene ───────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(C_BACKGROUND, 1);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(MAX_FOV, 1, 0.1, 100);
camera.position.set(CAMERA_DIST, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.enableZoom = false;
controls.enablePan  = false;
controls.minDistance = controls.maxDistance = CAMERA_DIST;

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshBasicMaterial({ color: C_OCEAN }),
));
addGlobeRefLines(scene, { color: C_REF_LINE, accentOpacity: 0.35, dimOpacity: 0.12 });

// ─── Metrics ─────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud');
const { startFetch, set, reveal } = createMetrics(hud, [
  { key: 'detail', label: 'detail', live: true },
  { key: 'verts',  label: 'verts',  live: true },
  { key: 'fov',    label: 'fov',    live: true },
]);
let statsReady = false;

// ─── Label ───────────────────────────────────────────────────────────────────
const labelEl = Object.assign(document.createElement('div'), { id: 'label' });
const hintEl  = Object.assign(document.createElement('div'), { id: 'hint', textContent: 'double-click to identify' });
hud.append(labelEl, hintEl);

let labelTimer = null;

function showLabel(text, isOcean) {
  clearTimeout(labelTimer);
  labelEl.textContent = text;
  labelEl.className = isOcean ? 'ocean visible' : 'visible';
  hintEl.style.opacity = '0';
  labelTimer = setTimeout(() => {
    labelEl.className = labelEl.className.replace('visible', '').trim();
    hintEl.style.opacity = '';
  }, 3000);
}

// ─── Border geometry ─────────────────────────────────────────────────────────
const borderMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  depthTest: true,
  depthWrite: false,
});

function buildBorderGroup(geojson) {
  const group = new THREE.Group();
  let totalVerts = 0;
  for (const feature of geojson.features) {
    const { type, coordinates } = feature.geometry;
    const polys = type === 'Polygon' ? [coordinates] : coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon));
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        totalVerts += pts.length;
        const line = new THREE.Line(geo, borderMaterial);
        line.renderOrder = 999;
        group.add(line);
      }
    }
  }
  return { group, totalVerts };
}

// ─── LOD state ───────────────────────────────────────────────────────────────
const groups   = Array(3).fill(null);
const geojsons = Array(3).fill(null);
const loaded   = [false, false, false];
let activeLod  = -1;
let loadingLod = -1;

async function loadLod(level) {
  if (loaded[level] || loadingLod === level) return;
  loadingLod = level;

  const stopFetch = startFetch();
  const { geojson, fetchMs, fromCache } = await fetchGeo(LEVELS[level].url);

  const { group, totalVerts } = buildBorderGroup(geojson);
  group.visible = false;
  scene.add(group);
  groups[level]   = { group, totalVerts };
  geojsons[level] = geojson;
  loaded[level]   = true;
  loadingLod      = -1;
  applyLod(level);

  if (!statsReady) {
    await stopFetch(fetchMs, { fromCache });
    await reveal([
      { key: 'detail', value: LEVELS[level].res, unit: 'm' },
      { key: 'verts',  value: Math.round(groups[level].totalVerts / 1000), unit: 'K' },
      { key: 'fov',    value: Math.round(currentFov * 10) / 10, unit: '°' },
    ]);
    statsReady = true;
  } else {
    stopFetch(fetchMs, { fromCache });
  }
}

function applyLod(level) {
  if (!loaded[level]) return;
  if (activeLod === level) return;
  if (activeLod >= 0 && groups[activeLod]) groups[activeLod].group.visible = false;
  groups[level].group.visible = true;
  activeLod = level;
  if (statsReady) {
    set('detail', LEVELS[level].res, 'm');
    set('verts',  Math.round(groups[level].totalVerts / 1000), 'K');
  }
}

// ─── Double-click: ray → sphere → lat/lon → PIP ──────────────────────────────
const _raycaster   = new THREE.Raycaster();
const _mouse       = new THREE.Vector2();
const _globeSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
const _hitPt       = new THREE.Vector3();

canvas.addEventListener('dblclick', e => {
  const rect = canvas.getBoundingClientRect();
  _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_mouse, camera);

  if (!_raycaster.ray.intersectSphere(_globeSphere, _hitPt)) return;

  const { lat, lon } = vec3ToLatLon(_hitPt.normalize());
  const features = geojsons[activeLod]?.features ?? [];
  const name = pickCountry(lon, lat, features);
  showLabel(name ?? 'Ocean', name === null);
});

// ─── FOV zoom ────────────────────────────────────────────────────────────────
let currentFov   = MAX_FOV;
let currentLevel = -1;

function setFov(fov) {
  currentFov = clamp(fov, MIN_FOV, MAX_FOV);
  camera.fov = currentFov;
  camera.updateProjectionMatrix();
  const zoom = 60 / currentFov;
  controls.rotateSpeed   = 0.95 / Math.pow(zoom + 0.5, 1.15);
  controls.dampingFactor = 0.1 + Math.min(zoom / 200, 1) * 0.4;

  const level = lodForFov(currentFov);
  if (level !== currentLevel) {
    currentLevel = level;
    loaded[level] ? applyLod(level) : loadLod(level);
  }
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const zoom  = 60 / currentFov;
  const speed = Math.max(0.15, 2.5 / Math.pow(zoom + 0.5, 0.6));
  setFov(currentFov + (e.deltaY > 0 ? speed : -speed));
}, { passive: false });

// ─── Resize & loop ───────────────────────────────────────────────────────────
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (statsReady) set('fov', Math.round(currentFov * 10) / 10, '°');
  renderer.render(scene, camera);
}
animate();

setFov(MAX_FOV);
loadLod(0);

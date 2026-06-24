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
const CELL_STEP   = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// LOD levels — finer data loaded on demand as user zooms in
const LEVELS = [
  { fovMin: 20, label: '110m', res: 110, url: '/geo/collections/ne_110m_admin_0_countries/items?limit=10000' },
  { fovMin: 4,  label: '50m',  res: 50,  url: '/geo/collections/ne_50m_admin_0_countries/items?limit=10000' },
  { fovMin: 0,  label: '10m',  res: 10,  url: '/geo/collections/ne_10m_admin_0_countries/items?limit=10000' },
];

function lodForFov(fov) {
  if (fov > LEVELS[0].fovMin) return 0;
  if (fov > LEVELS[1].fovMin) return 1;
  return 2;
}

// ─── Cell grid (same 10° system as culling sketches) ─────────────────────────
function latLonToVec3(lat, lon, r = LINE_RADIUS) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function buildCells() {
  const LAT_STEPS = Math.round(180 / CELL_STEP);
  const LON_STEPS = Math.round(360 / CELL_STEP);
  const NUM_CELLS = LAT_STEPS * LON_STEPS;
  const centers = [], meta = [];
  for (let li = 0; li < LAT_STEPS; li++) {
    for (let lj = 0; lj < LON_STEPS; lj++) {
      centers.push(latLonToVec3(
        -90 + li * CELL_STEP + CELL_STEP / 2,
        -180 + lj * CELL_STEP + CELL_STEP / 2,
        1,
      ).normalize());
      meta.push({ li, lj });
    }
  }
  return { centers, meta, NUM_CELLS, LAT_STEPS, LON_STEPS };
}

const cells = buildCells();
const HALF_CELL_CHORD = 2 * Math.sin((CELL_STEP * Math.sqrt(2) / 2) * (Math.PI / 180) / 2);
const LOD_PX    = [150, 400];
const LOD_COLORS = ['#2d5fa5', '#d97706', '#fbbf24'];
const CULL_COLOR = '#111c32';

// ─── Border geo helpers ───────────────────────────────────────────────────────
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

// ─── Scene ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(C_BACKGROUND, 1);

const scene = new THREE.Scene();
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
addGlobeRefLines(scene, { color: C_REF_LINE, meridianStep: CELL_STEP, parallelStep: CELL_STEP, accentOpacity: 0.35, dimOpacity: 0.12 });

// ─── Metrics ─────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud');
const { startFetch, set, reveal } = createMetrics(hud, [
  { key: 'detail', label: 'detail', live: true },
  { key: 'verts',  label: 'verts',  live: true },
  { key: 'fov',    label: 'fov',    live: true },
]);
let statsReady = false;

// ─── Minimap ─────────────────────────────────────────────────────────────────
const minimapEl = Object.assign(document.createElement('canvas'), { id: 'minimap' });
const labelEl   = Object.assign(document.createElement('div'), { id: 'minimap-label', textContent: 'equirectangular view' });
hud.append(minimapEl, labelEl);

const mm = minimapEl.getContext('2d');
const MM_W = 216, MM_H = 108, CELL_PX_W = MM_W / cells.LON_STEPS;
minimapEl.width = MM_W; minimapEl.height = MM_H;

const lodPerCell = new Int8Array(cells.NUM_CELLS);

function drawMinimap() {
  mm.fillStyle = '#080c14';
  mm.fillRect(0, 0, MM_W, MM_H);
  for (let i = 0; i < cells.NUM_CELLS; i++) {
    const { li, lj } = cells.meta[i];
    mm.fillStyle = lodPerCell[i] < 0 ? CULL_COLOR : LOD_COLORS[lodPerCell[i]];
    mm.fillRect(lj * CELL_PX_W + 0.5, (cells.LAT_STEPS - 1 - li) * CELL_PX_W + 0.5, CELL_PX_W - 1, CELL_PX_W - 1);
  }
}

// ─── LOD state ───────────────────────────────────────────────────────────────
const groups   = Array(3).fill(null); // { group, totalVerts }
const loaded   = [false, false, false];
let activeLod  = -1;
let loadingLod = -1;

async function loadLod(level) {
  if (loaded[level] || loadingLod === level) return;
  loadingLod = level;

  const stopFetch = startFetch();
  const { geojson, fetchMs, fromCache } = await fetchGeo(LEVELS[level].url);

  // Build geometry and show it immediately — don't block on the fetch animation
  const { group, totalVerts } = buildBorderGroup(geojson);
  group.visible = false;
  scene.add(group);
  groups[level] = { group, totalVerts };
  loaded[level] = true;
  loadingLod = -1;
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

// ─── Per-frame: cell LOD assignment for minimap ───────────────────────────────
const frustum  = new THREE.Frustum();
const _projMat = new THREE.Matrix4();
const _sphere  = new THREE.Sphere();
const _tmp     = new THREE.Vector3();
const _camDir  = new THREE.Vector3();

function lodForCell(center) {
  _tmp.copy(center).sub(camera.position);
  const dist    = _tmp.length();
  const angDiam = 2 * Math.atan(HALF_CELL_CHORD / dist);
  const fovY    = camera.fov * (Math.PI / 180);
  const px      = (angDiam / fovY) * canvas.clientHeight;
  if (px >= LOD_PX[1]) return 2;
  if (px >= LOD_PX[0]) return 1;
  return 0;
}

function updateMinimap() {
  _camDir.copy(camera.position).normalize();
  _projMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(_projMat);

  for (let i = 0; i < cells.NUM_CELLS; i++) {
    const center = cells.centers[i];
    if (center.dot(_camDir) <= 0) { lodPerCell[i] = -1; continue; }
    _sphere.center.copy(center);
    _sphere.radius = HALF_CELL_CHORD;
    if (!frustum.intersectsSphere(_sphere)) { lodPerCell[i] = -1; continue; }
    lodPerCell[i] = lodForCell(center);
  }
  drawMinimap();
}

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
  updateMinimap();
  renderer.render(scene, camera);
}
animate();

setFov(MAX_FOV);

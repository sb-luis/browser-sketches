import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addGlobeRefLines } from '../lib/globe-ref-lines.js';
import { createMetrics } from '../lib/geo-metrics.js';
import { C_OCEAN, C_BACKGROUND, C_REF_LINE } from '../lib/geo-color-palette.js';

const CAMERA_DIST = 3;
const MIN_FOV     = 0.3;
const MAX_FOV     = 80;
const CELL_STEP   = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function latLonToVec3(lat, lon) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
     Math.cos(phi),
     Math.sin(phi) * Math.sin(theta),
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
      ).normalize());
      meta.push({ li, lj });
    }
  }
  return { centers, meta, NUM_CELLS, LAT_STEPS, LON_STEPS };
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

const cells = buildCells();

// ─── Metrics ─────────────────────────────────────────────────────────────────
const { set, reveal } = createMetrics(
  document.getElementById('hud'),
  [
    { key: 'active', label: 'active', live: true },
    { key: 'culled', label: 'culled', live: true },
    { key: 'total',  label: 'total',  live: false },
  ],
  { fetch: false },
);
let statsReady = false;
reveal([
  { key: 'active', value: 0, unit: ' cells' },
  { key: 'culled', value: 0, unit: ' cells' },
  { key: 'total',  value: cells.NUM_CELLS, unit: ' cells' },
]).then(() => { statsReady = true; });

// ─── Minimap ─────────────────────────────────────────────────────────────────
const minimapEl = Object.assign(document.createElement('canvas'), { id: 'minimap' });
const labelEl   = Object.assign(document.createElement('div'),   { id: 'minimap-label', textContent: 'equirectangular view' });
document.getElementById('hud').append(minimapEl, labelEl);

const mm = minimapEl.getContext('2d');
const MM_W = 216, MM_H = 108, CELL_PX = MM_W / cells.LON_STEPS;
minimapEl.width = MM_W; minimapEl.height = MM_H;

function drawMinimap(activeFlags) {
  mm.fillStyle = '#080c14';
  mm.fillRect(0, 0, MM_W, MM_H);
  for (let i = 0; i < cells.NUM_CELLS; i++) {
    const { li, lj } = cells.meta[i];
    mm.fillStyle = activeFlags[i] ? '#fbbf24' : '#111c32';
    mm.fillRect(lj * CELL_PX + 0.5, (cells.LAT_STEPS - 1 - li) * CELL_PX + 0.5, CELL_PX - 1, CELL_PX - 1);
  }
}

// ─── Per-frame update ────────────────────────────────────────────────────────
const _camDir     = new THREE.Vector3();
const activeFlags = new Uint8Array(cells.NUM_CELLS);

function updateCells() {
  _camDir.copy(camera.position).normalize();
  let activeCount = 0;
  for (let i = 0; i < cells.NUM_CELLS; i++) {
    const active = cells.centers[i].dot(_camDir) > 0;
    activeFlags[i] = active ? 1 : 0;
    if (active) activeCount++;
  }
  set('active', activeCount,                ' cells');
  set('culled', cells.NUM_CELLS - activeCount, ' cells');
  drawMinimap(activeFlags);
}

// ─── FOV zoom ────────────────────────────────────────────────────────────────
let currentFov = MAX_FOV;

function setFov(fov) {
  currentFov = clamp(fov, MIN_FOV, MAX_FOV);
  camera.fov = currentFov;
  camera.updateProjectionMatrix();
  const zoom = 60 / currentFov;
  controls.rotateSpeed   = 0.95 / Math.pow(zoom + 0.5, 1.15);
  controls.dampingFactor = 0.1 + Math.min(zoom / 200, 1) * 0.4;
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const zoom  = 60 / currentFov;
  const speed = Math.max(0.15, 2.5 / Math.pow(zoom + 0.5, 0.6));
  setFov(currentFov + (e.deltaY > 0 ? speed : -speed));
}, { passive: false });

setFov(MAX_FOV);

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
  if (statsReady) updateCells();
  renderer.render(scene, camera);
}
animate();

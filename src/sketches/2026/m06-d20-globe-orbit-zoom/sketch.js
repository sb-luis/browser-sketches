import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addGlobeRefLines } from '../lib/globe-ref-lines.js';
import { C_OCEAN, C_BACKGROUND, C_REF_LINE } from '../lib/geo-color-palette.js';

const GLOBE_RADIUS = 1;
const CAMERA_DISTANCE = 3;
const MIN_FOV = 0.3;
const MAX_FOV = 80;

// ─── Zoom helpers ─────────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function zoomSpeed(fov) {
  const normalised = (fov - MIN_FOV) / (MAX_FOV - MIN_FOV);
  return 0.5 + normalised * 4;
}

function rotateSpeed(fov) {
  const normalised = (fov - MIN_FOV) / (MAX_FOV - MIN_FOV);
  return 0.2 + normalised * 0.8;
}

// ─── Scene setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(C_BACKGROUND, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(MAX_FOV, 1, 0.1, 100);
camera.position.set(CAMERA_DISTANCE, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.enableZoom = false;
controls.enablePan = false;
controls.minDistance = CAMERA_DISTANCE;
controls.maxDistance = CAMERA_DISTANCE;

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64),
  new THREE.MeshBasicMaterial({ color: C_OCEAN }),
));

addGlobeRefLines(scene, { color: C_REF_LINE, meridianStep: 30, parallelStep: 30 });

// ─── FOV zoom via scroll wheel ────────────────────────────────────────────────

let currentFov = MAX_FOV;

function setFov(fov) {
  currentFov = clamp(fov, MIN_FOV, MAX_FOV);
  camera.fov = currentFov;
  camera.updateProjectionMatrix();
  controls.rotateSpeed = rotateSpeed(currentFov);
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? zoomSpeed(currentFov) : -zoomSpeed(currentFov);
  setFov(currentFov + delta);
}, { passive: false });

setFov(MAX_FOV);

// ─── Resize ───────────────────────────────────────────────────────────────────

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

// ─── Render loop ──────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addGlobeRefLines } from '../lib/globe-ref-lines.js';

const OCEAN_COLOR = 0x1e3a8a;
const COUNTRY_COLOR = 0xffffff;
const BACKGROUND_COLOR = 0x000000;
const GLOBE_RADIUS = 1;
const LINE_RADIUS = 1.001;
const CAMERA_DISTANCE = 3;
const MIN_FOV = 0.3;
const MAX_FOV = 80;

const GEO_URL = '/geo/collections/ne_110m_admin_0_countries/items?limit=10000&ISO_A3=RUS';

// projection

function latLonToVec3(lat, lon, r = LINE_RADIUS) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// rendering 

function renderRing(coords, material, scene) {
  const points = coords.map(([lon, lat]) => latLonToVec3(lat, lon));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 999;
  scene.add(line);
}

function renderCountry(feature, material, scene) {
  const { type, coordinates } = feature.geometry;

  if (type === 'Polygon') {
    for (const ring of coordinates) renderRing(ring, material, scene);
  } else if (type === 'MultiPolygon') {
    for (const polygon of coordinates)
      for (const ring of polygon) renderRing(ring, material, scene);
  }
}

// scene setup 

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(BACKGROUND_COLOR, 1);

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
  new THREE.MeshBasicMaterial({ color: OCEAN_COLOR }),
));

addGlobeRefLines(scene, {
  accentOpacity: 0.35,
  dimOpacity: 0.1,
});

// fetch and draw 

const countryMaterial = new THREE.LineBasicMaterial({
  color: COUNTRY_COLOR,
  depthTest: true,
  depthWrite: false,
});

fetch(GEO_URL)
  .then((r) => r.json())
  .then((geojson) => {
    for (const feature of geojson.features) {
      renderCountry(feature, countryMaterial, scene);
    }
  });

// FOV zoom 

const MIN_ROTATE = 0.2;
const MAX_ROTATE = 1.0;
let currentFov = MAX_FOV;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function setFov(fov) {
  currentFov = clamp(fov, MIN_FOV, MAX_FOV);
  camera.fov = currentFov;
  camera.updateProjectionMatrix();
  const t = (currentFov - MIN_FOV) / (MAX_FOV - MIN_FOV);
  controls.rotateSpeed = MIN_ROTATE + t * (MAX_ROTATE - MIN_ROTATE);
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const t = (currentFov - MIN_FOV) / (MAX_FOV - MIN_FOV);
  const speed = 0.5 + t * 4;
  setFov(currentFov + (e.deltaY > 0 ? speed : -speed));
}, { passive: false });

setFov(MAX_FOV);

// render loop 

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

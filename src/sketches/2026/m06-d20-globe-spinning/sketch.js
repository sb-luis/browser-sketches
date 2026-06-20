import * as THREE from 'three';
import { addGlobeRefLines } from '../lib/globe-ref-lines.js';

const OCEAN_COLOR = 0x1e3a8a;
const BACKGROUND_COLOR = 0x000000;
const GLOBE_RADIUS = 1;
const CAMERA_Z = 3;
const AUTO_ROTATE_SPEED = 0.003;

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(BACKGROUND_COLOR, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, CAMERA_Z);

// Globe
const globeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64),
  new THREE.MeshBasicMaterial({ color: OCEAN_COLOR }),
);
scene.add(globeMesh);

// reference lines in their own group so they rotate with the globe
const refGroup = new THREE.Group();
addGlobeRefLines(refGroup);
scene.add(refGroup);

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
  globeMesh.rotation.y += AUTO_ROTATE_SPEED;
  refGroup.rotation.y += AUTO_ROTATE_SPEED;
  renderer.render(scene, camera);
}

animate();

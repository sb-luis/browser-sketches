import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fetchGeo } from '../lib/geo-fetch.js';
import { createMetrics } from '../lib/geo-metrics.js';
import { PALETTE, C_BACKGROUND, C_OCEAN, C_LAND, C_BORDER, C_SELECTED, randomPalette } from '../lib/geo-color-palette.js';

const CAMERA_DIST = 3;
const MIN_FOV     = 0.3;
const MAX_FOV     = 80;
const FILL_RADIUS = 1.0005;
const LINE_RADIUS = 1.001;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function latLonToVec3(lat, lon, r) {
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

// ─── Fill geometry (tessellated to follow sphere curvature) ──────────────────
const MAX_EDGE_DEG = 2;

function buildFillGeo(poly) {
  const stripClose = ring => {
    const pts = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    const f = pts[0], l = pts[pts.length - 1];
    if (f.x === l.x && f.y === l.y) pts.pop();
    return pts;
  };

  const [outerRaw, ...holeRaws] = poly;
  const shape = new THREE.Shape(stripClose(outerRaw));
  shape.holes = holeRaws.map(h => new THREE.Path(stripClose(h)));

  const raw = new THREE.ShapeGeometry(shape);
  const rp  = raw.attributes.position;
  const ri  = raw.index;

  const verts = [];
  for (let i = 0; i < rp.count; i++) verts.push([rp.getX(i), rp.getY(i)]);

  let tris = [];
  for (let i = 0; i < ri.count; i += 3) tris.push([ri.getX(i), ri.getX(i+1), ri.getX(i+2)]);
  raw.dispose();

  const midCache = new Map();
  const getMid = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (midCache.has(key)) return midCache.get(key);
    const mi = verts.length;
    verts.push([(verts[a][0]+verts[b][0])/2, (verts[a][1]+verts[b][1])/2]);
    midCache.set(key, mi);
    return mi;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const next = [];
    for (const [a, b, c] of tris) {
      const [ax, ay] = verts[a], [bx, by] = verts[b], [cx, cy] = verts[c];
      const dab = Math.hypot(bx-ax, by-ay);
      const dbc = Math.hypot(cx-bx, cy-by);
      const dca = Math.hypot(ax-cx, ay-cy);
      const mx  = Math.max(dab, dbc, dca);
      if (mx <= MAX_EDGE_DEG) { next.push([a, b, c]); continue; }
      changed = true;
      if      (mx === dab) { const m = getMid(a,b); next.push([a,m,c], [m,b,c]); }
      else if (mx === dbc) { const m = getMid(b,c); next.push([a,b,m], [a,m,c]); }
      else                 { const m = getMid(c,a); next.push([a,b,m], [m,b,c]); }
    }
    tris = next;
  }

  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const v = latLonToVec3(verts[i][1], verts[i][0], FILL_RADIUS);
    positions[i*3] = v.x; positions[i*3+1] = v.y; positions[i*3+2] = v.z;
  }
  const idxArr = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    idxArr[i*3] = tris[i][0]; idxArr[i*3+1] = tris[i][1]; idxArr[i*3+2] = tris[i][2];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  return geo;
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

// ─── Materials ────────────────────────────────────────────────────────────────
const oceanMaterial    = new THREE.MeshBasicMaterial({ color: C_OCEAN });
const fillDimMaterial  = new THREE.MeshBasicMaterial({ color: C_LAND,     side: THREE.DoubleSide });
const fillHighMaterial = new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide });
const borderMaterial   = new THREE.LineBasicMaterial({ color: C_BORDER, depthTest: true, depthWrite: false });

// ─── Scene ───────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(C_BACKGROUND);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(MAX_FOV, 1, 0.1, 100);
camera.position.set(CAMERA_DIST, 0, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.enableZoom = false;
controls.enablePan  = false;
controls.minDistance = controls.maxDistance = CAMERA_DIST;

scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), oceanMaterial));

// ─── HUD ─────────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud');
const { startFetch } = createMetrics(hud, []);

const labelEl = Object.assign(document.createElement('div'), { id: 'label' });
const hintEl  = Object.assign(document.createElement('div'), { id: 'hint', textContent: 'double-click a country' });
hud.append(labelEl, hintEl);

function showLabel(name) {
  labelEl.textContent  = name ?? '';
  labelEl.className    = name ? 'visible' : '';
  hintEl.style.opacity = name ? '0' : '';
}

// ─── Country data ─────────────────────────────────────────────────────────────
const borders = new THREE.Group();
const fills   = new THREE.Group();
const fillMap = new Map();
scene.add(fills, borders);

let geojsonFeatures = [];
let selectedGroup   = null;
let selectedName    = null;

function applyMaterialToGroup(group, mat) {
  for (const mesh of group.children) mesh.material = mat;
}

function buildCountryData(geojson) {
  geojsonFeatures = geojson.features;
  for (const feature of geojson.features) {
    const name = feature.properties?.NAME ?? feature.properties?.ADMIN ?? 'Unknown';
    const { type, coordinates } = feature.geometry;
    const polys = type === 'Polygon' ? [coordinates] : coordinates;

    const featureFills = new THREE.Group();
    for (const poly of polys) {
      try {
        const mesh = new THREE.Mesh(buildFillGeo(poly), fillDimMaterial);
        mesh.renderOrder = 1;
        featureFills.add(mesh);
      } catch (_) {}

      for (const ring of poly) {
        const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, LINE_RADIUS));
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, borderMaterial);
        line.renderOrder = 999;
        borders.add(line);
      }
    }
    fills.add(featureFills);
    fillMap.set(name, featureFills);
  }
}

// ─── Double-click selection ───────────────────────────────────────────────────
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
  const name = pickCountry(lon, lat, geojsonFeatures);

  if (selectedGroup) { applyMaterialToGroup(selectedGroup, fillDimMaterial); selectedGroup = null; }
  selectedName = name ?? null;
  if (name) {
    const g = fillMap.get(name);
    if (g) { selectedGroup = g; applyMaterialToGroup(g, fillHighMaterial); }
    showLabel(name);
  } else {
    showLabel(null);
  }
});

// ─── Color controls panel ─────────────────────────────────────────────────────
const controlsEl = Object.assign(document.createElement('div'), { id: 'controls' });
hud.appendChild(controlsEl);

// Disable OrbitControls while the mouse is inside the panel — prevents the
// OS color-picker dialog from leaving a stale mousedown state on the canvas.
controlsEl.addEventListener('mouseenter', () => { controls.enabled = false; });
controlsEl.addEventListener('mouseleave', () => { controls.enabled = true;  });

const pickers = {};

const colorDefs = [
  { key: 'background', label: 'background', apply: v => renderer.setClearColor(v) },
  { key: 'ocean',      label: 'ocean',      apply: v => oceanMaterial.color.set(v) },
  { key: 'land',       label: 'land',       apply: v => fillDimMaterial.color.set(v) },
  { key: 'border',     label: 'border',     apply: v => borderMaterial.color.set(v) },
  { key: 'selected',   label: 'selected',   apply: v => fillHighMaterial.color.set(v) },
];

for (const { key, label, apply } of colorDefs) {
  const row   = Object.assign(document.createElement('div'), { className: 'color-row' });
  const lbl   = Object.assign(document.createElement('span'), { className: 'color-label', textContent: label });
  const input = Object.assign(document.createElement('input'), {
    type: 'color', className: 'color-picker', value: PALETTE[key],
  });
  input.addEventListener('input', () => apply(input.value));
  pickers[key] = input;
  row.append(lbl, input);
  controlsEl.appendChild(row);
}

function applyPalette(palette) {
  for (const { key, apply } of colorDefs) {
    apply(palette[key]);
    pickers[key].value = palette[key];
  }
}

const divider = Object.assign(document.createElement('div'), { className: 'controls-divider' });
controlsEl.appendChild(divider);

const shuffleBtn = Object.assign(document.createElement('button'), {
  id: 'shuffle-btn', className: 'ctrl-btn', textContent: 'shuffle palette',
});
shuffleBtn.addEventListener('click', () => applyPalette(randomPalette()));
controlsEl.appendChild(shuffleBtn);

const copyBtn = Object.assign(document.createElement('button'), {
  id: 'copy-btn', className: 'ctrl-btn', textContent: 'copy palette',
});
copyBtn.addEventListener('click', () => {
  const lines = colorDefs.map(({ key, label }) =>
    `  ${label.padEnd(10)}: '${pickers[key].value}'`
  );
  navigator.clipboard.writeText(`{\n${lines.join(',\n')}\n}`).then(() => {
    copyBtn.textContent = 'copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => { copyBtn.textContent = 'copy palette'; copyBtn.classList.remove('copied'); }, 2000);
  });
});
controlsEl.appendChild(copyBtn);

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
  renderer.render(scene, camera);
}
animate();

setFov(MAX_FOV);

(async () => {
  const stopFetch = startFetch();
  const { geojson, fetchMs, fromCache } = await fetchGeo(
    '/geo/collections/ne_50m_admin_0_countries/items?limit=10000'
  );
  buildCountryData(geojson);
  stopFetch(fetchMs, { fromCache });
})();

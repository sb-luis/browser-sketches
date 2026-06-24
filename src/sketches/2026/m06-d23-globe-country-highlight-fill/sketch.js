import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addGlobeRefLines } from '../lib/globe-ref-lines.js';
import { fetchGeo } from '../lib/geo-fetch.js';
import { createMetrics } from '../lib/geo-metrics.js';
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED, C_BACKGROUND, C_REF_LINE } from '../lib/geo-color-palette.js';

const CAMERA_DIST     = 3;
const MIN_FOV         = 0.3;
const MAX_FOV         = 80;
const FILL_RADIUS     = 1.0005; // fills sit just above the ocean sphere
const LINE_RADIUS     = 1.001;  // borders sit above fills

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

// ─── Fill geometry ────────────────────────────────────────────────────────────
// Triangulate in 2D lon/lat, then tessellate so no edge exceeds MAX_EDGE_DEG.
// This ensures every triangle is small enough to hug the sphere surface — flat
// chord panels on large triangles would dip below the ocean sphere and show through.
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

  // Collect 2D vertices as [lon, lat]
  const verts = [];
  for (let i = 0; i < rp.count; i++) verts.push([rp.getX(i), rp.getY(i)]);

  let tris = [];
  for (let i = 0; i < ri.count; i += 3) tris.push([ri.getX(i), ri.getX(i+1), ri.getX(i+2)]);
  raw.dispose();

  // Shared midpoint cache — prevents cracks at shared edges between triangles
  const midCache = new Map();
  const getMid = (a, b) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (midCache.has(key)) return midCache.get(key);
    const mi = verts.length;
    verts.push([(verts[a][0]+verts[b][0])/2, (verts[a][1]+verts[b][1])/2]);
    midCache.set(key, mi);
    return mi;
  };

  // Split longest edge of any triangle that exceeds the threshold
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

  // Project all 2D lon/lat vertices to sphere and build final geometry
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
const fillDimMaterial  = new THREE.MeshBasicMaterial({ color: C_LAND,      side: THREE.DoubleSide });
const fillHighMaterial = new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide });
const borderMaterial   = new THREE.LineBasicMaterial({ color: C_BORDER, depthTest: true, depthWrite: false });

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
addGlobeRefLines(scene, { color: C_REF_LINE, accentOpacity: 0.2, dimOpacity: 0.08 });

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
const hintEl  = Object.assign(document.createElement('div'), { id: 'hint', textContent: 'double-click a country' });
hud.append(labelEl, hintEl);

function showLabel(name) {
  labelEl.textContent  = name ?? '';
  labelEl.className    = name ? 'visible' : '';
  hintEl.style.opacity = name ? '0' : '';
}

// ─── Build country data ───────────────────────────────────────────────────────
// Returns borders Group, fills Group, a Map(name → fill Group), and totalVerts.
// Each country gets its own fill Group so we can swap its children's material
// independently without cloning.
function buildCountryData(geojson) {
  const borders  = new THREE.Group();
  const fills    = new THREE.Group();
  const fillMap  = new Map(); // name → THREE.Group
  let totalVerts = 0;

  for (const feature of geojson.features) {
    const name = feature.properties?.NAME ?? feature.properties?.ADMIN ?? 'Unknown';
    const { type, coordinates } = feature.geometry;
    const polys = type === 'Polygon' ? [coordinates] : coordinates;

    const featureFills = new THREE.Group();

    for (const poly of polys) {
      // Fill mesh
      try {
        const mesh = new THREE.Mesh(buildFillGeo(poly), fillDimMaterial);
        mesh.renderOrder = 1;
        featureFills.add(mesh);
      } catch (_) {
        // Skip degenerate polygons
      }

      // Border lines (outer ring + holes)
      for (const ring of poly) {
        const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, LINE_RADIUS));
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        totalVerts += pts.length;
        const line = new THREE.Line(geo, borderMaterial);
        line.renderOrder = 999;
        borders.add(line);
      }
    }

    fills.add(featureFills);
    fillMap.set(name, featureFills);
  }

  return { borders, fills, fillMap, totalVerts };
}

// ─── LOD state ───────────────────────────────────────────────────────────────
const groups   = Array(3).fill(null); // { borders, fills, fillMap, totalVerts }
const geojsons = Array(3).fill(null);
const loaded   = [false, false, false];
let activeLod  = -1;
let loadingLod = -1;

let selectedName  = null;
let selectedGroup = null; // the fill Group for the currently highlighted country

function applyMaterialToGroup(group, material) {
  for (const mesh of group.children) mesh.material = material;
}

function restoreSelection(fillMap) {
  if (!selectedName) return;
  const g = fillMap.get(selectedName);
  if (g) { selectedGroup = g; applyMaterialToGroup(g, fillHighMaterial); }
}

async function loadLod(level) {
  if (loaded[level] || loadingLod === level) return;
  loadingLod = level;

  const stopFetch = startFetch();
  const { geojson, fetchMs, fromCache } = await fetchGeo(LEVELS[level].url);

  const data = buildCountryData(geojson);
  data.borders.visible = false;
  data.fills.visible   = false;
  scene.add(data.borders);
  scene.add(data.fills);
  groups[level]   = data;
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

  if (activeLod >= 0 && groups[activeLod]) {
    groups[activeLod].borders.visible = false;
    groups[activeLod].fills.visible   = false;
  }

  // selectedGroup pointed into the old LOD — clear it before restoring
  selectedGroup = null;

  groups[level].borders.visible = true;
  groups[level].fills.visible   = true;
  activeLod = level;

  restoreSelection(groups[level].fillMap);

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

  // Deselect old
  if (selectedGroup) {
    applyMaterialToGroup(selectedGroup, fillDimMaterial);
    selectedGroup = null;
  }

  selectedName = name ?? null;

  if (name) {
    const g = groups[activeLod]?.fillMap.get(name);
    if (g) { selectedGroup = g; applyMaterialToGroup(g, fillHighMaterial); }
    showLabel(name);
  } else {
    showLabel(null);
  }
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

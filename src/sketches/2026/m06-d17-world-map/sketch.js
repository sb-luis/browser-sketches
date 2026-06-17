import { geoNaturalEarth1, geoPath } from 'd3';

const DATASETS = {
  '110m-countries': '/sketches/2026/data/world_110m.geojson',
  '110m-lakes':     '/sketches/2026/data/world_110m_lakes.geojson',
  '50m-countries':  '/sketches/2026/data/world_50m.geojson',
  '50m-lakes':      '/sketches/2026/data/world_50m_lakes.geojson',
  '10m-countries':  '/sketches/2026/data/world_10m.geojson',
  '10m-lakes':      '/sketches/2026/data/world_10m_lakes.geojson',
};

const svg       = document.getElementById('svg');
const map       = document.getElementById('map');
const mSize     = document.getElementById('m-size');
const mFeatures = document.getElementById('m-features');
const mRings    = document.getElementById('m-rings');
const mVerts    = document.getElementById('m-verts');
const mRender   = document.getElementById('m-render');
const mNodes    = document.getElementById('m-nodes');

let currentLod   = '110m';
let currentLakes = false;
const cache = {};
let resizePending = false;

function key() {
  return `${currentLod}-${currentLakes ? 'lakes' : 'countries'}`;
}

function countGeometry(geojson) {
  let rings = 0, verts = 0;
  for (const f of geojson.features) {
    const rs = f.geometry.type === 'Polygon'
      ? f.geometry.coordinates
      : f.geometry.coordinates.flat();
    rings += rs.length;
    for (const r of rs) verts += r.length;
  }
  return { rings, verts };
}

function setMetric(el, value) {
  el.textContent = value;
  el.classList.remove('loading');
}

function clearMetrics() {
  [mSize, mFeatures, mRings, mVerts, mRender, mNodes].forEach(el => {
    el.textContent = '—';
    el.classList.add('loading');
  });
}

function render(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const projection = geoNaturalEarth1().fitExtent([[20, 20], [w - 20, h - 20]], { type: 'Sphere' });
  const path = geoPath(projection);

  const t0 = performance.now();

  const paths = geojson.features.map(f => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(f));
    return el;
  });
  svg.replaceChildren(...paths);

  setMetric(mRender, (performance.now() - t0).toFixed(1) + ' ms');
  setMetric(mNodes,  paths.length.toLocaleString());
}

async function load() {
  const k = key();
  clearMetrics();

  if (!cache[k]) {
    const res  = await fetch(DATASETS[k]);
    const text = await res.text();
    cache[k] = { geojson: JSON.parse(text), size: text.length };
  }

  const { geojson, size } = cache[k];
  const { rings, verts } = countGeometry(geojson);

  setMetric(mSize,     (size / 1024).toFixed(1) + ' KB');
  setMetric(mFeatures, geojson.features.length.toLocaleString());
  setMetric(mRings,    rings.toLocaleString());
  setMetric(mVerts,    verts.toLocaleString());

  render(geojson);
}

document.querySelectorAll('.lod-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.lod === currentLod) return;
    document.querySelector('.lod-btn.active').classList.remove('active');
    btn.classList.add('active');
    currentLod = btn.dataset.lod;
    load();
  });
});

document.querySelectorAll('.lakes-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.lakes === 'true';
    if (val === currentLakes) return;
    document.querySelector('.lakes-btn.active').classList.remove('active');
    btn.classList.add('active');
    currentLakes = val;
    load();
  });
});

window.addEventListener('resize', () => {
  const k = key();
  if (!cache[k] || resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    render(cache[k].geojson);
    resizePending = false;
  });
});

load();

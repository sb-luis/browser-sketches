import { geoMercator, geoPath } from 'd3';

const DATASETS = {
  '110m': '/sketches/2026/data/iceland_110m.geojson',
  '50m':  '/sketches/2026/data/iceland_50m.geojson',
  '10m':  '/sketches/2026/data/iceland_10m.geojson',
};

const svg       = document.getElementById('svg');
const map       = document.getElementById('map');
const mSize     = document.getElementById('m-size');
const mFeatures = document.getElementById('m-features');
const mRings    = document.getElementById('m-rings');
const mVerts    = document.getElementById('m-verts');
const mRender   = document.getElementById('m-render');
const mNodes    = document.getElementById('m-nodes');

let currentLod = '10m';
const cache = {};
let resizePending = false;

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

  const projection = geoMercator().fitExtent([[40, 40], [w - 40, h - 40]], geojson);
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
  clearMetrics();

  if (!cache[currentLod]) {
    const res  = await fetch(DATASETS[currentLod]);
    const text = await res.text();
    cache[currentLod] = { geojson: JSON.parse(text), size: text.length };
  }

  const { geojson, size } = cache[currentLod];
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

window.addEventListener('resize', () => {
  if (!cache[currentLod] || resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    render(cache[currentLod].geojson);
    resizePending = false;
  });
});

load();

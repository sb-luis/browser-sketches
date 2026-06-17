import { geoMercator, geoPath } from 'd3';

const DATASETS = {
  countries: '/sketches/2026/data/canada_10m.geojson',
  lakes:     '/sketches/2026/data/canada_10m_lakes.geojson',
};

const LABELS = {
  countries: 'countries',
  lakes:     'without boundary lakes',
};

const svg     = document.getElementById('svg');
const map     = document.getElementById('map');
const mDataset = document.getElementById('m-dataset');
const mSize   = document.getElementById('m-size');
const mRings  = document.getElementById('m-rings');
const mVerts  = document.getElementById('m-verts');
const mFetch  = document.getElementById('m-fetch');
const mRender = document.getElementById('m-render');

let current = 'countries';
let cached  = null;
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
  [mSize, mRings, mVerts, mFetch, mRender].forEach(el => {
    el.textContent = '—';
    el.classList.add('loading');
  });
}

function render(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const projection = geoMercator().fitExtent(
    [[20, 20], [w - 20, h - 20]],
    geojson
  );
  const path = geoPath(projection);

  const t0 = performance.now();

  const paths = geojson.features.map(f => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(f));
    return el;
  });

  svg.replaceChildren(...paths);

  setMetric(mRender, (performance.now() - t0).toFixed(1) + ' ms');
}

async function load(key) {
  clearMetrics();
  mDataset.textContent = LABELS[key];

  const t0  = performance.now();
  const res = await fetch(DATASETS[key]);
  const text = await res.text();
  const fetchMs = performance.now() - t0;

  cached = JSON.parse(text);

  const { rings, verts } = countGeometry(cached);

  setMetric(mFetch, fetchMs.toFixed(1) + ' ms');
  setMetric(mSize,  (text.length / 1024).toFixed(1) + ' KB');
  setMetric(mRings, rings.toLocaleString());
  setMetric(mVerts, verts.toLocaleString());

  render(cached);
}

document.querySelectorAll('.dataset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.dataset === current) return;
    document.querySelector('.dataset-btn.active').classList.remove('active');
    btn.classList.add('active');
    current = btn.dataset.dataset;
    load(current);
  });
});

window.addEventListener('resize', () => {
  if (!cached || resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    render(cached);
    resizePending = false;
  });
});

load(current);

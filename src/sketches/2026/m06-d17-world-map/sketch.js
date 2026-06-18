import { geoNaturalEarth1, geoPath } from 'd3';
import { resetMetrics, startFetching, startCached, revealSequentially, formatBytes, formatMs } from '../lib/sketch-metrics.js';

const GEO_API = '/geo/collections';
const DATASETS = {
  '110m-countries': `${GEO_API}/ne_110m_admin_0_countries/items?limit=10000`,
  '110m-lakes':     `${GEO_API}/ne_110m_admin_0_countries_lakes/items?limit=10000`,
  '50m-countries':  `${GEO_API}/ne_50m_admin_0_countries/items?limit=10000`,
  '50m-lakes':      `${GEO_API}/ne_50m_admin_0_countries_lakes/items?limit=10000`,
  '10m-countries':  `${GEO_API}/ne_10m_admin_0_countries/items?limit=10000`,
  '10m-lakes':      `${GEO_API}/ne_10m_admin_0_countries_lakes/items?limit=10000`,
};

const svg       = document.getElementById('svg');
const map       = document.getElementById('map');
const mFetch    = document.getElementById('m-fetch');
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

  return {
    renderMs:  parseFloat((performance.now() - t0).toFixed(1)),
    nodeCount: paths.length,
  };
}

async function load() {
  const k  = key();
  const t0 = performance.now();
  resetMetrics(svg);

  if (cache[k]) {
    const { geojson, size } = cache[k];
    const { rings, verts }        = countGeometry(geojson);
    const { renderMs, nodeCount } = render(geojson);
    const cacheMs = Math.round(performance.now() - t0);
    if (!await startCached(mFetch, cacheMs)) return;
    revealSequentially([
      { el: mSize,     ...formatBytes(size) },
      { el: mFeatures, value: geojson.features.length },
      { el: mRings,    value: rings },
      { el: mVerts,    value: verts },
      { el: mRender,   ...formatMs(renderMs) },
      { el: mNodes,    value: nodeCount },
    ]);
    return;
  }

  const doneFetching = await startFetching(mFetch);
  if (!doneFetching) return;

  const res  = await fetch(DATASETS[k]);
  const text = await res.text();
  cache[k] = {
    geojson: JSON.parse(text),
    size:    text.length,
    fetchMs: Math.round(performance.now() - t0),
  };

  const { geojson, size, fetchMs } = cache[k];
  if (!await doneFetching(fetchMs)) return;

  const { rings, verts }        = countGeometry(geojson);
  const { renderMs, nodeCount } = render(geojson);

  revealSequentially([
    { el: mSize,     ...formatBytes(size) },
    { el: mFeatures, value: geojson.features.length },
    { el: mRings,    value: rings },
    { el: mVerts,    value: verts },
    { el: mRender,   ...formatMs(renderMs) },
    { el: mNodes,    value: nodeCount },
  ]);
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

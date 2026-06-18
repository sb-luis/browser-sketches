import { geoMercator, geoPath } from 'd3';
import { resetMetrics, startFetching, startCached, revealSequentially, formatBytes, formatMs } from '../lib/sketch-metrics.js';

const GEO_API = '/geo/collections';
const DATASETS = {
  countries:       `${GEO_API}/ne_10m_admin_0_countries/items?limit=10000&ISO_A3=CAN`,
  countries_lakes: `${GEO_API}/ne_10m_admin_0_countries_lakes/items?limit=10000&ISO_A3=CAN`,
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

let current = 'countries';
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

  return {
    renderMs:  parseFloat((performance.now() - t0).toFixed(1)),
    nodeCount: paths.length,
  };
}

async function load() {
  const t0 = performance.now();
  resetMetrics(svg);

  if (cache[current]) {
    const { geojson, size } = cache[current];
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

  const res  = await fetch(DATASETS[current]);
  const text = await res.text();
  cache[current] = {
    geojson: JSON.parse(text),
    size:    text.length,
    fetchMs: Math.round(performance.now() - t0),
  };

  const { geojson, size, fetchMs } = cache[current];
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

document.querySelectorAll('.dataset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.dataset === current) return;
    document.querySelector('.dataset-btn.active').classList.remove('active');
    btn.classList.add('active');
    current = btn.dataset.dataset;
    load();
  });
});

window.addEventListener('resize', () => {
  if (!cache[current] || resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    render(cache[current].geojson);
    resizePending = false;
  });
});

load();

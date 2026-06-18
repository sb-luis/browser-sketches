import { geoMercator, geoPath } from 'd3';
import { resetMetrics, startFetching, revealSequentially, formatBytes, formatMs } from '../lib/sketch-metrics.js';

const URL_10M = '/geo/collections/ne_10m_admin_0_countries/items?limit=10000&ISO_A3=THA';

const svg    = document.getElementById('svg');
const map    = document.getElementById('map');
const mFetch  = document.getElementById('m-fetch');
const mSize   = document.getElementById('m-size');
const mRender = document.getElementById('m-render');

let cached = null;
let resizePending = false;

function render(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const projection = geoMercator().fitExtent([[40, 40], [w - 40, h - 40]], geojson);
  const path = geoPath(projection);
  const t0 = performance.now();

  svg.replaceChildren(...geojson.features.map(f => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(f));
    return el;
  }));

  return parseFloat((performance.now() - t0).toFixed(1));
}

async function load() {
  const t0 = performance.now();
  resetMetrics(svg);

  const doneFetching = await startFetching(mFetch);
  if (!doneFetching) return;

  const res  = await fetch(URL_10M);
  const text = await res.text();
  const fetchMs = Math.round(performance.now() - t0);
  cached = { geojson: JSON.parse(text), size: text.length };

  if (!await doneFetching(fetchMs)) return;

  const renderMs = render(cached.geojson);
  revealSequentially([
    { el: mSize,   ...formatBytes(cached.size) },
    { el: mRender, ...formatMs(renderMs) },
  ]);
}

window.addEventListener('resize', () => {
  if (!cached || resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    render(cached.geojson);
    resizePending = false;
  });
});

load();

import { fetchGeo } from './geo-fetch.js';
import { createMetrics, formatBytes, formatMs, countGeometry } from './geo-metrics.js';

/**
 * D3/SVG convenience wrapper around fetchGeo + createMetrics.
 *
 * Handles: fetch → clear SVG → render → reveal metrics → resize re-render.
 * For ThreeJS or other renderers, use fetchGeo + createMetrics directly instead.
 *
 * @param {string} url         - GeoJSON endpoint (also used as cache key).
 * @param {Function} renderFn  - async (geojson) => void; draws into the SVG.
 * @param {string[]} stats     - Which extra rows to show, e.g. ['size', 'verts', 'render'].
 * @param {Function} [fetchFn] - Optional custom fetch: (url) => Promise<{geojson, size}>.
 */

const METRIC_DEFS = {
  size:     'file size',
  features: 'features',
  rings:    'rings',
  verts:    'vertices',
  render:   'render',
  nodes:    'dom nodes',
};

let metrics = null;
let lastGeojson = null;
let lastRenderFn = null;
let gen = 0;

export async function loadAndRenderGeo(url, renderFn, stats = [], fetchFn) {
  const svgEl = document.getElementById('svg');
  const mapEl = document.getElementById('map');

  if (!metrics) {
    metrics = createMetrics(mapEl, stats.map(k => ({ key: k, label: METRIC_DEFS[k] ?? k })));
    window.addEventListener('resize', () => {
      if (lastGeojson && lastRenderFn) lastRenderFn(lastGeojson);
    });
  }

  const myGen = ++gen;
  lastRenderFn = renderFn;

  metrics.reset();
  svgEl.replaceChildren();

  const stop = metrics.startFetch();
  const { geojson, size, fetchMs, fromCache } = await fetchGeo(url, fetchFn);
  if (myGen !== gen) return;
  await stop(fetchMs, { fromCache });
  if (myGen !== gen) return;

  const t0 = performance.now();
  await renderFn(geojson);
  if (myGen !== gen) return;
  lastGeojson = geojson;
  const renderMs = performance.now() - t0;

  const { rings, verts } = countGeometry(geojson);
  const revealItems = stats.map(k => {
    if (k === 'size')     return { key: k, ...formatBytes(size) };
    if (k === 'features') return { key: k, value: geojson.features.length };
    if (k === 'rings')    return { key: k, value: rings };
    if (k === 'verts')    return { key: k, value: verts };
    if (k === 'render')   return { key: k, ...formatMs(renderMs) };
    if (k === 'nodes')    return { key: k, value: svgEl.children.length };
    return null;
  }).filter(Boolean);

  metrics.reveal(revealItems);
}

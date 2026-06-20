import { createMetrics, countGeometry, formatBytes, formatMs } from './geo-metrics.js';

/**
 * loadAndRenderGeo(url, renderFn, stats?, fetchFn?)
 *
 * url      — URL to fetch GeoJSON from, or a cache key when fetchFn is provided
 * renderFn — async (geojson) => void; draws to the SVG, returns nothing
 * stats    — optional array of metrics to show after fetch, e.g. ['size', 'render'].
 *            If omitted, no metrics panel is rendered.
 *            If provided (even []), 'fetch' is always shown first.
 * fetchFn  — optional (key) => Promise<{ geojson, size }> for parallel or custom fetching
 */

let metrics = null;
let activeStats = [];
const cache = new Map();
let lastUrl = null;
let lastRenderFn = null;
let resizePending = false;
let initialized = false;

export async function loadAndRenderGeo(url, renderFn, stats, fetchFn) {
  const svgEl = document.getElementById('svg');

  if (!initialized) {
    initialized = true;
    if (stats !== undefined) {
      metrics = createMetrics(stats);
      activeStats = stats;
    }
    window.addEventListener('resize', () => {
      if (!lastUrl || resizePending) return;
      resizePending = true;
      requestAnimationFrame(async () => {
        await lastRenderFn(cache.get(lastUrl).geojson);
        resizePending = false;
      });
    });
  }

  lastRenderFn = renderFn;
  const t0 = performance.now();

  if (metrics) metrics.reset(svgEl);
  else svgEl.replaceChildren();

  if (cache.has(url)) {
    const { geojson, size } = cache.get(url);
    lastUrl = url;
    const t1 = performance.now();
    await renderFn(geojson);
    const renderMs = parseFloat((performance.now() - t1).toFixed(1));
    if (metrics) {
      const cacheMs = Math.round(performance.now() - t0);
      if (!await metrics.startCached(metrics.els.fetch, cacheMs)) return;
      metrics.reveal(buildRevealItems(svgEl, geojson, size, renderMs));
    }
    return;
  }

  let done;
  if (metrics) {
    done = await metrics.startFetch(metrics.els.fetch);
    if (!done) return;
  }

  let geojson, size;
  if (fetchFn) {
    ({ geojson, size } = await fetchFn(url));
  } else {
    const res  = await fetch(url);
    const text = await res.text();
    geojson = JSON.parse(text);
    size    = text.length;
  }

  const fetchMs = Math.round(performance.now() - t0);
  cache.set(url, { geojson, size });
  lastUrl = url;

  if (metrics) {
    if (!await done(fetchMs)) return;
  }

  const t1 = performance.now();
  await renderFn(geojson);
  const renderMs = parseFloat((performance.now() - t1).toFixed(1));

  if (metrics) {
    metrics.reveal(buildRevealItems(svgEl, geojson, size, renderMs));
  }
}

function buildRevealItems(svgEl, geojson, size, renderMs) {
  const needsGeometry = activeStats.includes('rings') || activeStats.includes('verts');
  const geo = needsGeometry ? countGeometry(geojson) : {};
  const nodeCount = svgEl.children.length;
  const valueFor = {
    size:     () => formatBytes(size),
    features: () => ({ value: geojson.features.length }),
    rings:    () => ({ value: geo.rings }),
    verts:    () => ({ value: geo.verts }),
    render:   () => formatMs(renderMs),
    nodes:    () => ({ value: nodeCount }),
  };
  return activeStats
    .filter(s => metrics.els[s] && valueFor[s])
    .map(s => ({ el: metrics.els[s], ...valueFor[s]() }));
}

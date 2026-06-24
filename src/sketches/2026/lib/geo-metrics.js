import gsap from 'gsap';
import 'number-flow';

const NF_DURATION   = 700;
const LIVE_DURATION = 200;
const NF_EASING     = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

const sleep     = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = ()  => new Promise(r => requestAnimationFrame(r));

// ─── formatting & geo utilities ───────────────────────────────────────────────

export function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb >= 1000) return { value: parseFloat((kb / 1024).toFixed(2)), unit: ' MB' };
  return { value: parseFloat(kb.toFixed(1)), unit: ' KB' };
}

export function formatMs(ms) {
  if (ms >= 1000) return { value: parseFloat((ms / 1000).toFixed(2)), unit: ' s' };
  return { value: ms, unit: ' ms' };
}

export function countGeometry(geojson) {
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

// ─── internal animation helpers ───────────────────────────────────────────────

function ensureNF(el) {
  if (!el._nf) {
    const nf     = document.createElement('number-flow');
    const unitEl = document.createElement('span');
    unitEl.className = 'metric-unit';
    el.textContent = '';
    el.appendChild(nf);
    el.appendChild(unitEl);
    el._nf   = nf;
    el._unit = unitEl;
  }
  return el._nf;
}

async function revealRow(row, gen, getGen) {
  if (getGen() !== gen) return false;
  await new Promise(resolve =>
    gsap.fromTo(row,
      { autoAlpha: 0, y: -6 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out', onComplete: resolve }
    )
  );
  return getGen() === gen;
}

async function snapToZero(nf, gen, getGen) {
  if (getGen() !== gen) return false;
  nf.animated = false;
  nf.update(0);
  await nextFrame();
  if (getGen() !== gen) return false;
  nf.animated = true;
  return getGen() === gen;
}

// ─── createMetrics ────────────────────────────────────────────────────────────

/**
 * Injects a metrics panel into `container` and returns animation primitives.
 *
 * @param {HTMLElement} container  - Any positioned DOM element to host the panel.
 * @param {Array<{key: string, label: string}>} metricDefs
 *   Ordered list of metric rows. Rows without `live: true` are hidden initially
 *   and revealed with animation via `reveal()`. Rows with `live: true` are
 *   visible immediately and updated via `set()` (plain text, no animation —
 *   intended for per-frame values like active cell counts).
 * @param {{ fetch?: boolean }} [opts]
 *   `fetch` (default `true`) — whether to include the animated fetch-timer row.
 *   Set to `false` for sketches that don't load remote data.
 *
 * @returns {{ panel, startFetch?, reveal, reset, set }}
 *   `panel` is the DOM element — append extra content (e.g. switches) to it.
 *   `startFetch` is only present when `fetch: true`.
 *
 * Usage (with fetch):
 *   const { startFetch, reveal } = createMetrics(hud, [...])
 *   const stop = startFetch()
 *   const { geojson, size, fetchMs, fromCache } = await fetchGeo(url)
 *   await stop(fetchMs, { fromCache })
 *   reveal([{ key: 'size', ...formatBytes(size) }, ...])
 *
 * Usage (without fetch, with live rows):
 *   const { set } = createMetrics(hud, [
 *     { key: 'active', label: 'active', live: true },
 *     { key: 'total',  label: 'total',  live: true },
 *   ], { fetch: false })
 *   // each frame:
 *   set('active', 312, ' cells')
 */
export function createMetrics(container, metricDefs = [], { fetch: includeFetch = true } = {}) {
  const panel = document.createElement('div');
  panel.id = 'metrics';
  const els = {};

  function makeRow(key, label) {
    const row     = document.createElement('div');
    row.className = 'metric-row';
    gsap.set(row, { autoAlpha: 0 }); // all rows start hidden
    const labelEl = document.createElement('span');
    labelEl.className = 'metric-label';
    labelEl.textContent = label;
    const val     = document.createElement('span');
    val.className = 'metric-value loading';
    val.textContent = '—';
    row.append(labelEl, val);
    panel.appendChild(row);
    return val;
  }

  if (includeFetch) {
    els.fetch = makeRow('fetch', 'fetch');
  }
  for (const { key, label } of metricDefs) {
    els[key] = makeRow(key, label);
  }

  container.appendChild(panel);

  let gen = 0;
  let fetchInterval = null;
  const getGen = () => gen;
  const liveRevealed = new Set();

  function reset() {
    gen++;
    liveRevealed.clear();
    if (fetchInterval !== null) { clearInterval(fetchInterval); fetchInterval = null; }
    gsap.killTweensOf(panel.querySelectorAll('.metric-row'));
    gsap.set(panel.querySelectorAll('.metric-row'), { autoAlpha: 0 });
  }

  /**
   * Starts an animated fetch timer. Call the returned `stop(finalMs, {fromCache})`
   * once the fetch resolves.
   */
  function startFetch() {
    const snap  = gen;
    const el    = els.fetch;
    const row   = el.closest('.metric-row');
    const label = row.querySelector('.metric-label');

    label.textContent = 'fetching';
    const nf = ensureNF(el);
    nf.transformTiming = { duration: 80, easing: 'linear' };
    nf.opacityTiming   = { duration: 40, easing: 'ease-out' };
    el._unit.textContent = ' ms';

    // Kick off the live counter (resolves async; caller awaits stop())
    const counterReady = (async () => {
      if (!await snapToZero(nf, snap, getGen)) return false;
      if (!await revealRow(row, snap, getGen)) return false;
      const t0 = performance.now();
      fetchInterval = setInterval(() => {
        if (getGen() !== snap) { clearInterval(fetchInterval); fetchInterval = null; return; }
        nf.update(Math.round(performance.now() - t0));
      }, 80);
      return true;
    })();

    return async function stop(finalMs, { fromCache = false } = {}) {
      await counterReady;
      clearInterval(fetchInterval);
      fetchInterval = null;
      if (getGen() !== snap) return;

      const { value, unit } = formatMs(finalMs);
      label.textContent = fromCache ? 'cached' : 'fetched';
      nf.transformTiming = { duration: NF_DURATION, easing: NF_EASING };
      nf.opacityTiming   = { duration: Math.round(NF_DURATION * 0.5), easing: 'ease-out' };
      el._unit.textContent = unit;
      nf.update(value);
      await sleep(120);
    };
  }

  /**
   * Reveals metric rows one by one with animated number transitions.
   * @param {Array<{key: string, value: number, unit?: string}>} items
   */
  async function reveal(items) {
    const snap = gen;
    for (const { key, value, unit = '', duration = NF_DURATION, easing = NF_EASING } of items) {
      if (getGen() !== snap) return;
      const el  = els[key];
      if (!el) continue;
      const row = el.closest('.metric-row');
      const nf  = ensureNF(el);
      el.classList.remove('loading');
      nf.transformTiming  = { duration, easing };
      nf.opacityTiming    = { duration: Math.round(duration * 0.5), easing: 'ease-out' };
      el._unit.textContent = unit;
      if (!await snapToZero(nf, snap, getGen)) return;
      if (!await revealRow(row, snap, getGen)) return;
      liveRevealed.add(key);
      nf.update(value);
      await sleep(120);
    }
  }

  /**
   * Updates a metric value with number-flow animation — intended for live per-frame updates.
   * On the first call the row slides in (same init animation as static rows). Subsequent
   * calls animate only the number, not the row, so rapid updates aren't jarring.
   */
  function set(key, value, unit = '') {
    const el = els[key];
    if (!el) return;
    const nf  = ensureNF(el);
    el.classList.remove('loading');
    el._unit.textContent = unit;
    nf.transformTiming = { duration: LIVE_DURATION, easing: NF_EASING };
    nf.opacityTiming   = { duration: Math.round(LIVE_DURATION * 0.5), easing: 'ease-out' };
    nf.update(typeof value === 'number' ? value : parseFloat(value));
    if (!liveRevealed.has(key)) {
      liveRevealed.add(key);
      liveRevealQueue.push(el.closest('.metric-row'));
      drainLiveRevealQueue(gen);
    }
  }

  const result = { panel, reveal, reset, set };
  if (includeFetch) result.startFetch = startFetch;
  return result;
}

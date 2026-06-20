import gsap from 'gsap';
import 'number-flow';

const NF_DURATION = 700;
const NF_EASING   = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

const sleep     = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = ()  => new Promise(r => requestAnimationFrame(r));

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

async function revealRow(row, gen, generation) {
  if (generation() !== gen) return false;
  await new Promise(resolve =>
    gsap.fromTo(row,
      { autoAlpha: 0, y: -6 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out', onComplete: resolve }
    )
  );
  return generation() === gen;
}

async function snapToZero(nf, gen, generation) {
  if (generation() !== gen) return false;
  nf.animated = false;
  nf.update(0);
  await nextFrame();
  if (generation() !== gen) return false;
  nf.animated = true;
  return generation() === gen;
}

// ─── formatting helpers ───────────────────────────────────────────────────────

export function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb >= 1000) return { value: parseFloat((kb / 1024).toFixed(2)), unit: ' MB' };
  return { value: parseFloat(kb.toFixed(1)), unit: ' KB' };
}

export function formatMs(ms) {
  if (ms >= 1000) return { value: parseFloat((ms / 1000).toFixed(2)), unit: ' s' };
  return { value: ms, unit: ' ms' };
}

// ─── geo helpers ─────────────────────────────────────────────────────────────

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

// ─── createMetrics ────────────────────────────────────────────────────────────

const LABELS = {
  size:     'file size',
  features: 'features',
  rings:    'rings',
  verts:    'vertices',
  render:   'render',
  nodes:    'dom nodes',
};

/**
 * createMetrics(stats) → { els, reset(svgEl), startFetch(el), startCached(el, ms), reveal(items) }
 *
 * Injects #metrics into #map and returns animation primitives used by geo-load.js.
 * 'fetch' is always the first row; stats controls which additional rows follow and in what order.
 */
export function createMetrics(stats) {
  const mapEl = document.getElementById('map');

  const metricsEl = document.createElement('div');
  metricsEl.id = 'metrics';
  const els = {};

  function makeRow(key, label) {
    const row     = document.createElement('div');
    row.className = 'metric-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'metric-label';
    labelEl.textContent = label;
    const val     = document.createElement('span');
    val.className = 'metric-value loading';
    val.textContent = '—';
    row.append(labelEl, val);
    metricsEl.appendChild(row);
    return val;
  }

  els.fetch = makeRow('fetch', 'fetch');
  for (const stat of stats) {
    els[stat] = makeRow(stat, LABELS[stat] ?? stat);
  }
  mapEl.appendChild(metricsEl);

  let gen = 0;
  let fetchInterval = null;
  const getGen = () => gen;

  function reset(svgEl) {
    gen++;
    if (fetchInterval !== null) { clearInterval(fetchInterval); fetchInterval = null; }
    gsap.killTweensOf(document.querySelectorAll('.metric-row'));
    gsap.set(document.querySelectorAll('.metric-row'), { autoAlpha: 0 });
    if (svgEl) svgEl.replaceChildren();
  }

  async function startCached(el, ms) {
    const snap = gen;
    const row  = el.closest('.metric-row');
    row.querySelector('.metric-label').textContent = 'cached';
    const { value, unit } = formatMs(ms);
    const nf = ensureNF(el);
    nf.transformTiming = { duration: NF_DURATION, easing: NF_EASING };
    nf.opacityTiming   = { duration: Math.round(NF_DURATION * 0.5), easing: 'ease-out' };
    el._unit.textContent = unit;
    if (!await snapToZero(nf, snap, getGen)) return false;
    if (!await revealRow(row, snap, getGen)) return false;
    nf.update(value);
    await sleep(120);
    return getGen() === snap;
  }

  async function startFetch(el) {
    const snap  = gen;
    const row   = el.closest('.metric-row');
    const label = row.querySelector('.metric-label');
    label.textContent = 'fetching';
    const nf = ensureNF(el);
    nf.transformTiming = { duration: 80, easing: 'linear' };
    nf.opacityTiming   = { duration: 40, easing: 'ease-out' };
    el._unit.textContent = ' ms';
    if (!await snapToZero(nf, snap, getGen)) return null;
    if (!await revealRow(row, snap, getGen)) return null;
    const t0 = performance.now();
    fetchInterval = setInterval(() => {
      if (getGen() !== snap) { clearInterval(fetchInterval); fetchInterval = null; return; }
      nf.update(Math.round(performance.now() - t0));
    }, 80);
    return async function stop(finalMs) {
      clearInterval(fetchInterval);
      fetchInterval = null;
      if (getGen() !== snap) return false;
      const { value, unit } = formatMs(finalMs);
      label.textContent = 'fetched';
      nf.transformTiming = { duration: NF_DURATION, easing: NF_EASING };
      nf.opacityTiming   = { duration: Math.round(NF_DURATION * 0.5), easing: 'ease-out' };
      el._unit.textContent = unit;
      nf.update(value);
      await sleep(120);
      return getGen() === snap;
    };
  }

  async function reveal(items) {
    const snap = gen;
    for (const { el, value, unit = '', duration = NF_DURATION, easing = NF_EASING } of items) {
      if (getGen() !== snap) return;
      const row = el.closest('.metric-row');
      const nf  = ensureNF(el);
      nf.transformTiming  = { duration, easing };
      nf.opacityTiming    = { duration: Math.round(duration * 0.5), easing: 'ease-out' };
      el._unit.textContent = unit;
      if (!await snapToZero(nf, snap, getGen)) return;
      if (!await revealRow(row, snap, getGen)) return;
      nf.update(value);
      await sleep(120);
    }
  }

  return { els, reset, startFetch, startCached, reveal };
}

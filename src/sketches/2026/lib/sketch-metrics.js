import gsap from 'gsap';
import 'number-flow';

const NF_DURATION = 700;
const NF_EASING   = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

export function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb >= 1000) return { value: parseFloat((kb / 1024).toFixed(2)), unit: ' MB' };
  return { value: parseFloat(kb.toFixed(1)), unit: ' KB' };
}

export function formatMs(ms) {
  if (ms >= 1000) return { value: parseFloat((ms / 1000).toFixed(2)), unit: ' s' };
  return { value: ms, unit: ' ms' };
}

const sleep     = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = ()  => new Promise(r => requestAnimationFrame(r));

// Incremented on every resetMetrics() — lets any in-flight async chain detect
// it has been superseded and bail out cleanly.
let generation = 0;
let currentFetchInterval = null;

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

// Reveal one row with a slide-in. Returns false if superseded.
async function revealRow(row, gen) {
  if (generation !== gen) return false;
  await new Promise(resolve =>
    gsap.fromTo(row,
      { autoAlpha: 0, y: -6 },
      { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out', onComplete: resolve }
    )
  );
  return generation === gen;
}

// Snap number-flow to 0 instantly then re-enable animation.
// Returns false if superseded.
async function snapToZero(nf, gen) {
  if (generation !== gen) return false;
  nf.animated = false;
  nf.update(0);
  await nextFrame();
  if (generation !== gen) return false;
  nf.animated = true;
  return generation === gen;
}

/**
 * Call at the very start of every load() to cancel any ongoing animation
 * and immediately clear all metric rows and the SVG from view.
 */
export function resetMetrics(svgEl) {
  generation++;
  if (currentFetchInterval !== null) {
    clearInterval(currentFetchInterval);
    currentFetchInterval = null;
  }
  gsap.killTweensOf(document.querySelectorAll('.metric-row'));
  gsap.set(document.querySelectorAll('.metric-row'), { autoAlpha: 0 });
  if (svgEl) svgEl.replaceChildren();
}

/**
 * Reveal the fetch row as "cached X ms" (no live counter).
 * Returns false if superseded.
 */
export async function startCached(el, ms) {
  const gen = generation;

  const row   = el.closest('.metric-row');
  row.querySelector('.metric-label').textContent = 'cached';

  const { value, unit } = formatMs(ms);
  const nf = ensureNF(el);
  nf.transformTiming = { duration: NF_DURATION, easing: NF_EASING };
  nf.opacityTiming   = { duration: Math.round(NF_DURATION * 0.5), easing: 'ease-out' };
  el._unit.textContent = unit;

  if (!await snapToZero(nf, gen)) return false;
  if (!await revealRow(row, gen)) return false;
  nf.update(value);
  await sleep(120);
  return generation === gen;
}

/**
 * Reveal the fetch row immediately with a live elapsed-time counter.
 * Returns a stop(finalMs) function, or null if superseded during setup.
 * stop() returns false if superseded before it could settle.
 */
export async function startFetching(el) {
  const gen = generation;

  const row   = el.closest('.metric-row');
  const label = row.querySelector('.metric-label');
  label.textContent = 'fetching';

  const nf = ensureNF(el);
  nf.transformTiming = { duration: 80, easing: 'linear' };
  nf.opacityTiming   = { duration: 40, easing: 'ease-out' };
  el._unit.textContent = ' ms';

  if (!await snapToZero(nf, gen)) return null;
  if (!await revealRow(row, gen)) return null;

  const t0 = performance.now();
  currentFetchInterval = setInterval(() => {
    if (generation !== gen) { clearInterval(currentFetchInterval); currentFetchInterval = null; return; }
    nf.update(Math.round(performance.now() - t0));
  }, 80);

  return async function stop(finalMs) {
    clearInterval(currentFetchInterval);
    currentFetchInterval = null;
    if (generation !== gen) return false;

    const { value, unit } = formatMs(finalMs);
    label.textContent = 'fetched';
    nf.transformTiming = { duration: NF_DURATION, easing: NF_EASING };
    nf.opacityTiming   = { duration: Math.round(NF_DURATION * 0.5), easing: 'ease-out' };
    el._unit.textContent = unit;
    nf.update(value);
    await sleep(120);
    return generation === gen;
  };
}

/**
 * Reveal metric rows one at a time. Aborts silently if superseded.
 */
export async function revealSequentially(items) {
  const gen = generation;

  for (const {
    el,
    value,
    unit     = '',
    duration = NF_DURATION,
    easing   = NF_EASING,
  } of items) {
    if (generation !== gen) return;

    const row = el.closest('.metric-row');
    const nf = ensureNF(el);
    nf.transformTiming  = { duration, easing };
    nf.opacityTiming    = { duration: Math.round(duration * 0.5), easing: 'ease-out' };
    el._unit.textContent = unit;

    if (!await snapToZero(nf, gen)) return;
    if (!await revealRow(row, gen)) return;

    nf.update(value);
    await sleep(120);
  }
}

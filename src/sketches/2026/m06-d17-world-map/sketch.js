import { geoNaturalEarth1, geoPath } from 'd3';

const DATASET = '/sketches/2026/data/world_10m_lakes.geojson';

const svgEl    = document.getElementById('svg');
const canvasEl = document.getElementById('canvas');
const map      = document.getElementById('map');

const mRenderer = document.getElementById('m-renderer');
const mSize     = document.getElementById('m-size');
const mFeatures = document.getElementById('m-features');
const mRings    = document.getElementById('m-rings');
const mVerts    = document.getElementById('m-verts');
const mFetch    = document.getElementById('m-fetch');
const mRender   = document.getElementById('m-render');
const mNodes    = document.getElementById('m-nodes');

let currentRenderer = 'svg';
let cached          = null;
let resizePending   = false;

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

function renderSVG(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;

  svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svgEl.style.display = '';
  canvasEl.style.display = 'none';

  const projection = geoNaturalEarth1().fitExtent([[20, 20], [w - 20, h - 20]], { type: 'Sphere' });
  const path = geoPath(projection);

  const t0 = performance.now();

  const paths = geojson.features.map(f => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(f));
    return el;
  });
  svgEl.replaceChildren(...paths);

  setMetric(mRender, (performance.now() - t0).toFixed(1) + ' ms');
  setMetric(mNodes,  paths.length.toLocaleString());
}

function renderCanvas(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;

  canvasEl.width  = w * devicePixelRatio;
  canvasEl.height = h * devicePixelRatio;
  canvasEl.style.width  = w + 'px';
  canvasEl.style.height = h + 'px';
  canvasEl.style.display = 'block';
  svgEl.style.display = 'none';

  const ctx = canvasEl.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const projection = geoNaturalEarth1().fitExtent([[20, 20], [w - 20, h - 20]], { type: 'Sphere' });
  const path = geoPath(projection, ctx);

  const t0 = performance.now();

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  for (const f of geojson.features) path(f);
  ctx.fillStyle = '#1e3a5f';
  ctx.fill();
  ctx.strokeStyle = '#5b9bd5';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  setMetric(mRender, (performance.now() - t0).toFixed(1) + ' ms');
  setMetric(mNodes,  '0');
}

function render(geojson) {
  setMetric(mRenderer, currentRenderer);
  if (currentRenderer === 'svg') {
    renderSVG(geojson);
  } else {
    renderCanvas(geojson);
  }
}

async function init() {
  [mSize, mFeatures, mRings, mVerts, mFetch, mRender, mNodes].forEach(el => {
    el.textContent = '—';
    el.classList.add('loading');
  });
  setMetric(mRenderer, currentRenderer);

  const t0  = performance.now();
  const res = await fetch(DATASET);
  const text = await res.text();
  setMetric(mFetch, (performance.now() - t0).toFixed(1) + ' ms');

  cached = JSON.parse(text);

  const { rings, verts } = countGeometry(cached);

  setMetric(mSize,     (text.length / 1024).toFixed(1) + ' KB');
  setMetric(mFeatures, cached.features.length.toLocaleString());
  setMetric(mRings,    rings.toLocaleString());
  setMetric(mVerts,    verts.toLocaleString());

  render(cached);
}

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.renderer === currentRenderer) return;
    document.querySelector('.toggle-btn.active').classList.remove('active');
    btn.classList.add('active');
    currentRenderer = btn.dataset.renderer;
    if (cached) render(cached);
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

init();

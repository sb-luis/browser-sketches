import { geoMercator, geoPath } from 'd3';

const DATASET = '/sketches/2026/data/africa_10m_lakes.geojson';

const canvasEl  = document.getElementById('canvas');
const map       = document.getElementById('map');
const mSize     = document.getElementById('m-size');
const mFeatures = document.getElementById('m-features');
const mRings    = document.getElementById('m-rings');
const mVerts    = document.getElementById('m-verts');
const mFetch    = document.getElementById('m-fetch');
const mRender   = document.getElementById('m-render');

let cached        = null;
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

function render(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;

  canvasEl.width  = w * devicePixelRatio;
  canvasEl.height = h * devicePixelRatio;
  canvasEl.style.width  = w + 'px';
  canvasEl.style.height = h + 'px';

  const ctx = canvasEl.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const projection = geoMercator().fitExtent([[20, 20], [w - 20, h - 20]], geojson);
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
}

async function init() {
  [mSize, mFeatures, mRings, mVerts, mFetch, mRender].forEach(el => {
    el.textContent = '—';
    el.classList.add('loading');
  });

  const t0  = performance.now();
  const res = await fetch(DATASET);
  const text = await res.text();
  const fetchMs = performance.now() - t0;

  cached = JSON.parse(text);

  const { rings, verts } = countGeometry(cached);

  setMetric(mFetch,    fetchMs.toFixed(1) + ' ms');
  setMetric(mSize,     (text.length / 1024).toFixed(1) + ' KB');
  setMetric(mFeatures, cached.features.length.toLocaleString());
  setMetric(mRings,    rings.toLocaleString());
  setMetric(mVerts,    verts.toLocaleString());

  render(cached);
}

window.addEventListener('resize', () => {
  if (!cached || resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    render(cached);
    resizePending = false;
  });
});

init();

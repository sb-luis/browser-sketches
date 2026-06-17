import {
  geoMercator,
  geoPath,
} from "https://cdn.jsdelivr.net/npm/d3-geo@3/+esm";

const DATA_BASE = "/sketches/2026/data/";
const DATASETS = {
  "110m": DATA_BASE + "iceland_110m.geojson",
  "50m": DATA_BASE + "iceland_50m.geojson",
  "10m": DATA_BASE + "iceland_10m.geojson",
};

const svg = document.getElementById("svg");
const map = document.getElementById("map");
const mLod = document.getElementById("m-lod");
const mSize = document.getElementById("m-size");
const mVerts = document.getElementById("m-verts");
const mFetch = document.getElementById("m-fetch");
const mRender = document.getElementById("m-render");

let currentLod = "10m";
let renderScheduled = false;

function countVertices(geojson) {
  let n = 0;
  for (const f of geojson.features) {
    const rings =
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates
        : f.geometry.coordinates.flat();
    for (const ring of rings) n += ring.length;
  }
  return n;
}

function setMetric(el, value) {
  el.textContent = value;
  el.classList.remove("loading");
}

function clearMetrics() {
  [mSize, mVerts, mFetch, mRender].forEach((el) => {
    el.textContent = "—";
    el.classList.add("loading");
  });
}

function render(geojson) {
  const w = map.clientWidth;
  const h = map.clientHeight;

  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const projection = geoMercator().fitExtent(
    [
      [40, 40],
      [w - 40, h - 40],
    ],
    geojson,
  );
  const path = geoPath(projection);

  const t0 = performance.now();

  const paths = geojson.features.map((f) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", path(f));
    return el;
  });

  svg.replaceChildren(...paths);

  const renderMs = performance.now() - t0;
  setMetric(mRender, renderMs.toFixed(1) + " ms");
}

let cachedGeojson = null;

async function loadAndCache(lod) {
  clearMetrics();
  mLod.textContent = "1:" + lod;

  const t0 = performance.now();
  const res = await fetch(DATASETS[lod]);
  const text = await res.text();
  const fetchMs = performance.now() - t0;

  cachedGeojson = JSON.parse(text);

  setMetric(mFetch, fetchMs.toFixed(1) + " ms");
  setMetric(mSize, (text.length / 1024).toFixed(1) + " KB");
  setMetric(mVerts, countVertices(cachedGeojson).toLocaleString());

  render(cachedGeojson);
}

window.addEventListener("resize", () => {
  if (!cachedGeojson || renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    render(cachedGeojson);
    renderScheduled = false;
  });
});

document.querySelectorAll(".lod-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.lod === currentLod) return;
    document.querySelector(".lod-btn.active").classList.remove("active");
    btn.classList.add("active");
    currentLod = btn.dataset.lod;
    loadAndCache(currentLod);
  });
});

loadAndCache(currentLod);

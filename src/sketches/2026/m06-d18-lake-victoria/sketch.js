import { geoMercator, geoPath } from 'd3';
import { loadAndRenderGeo } from '../lib/d3-geo.js';

const svg = document.getElementById('svg');
const map = document.getElementById('map');

const COUNTRIES = ['TZA', 'KEN', 'UGA'];
const DATASETS = {
  countries:       '/geo/collections/ne_10m_admin_0_countries/items?limit=10000',
  countries_lakes: '/geo/collections/ne_10m_admin_0_countries_lakes/items?limit=10000',
};

async function render(geojson) {
  const w = map.clientWidth, h = map.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const projection = geoMercator().fitExtent([[40, 40], [w - 40, h - 40]], geojson);
  const path = geoPath(projection);
  svg.replaceChildren(...geojson.features.map(f => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(f));
    return el;
  }));
}

async function fetchDataset(key) {
  const texts = await Promise.all(
    COUNTRIES.map(iso => fetch(`${DATASETS[key]}&ISO_A3=${iso}`).then(r => r.text()))
  );
  return {
    geojson: { type: 'FeatureCollection', features: texts.flatMap(t => JSON.parse(t).features) },
    size:    texts.reduce((s, t) => s + t.length, 0),
  };
}

document.querySelectorAll('.dataset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.dataset-btn.active').classList.remove('active');
    btn.classList.add('active');
    loadAndRenderGeo(btn.dataset.dataset, render, ['rings', 'verts'], fetchDataset);
  });
});

loadAndRenderGeo('countries_lakes', render, ['rings', 'verts'], fetchDataset);

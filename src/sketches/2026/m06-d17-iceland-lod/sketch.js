import { geoMercator, geoPath } from 'd3';
import { loadAndRenderGeo } from '../lib/d3-geo.js';

const svg = document.getElementById('svg');
const map = document.getElementById('map');

const DATASETS = {
  '110m': '/geo/collections/ne_110m_admin_0_countries/items?limit=10000&ISO_A3=ISL',
  '50m':  '/geo/collections/ne_50m_admin_0_countries/items?limit=10000&ISO_A3=ISL',
  '10m':  '/geo/collections/ne_10m_admin_0_countries/items?limit=10000&ISO_A3=ISL',
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

document.querySelectorAll('.lod-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.lod-btn.active').classList.remove('active');
    btn.classList.add('active');
    loadAndRenderGeo(DATASETS[btn.dataset.lod], render, ['size', 'verts']);
  });
});

loadAndRenderGeo(DATASETS['10m'], render, ['size', 'verts']);

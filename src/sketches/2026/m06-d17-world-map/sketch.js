import { geoNaturalEarth1, geoPath } from 'd3';
import { loadAndRenderGeo } from '../lib/d3-geo.js';

const svg = document.getElementById('svg');
const map = document.getElementById('map');

const DATASETS = {
  '110m': '/geo/collections/ne_110m_admin_0_countries/items?limit=10000',
  '50m':  '/geo/collections/ne_50m_admin_0_countries/items?limit=10000',
  '10m':  '/geo/collections/ne_10m_admin_0_countries/items?limit=10000',
};

async function render(geojson) {
  const w = map.clientWidth, h = map.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const projection = geoNaturalEarth1().fitExtent([[20, 20], [w - 20, h - 20]], { type: 'Sphere' });
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
    loadAndRenderGeo(DATASETS[btn.dataset.lod], render, ['size', 'verts', 'render']);
  });
});

loadAndRenderGeo(DATASETS['110m'], render, ['size', 'verts', 'render']);

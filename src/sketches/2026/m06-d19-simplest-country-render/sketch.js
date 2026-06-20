import { geoMercator, geoPath } from 'd3';
import { loadAndRenderGeo } from '../lib/geo-load.js';

const svg = document.getElementById('svg');
const map = document.getElementById('map');

async function render(geojson) {
  const w = map.clientWidth, h = map.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const projection = geoMercator().fitExtent([[20, 20], [w - 20, h - 20]], geojson);
  const path = geoPath(projection);
  for (const feature of geojson.features) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(feature));
    svg.appendChild(el);
  }
}

loadAndRenderGeo('/geo/collections/ne_10m_admin_0_countries/items?limit=10000&ISO_A3=NPL', render, []);

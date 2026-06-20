import { geoMercator, geoPath } from 'd3';
import { loadAndRenderGeo } from '../lib/geo-load.js';

const svg = document.getElementById('svg');
const map = document.getElementById('map');

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

loadAndRenderGeo('/geo/collections/ne_10m_admin_0_countries/items?limit=10000&ISO_A3=THA', render, []);

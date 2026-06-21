import { geoMercator, geoPath } from 'd3';
import { loadAndRenderGeo } from '../lib/d3-geo.js';

const svg = document.getElementById('svg');
const map = document.getElementById('map');

async function render(geojson) {
  const w = map.clientWidth, h = map.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const projection = geoMercator().fitExtent([[20, 20], [w - 20, h - 20]], geojson);
  const path = geoPath(projection);
  svg.replaceChildren(...geojson.features.map(f => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path(f));
    return el;
  }));
}

loadAndRenderGeo('/geo/collections/ne_110m_admin_0_countries_lakes/items?limit=10000&CONTINENT=Africa', render, ['nodes']);

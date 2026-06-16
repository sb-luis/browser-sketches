import { createGlobeScene } from './globe-scene.js';
import { fovToSlider, sliderToFov } from './zoom-slider.js';
import { createLoadingIndicator } from './loading-indicator.js';

const GEO_PATH = '/geo/collections/ne_110m_admin_0_countries/items?limit=10000';

function loadGeoJSON() {
  return fetch(GEO_PATH).then((response) => {
    if (!response.ok) throw new Error(`Failed to load GeoJSON (${response.status})`);
    return response.json();
  });
}

const COLORS = {
  sceneBackground: 0x000000,
  oceanColor: 0x1e3a8a,
  atmosphereColor: 0x4488ff,
};

const MIN_FOV = 0.3;
const MAX_FOV = 80;

export function createSketch(root) {
  root.innerHTML = `
    <div class="app-shell">
      <canvas id="globe-canvas" class="globe-canvas"></canvas>
      <div class="overlay">
        <button class="reset-button" id="reset-button" title="Reset view">🌍</button>
        <div class="zoom-slider-wrap">
          <span class="zoom-label">−</span>
          <input id="zoom-slider" class="zoom-slider" type="range" min="0" max="1" step="0.001" />
          <span class="zoom-label">+</span>
        </div>
        <div class="loading-indicator" id="loading-indicator"></div>
      </div>
    </div>
  `;

  const canvas = root.querySelector('#globe-canvas');
  const slider = root.querySelector('#zoom-slider');
  const resetButton = root.querySelector('#reset-button');
  const loadingNode = root.querySelector('#loading-indicator');

  if (!canvas || !slider || !resetButton || !loadingNode) {
    throw new Error('Sketch failed to initialize required DOM nodes');
  }

  const geoJSONPromise = loadGeoJSON();
  const loadingIndicator = createLoadingIndicator(loadingNode, geoJSONPromise);

  const scene = createGlobeScene({
    canvas,
    minFov: MIN_FOV,
    maxFov: MAX_FOV,
    colors: COLORS,
    geoJSONPromise,
    onFovChange: (fov) => {
      slider.value = String(fovToSlider(fov, MIN_FOV, MAX_FOV));
    },
  });

  slider.value = String(fovToSlider(scene.navigation.getFov(), MIN_FOV, MAX_FOV));

  slider.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    scene.navigation.setFov(sliderToFov(value, MIN_FOV, MAX_FOV));
  });

  resetButton.addEventListener('click', () => {
    scene.navigation.reset();
  });

  return {
    destroy() {
      loadingIndicator.destroy();
      scene.destroy();
    },
  };
}

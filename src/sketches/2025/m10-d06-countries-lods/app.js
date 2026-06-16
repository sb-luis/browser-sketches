import { createGlobeScene } from './globe-scene.js';
import { createGeoJSONManager } from './geojson-manager.js';
import { fovToSlider, sliderToFov } from './zoom-slider.js';
import { createLoadingIndicator } from './loading-indicator.js';

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

  const geoJSONManager = createGeoJSONManager();
  const geoJSON110mPromise = geoJSONManager.load('110m');
  const loadingIndicator = createLoadingIndicator(loadingNode, geoJSONManager);

  const scene = createGlobeScene({
    canvas,
    minFov: MIN_FOV,
    maxFov: MAX_FOV,
    colors: COLORS,
    geoJSONManager,
    geoJSON110mPromise,
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

  // Eagerly load 50m and 10m in the background after 110m is ready.
  geoJSON110mPromise.then(() => Promise.all([
    geoJSONManager.load('50m'),
    geoJSONManager.load('10m'),
  ])).catch(() => {});

  return {
    destroy() {
      loadingIndicator.destroy();
      scene.destroy();
    },
  };
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBorderMaterial, createBordersFromGeoJSON, disposeGroupLines } from './borders-geometry.js';

/** Clamps `value` between `min` and `max`. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Returns OrbitControls rotate speed for the given zoom level. */
function calculateRotateSpeed(currentZoom) {
  const a = 0.95;
  const b = 1.15;
  const offset = 0.5;
  return a / Math.pow(currentZoom + offset, b);
}

/** Returns FOV scroll speed for the given zoom level, with a minimum floor. */
function calculateZoomSpeed(currentZoom, maxZoom) {
  const a = 2.5;
  const b = 0.6;
  const offset = 0.5;
  const minSpeed = 0.15 * (200 / maxZoom);
  const zoomSpeed = a / Math.pow(currentZoom + offset, b);
  return Math.max(minSpeed, zoomSpeed);
}

/** Creates and runs a Three.js globe scene with orbit controls and country border lines. */
export function createGlobeScene({
  canvas,
  minFov,
  maxFov,
  colors,
  geoJSONPromise,
  onFovChange,
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(colors.sceneBackground, 1);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(maxFov, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(3, 0, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.15;
  controls.minDistance = 3;
  controls.maxDistance = 3;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.rotateSpeed = 1;

  const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
  const globeMaterial = new THREE.MeshBasicMaterial({ color: colors.oceanColor });
  const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
  globeMesh.renderOrder = 0;
  scene.add(globeMesh);

  const atmosphereGeometry = new THREE.SphereGeometry(1.05, 16, 16);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: colors.atmosphereColor,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  atmosphere.renderOrder = 1;
  scene.add(atmosphere);

  const borderMaterial = createBorderMaterial();
  let borderGroup = null;
  let destroyed = false;

  geoJSONPromise.then((geoJSON) => {
    if (destroyed) return;
    borderGroup = createBordersFromGeoJSON(geoJSON, borderMaterial);
    scene.add(borderGroup);
  }).catch(() => {
    // No-op; loading indicator reflects failure via stalled state.
  });

  const initialState = {
    position: new THREE.Vector3(3, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
    fov: maxFov,
  };

  let currentFov = maxFov;
  let animation = null;

  /** Syncs rotate speed and damping factor to the current FOV. */
  const updateControlsFromFov = () => {
    const currentZoom = 60 / currentFov;
    const clampedZoom = Math.min(currentZoom, 200);
    controls.rotateSpeed = calculateRotateSpeed(currentZoom);
    controls.dampingFactor = 0.1 + (clampedZoom / 200) * 0.4;
  };

  /** Applies a new FOV to the camera and updates dependent control state. */
  const updateFov = (fov) => {
    currentFov = clamp(fov, minFov, maxFov);
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
    updateControlsFromFov();
    onFovChange(currentFov);
  };

  updateFov(maxFov);

  /** Zooms in/out by adjusting FOV on mouse wheel. */
  const handleWheel = (event) => {
    event.preventDefault();
    const currentZoom = 60 / currentFov;
    const maxZoom = 60 / minFov;
    const delta = event.deltaY > 0
      ? calculateZoomSpeed(currentZoom, maxZoom)
      : -calculateZoomSpeed(currentZoom, maxZoom);
    updateFov(currentFov + delta);
  };

  canvas.addEventListener('wheel', handleWheel, { passive: false });

  /** Updates renderer and camera aspect ratio when the canvas is resized. */
  const handleResize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  window.addEventListener('resize', handleResize);

  /** Cubic ease-in-out, used for the reset camera animation. */
  const easeInOutCubic = (t) => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  /** Main render loop; steps the reset animation if one is running. */
  const animate = () => {
    if (destroyed) return;

    if (animation) {
      const elapsed = performance.now() - animation.startTime;
      const progress = Math.min(elapsed / animation.duration, 1);
      const eased = easeInOutCubic(progress);

      camera.position.lerpVectors(animation.startPosition, animation.targetPosition, eased);
      controls.target.lerpVectors(animation.startTarget, animation.targetTarget, eased);
      updateFov(animation.startFov + (animation.targetFov - animation.startFov) * eased);

      if (progress >= 1) {
        camera.position.copy(animation.targetPosition);
        controls.target.copy(animation.targetTarget);
        updateFov(animation.targetFov);
        animation = null;
      }
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  handleResize();
  animate();

  return {
    navigation: {
      setFov(value) {
        updateFov(value);
      },
      reset() {
        animation = {
          startTime: performance.now(),
          duration: 800,
          startPosition: camera.position.clone(),
          startTarget: controls.target.clone(),
          startFov: currentFov,
          targetPosition: initialState.position.clone(),
          targetTarget: initialState.target.clone(),
          targetFov: initialState.fov,
        };
      },
      getFov() {
        return currentFov;
      },
    },
    destroy() {
      destroyed = true;
      canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);

      if (borderGroup) {
        scene.remove(borderGroup);
        disposeGroupLines(borderGroup);
      }

      borderMaterial.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      globeGeometry.dispose();
      globeMaterial.dispose();

      renderer.dispose();
      controls.dispose();
    },
  };
}

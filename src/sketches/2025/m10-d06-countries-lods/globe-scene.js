import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBorderMaterial, createBordersFromGeoJSON, disposeGroupLines } from './borders-geometry.js';

const LOD_LEVELS = [
  { level: 0, name: '110m', minZoom: 0, maxZoom: 8 },
  { level: 1, name: '50m', minZoom: 8, maxZoom: 25 },
  { level: 2, name: '10m', minZoom: 25, maxZoom: Infinity },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function determineLOD(zoomLevel) {
  for (const lod of LOD_LEVELS) {
    if (zoomLevel >= lod.minZoom && zoomLevel < lod.maxZoom) {
      return lod;
    }
  }
  return LOD_LEVELS[LOD_LEVELS.length - 1];
}

function calculateRotateSpeed(currentZoom) {
  const a = 0.95;
  const b = 1.15;
  const offset = 0.5;
  return a / Math.pow(currentZoom + offset, b);
}

function calculateZoomSpeed(currentZoom, maxZoom) {
  const a = 2.5;
  const b = 0.6;
  const offset = 0.5;
  const minSpeed = 0.15 * (200 / maxZoom);
  const zoomSpeed = a / Math.pow(currentZoom + offset, b);
  return Math.max(minSpeed, zoomSpeed);
}



export function createGlobeScene({
  canvas,
  minFov,
  maxFov,
  colors,
  geoJSONManager,
  geoJSON110mPromise,
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
  let persistent110mGroup = null;
  let dynamicBorderGroup = null;
  let activeLODLevel = 0;

  const setCurrentLOD = async (lodLevel) => {
    if (activeLODLevel === lodLevel) {
      return;
    }

    activeLODLevel = lodLevel;

    if (lodLevel === 0) {
      if (dynamicBorderGroup) {
        scene.remove(dynamicBorderGroup);
        disposeGroupLines(dynamicBorderGroup);
        dynamicBorderGroup = null;
      }

      if (persistent110mGroup) {
        persistent110mGroup.visible = true;
      }
      return;
    }

    if (persistent110mGroup) {
      persistent110mGroup.visible = false;
    }

    if (dynamicBorderGroup) {
      scene.remove(dynamicBorderGroup);
      disposeGroupLines(dynamicBorderGroup);
      dynamicBorderGroup = null;
    }

    const levelName = LOD_LEVELS[lodLevel].name;
    const geoJSON = await geoJSONManager.load(levelName);

    // race condition guard - if the user zoomed to a different level while waiting, we bail out instead of adding stale geometry to the scene.
    if (activeLODLevel !== lodLevel) {
      return;
    }
    dynamicBorderGroup = createBordersFromGeoJSON(geoJSON, borderMaterial, `country-borders-${levelName}`);
    scene.add(dynamicBorderGroup);
  };

  let destroyed = false;

  geoJSON110mPromise.then((geoJSON) => {
    if (destroyed) {
      return;
    }
    persistent110mGroup = createBordersFromGeoJSON(geoJSON, borderMaterial, 'country-borders-110m-persistent');
    scene.add(persistent110mGroup);
  }).catch(() => {
    // No-op for now; loading indicator already reflects failure via stalled state.
  });

  const initialState = {
    position: new THREE.Vector3(3, 0, 0),
    target: new THREE.Vector3(0, 0, 0),
    fov: maxFov,
  };

  let currentFov = maxFov;
  let animation = null;

  const updateControlsFromFov = () => {
    const currentZoom = 60 / currentFov;
    const clampedZoom = Math.min(currentZoom, 200);
    controls.rotateSpeed = calculateRotateSpeed(currentZoom);
    controls.dampingFactor = 0.1 + (clampedZoom / 200) * 0.4;
  };

  const updateFov = (fov) => {
    currentFov = clamp(fov, minFov, maxFov);
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
    updateControlsFromFov();
    onFovChange(currentFov);

    const zoomLevel = 60 / currentFov;
    const nextLOD = determineLOD(zoomLevel).level;
    void setCurrentLOD(nextLOD);
  };

  updateFov(maxFov);

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

  const easeInOutCubic = (t) => {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  const animate = () => {
    if (destroyed) {
      return;
    }

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

      if (persistent110mGroup) {
        scene.remove(persistent110mGroup);
        disposeGroupLines(persistent110mGroup);
      }

      if (dynamicBorderGroup) {
        scene.remove(dynamicBorderGroup);
        disposeGroupLines(dynamicBorderGroup);
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

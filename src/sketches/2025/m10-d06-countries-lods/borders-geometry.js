import * as THREE from 'three';

/** Converts lat/lon degrees to a point on the globe surface at the given radius. */
function latLonToVector3(lat, lon, radius = 1.0005) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

/** Adds a Three.js Line for each coordinate ring into `group`. */
function renderPolygonRings(rings, material, group) {
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 2) {
      continue;
    }

    const points = ring.map(([lon, lat]) => latLonToVector3(lat, lon));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 999;
    group.add(line);
  }
}

/** Returns the line material used for country borders. */
export function createBorderMaterial() {
  return new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 1,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
  });
}

/** Builds a named Three.js Group of border lines from a GeoJSON FeatureCollection. */
export function createBordersFromGeoJSON(geoJSON, material, name) {
  const group = new THREE.Group();
  group.name = name;
  group.renderOrder = 999;

  for (const feature of geoJSON.features) {
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
      renderPolygonRings(geometry.coordinates, material, group);
      continue;
    }

    if (geometry.type === 'MultiPolygon') {
      for (const polygonCoords of geometry.coordinates) {
        renderPolygonRings(polygonCoords, material, group);
      }
    }
  }

  return group;
}

/** Disposes the buffer geometry of every Line in `group`. */
export function disposeGroupLines(group) {
  group.traverse((child) => {
    if (child instanceof THREE.Line && child.geometry) {
      child.geometry.dispose();
    }
  });
}

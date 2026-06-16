const LEVELS = ['110m', '50m', '10m'];

function geoJsonPathFor(level) {
  return `/geo/collections/ne_${level}_admin_0_countries/items?limit=10000`;
}

export function createGeoJSONManager() {
  const cache = {
    '110m': { data: null, loading: false, promise: null },
    '50m': { data: null, loading: false, promise: null },
    '10m': { data: null, loading: false, promise: null },
  };

  const listeners = new Set();

  const emit = () => {
    for (const listener of listeners) {
      listener(getStats());
    }
  };

  const getStats = () =>
    Object.fromEntries(
      LEVELS.map((level) => [level, {
        loading: cache[level].loading,
        loaded: Boolean(cache[level].data),
        size: cache[level].data?.features?.length ?? 0,
      }])
    );

  const load = async (level) => {
    const entry = cache[level];
    if (entry.data) {
      return entry.data;
    }
    if (entry.promise) {
      return entry.promise;
    }

    entry.loading = true;
    emit();

    entry.promise = fetch(geoJsonPathFor(level))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${level} GeoJSON (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        entry.data = data;
        entry.loading = false;
        emit();
        return data;
      })
      .catch((error) => {
        entry.loading = false;
        entry.promise = null;
        emit();
        throw error;
      });

    return entry.promise;
  };

  return {
    getStats,
    onLoad(listener) {
      listeners.add(listener);
      listener(getStats());
      return () => listeners.delete(listener);
    },
    load,
  };
}

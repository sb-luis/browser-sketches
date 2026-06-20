const cache = new Map();

/**
 * Fetches GeoJSON from `url` (with in-memory caching) and returns the parsed
 * data along with timing info.
 *
 * @param {string} url - Cache key and default fetch URL.
 * @param {(url: string) => Promise<{geojson, size}>} [customFetchFn]
 *   Optional override for the actual network call — useful for parallel or
 *   multi-URL fetches (e.g. great-lakes merging CAN + USA responses).
 * @returns {Promise<{geojson, size, fetchMs, fromCache}>}
 */
export async function fetchGeo(url, customFetchFn) {
  const t0 = performance.now();

  if (cache.has(url)) {
    return { ...cache.get(url), fetchMs: performance.now() - t0, fromCache: true };
  }

  let geojson, size;
  if (customFetchFn) {
    ({ geojson, size } = await customFetchFn(url));
  } else {
    const res  = await fetch(url);
    const text = await res.text();
    geojson = JSON.parse(text);
    size    = text.length;
  }

  cache.set(url, { geojson, size });
  return { geojson, size, fetchMs: performance.now() - t0, fromCache: false };
}

const LEVELS = ['110m', '50m', '10m'];

function renderStats(node, stats) {
  const allLoaded = LEVELS.every((level) => stats[level].loaded);
  if (allLoaded) {
    node.style.display = 'none';
    return;
  }

  node.style.display = 'block';

  const rows = LEVELS.map((level) => {
    const row = stats[level];
    let stateText = '<span class="loading-state queued">Queued</span>';

    if (row.loading) {
      stateText = '<span class="loading-state loading">Loading...</span>';
    } else if (row.loaded) {
      stateText = `<span class="loading-state ready">✓ ${row.size} countries</span>`;
    }

    return `
      <div class="loading-row">
        <span class="loading-level">${level}:</span>
        ${stateText}
      </div>
    `;
  }).join('');

  node.innerHTML = `
    <div class="loading-title">Loading Geography Data...</div>
    ${rows}
  `;
}

export function createLoadingIndicator(node, geoJSONManager) {
  const unsubscribe = geoJSONManager.onLoad((stats) => {
    renderStats(node, stats);
  });

  return {
    destroy() {
      unsubscribe();
    },
  };
}

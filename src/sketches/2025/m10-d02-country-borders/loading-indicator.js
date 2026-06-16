export function createLoadingIndicator(node, loadingPromise) {
  node.style.display = 'block';
  node.innerHTML = `
    <div class="loading-title">Loading Geography Data...</div>
    <div class="loading-row">
      <span class="loading-level">110m:</span>
      <span class="loading-state loading">Loading...</span>
    </div>
  `;

  loadingPromise.then(() => {
    node.style.display = 'none';
  }).catch(() => {
    // Leave indicator visible; the stalled state signals failure.
  });

  return {
    destroy() {},
  };
}

const POWER = 2.5;

export function sliderToFov(sliderValue, minFov, maxFov) {
  const inverted = 1 - sliderValue;
  const curved = Math.pow(inverted, POWER);
  return minFov + curved * (maxFov - minFov);
}

export function fovToSlider(fov, minFov, maxFov) {
  const normalized = (fov - minFov) / (maxFov - minFov);
  const curved = Math.pow(normalized, 1 / POWER);
  return 1 - curved;
}

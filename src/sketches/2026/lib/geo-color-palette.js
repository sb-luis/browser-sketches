import * as THREE from 'three';

// ─── Three.js hex values (0xRRGGBB) ──────────────────────────────────────────
export const C_BACKGROUND = 0xf3f3f3;
export const C_OCEAN      = 0x427cdf;
export const C_LAND       = 0xd4d8db;
export const C_BORDER     = 0x4e5958;
export const C_SELECTED   = 0xfefff9;
export const C_REF_LINE   = 0xffffff; // globe grid lines — white contrasts against the ocean sphere

// ─── CSS hex strings (for DOM, color pickers, etc.) ──────────────────────────
export const PALETTE = {
  background: '#f3f3f3',
  ocean:      '#427cdf',
  land:       '#d4d8db',
  border:     '#95a9a6',
  selected:   '#fefff9',
};

// ─── HSL-based random palette generator ──────────────────────────────────────
// Picks a random ocean hue in the cyan-to-blue range, then derives land and
// accent as harmonious offsets. All values stay within ranges that read well
// against a dark space background (used by the country-colors explorer sketch).
export function randomPalette() {
  const hex = (h, s, l) => '#' + new THREE.Color().setHSL(h, s, l).getHexString();
  const oceanH  = 0.50 + Math.random() * 0.17; // 180–240° cyan → blue
  const landH   = (oceanH + 0.08 + Math.random() * 0.15) % 1.0;
  const accentH = (oceanH + 0.40 + Math.random() * 0.20) % 1.0;
  return {
    background: hex(0,       0,                     0.02 + Math.random() * 0.04),
    ocean:      hex(oceanH,  0.50 + Math.random() * 0.30, 0.14 + Math.random() * 0.18),
    land:       hex(landH,   0.25 + Math.random() * 0.35, 0.20 + Math.random() * 0.20),
    border:     hex(oceanH,  0.40 + Math.random() * 0.30, 0.04 + Math.random() * 0.08),
    selected:   hex(accentH, 0.70 + Math.random() * 0.30, 0.55 + Math.random() * 0.20),
  };
}

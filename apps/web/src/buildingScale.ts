// Monotonic LOC mapping shared by layout, both renderers and camera framing.
export function buildingHeight(lines: number) {
  return Math.max(
    0.8,
    Math.min(64, Math.pow(Math.log2(lines + 1) / 11, 3.3) * 36),
  );
}

export function buildingFootprint(lines: number) {
  return 1.25 + Math.min(2.6, buildingHeight(lines) * 0.055);
}

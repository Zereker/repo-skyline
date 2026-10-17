import type { PlacedBuilding } from "./cityLayout";

export function normalizeQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesQuery(path: string, query: string) {
  const needle = normalizeQuery(query);
  return needle.length > 0 && path.toLowerCase().includes(needle);
}

/** Active buildings whose path contains the query, biggest first. */
export function searchBuildings(
  buildings: PlacedBuilding[],
  query: string,
  limit = 8,
): PlacedBuilding[] {
  const needle = normalizeQuery(query);
  if (!needle) return [];
  return buildings
    .filter(
      (building) =>
        building.status === "Active" &&
        building.path.toLowerCase().includes(needle),
    )
    .sort(
      (a, b) =>
        b.lines - a.lines ||
        b.commits - a.commits ||
        a.path.localeCompare(b.path),
    )
    .slice(0, limit);
}

/** Districts whose own path, or any of their buildings, contains the query. */
export function searchDistricts(
  districts: Array<{ path: string; buildings: PlacedBuilding[] }>,
  query: string,
): Set<string> {
  const needle = normalizeQuery(query);
  const matched = new Set<string>();
  if (!needle) return matched;
  for (const district of districts) {
    if (district.path.toLowerCase().includes(needle)) {
      matched.add(district.path);
      continue;
    }
    if (
      district.buildings.some(
        (building) =>
          building.status === "Active" &&
          building.path.toLowerCase().includes(needle),
      )
    )
      matched.add(district.path);
  }
  return matched;
}

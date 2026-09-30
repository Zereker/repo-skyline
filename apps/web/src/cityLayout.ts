import type { Building, CityProject } from "./types";

export type PlacedBuilding = Building & {
  x: number;
  z: number;
  district: string;
};

export type PlacedDistrict = {
  path: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  buildings: PlacedBuilding[];
};

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function colorForContributor(author?: string | null) {
  if (!author) return "#64748b";
  const hue = stableHash(author) % 360;
  return `hsl(${hue} 72% 62%)`;
}

export function layoutCity(city: CityProject): PlacedDistrict[] {
  const districts = [...city.districts].sort((a, b) => a.path.localeCompare(b.path));
  const columns = Math.max(1, Math.ceil(Math.sqrt(districts.length)));

  return districts.map((district, districtIndex) => {
    const buildings = [...district.buildings].sort(
      (a, b) => stableHash(a.id) - stableHash(b.id) || a.path.localeCompare(b.path),
    );

    const localColumns = Math.max(1, Math.ceil(Math.sqrt(buildings.length)));
    const localRows = Math.max(1, Math.ceil(buildings.length / localColumns));
    const width = Math.max(7, localColumns * 2.3 + 2);
    const depth = Math.max(7, localRows * 2.3 + 2);

    const districtColumn = districtIndex % columns;
    const districtRow = Math.floor(districtIndex / columns);
    const x = districtColumn * 15;
    const z = districtRow * 15;

    return {
      path: district.path,
      x,
      z,
      width,
      depth,
      buildings: buildings.map((building, buildingIndex) => {
        const column = buildingIndex % localColumns;
        const row = Math.floor(buildingIndex / localColumns);

        return {
          ...building,
          district: district.path,
          x: x - width / 2 + 2 + column * 2.3,
          z: z - depth / 2 + 2 + row * 2.3,
        };
      }),
    };
  });
}

export function activeDistrictsAt(
  districts: PlacedDistrict[],
  timestamp: number,
): PlacedDistrict[] {
  return districts
    .map((district) => ({
      ...district,
      buildings: district.buildings.filter(
        (building) =>
          building.created_at <= timestamp &&
          (building.deleted_at == null || building.deleted_at >= timestamp),
      ),
    }))
    .filter((district) => district.buildings.length > 0);
}

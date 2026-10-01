import type { Building, CityProject } from "./types";

export type PlacedBuilding = Building & {
  x: number;
  z: number;
  district: string;
  from_x?: number;
  from_z?: number;
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

function directoryOf(path: string) {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "_root";
}

function historicalPoint(district: PlacedDistrict, path: string) {
  const columns = Math.max(1, Math.floor((district.width - 3) / 2.3));
  const rows = Math.max(1, Math.floor((district.depth - 3) / 2.3));
  const cells = Math.max(1, columns * rows);
  const index = stableHash(path) % cells;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: district.x - district.width / 2 + 2 + column * 2.3,
    z: district.z - district.depth / 2 + 2 + row * 2.3,
  };
}

export function colorForContributor(author?: string | null) {
  if (!author) return "#64748b";
  const hue = stableHash(author) % 360;
  return \`hsl(\${hue} 72% 62%)\`;
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
  commitIndex: number,
): PlacedDistrict[] {
  const districtMap = new Map(districts.map((district) => [district.path, district]));
  const active = new Map<string, PlacedBuilding[]>();

  for (const district of districts) {
    active.set(district.path, []);
  }

  for (const sourceDistrict of districts) {
    for (const building of sourceDistrict.buildings) {
      const snapshot = [...building.history]
        .filter((item) => item.commit_index <= commitIndex)
        .sort((a, b) => a.commit_index - b.commit_index)
        .at(-1);

      if (!snapshot) continue;

      const previous = [...building.history]
        .filter((item) => item.commit_index < snapshot.commit_index)
        .sort((a, b) => a.commit_index - b.commit_index)
        .at(-1);

      if (snapshot.kind === "deleted" && snapshot.commit_index < commitIndex) {
        continue;
      }

      const visibleLines =
        snapshot.kind === "deleted"
          ? previous?.lines ?? building.lines
          : snapshot.lines;

      const destinationPath = directoryOf(snapshot.path);
      const destination = districtMap.get(destinationPath) ?? sourceDistrict;
      const point = destination === sourceDistrict && snapshot.path === building.path
        ? { x: building.x, z: building.z }
        : historicalPoint(destination, snapshot.path);

      const previousPath = previous?.path;
      const previousDistrict = previousPath
        ? districtMap.get(directoryOf(previousPath))
        : undefined;

      const from =
        snapshot.kind === "renamed" && previousDistrict && previousPath
          ? historicalPoint(previousDistrict, previousPath)
          : undefined;

      const nextBuilding: PlacedBuilding = {
        ...building,
        path: snapshot.path,
        lines: visibleLines,
        district: destination.path,
        primary_author: snapshot.author_id || building.primary_author,
        x: point.x,
        z: point.z,
        from_x: from?.x,
        from_z: from?.z,
      };

      active.get(destination.path)?.push(nextBuilding);
    }
  }

  return districts
    .map((district) => ({
      ...district,
      buildings: active.get(district.path) ?? [],
    }))
    .filter((district) => district.buildings.length > 0);
}

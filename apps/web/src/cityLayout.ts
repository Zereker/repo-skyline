import type { Building, CityProject, FileSnapshot } from "./types";

export type PlacedBuilding = Building & {
  x: number;
  z: number;
  district: string;
  from_x?: number;
  from_z?: number;
  analysis_color?: string;
  recent_activity: number;
  status: "Active" | "Demolished";
};
export type PlacedDistrict = {
  path: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  buildings: PlacedBuilding[];
  slots: Map<string, { x: number; z: number }>;
  directory_depth: number;
};
function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function directoryOf(path: string, depth = Number.MAX_SAFE_INTEGER) {
  const slash = path.lastIndexOf("/");
  return slash > 0
    ? path.slice(0, slash).split("/").slice(0, depth).join("/")
    : "_root";
}
export function colorForContributor(author?: string | null) {
  return author ? `hsl(${stableHash(author) % 360} 72% 62%)` : "#64748b";
}
export function colorForDistrict(path: string) {
  return `hsl(${stableHash(path) % 360} 48% 58%)`;
}
export function colorForActivity(activity: number) {
  return `hsl(${Math.max(0, 210 - activity * 30)} 80% ${Math.min(65, 35 + activity * 5)}%)`;
}
function slotKey(id: string, path: string) {
  return `${id}\0${path}`;
}

export function layoutCity(
  city: CityProject,
  directoryDepth = Number.MAX_SAFE_INTEGER,
): PlacedDistrict[] {
  const buildings = city.districts.flatMap((d) => d.buildings);
  const paths = new Map<string, Set<string>>();
  for (const building of buildings) {
    for (const path of new Set([
      building.path,
      ...(building.history ?? []).map((s) => s.path),
    ])) {
      const directory = directoryOf(path, directoryDepth);
      if (!paths.has(directory)) paths.set(directory, new Set());
      paths.get(directory)!.add(slotKey(building.id, path));
    }
  }
  const models = [...paths]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, keys]) => {
      const ordered = [...keys].sort(
        (a, b) => stableHash(a) - stableHash(b) || a.localeCompare(b),
      );
      const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
      return {
        path,
        ordered,
        columns,
        width: Math.max(7, columns * 2.3 + 3),
        depth: Math.max(7, Math.ceil(ordered.length / columns) * 2.3 + 3),
      };
    });
  const columns = Math.max(1, Math.ceil(Math.sqrt(models.length)));
  const colWidths = Array.from({ length: columns }, (_, col) =>
    Math.max(
      7,
      ...models.filter((_, i) => i % columns === col).map((m) => m.width),
    ),
  );
  const rowDepths = Array.from(
    { length: Math.ceil(models.length / columns) },
    (_, row) =>
      Math.max(
        7,
        ...models.slice(row * columns, (row + 1) * columns).map((m) => m.depth),
      ),
  );
  const offset = (sizes: number[], index: number) =>
    sizes.slice(0, index).reduce((s, v) => s + v + 4, 0) + sizes[index] / 2;
  return models.map((m, i) => {
    const x = offset(colWidths, i % columns);
    const z = offset(rowDepths, Math.floor(i / columns));
    const slots = new Map(
      m.ordered.map((key, index) => [
        key,
        {
          x: x - m.width / 2 + 2 + (index % m.columns) * 2.3,
          z: z - m.depth / 2 + 2 + Math.floor(index / m.columns) * 2.3,
        },
      ]),
    );
    return {
      ...m,
      x,
      z,
      slots,
      directory_depth: directoryDepth,
      buildings: buildings
        .filter((b) => directoryOf(b.path, directoryDepth) === m.path)
        .map((b) => ({
          ...b,
          ...slots.get(slotKey(b.id, b.path))!,
          district: m.path,
          recent_activity: 0,
          status: "Active" as const,
        })),
    };
  });
}

export function ownerAt(history: FileSnapshot[]): string | undefined {
  const scores = new Map<string, { additions: number; commits: number }>();
  for (const snapshot of history) {
    const score = scores.get(snapshot.author_id) ?? {
      additions: 0,
      commits: 0,
    };
    score.additions += snapshot.additions ?? 0;
    score.commits++;
    scores.set(snapshot.author_id, score);
  }
  return [...scores].sort(
    ([a, sa], [b, sb]) =>
      sb.additions - sa.additions ||
      sb.commits - sa.commits ||
      (a < b ? -1 : a > b ? 1 : 0),
  )[0]?.[0];
}
export function activeDistrictsAt(
  districts: PlacedDistrict[],
  commitIndex: number,
  timestamp?: number,
): PlacedDistrict[] {
  const districtMap = new Map(districts.map((d) => [d.path, d]));
  const active = new Map(
    districts.map((d) => [d.path, [] as PlacedBuilding[]]),
  );
  for (const building of districts.flatMap((d) => d.buildings)) {
    const history = building.history ?? [];
    if (history.length === 0) {
      // Legacy/demo projects have no snapshots; retain their explicit static view.
      if (timestamp == null || building.created_at <= timestamp)
        active.get(building.district)?.push(building);
      continue;
    }
    let low = 0;
    let high = history.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (history[mid].commit_index <= commitIndex) low = mid + 1;
      else high = mid;
    }
    const snapshot = history[low - 1];
    if (!snapshot) continue;
    if (snapshot.kind === "deleted" && snapshot.commit_index < commitIndex)
      continue;
    const previous = history[low - 2];
    const destination = districtMap.get(
      directoryOf(snapshot.path, districts[0]?.directory_depth),
    );
    if (!destination) continue;
    const point = destination.slots.get(slotKey(building.id, snapshot.path))!;
    const from =
      snapshot.kind === "renamed" &&
      snapshot.commit_index === commitIndex &&
      previous
        ? districtMap
            .get(directoryOf(previous.path, districts[0]?.directory_depth))
            ?.slots.get(slotKey(building.id, previous.path))
        : undefined;
    const past = history.slice(0, low);
    const at = timestamp ?? snapshot.timestamp;
    active.get(destination.path)!.push({
      ...building,
      ...point,
      path: snapshot.path,
      district: destination.path,
      lines:
        snapshot.kind === "deleted" ? (previous?.lines ?? 0) : snapshot.lines,
      commits: past.length,
      additions: past.reduce((s, v) => s + (v.additions ?? 0), 0),
      deletions: past.reduce((s, v) => s + (v.deletions ?? 0), 0),
      contributor_count: new Set(past.map((s) => s.author_id)).size,
      primary_author: ownerAt(past),
      created_at: history[0].timestamp,
      last_modified_at: snapshot.timestamp,
      deleted_at: snapshot.kind === "deleted" ? snapshot.timestamp : null,
      from_x: from?.x,
      from_z: from?.z,
      status: snapshot.kind === "deleted" ? "Demolished" : "Active",
      recent_activity: past.filter(
        (s) => s.timestamp <= at && s.timestamp >= at - 30 * 86400,
      ).length,
    });
  }
  return districts
    .map((d) => ({ ...d, buildings: active.get(d.path)! }))
    .filter((d) => d.buildings.length > 0);
}

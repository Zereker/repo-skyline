import type { Building, CityProject, FileSnapshot } from "./types";
import { buildingFootprint } from "./buildingScale";

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
  return author ? `hsl(${stableHash(author) % 360}, 72%, 62%)` : "#64748b";
}
export function colorForDistrict(path: string) {
  return `hsl(${stableHash(path) % 360}, 48%, 58%)`;
}
export function colorForActivity(activity: number) {
  return `hsl(${Math.max(0, 210 - activity * 30)}, 80%, ${Math.min(65, 35 + activity * 5)}%)`;
}
export function slotKey(id: string, path: string) {
  return `${id}\0${path}`;
}

export function layoutCity(
  city: CityProject,
  directoryDepth = Number.MAX_SAFE_INTEGER,
): PlacedDistrict[] {
  const buildings = city.districts.flatMap((d) => d.buildings);
  const currentSlots = new Set(
    buildings
      .filter((b) => b.deleted_at == null)
      .map((b) => slotKey(b.id, b.path)),
  );
  const currentDirectories = new Set(
    buildings
      .filter((b) => b.deleted_at == null)
      .map((b) => directoryOf(b.path, directoryDepth)),
  );
  const paths = new Map<string, Set<string>>();
  const lotSizes = new Map<string, number>();
  for (const building of buildings) {
    const peakLines = Math.max(
      building.lines,
      ...(building.history ?? []).map((s) => s.lines),
    );
    const lotSize = buildingFootprint(peakLines) * 1.15 + 0.75;
    for (const path of new Set([
      building.path,
      ...(building.history ?? []).map((s) => s.path),
    ])) {
      const directory = directoryOf(path, directoryDepth);
      if (!paths.has(directory)) paths.set(directory, new Set());
      paths.get(directory)!.add(slotKey(building.id, path));
      lotSizes.set(slotKey(building.id, path), lotSize);
    }
  }
  const models = [...paths]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, keys]) => {
      const ordered = [...keys].sort(
        (a, b) =>
          Number(currentSlots.has(b)) - Number(currentSlots.has(a)) ||
          stableHash(a) - stableHash(b) ||
          a.localeCompare(b),
      );
      const rowWidth = Math.max(
        4,
        Math.sqrt(
          ordered.reduce((area, key) => area + lotSizes.get(key)! ** 2, 0),
        ) * 1.15,
      );
      const localSlots = new Map<string, { x: number; z: number }>();
      let x = 0,
        z = 0,
        rowDepth = 0,
        usedWidth = 0;
      for (const key of ordered) {
        const size = lotSizes.get(key)!;
        if (x > 0 && x + size > rowWidth) {
          x = 0;
          z += rowDepth;
          rowDepth = 0;
        }
        localSlots.set(key, { x: x + size / 2, z: z + size / 2 });
        x += size;
        usedWidth = Math.max(usedWidth, x);
        rowDepth = Math.max(rowDepth, size);
      }
      return {
        path,
        ordered,
        localSlots,
        width: Math.max(7, usedWidth + 2),
        depth: Math.max(7, z + rowDepth + 2),
      };
    });
  // Stable shelf packing avoids the empty boulevards of a uniform district grid.
  // Historical lots remain reserved, so seeking never shuffles file identities.
  const orderedModels = [...models].sort(
    (a, b) =>
      Number(currentDirectories.has(b.path)) -
        Number(currentDirectories.has(a.path)) ||
      b.depth - a.depth ||
      a.path.localeCompare(b.path),
  );
  const rowWidth = Math.max(
    7,
    ...models.map((m) => m.width),
    Math.sqrt(
      models.reduce((area, m) => area + (m.width + 3) * (m.depth + 3), 0),
    ) * 1.45,
  );
  const positions = new Map<string, { x: number; z: number }>();
  let cursorX = 0,
    cursorZ = 0,
    rowDepth = 0;
  for (const model of orderedModels) {
    if (cursorX > 0 && cursorX + model.width > rowWidth) {
      cursorX = 0;
      cursorZ += rowDepth + 3;
      rowDepth = 0;
    }
    positions.set(model.path, {
      x: cursorX + model.width / 2,
      z: cursorZ + model.depth / 2,
    });
    cursorX += model.width + 3;
    rowDepth = Math.max(rowDepth, model.depth);
  }
  return models.map((m) => {
    const { x, z } = positions.get(m.path)!;
    const slots = new Map(
      m.ordered.map((key) => [
        key,
        {
          x: x - m.width / 2 + 1 + m.localSlots.get(key)!.x,
          z: z - m.depth / 2 + 1 + m.localSlots.get(key)!.z,
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
  resolveZone?: (path: string) => string | undefined,
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
      resolveZone?.(snapshot.path) ??
        directoryOf(snapshot.path, districts[0]?.directory_depth),
    );
    if (!destination) continue;
    const point = destination.slots.get(slotKey(building.id, snapshot.path))!;
    const from =
      snapshot.kind === "renamed" &&
      snapshot.commit_index === commitIndex &&
      previous
        ? districtMap
            .get(
              resolveZone?.(previous.path) ??
                directoryOf(previous.path, districts[0]?.directory_depth),
            )
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

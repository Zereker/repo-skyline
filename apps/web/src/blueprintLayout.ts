import { Color } from "three";
import { buildingFootprint } from "./buildingScale";
import {
  slotKey,
  type PlacedBuilding,
  type PlacedDistrict,
} from "./cityLayout";
import {
  BLUEPRINT_STOPS,
  BLUEPRINT_SUPPORT_CELL,
  BLUEPRINT_SUPPORT_ZONE,
  BLUEPRINT_ZONES,
  blueprintZoneForPath,
  type BlueprintStop,
} from "./blueprint";
import type { CityProject } from "./types";
import type { UrbanAppearance } from "./urbanIdentity";

export type BlueprintLandmark = {
  stop: BlueprintStop;
  zone: string;
  style: BlueprintStop["style"];
  /** Blueprint label, used only as an explanation of the zone. */
  title: string;
  /** Generated from the repository: the actual file or crate this tower represents. */
  name: string;
  path: string;
  tint: string;
};

/** Building names come from the project, never from the blueprint. */
export function projectBuildingName(path: string) {
  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts[0] === "crates" && parts.length > 2) return parts[1];
  return parts.at(-1) ?? path;
}

export type BlueprintLayout = {
  districts: PlacedDistrict[];
  landmarks: Map<string, BlueprintLandmark>;
};

const GAP = 6;

function packZone(
  keys: string[],
  lotSizes: Map<string, number>,
): {
  positions: Map<string, { x: number; z: number }>;
  width: number;
  depth: number;
} {
  const rowWidth =
    Math.max(
      4,
      Math.sqrt(keys.reduce((area, key) => area + lotSizes.get(key)! ** 2, 0)) *
        1.15,
    ) || 4;
  const positions = new Map<string, { x: number; z: number }>();
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let usedWidth = 0;
  for (const key of keys) {
    const size = lotSizes.get(key)!;
    if (x > 0 && x + size > rowWidth) {
      x = 0;
      z += rowDepth;
      rowDepth = 0;
    }
    positions.set(key, { x: x + size / 2, z: z + size / 2 });
    x += size;
    usedWidth = Math.max(usedWidth, x);
    rowDepth = Math.max(rowDepth, size);
  }
  return {
    positions,
    width: Math.max(7, usedWidth + 2),
    depth: Math.max(7, z + rowDepth + 2),
  };
}

/**
 * Regroups the same historical files into the ten blueprint zones. File identity,
 * renames and historical lots stay stable; only the district plan changes.
 */
export function buildBlueprintLayout(city: CityProject): BlueprintLayout {
  const buildings = city.districts.flatMap((district) => district.buildings);
  const pathZones = new Map(BLUEPRINT_ZONES.map((zone) => [zone.path, zone]));
  const keysByZone = new Map<string, Set<string>>();
  const lotSizes = new Map<string, number>();

  for (const building of buildings) {
    const peakLines = Math.max(
      building.lines,
      ...(building.history ?? []).map((snapshot) => snapshot.lines),
    );
    const lotSize = buildingFootprint(peakLines) * 1.15 + 0.75;
    for (const path of new Set([
      building.path,
      ...(building.history ?? []).map((snapshot) => snapshot.path),
    ])) {
      const zone = blueprintZoneForPath(path);
      if (!keysByZone.has(zone)) keysByZone.set(zone, new Set());
      const key = slotKey(building.id, path);
      keysByZone.get(zone)!.add(key);
      lotSizes.set(key, lotSize);
    }
  }

  const models = [...keysByZone].map(([path, keys]) => {
    const ordered = [...keys].sort((a, b) => a.localeCompare(b));
    const packed = packZone(ordered, lotSizes);
    const zone = pathZones.get(path);
    return {
      path,
      ordered,
      ...packed,
      col: zone?.col ?? BLUEPRINT_SUPPORT_CELL.col,
      row: zone?.row ?? BLUEPRINT_SUPPORT_CELL.row,
    };
  });

  const columns = Math.max(...models.map((model) => model.col)) + 1;
  const rows = Math.max(...models.map((model) => model.row)) + 1;
  const columnWidths = Array.from({ length: columns }, (_, col) =>
    Math.max(
      7,
      ...models
        .filter((model) => model.col === col)
        .map((model) => model.width),
    ),
  );
  const rowDepths = Array.from({ length: rows }, (_, row) =>
    Math.max(
      7,
      ...models
        .filter((model) => model.row === row)
        .map((model) => model.depth),
    ),
  );
  const offset = (sizes: number[], index: number, gap: number) =>
    sizes.slice(0, index).reduce((sum, size) => sum + size + gap, 0) +
    sizes[index] / 2;

  const districts = models
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((model) => {
      const x = offset(columnWidths, model.col, GAP);
      const z = offset(rowDepths, model.row, GAP);
      const slots = new Map(
        model.ordered.map((key) => {
          const local = model.positions.get(key)!;
          return [
            key,
            {
              x: x - model.width / 2 + 1 + local.x,
              z: z - model.depth / 2 + 1 + local.z,
            },
          ];
        }),
      );
      return {
        path: model.path,
        x,
        z,
        width: model.width,
        depth: model.depth,
        slots,
        directory_depth: Number.MAX_SAFE_INTEGER,
        buildings: buildings
          .filter(
            (building) => blueprintZoneForPath(building.path) === model.path,
          )
          .map((building) => ({
            ...building,
            ...slots.get(slotKey(building.id, building.path))!,
            district: model.path,
            recent_activity: 0,
            status:
              building.deleted_at == null
                ? ("Active" as const)
                : ("Demolished" as const),
          })),
      } satisfies PlacedDistrict;
    });

  const landmarks = new Map<string, BlueprintLandmark>();
  for (const stop of BLUEPRINT_STOPS) {
    const candidates = buildings.filter(
      (building) =>
        building.deleted_at == null &&
        blueprintZoneForPath(building.path) === stop.zone,
    );
    const exact = stop.files
      .map((file) => candidates.find((building) => building.path === file))
      .filter((building): building is PlacedBuilding => !!building);
    const anchor =
      exact[0] ??
      [...candidates].sort(
        (a, b) => b.lines - a.lines || b.commits - a.commits,
      )[0];
    if (anchor)
      landmarks.set(anchor.id, {
        stop,
        zone: stop.zone,
        style: stop.style,
        title: stop.title,
        name: projectBuildingName(anchor.path),
        path: anchor.path,
        tint: stop.tint,
      });
  }

  return { districts, landmarks };
}

const BLUEPRINT_HEIGHT: Record<string, number> = {
  contract: 1.32,
  scene: 0.92,
  control: 0.86,
  history: 0.8,
  projection: 0.74,
  identity: 0.56,
  layout: 0.52,
  gate: 0.48,
  replay: 0.44,
  entry: 0.4,
};

/** Height and roof family encode the blueprint's intended skyline hierarchy. */
export function applyBlueprintLandmarks(
  appearances: Map<string, UrbanAppearance>,
  landmarks: Map<string, BlueprintLandmark>,
  zones: Map<string, string>,
  zoneTints: Map<string, string>,
): Map<string, UrbanAppearance> {
  if (appearances.size === 0 || landmarks.size === 0) return appearances;
  const maxHeight = Math.max(
    ...Array.from(appearances.values(), (appearance) => appearance.height),
  );
  const result = new Map(appearances);
  const landmarkHeight = new Map<string, number>();
  for (const [buildingId, landmark] of landmarks) {
    const appearance = result.get(buildingId);
    if (!appearance) continue;
    const rank = BLUEPRINT_HEIGHT[landmark.stop.id] ?? 0.5;
    const target = maxHeight * rank;
    const height = Math.max(appearance.height, target);
    landmarkHeight.set(landmark.zone, height);
    result.set(buildingId, {
      ...appearance,
      style: landmark.style,
      height,
      tier: "landmark",
      color: landmark.tint,
      accent: landmark.tint,
      roof: landmark.tint,
      classification: `蓝图片区「${landmark.zone}」，由 ${landmark.name} 代表`,
    });
  }
  for (const [buildingId, appearance] of result) {
    if (landmarks.has(buildingId)) continue;
    const zone = zones.get(buildingId);
    if (!zone) continue;
    const anchor = landmarkHeight.get(zone);
    const cap = anchor ? anchor * 0.72 : maxHeight * 0.55;
    const tint = zoneTints.get(zone);
    const height = Math.min(appearance.height, cap);
    const color = tint
      ? new Color(appearance.color).lerp(new Color(tint), 0.62).getStyle()
      : appearance.color;
    const roof = tint
      ? new Color(appearance.roof).lerp(new Color(tint), 0.45).getStyle()
      : appearance.roof;
    result.set(buildingId, { ...appearance, height, color, roof });
  }
  return result;
}

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DynamicDrawUsage, Object3D, type InstancedMesh } from "three";
import {
  colorForActivity,
  colorForContributor,
  colorForDistrict,
  type PlacedBuilding,
} from "./cityLayout";
import type { CityEventKind, ViewMode } from "./types";
import {
  buildingHeight,
  roofGeometries,
  towerGeometries,
} from "./buildingVisuals";
import type { UrbanAppearance } from "./urbanIdentity";
import FacadeMaterial from "./FacadeMaterial";

type Props = {
  buildings: PlacedBuilding[];
  appearances: Map<string, UrbanAppearance>;
  changes: Map<string, CityEventKind>;
  focusDistrict?: string | null;
  isDimmed?: (building: PlacedBuilding) => boolean;
  commitId?: string;
  viewMode: ViewMode;
  selectedId?: string;
  onSelect: (b: PlacedBuilding) => void;
  onHover: (b: PlacedBuilding | null) => void;
};

/** Batch by architectural family, retaining module differences in large cities. */
export default function InstancedBuildings(props: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, PlacedBuilding[]>();
    for (const building of props.buildings) {
      const appearance = props.appearances.get(building.id)!;
      const key = `${appearance.role}:${appearance.style}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(building);
    }
    return [...map];
  }, [props.buildings, props.appearances]);
  return (
    <>
      {groups.map(([key, buildings]) => (
        <BuildingBatch key={key} {...props} buildings={buildings} />
      ))}
    </>
  );
}

function BuildingBatch({
  buildings,
  appearances,
  changes,
  commitId,
  viewMode,
  selectedId,
  onSelect,
  onHover,
}: Props) {
  const ref = useRef<InstancedMesh>(null);
  const roofRef = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);
  const object = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const eventColor = useMemo(() => new Color(), []);
  const dimColor = useMemo(() => new Color("#0d1a2b"), []);
  const family = appearances.get(buildings[0].id)!;
  const roof = roofGeometries[family.style];
  const targets = useMemo(
    () =>
      buildings.map((b) => {
        const appearance = appearances.get(b.id)!;
        const kind = changes.get(b.path);
        const index =
          b.history?.findIndex((s) => s.commit_id === commitId) ?? -1;
        const previous = index > 0 ? b.history![index - 1].lines : b.lines;
        const normal =
          b.analysis_color ??
          (viewMode === "territory"
            ? colorForContributor(b.primary_author)
            : viewMode === "activity"
              ? colorForActivity(b.recent_activity)
              : appearance.language === "modules"
                ? appearance.color
                : colorForDistrict(b.district));
        return {
          b,
          appearance,
          kind,
          previous:
            (buildingHeight(previous) * appearance.height) /
            buildingHeight(b.lines),
          color: b.id === selectedId ? "#ffffff" : normal,
          pulse:
            b.id === selectedId
              ? null
              : kind === "added"
                ? "#7ee787"
                : kind === "modified"
                  ? "#ffd166"
                  : kind === "deleted"
                    ? "#ff6b6b"
                    : kind === "renamed"
                      ? "#c084fc"
                      : null,
        };
      }),
    [buildings, appearances, changes, commitId, viewMode, selectedId],
  );
  useEffect(() => {
    elapsed.current = 0;
    ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    roofRef.current?.instanceMatrix.setUsage(DynamicDrawUsage);
  }, [commitId]);
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    elapsed.current = Math.min(1, elapsed.current + delta * 2.4);
    const t = 1 - Math.pow(1 - elapsed.current, 3);
    targets.forEach(
      ({ b, appearance, kind, previous, color: shade, pulse }, i) => {
        const height = appearance.height;
        const h =
          kind === "added"
            ? height * t
            : kind === "deleted"
              ? height * (1 - t)
              : kind === "modified"
                ? previous + (height - previous) * t
                : height;
        object.position.set(
          (b.from_x ?? b.x) + (b.x - (b.from_x ?? b.x)) * t,
          0.1,
          (b.from_z ?? b.z) + (b.z - (b.from_z ?? b.z)) * t,
        );
        object.scale.set(
          appearance.width,
          Math.max(0.002, h),
          appearance.width,
        );
        object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix);
        color.set(shade);
        if (pulse) color.lerp(eventColor.set(pulse), 1 - t);
        mesh.setColorAt(i, color);
        roofRef.current?.setMatrixAt(i, object.matrix);
        roofRef.current?.setColorAt(i, color.set(appearance.roof));
      },
    );
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (roofRef.current) {
      roofRef.current.instanceMatrix.needsUpdate = true;
      if (roofRef.current.instanceColor)
        roofRef.current.instanceColor.needsUpdate = true;
    }
  });
  return (
    <group>
      <instancedMesh
        ref={ref}
        args={[towerGeometries[family.style], undefined, buildings.length]}
        dispose={null}
        frustumCulled={false}
        onClick={(event) => {
          if (event.instanceId != null) {
            event.stopPropagation();
            onSelect(buildings[event.instanceId]);
          }
        }}
        onPointerMove={(event) => {
          if (event.instanceId != null) {
            event.stopPropagation();
            onHover(buildings[event.instanceId]);
          }
        }}
        onPointerOut={() => onHover(null)}
      >
        <FacadeMaterial color="#ffffff" appearance={family} />
      </instancedMesh>
      {roof && (
        <instancedMesh
          ref={roofRef}
          args={[roof, undefined, buildings.length]}
          dispose={null}
          frustumCulled={false}
          onClick={(event) => {
            if (event.instanceId != null) {
              event.stopPropagation();
              onSelect(buildings[event.instanceId]);
            }
          }}
          onPointerMove={(event) => {
            if (event.instanceId != null) {
              event.stopPropagation();
              onHover(buildings[event.instanceId]);
            }
          }}
          onPointerOut={() => onHover(null)}
        >
          <meshStandardMaterial
            color="#ffffff"
            metalness={family.metalness * 0.5}
            roughness={Math.max(0.4, family.roughness)}
          />
        </instancedMesh>
      )}
    </group>
  );
}

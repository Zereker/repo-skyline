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
type Props = {
  buildings: PlacedBuilding[];
  changes: Map<string, CityEventKind>;
  commitId?: string;
  viewMode: ViewMode;
  selectedId?: string;
  onSelect: (b: PlacedBuilding) => void;
  onHover: (b: PlacedBuilding | null) => void;
};
const heightOf = (lines: number) =>
  Math.max(0.7, Math.min(11, Math.log2(lines + 1) * 0.9));
/** Compact shared geometry keeps large repositories interactive. */
export default function InstancedBuildings({
  buildings,
  changes,
  commitId,
  viewMode,
  selectedId,
  onSelect,
  onHover,
}: Props) {
  const ref = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);
  const object = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const targets = useMemo(
    () =>
      buildings.map((b) => {
        const kind = changes.get(b.path);
        const index =
          b.history?.findIndex((s) => s.commit_id === commitId) ?? -1;
        const previous = index > 0 ? b.history![index - 1].lines : 0;
        const normal =
          b.analysis_color ??
          (viewMode === "territory"
            ? colorForContributor(b.primary_author)
            : viewMode === "activity"
              ? colorForActivity(b.recent_activity)
              : colorForDistrict(b.district));
        return {
          b,
          kind,
          height: heightOf(b.lines),
          previous: heightOf(previous),
          color:
            b.id === selectedId
              ? "#ffffff"
              : kind === "added"
                ? "#7ee787"
                : kind === "modified"
                  ? "#ffd166"
                  : kind === "deleted"
                    ? "#ff6b6b"
                    : kind === "renamed"
                      ? "#c084fc"
                      : normal,
        };
      }),
    [buildings, changes, commitId, viewMode, selectedId],
  );
  useEffect(() => {
    elapsed.current = 0;
    if (ref.current) {
      ref.current.instanceMatrix.setUsage(DynamicDrawUsage);
    }
  }, [commitId]);
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    elapsed.current = Math.min(1, elapsed.current + delta * 2.4);
    const t = 1 - Math.pow(1 - elapsed.current, 3);
    targets.forEach(({ b, kind, height, previous, color: shade }, i) => {
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
        Math.max(0.002, h) / 2,
        (b.from_z ?? b.z) + (b.z - (b.from_z ?? b.z)) * t,
      );
      object.scale.set(1.4, Math.max(0.002, h), 1.4);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.set(shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, buildings.length]}
      frustumCulled={false}
      castShadow
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
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}

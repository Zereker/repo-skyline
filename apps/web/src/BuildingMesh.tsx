import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Group, type MeshStandardMaterial } from "three";
import {
  colorForActivity,
  colorForContributor,
  colorForDistrict,
  type PlacedBuilding,
} from "./cityLayout";
import {
  buildingHeight,
  towerGeometries,
  roofGeometries,
} from "./buildingVisuals";
import FacadeMaterial from "./FacadeMaterial";
import type { CityEventKind, ViewMode } from "./types";
import type { UrbanAppearance } from "./urbanIdentity";

type Props = {
  building: PlacedBuilding;
  changeKind?: CityEventKind;
  commitId?: string;
  viewMode: ViewMode;
  appearance: UrbanAppearance;
  onSelect: (building: PlacedBuilding) => void;
  onHover: (building: PlacedBuilding | null) => void;
  selected?: boolean;
  dimmed?: boolean;
};

export default function BuildingMesh({
  building,
  changeKind,
  commitId,
  viewMode,
  appearance,
  onSelect,
  onHover,
  selected = false,
  dimmed = false,
}: Props) {
  const group = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const progress = useRef(1);
  const { height, width, style } = appearance;
  const landmark = appearance.tier === "landmark";
  const roof = roofGeometries[style];
  const previousHeight = useMemo(() => {
    const index =
      building.history?.findIndex((s) => s.commit_id === commitId) ?? -1;
    return (
      (buildingHeight(
        index > 0 ? building.history![index - 1].lines : building.lines,
      ) *
        height) /
      buildingHeight(building.lines)
    );
  }, [building.history, building.lines, commitId, height]);
  const normal =
    building.analysis_color ??
    (viewMode === "territory"
      ? colorForContributor(building.primary_author)
      : viewMode === "activity"
        ? colorForActivity(building.recent_activity)
        : appearance.language === "modules"
          ? appearance.accent
          : colorForDistrict(building.district));
  const accent = selected
    ? "#ecfaff"
    : changeKind === "added"
      ? "#6ee7b7"
      : changeKind === "modified"
        ? "#ffd28b"
        : changeKind === "deleted"
          ? "#ff647c"
          : changeKind === "renamed"
            ? "#c6a2ff"
            : normal;
  const glass = useMemo(
    () =>
      viewMode === "district" && !selected
        ? new Color(appearance.color)
        : new Color(accent).lerp(new Color(appearance.color), 0.18),
    [accent, selected, viewMode, appearance.color],
  );

  useEffect(() => {
    progress.current = changeKind ? 0 : 1;
  }, [changeKind, commitId]);
  useFrame((_, delta) => {
    if (!group.current) return;
    progress.current = Math.min(1, progress.current + delta * 1.8);
    const t = 1 - Math.pow(1 - progress.current, 3);
    const scale =
      changeKind === "added"
        ? t
        : changeKind === "deleted"
          ? 1 - t
          : changeKind === "modified"
            ? (previousHeight + (height - previousHeight) * t) / height
            : 1;
    group.current.scale.y = Math.max(0.002, scale);
    group.current.position.x =
      (building.from_x ?? building.x) +
      (building.x - (building.from_x ?? building.x)) * t;
    group.current.position.z =
      (building.from_z ?? building.z) +
      (building.z - (building.from_z ?? building.z)) * t;
    if (material.current) {
      material.current.opacity = dimmed ? 0.14 : 1;
      material.current.transparent = dimmed;
      material.current.emissive.set(accent);
      material.current.emissiveIntensity = selected
        ? 0.2
        : changeKind
          ? (1 - t) * 0.3
          : 0;
    }
  });

  const spire =
    (style === "pagoda" || style === "crown") &&
    height > 12 &&
    appearance.tier !== "local";
  const plinth = appearance.role === "source" ? 0.4 : 0.16;
  return (
    <group
      ref={group}
      position={[building.x, 0.1, building.z]}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(building);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(building);
      }}
    >
      <mesh
        geometry={towerGeometries[style]}
        scale={[width, height, width]}
        dispose={null}
      >
        <FacadeMaterial
          color={glass}
          materialRef={material}
          appearance={appearance}
        />
      </mesh>
      {roof && (
        <mesh geometry={roof} scale={[width, height, width]} dispose={null}>
          <meshStandardMaterial
            color={appearance.roof}
            metalness={appearance.metalness * 0.5}
            roughness={Math.max(0.4, appearance.roughness)}
          />
        </mesh>
      )}
      <mesh position={[0, plinth / 2, 0]}>
        <boxGeometry args={[width * 1.15, plinth, width * 0.95]} />
        <meshStandardMaterial
          color={appearance.roof}
          metalness={0.15}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0, plinth + 0.015, width * 0.48]}>
        <boxGeometry args={[width * 1.1, 0.035, 0.025]} />
        <meshBasicMaterial color={appearance.accent} toneMapped={false} />
      </mesh>
      {style === "spiral" ? (
        <mesh position={[0, height * 0.99, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[width * 0.3, 0.026, 4, 16]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ) : !roof ? (
        <mesh
          position={[
            style === "twin" ? -width * 0.25 : 0,
            height + 0.035,
            style === "twin" ? -width * 0.08 : 0,
          ]}
        >
          <boxGeometry
            args={[
              width *
                (style === "pagoda"
                  ? 0.3
                  : style === "crown"
                    ? 0.45
                    : style === "twin"
                      ? 0.43
                      : 0.84),
              0.065,
              width * 0.7,
            ]}
          />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ) : null}
      {landmark && !roof && (
        <>
          <mesh position={[width * 0.48, height * 0.45, width * 0.35]}>
            <boxGeometry args={[0.025, height * 0.86, 0.025]} />
            <meshBasicMaterial color={appearance.accent} toneMapped={false} />
          </mesh>
          <mesh position={[-width * 0.48, height * 0.45, width * 0.35]}>
            <boxGeometry args={[0.025, height * 0.86, 0.025]} />
            <meshBasicMaterial color={appearance.accent} toneMapped={false} />
          </mesh>
        </>
      )}
      {spire && (
        <>
          <mesh position={[0, height + height * 0.075, 0]}>
            <cylinderGeometry args={[0.015, 0.07, height * 0.15, 5]} />
            <meshStandardMaterial
              color="#a8b8c9"
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
          <mesh position={[0, height * 1.15, 0]}>
            <sphereGeometry args={[0.07, 6, 4]} />
            <meshBasicMaterial color="#ff7974" toneMapped={false} />
          </mesh>
        </>
      )}
      {selected && (
        <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[width * 0.73, width * 0.78, 32]} />
          <meshBasicMaterial color="#bfefff" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

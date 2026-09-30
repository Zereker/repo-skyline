import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Mesh, MeshStandardMaterial } from "three";
import { colorForContributor, type PlacedBuilding } from "./cityLayout";
import type { CityEventKind } from "./types";

type ViewMode = "district" | "territory";

type Props = {
  building: PlacedBuilding;
  changeKind?: CityEventKind;
  commitId?: string;
  viewMode: ViewMode;
  onSelect: (building: PlacedBuilding) => void;
};

function buildingHeight(lines: number) {
  return Math.max(0.7, Math.min(11, Math.log2(lines + 1) * 0.9));
}

export default function BuildingMesh({
  building,
  changeKind,
  commitId,
  viewMode,
  onSelect,
}: Props) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const progressRef = useRef(1);
  const height = buildingHeight(building.lines);

  useEffect(() => {
    progressRef.current =
      changeKind === "added" || changeKind === "deleted" ? 0 : 1;
  }, [changeKind, commitId]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    if (changeKind === "added") {
      progressRef.current = Math.min(1, progressRef.current + delta * 2.7);
      const t = 1 - Math.pow(1 - progressRef.current, 3);
      mesh.scale.y = Math.max(0.03, t);
      mesh.position.y = (height * mesh.scale.y) / 2;
      material.emissiveIntensity = 0.35 * (1 - t) + 0.1;
      return;
    }

    if (changeKind === "deleted") {
      progressRef.current = Math.min(1, progressRef.current + delta * 2.4);
      const scale = Math.max(0.03, 1 - progressRef.current);
      mesh.scale.y = scale;
      mesh.position.y = (height * scale) / 2;
      material.opacity = Math.max(0.08, 1 - progressRef.current);
      material.transparent = true;
      material.emissiveIntensity = 0.35;
      return;
    }

    mesh.scale.y = 1;
    mesh.position.y = height / 2;
    material.opacity = 1;
    material.transparent = false;

    if (changeKind === "modified") {
      material.emissiveIntensity =
        0.25 + (Math.sin(state.clock.elapsedTime * 10) + 1) * 0.25;
    } else if (changeKind === "renamed") {
      const pulse = 1 + (Math.sin(state.clock.elapsedTime * 8) + 1) * 0.025;
      mesh.scale.x = pulse;
      mesh.scale.z = pulse;
      material.emissiveIntensity = 0.38;
    } else {
      mesh.scale.x = 1;
      mesh.scale.z = 1;
      material.emissiveIntensity = 0;
    }
  });

  const normalColor =
    viewMode === "territory"
      ? colorForContributor(building.primary_author)
      : "#75a7ff";

  const color =
    changeKind === "added"
      ? "#7ee787"
      : changeKind === "modified"
        ? "#ffd166"
        : changeKind === "deleted"
          ? "#ff6b6b"
          : changeKind === "renamed"
            ? "#c084fc"
            : normalColor;

  return (
    <mesh
      ref={meshRef}
      position={[building.x, height / 2, building.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(building);
      }}
    >
      <boxGeometry args={[1.5, height, 1.5]} />
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        emissive={changeKind ? color : "#000000"}
        emissiveIntensity={0}
        roughness={0.7}
        metalness={0.06}
      />
    </mesh>
  );
}

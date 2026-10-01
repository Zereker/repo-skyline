import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Mesh, MeshStandardMaterial } from "three";
import { colorForContributor, type PlacedBuilding } from "./cityLayout";
import type { CityEventKind } from "./types";

type ViewMode = "district" | "territory";

type Props = {
  building: PlacedBuilding;
  changeKind?: CityEventKind;
  commitId?: string;
  viewMode: ViewMode;
  hotspot?: boolean;
  onSelect: (building: PlacedBuilding) => void;
};

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildingHeight(lines: number) {
  return Math.max(0.7, Math.min(11, Math.log2(lines + 1) * 0.9));
}

export default function BuildingMesh({
  building,
  changeKind,
  commitId,
  viewMode,
  hotspot = false,
  onSelect,
}: Props) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const progressRef = useRef(1);
  const height = buildingHeight(building.lines);

  const footprint = useMemo(() => {
    const hash = stableHash(building.id);
    return {
      width: 1.12 + (hash % 5) * 0.13,
      depth: 1.12 + ((hash >>> 5) % 5) * 0.13,
    };
  }, [building.id]);

  useEffect(() => {
    progressRef.current =
      changeKind === "added" || changeKind === "deleted" ? 0 : 1;
  }, [changeKind, commitId]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    if (changeKind === "added") {
      mesh.scale.x = 1;
      mesh.scale.z = 1;
      progressRef.current = Math.min(1, progressRef.current + delta * 2.7);
      const t = 1 - Math.pow(1 - progressRef.current, 3);
      mesh.scale.y = Math.max(0.03, t);
      mesh.position.y = (height * mesh.scale.y) / 2;
      material.opacity = 1;
      material.transparent = false;
      material.emissiveIntensity = 0.45 * (1 - t) + 0.12;
      return;
    }

    if (changeKind === "deleted") {
      mesh.scale.x = 1;
      mesh.scale.z = 1;
      progressRef.current = Math.min(1, progressRef.current + delta * 2.4);
      const scale = Math.max(0.03, 1 - progressRef.current);
      mesh.scale.y = scale;
      mesh.position.y = (height * scale) / 2;
      material.opacity = Math.max(0.08, 1 - progressRef.current);
      material.transparent = true;
      material.emissiveIntensity = 0.4;
      return;
    }

    mesh.scale.y = 1;
    mesh.position.y = height / 2;
    material.opacity = 1;
    material.transparent = false;

    if (changeKind === "modified") {
      mesh.scale.x = 1;
      mesh.scale.z = 1;
      material.emissiveIntensity =
        0.22 + (Math.sin(state.clock.elapsedTime * 10) + 1) * 0.26;
    } else if (changeKind === "renamed") {
      const pulse = 1 + (Math.sin(state.clock.elapsedTime * 8) + 1) * 0.025;
      mesh.scale.x = pulse;
      mesh.scale.z = pulse;
      material.emissiveIntensity = 0.38;
    } else {
      mesh.scale.x = 1;
      mesh.scale.z = 1;
      material.emissiveIntensity = 0.02;
    }
  });

  const normalColor =
    viewMode === "territory"
      ? colorForContributor(building.primary_author)
      : "#5f8fdc";

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
      castShadow
      onClick={(event) => {
        event.stopPropagation();
        onSelect(building);
      }}
    >
      <boxGeometry args={[footprint.width, height, footprint.depth]} />
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        emissive={changeKind ? color : "#000000"}
        emissiveIntensity={0}
        roughness={0.68}
        metalness={0.08}
      />
      {hotspot ? (
        <>
          <mesh position={[0, height / 2 + 0.055, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.08, 12]} />
            <meshStandardMaterial
              color="#ff9f43"
              emissive="#ff9f43"
              emissiveIntensity={0.9}
              roughness={0.45}
            />
          </mesh>
          <pointLight
            position={[0, height / 2 + 0.3, 0]}
            color="#ffb45c"
            intensity={0.45}
            distance={3.2}
            decay={2}
          />
        </>
      ) : null}
    </mesh>
  );
}

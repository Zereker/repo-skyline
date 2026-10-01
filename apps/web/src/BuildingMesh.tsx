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
  landmark?: boolean;
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
  landmark = false,
  onSelect,
}: Props) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const progressRef = useRef(1);
  const height = buildingHeight(building.lines);

  const previousLines = useMemo(() => {
    if (!commitId) return building.lines;

    const index = building.history.findIndex((snapshot) => snapshot.commit_id === commitId);
    if (index <= 0) return 0;

    return building.history[index - 1]?.lines ?? 0;
  }, [building.history, building.lines, commitId]);

  const previousHeight = buildingHeight(previousLines);

  const shape = useMemo(() => {
    const hash = stableHash(building.id);
    const type = hash % 5;
    return {
      type,
      width: 1.12 + (hash % 5) * 0.13,
      depth: 1.12 + ((hash >>> 5) % 5) * 0.13,
      windows: type !== 4 && (hash >>> 13) % 4 === 0,
    };
  }, [building.id]);

  useEffect(() => {
    progressRef.current =
      changeKind === "added" || changeKind === "deleted" || changeKind === "modified" || changeKind === "renamed"
        ? 0
        : 1;

    if (meshRef.current) {
      meshRef.current.position.x = building.from_x ?? building.x;
      meshRef.current.position.z = building.from_z ?? building.z;
    }
  }, [changeKind, commitId, building.from_x, building.from_z, building.x, building.z]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    if (changeKind === "added") {
      progressRef.current = Math.min(1, progressRef.current + delta * 2.7);
      const t = 1 - Math.pow(1 - progressRef.current, 3);
      mesh.scale.set(1, Math.max(0.03, t), 1);
      mesh.position.x = building.x;
      mesh.position.z = building.z;
      mesh.position.y = (height * mesh.scale.y) / 2;
      material.opacity = 1;
      material.transparent = false;
      material.emissiveIntensity = 0.45 * (1 - t) + 0.12;
      return;
    }

    if (changeKind === "deleted") {
      progressRef.current = Math.min(1, progressRef.current + delta * 2.4);
      const scale = Math.max(0.03, 1 - progressRef.current);
      mesh.scale.set(1, scale, 1);
      mesh.position.x = building.x;
      mesh.position.z = building.z;
      mesh.position.y = (height * scale) / 2;
      material.opacity = Math.max(0.08, 1 - progressRef.current);
      material.transparent = true;
      material.emissiveIntensity = 0.4;
      return;
    }

    if (changeKind === "modified") {
      progressRef.current = Math.min(1, progressRef.current + delta * 2.8);
      const t = 1 - Math.pow(1 - progressRef.current, 3);
      const displayHeight = previousHeight + (height - previousHeight) * t;
      mesh.scale.set(1, displayHeight / Math.max(height, 0.01), 1);
      mesh.position.x = building.x;
      mesh.position.z = building.z;
      mesh.position.y = displayHeight / 2;
      material.opacity = 1;
      material.transparent = false;
      material.emissiveIntensity =
        0.22 + (Math.sin(state.clock.elapsedTime * 10) + 1) * 0.26 * (1 - t * 0.7);
      return;
    }

    if (changeKind === "renamed") {
      progressRef.current = Math.min(1, progressRef.current + delta * 1.9);
      const t = 1 - Math.pow(1 - progressRef.current, 3);
      mesh.scale.set(1 + (Math.sin(state.clock.elapsedTime * 8) + 1) * 0.012, 1, 1 + (Math.sin(state.clock.elapsedTime * 8) + 1) * 0.012);
      const fromX = building.from_x ?? building.x;
      const fromZ = building.from_z ?? building.z;
      mesh.position.x = fromX + (building.x - fromX) * t;
      mesh.position.z = fromZ + (building.z - fromZ) * t;
      mesh.position.y = height / 2;
      material.emissiveIntensity = 0.38 * (1 - t * 0.45);
      return;
    }

    mesh.scale.set(1, 1, 1);
    mesh.position.x = building.x;
    mesh.position.z = building.z;
    mesh.position.y = height / 2;
    material.opacity = 1;
    material.transparent = false;
    material.emissiveIntensity = 0.02;
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

  const roofY = height / 2 + 0.05;
  const isTower = shape.type === 0;
  const isOffice = shape.type === 1;
  const isWarehouse = shape.type === 3;
  const isCivic = shape.type === 4;

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
      {isTower ? (
        <boxGeometry args={[shape.width * 0.78, height, shape.depth * 0.78]} />
      ) : isCivic ? (
        <cylinderGeometry
          args={[Math.min(shape.width, shape.depth) * 0.58, Math.min(shape.width, shape.depth) * 0.68, height, 10]}
        />
      ) : isWarehouse ? (
        <boxGeometry args={[shape.width * 1.22, height * 0.72, shape.depth * 1.18]} />
      ) : (
        <boxGeometry args={[shape.width, height, shape.depth]} />
      )}

      <meshStandardMaterial
        ref={materialRef}
        color={color}
        emissive={changeKind ? color : "#000000"}
        emissiveIntensity={0}
        roughness={isCivic ? 0.5 : 0.68}
        metalness={isOffice ? 0.16 : 0.08}
      />

      {isTower ? (
        <mesh position={[0, roofY, 0]}>
          <cylinderGeometry args={[0.18, 0.28, 0.48, 8]} />
          <meshStandardMaterial
            color="#8fa8c8"
            emissive="#29486f"
            emissiveIntensity={0.35}
            roughness={0.35}
            metalness={0.55}
          />
        </mesh>
      ) : null}

      {isOffice ? (
        <mesh position={[0, roofY, 0]}>
          <boxGeometry args={[shape.width * 0.42, 0.2, shape.depth * 0.42]} />
          <meshStandardMaterial
            color="#8aa1bf"
            emissive="#263d60"
            emissiveIntensity={0.3}
            roughness={0.4}
            metalness={0.35}
          />
        </mesh>
      ) : null}

      {isCivic ? (
        <mesh position={[0, roofY + 0.12, 0]}>
          <coneGeometry args={[0.38, 0.52, 8]} />
          <meshStandardMaterial
            color="#b3c6df"
            emissive="#324f76"
            emissiveIntensity={0.38}
            roughness={0.4}
            metalness={0.2}
          />
        </mesh>
      ) : null}

      {shape.windows ? (
        <>
          <mesh position={[0, -height * 0.08, -shape.depth / 2 - 0.008]}>
            <boxGeometry args={[Math.max(0.35, shape.width * 0.72), 0.045, 0.018]} />
            <meshStandardMaterial
              color="#f7d98b"
              emissive="#f7b955"
              emissiveIntensity={0.55}
              roughness={0.35}
            />
          </mesh>
          {height > 3.2 ? (
            <mesh position={[0, height * 0.22, -shape.depth / 2 - 0.008]}>
              <boxGeometry args={[Math.max(0.35, shape.width * 0.72), 0.045, 0.018]} />
              <meshStandardMaterial
                color="#f7d98b"
                emissive="#f7b955"
                emissiveIntensity={0.42}
                roughness={0.35}
              />
            </mesh>
          ) : null}
        </>
      ) : null}

      {landmark ? (
        <>
          <mesh position={[0, roofY + 0.07, 0]}>
            <torusGeometry args={[Math.max(0.34, Math.min(shape.width, shape.depth) * 0.34), 0.035, 8, 24]} />
            <meshStandardMaterial
              color="#9ec5ff"
              emissive="#6fa9ff"
              emissiveIntensity={0.65}
              roughness={0.3}
              metalness={0.35}
            />
          </mesh>
          <pointLight
            position={[0, roofY + 0.2, 0]}
            color="#7fb4ff"
            intensity={0.22}
            distance={3.8}
            decay={2}
          />
        </>
      ) : null}

      {hotspot ? (
        <>
          <mesh position={[0, roofY + 0.12, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.08, 12]} />
            <meshStandardMaterial
              color="#ff9f43"
              emissive="#ff9f43"
              emissiveIntensity={0.9}
              roughness={0.45}
            />
          </mesh>
          <pointLight
            position={[0, roofY + 0.38, 0]}
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

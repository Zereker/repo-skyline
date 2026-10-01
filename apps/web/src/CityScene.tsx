import { Billboard, OrbitControls, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import BuildingMesh from "./BuildingMesh";
import type { PlacedBuilding, PlacedDistrict } from "./cityLayout";
import type { CityEventKind } from "./types";

type ViewMode = "district" | "territory";

type Props = {
  districts: PlacedDistrict[];
  activeChanges: Map<string, CityEventKind>;
  commitId?: string;
  viewMode: ViewMode;
  onSelect: (building: PlacedBuilding) => void;
  cinematic?: boolean;
  focusPath?: string | null;
};

export default function CityScene({
  districts,
  activeChanges,
  commitId,
  viewMode,
  onSelect,
  cinematic = false,
  focusPath = null,
}: Props) {
  const { camera } = useThree();
  const target = useMemo(() => new Vector3(), []);
  const desired = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const focus = districts
      .flatMap((district) => district.buildings)
      .find((building) => building.path === focusPath);

    const fallback = districts[0];
    const x = focus?.x ?? fallback?.x ?? 0;
    const z = focus?.z ?? fallback?.z ?? 0;

    target.set(x, 0, z);
    desired.set(x + 11, 12, z + 13);
  }, [districts, focusPath, target, desired]);

  useFrame((_, delta) => {
    if (!cinematic) return;

    const smoothing = 1 - Math.pow(0.001, delta);
    camera.position.lerp(desired, smoothing);
    camera.lookAt(target);
  });

  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[12, 22, 10]} intensity={2.6} />
      <gridHelper args={[120, 60, "#334155", "#172033"]} />

      {districts.map((district) => (
        <group key={district.path}>
          <mesh position={[district.x, -0.08, district.z]}>
            <boxGeometry args={[district.width, 0.12, district.depth]} />
            <meshStandardMaterial color="#172033" roughness={1} />
          </mesh>

          <Billboard
            position={[
              district.x,
              1.1,
              district.z - Math.max(1.5, district.depth / 2 - 0.8),
            ]}
          >
            <Text
              fontSize={0.72}
              color="#c8d7ee"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#08101c"
            >
              {district.path}
            </Text>
          </Billboard>

          {district.buildings.map((building) => (
            <BuildingMesh
              key={building.id}
              building={building}
              changeKind={activeChanges.get(building.path)}
              commitId={commitId}
              viewMode={viewMode}
              onSelect={onSelect}
            />
          ))}
        </group>
      ))}

      <OrbitControls
        makeDefault
        enabled={!cinematic}
        enableDamping
        minDistance={8}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}

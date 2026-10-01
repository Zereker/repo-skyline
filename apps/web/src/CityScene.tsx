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

  const cityCenter = useMemo(() => {
    if (districts.length === 0) return [0, 0] as const;

    const minX = Math.min(...districts.map((district) => district.x - district.width / 2));
    const maxX = Math.max(...districts.map((district) => district.x + district.width / 2));
    const minZ = Math.min(...districts.map((district) => district.z - district.depth / 2));
    const maxZ = Math.max(...districts.map((district) => district.z + district.depth / 2));

    return [(minX + maxX) / 2, (minZ + maxZ) / 2] as const;
  }, [districts]);

  useEffect(() => {
    const focus = districts
      .flatMap((district) => district.buildings)
      .find((building) => building.path === focusPath);

    const x = focus?.x ?? cityCenter[0];
    const z = focus?.z ?? cityCenter[1];

    target.set(x, 0, z);
    desired.set(x + 11, 12, z + 13);
  }, [districts, focusPath, cityCenter, target, desired]);

  useFrame((_, delta) => {
    if (!cinematic) return;

    const smoothing = 1 - Math.pow(0.001, delta);
    camera.position.lerp(desired, smoothing);
    camera.lookAt(target);
  });

  return (
    <>
      <ambientLight intensity={1.45} />
      <directionalLight position={[18, 28, 10]} intensity={2.8} />
      <directionalLight position={[-16, 12, -12]} intensity={0.8} />
      <hemisphereLight args={["#9db9df", "#07101b", 0.45]} />
      <fog attach="fog" args={["#080d18", 58, 135]} />

      <mesh position={[cityCenter[0], -0.32, cityCenter[1]]} receiveShadow>
        <boxGeometry args={[140, 0.35, 140]} />
        <meshStandardMaterial color="#07101b" roughness={1} />
      </mesh>

      <gridHelper
        args={[140, 70, "#233149", "#101a2b"]}
        position={[cityCenter[0], -0.13, cityCenter[1]]}
      />

      {districts.map((district) => (
        <group key={district.path}>
          <mesh position={[district.x, -0.11, district.z]} receiveShadow>
            <boxGeometry args={[district.width + 1.15, 0.12, district.depth + 1.15]} />
            <meshStandardMaterial color="#0b1524" roughness={0.95} />
          </mesh>

          <mesh position={[district.x, -0.045, district.z]} receiveShadow>
            <boxGeometry args={[district.width + 0.42, 0.08, district.depth + 0.42]} />
            <meshStandardMaterial color="#152238" roughness={0.9} />
          </mesh>

          <mesh position={[district.x, 0.02, district.z]} receiveShadow>
            <boxGeometry args={[district.width, 0.08, district.depth]} />
            <meshStandardMaterial
              color={viewMode === "territory" ? "#18233a" : "#172033"}
              roughness={0.92}
            />
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
              color="#d4e1f4"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.025}
              outlineColor="#060b13"
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
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.05}
        target={[cityCenter[0], 0, cityCenter[1]]}
      />
    </>
  );
}

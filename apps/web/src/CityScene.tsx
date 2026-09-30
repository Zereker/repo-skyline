import { Billboard, OrbitControls, Text } from "@react-three/drei";
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
};

export default function CityScene({
  districts,
  activeChanges,
  commitId,
  viewMode,
  onSelect,
}: Props) {
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
        enableDamping
        minDistance={8}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}

import { Billboard, OrbitControls, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Mesh, MeshStandardMaterial } from "three";
import { Vector3 } from "three";
import BuildingMesh from "./BuildingMesh";
import type { PlacedBuilding, PlacedDistrict } from "./cityLayout";
import type { CityEventKind, CityRoad } from "./types";

type ViewMode = "district" | "territory";

type Props = {
  districts: PlacedDistrict[];
  activeChanges: Map<string, CityEventKind>;
  roads?: CityRoad[];
  commitId?: string;
  releaseNames?: string[];
  viewMode: ViewMode;
  onSelect: (building: PlacedBuilding) => void;
  cinematic?: boolean;
  focusPath?: string | null;
};

export default function CityScene({
  districts,
  activeChanges,
  roads = [],
  commitId,
  releaseNames = [],
  viewMode,
  onSelect,
  cinematic = false,
  focusPath = null,
}: Props) {
  const { camera } = useThree();
  const target = useMemo(() => new Vector3(), []);
  const desired = useMemo(() => new Vector3(), []);
  const rippleRef = useRef<Mesh>(null);
  const rippleMaterialRef = useRef<MeshStandardMaterial>(null);
  const rippleProgressRef = useRef(0);

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

  const hotspotPaths = useMemo(() => {
    const buildings = districts
      .flatMap((district) => district.buildings)
      .sort((a, b) => b.commits - a.commits || b.lines - a.lines);

    const limit = Math.min(12, Math.max(3, Math.ceil(buildings.length * 0.05)));
    return new Set(buildings.slice(0, limit).map((building) => building.path));
  }, [districts]);

  const landmarkPaths = useMemo(() => {
    const paths = new Set<string>();

    for (const district of districts) {
      const landmark = [...district.buildings].sort(
        (a, b) => b.lines - a.lines || b.commits - a.commits,
      )[0];

      if (landmark) paths.add(landmark.path);
    }

    return paths;
  }, [districts]);

  const roadSegments = useMemo(() => {
    const segments: Array<{
      id: string;
      x: number;
      z: number;
      width: number;
      depth: number;
    }> = [];

    for (const district of districts) {
      const roadOffsetX = district.width / 2 - 0.55;
      const roadOffsetZ = district.depth / 2 - 0.55;

      segments.push(
        {
          id: `${district.path}:top`,
          x: district.x,
          z: district.z - roadOffsetZ,
          width: district.width,
          depth: 0.42,
        },
        {
          id: `${district.path}:bottom`,
          x: district.x,
          z: district.z + roadOffsetZ,
          width: district.width,
          depth: 0.42,
        },
        {
          id: `${district.path}:left`,
          x: district.x - roadOffsetX,
          z: district.z,
          width: 0.42,
          depth: district.depth,
        },
        {
          id: `${district.path}:right`,
          x: district.x + roadOffsetX,
          z: district.z,
          width: 0.42,
          depth: district.depth,
        },
      );
    }

    const columns = new Map<number, PlacedDistrict[]>();
    const rows = new Map<number, PlacedDistrict[]>();

    for (const district of districts) {
      const column = Math.round(district.x / 15);
      const row = Math.round(district.z / 15);
      columns.set(column, [...(columns.get(column) ?? []), district]);
      rows.set(row, [...(rows.get(row) ?? []), district]);
    }

    for (const group of rows.values()) {
      const ordered = [...group].sort((a, b) => a.x - b.x);
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index];
        const to = ordered[index + 1];
        const gap = to.x - from.x - from.width / 2 - to.width / 2;
        if (gap > 0.8) {
          segments.push({
            id: `link-x:${from.path}:${to.path}`,
            x: (from.x + to.x) / 2,
            z: (from.z + to.z) / 2,
            width: gap,
            depth: 0.5,
          });
        }
      }
    }

    for (const group of columns.values()) {
      const ordered = [...group].sort((a, b) => a.z - b.z);
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index];
        const to = ordered[index + 1];
        const gap = to.z - from.z - from.depth / 2 - to.depth / 2;
        if (gap > 0.8) {
          segments.push({
            id: `link-z:${from.path}:${to.path}`,
            x: (from.x + to.x) / 2,
            z: (from.z + to.z) / 2,
            width: 0.5,
            depth: gap,
          });
        }
      }
    }

    return segments;
  }, [districts]);

  const cochangeRoads = useMemo(() => {
    const buildings = new Map<string, PlacedBuilding>();
    for (const district of districts) {
      for (const building of district.buildings) buildings.set(building.id, building);
    }

    return roads
      .map((road) => {
        const from = buildings.get(road.from);
        const to = buildings.get(road.to);
        if (!from || !to) return null;

        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.5) return null;

        return {
          ...road,
          from,
          to,
          length,
          angle: Math.atan2(dz, dx),
        };
      })
      .filter((road): road is NonNullable<typeof road> => road !== null)
      .slice(0, 80);
  }, [districts, roads]);

  useEffect(() => {
    rippleProgressRef.current = releaseNames.length > 0 ? 0 : 2;
    if (rippleRef.current) {
      rippleRef.current.visible = releaseNames.length > 0;
      rippleRef.current.scale.setScalar(1);
    }
  }, [commitId, releaseNames]);

  useFrame((state, delta) => {
    if (cinematic) {
      const smoothing = 1 - Math.pow(0.001, delta);
      const orbit = state.clock.elapsedTime * 0.34;
      const cinematicDesired = desired.clone();
      cinematicDesired.x += Math.sin(orbit) * 1.8;
      cinematicDesired.z += Math.cos(orbit) * 1.2;
      cinematicDesired.y += Math.sin(orbit * 0.7) * 0.55;
      camera.position.lerp(cinematicDesired, smoothing);
      camera.lookAt(target);
    }

    const ripple = rippleRef.current;
    const rippleMaterial = rippleMaterialRef.current;
    if (ripple && rippleMaterial && releaseNames.length > 0) {
      rippleProgressRef.current = Math.min(1.15, rippleProgressRef.current + delta * 0.55);
      const progress = rippleProgressRef.current;
      const scale = 1 + progress * 22;
      ripple.scale.setScalar(scale);
      rippleMaterial.opacity = Math.max(0, 0.72 * (1 - progress));
      ripple.visible = progress < 1;
    }
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

      <mesh
        ref={rippleRef}
        position={[cityCenter[0], 0.18, cityCenter[1]]}
        rotation={[0, 0, 0]}
        visible={releaseNames.length > 0}
      >
        <torusGeometry args={[1, 0.055, 8, 96]} />
        <meshStandardMaterial
          ref={rippleMaterialRef}
          color="#8fc1ff"
          emissive="#5b9dff"
          emissiveIntensity={1.15}
          transparent
          opacity={0.7}
          roughness={0.35}
        />
      </mesh>

      {roadSegments.map((road) => (
        <group key={road.id}>
          <mesh position={[road.x, 0.075, road.z]} receiveShadow>
            <boxGeometry args={[road.width, 0.08, road.depth]} />
            <meshStandardMaterial color="#263247" roughness={0.92} />
          </mesh>
          <mesh
            position={[road.x, 0.12, road.z]}
            rotation={road.width > road.depth ? [0, 0, 0] : [0, Math.PI / 2, 0]}
          >
            <boxGeometry
              args={[
                Math.max(
                  0.05,
                  road.width > road.depth ? road.width - 0.35 : road.depth - 0.35,
                ),
                0.018,
                0.025,
              ]}
            />
            <meshStandardMaterial
              color="#56657c"
              emissive="#182337"
              emissiveIntensity={0.3}
            />
          </mesh>
        </group>
      ))}

      {cochangeRoads.map((road) => (
        <mesh
          key={`${road.from.id}:${road.to.id}`}
          position={[
            (road.from.x + road.to.x) / 2,
            0.18,
            (road.from.z + road.to.z) / 2,
          ]}
          rotation={[0, -road.angle, 0]}
        >
          <boxGeometry
            args={[road.length, 0.045, 0.08 + Math.min(0.18, road.weight * 0.025)]}
          />
          <meshStandardMaterial
            color="#3f6f9f"
            emissive="#274e78"
            emissiveIntensity={0.35 + Math.min(0.5, road.weight * 0.06)}
            transparent
            opacity={0.38 + Math.min(0.38, road.weight * 0.05)}
            roughness={0.7}
          />
        </mesh>
      ))}

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
              hotspot={hotspotPaths.has(building.path)}
              landmark={landmarkPaths.has(building.path)}
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

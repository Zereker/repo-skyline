import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Fog,
  PerspectiveCamera,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import DistrictLabel from "./DistrictLabel";
import InstancedBuildings from "./InstancedBuildings";
import BuildingMesh from "./BuildingMesh";
import NightEffects from "./NightEffects";
import CityLandscaping from "./CityLandscaping";
import Waterfront, { type CityBounds } from "./Waterfront";
import { buildingHeight } from "./buildingScale";
import type { UrbanAppearance } from "./urbanIdentity";
import type { PlacedBuilding, PlacedDistrict } from "./cityLayout";
import type { CityEventKind, CityRoad, ViewMode } from "./types";

type Props = {
  districts: PlacedDistrict[];
  appearances: Map<string, UrbanAppearance>;
  layoutDistricts?: PlacedDistrict[];
  activeChanges: Map<string, CityEventKind>;
  roads?: CityRoad[];
  commitId?: string;
  releaseNames?: string[];
  viewMode: ViewMode;
  onSelect: (building: PlacedBuilding) => void;
  onHover: (building: PlacedBuilding | null) => void;
  selectedId?: string;
  fitRequest?: number;
  showRoads?: boolean;
  showLabels?: boolean;
  zoneTints?: Map<string, string>;
  landmarkLabels?: Map<string, { name: string; zone: string }>;
  focusDistrict?: string | null;
  highlightPaths?: Set<string> | null;
  cameraMode?: "skyline" | "aerial";
  cinematic?: boolean;
  focusPath?: string | null;
  focusBuildingId?: string | null;
  focusRequest?: number;
};

function boundsOf(districts: PlacedDistrict[]): CityBounds {
  if (!districts.length) return { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
  return {
    minX: Math.min(...districts.map((d) => d.x - d.width / 2)),
    maxX: Math.max(...districts.map((d) => d.x + d.width / 2)),
    minZ: Math.min(...districts.map((d) => d.z - d.depth / 2)),
    maxZ: Math.max(...districts.map((d) => d.z + d.depth / 2)),
  };
}

export default function CityScene({
  districts,
  appearances,
  layoutDistricts,
  activeChanges,
  roads = [],
  commitId,
  releaseNames = [],
  viewMode,
  onSelect,
  onHover,
  selectedId,
  fitRequest = 0,
  showRoads = false,
  showLabels = false,
  zoneTints,
  landmarkLabels,
  focusDistrict = null,
  highlightPaths = null,
  cameraMode = "skyline",
  cinematic = false,
  focusPath = null,
  focusBuildingId = null,
  focusRequest = 0,
}: Props) {
  const { camera, size, scene } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const ripple = useRef<Mesh>(null);
  const rippleMaterial = useRef<MeshBasicMaterial>(null);
  const rippleProgress = useRef(2);
  const bounds = useMemo(
    () =>
      boundsOf(
        layoutDistricts?.filter((d) =>
          d.buildings.some((b) => b.deleted_at == null),
        ) ?? districts,
      ),
    [layoutDistricts, districts],
  );
  const buildings = useMemo(
    () => districts.flatMap((d) => d.buildings),
    [districts],
  );
  const center = useMemo(
    () =>
      new Vector3(
        (bounds.minX + bounds.maxX) / 2,
        5,
        (bounds.minZ + bounds.maxZ) / 2,
      ),
    [bounds],
  );
  const extent = Math.max(
    30,
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
  );
  const storyTarget = useMemo(() => new Vector3(), []);
  const storyEye = useMemo(() => new Vector3(), []);
  const currentStoryEye = useMemo(() => new Vector3(), []);
  const flight = useRef<{
    eye: Vector3;
    target: Vector3;
    startedAt: number;
  } | null>(null);
  const compact = buildings.length > 400;
  // One channel for both interactions: district focus and search results.
  const isDimmed = (building: PlacedBuilding) => {
    if (focusDistrict) return building.district !== focusDistrict;
    if (highlightPaths) return !highlightPaths.has(building.path);
    return false;
  };

  useEffect(() => {
    if (!focusBuildingId) return;
    const building = buildings.find((b) => b.id === focusBuildingId);
    if (!building) return;
    const height =
      appearances.get(building.id)?.height ?? buildingHeight(building.lines);
    const distance = Math.max(16, height * 1.7);
    flight.current = {
      eye: new Vector3(
        building.x + distance * 0.55,
        height * 0.75 + distance * 0.45,
        building.z + distance * 0.9,
      ),
      target: new Vector3(building.x, height * 0.42, building.z),
      startedAt: performance.now(),
    };
  }, [focusRequest, focusBuildingId, buildings, appearances]);

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const scoped = focusDistrict
      ? districts.filter((district) => district.path === focusDistrict)
      : districts;
    const activeBounds = boundsOf(scoped.length > 0 ? scoped : districts);
    const maxHeight = Math.max(
      6,
      ...buildings.map(
        (b) =>
          (appearances.get(b.id)?.height ?? buildingHeight(b.lines)) * 1.15,
      ),
    );
    const target = new Vector3(
      (activeBounds.minX + activeBounds.maxX) / 2,
      maxHeight * 0.3,
      (activeBounds.minZ + activeBounds.maxZ) / 2,
    );
    const backward = new Vector3(
      ...(cameraMode === "aerial"
        ? ([0.7, 1.15, 1] as const)
        : ([0.2, 0.24, 1] as const)),
    ).normalize();
    const right = new Vector3()
      .crossVectors(new Vector3(0, 1, 0), backward)
      .normalize();
    const up = new Vector3().crossVectors(backward, right);
    const vertical = Math.tan((camera.fov * Math.PI) / 360);
    const horizontal = (vertical * size.width) / Math.max(1, size.height);
    let distance = 35;
    for (const x of [activeBounds.minX, activeBounds.maxX]) {
      for (const y of [0, maxHeight]) {
        for (const z of [activeBounds.minZ, activeBounds.maxZ]) {
          const point = new Vector3(x, y, z).sub(target);
          distance = Math.max(
            distance,
            Math.abs(point.dot(right)) / horizontal + point.dot(backward),
            Math.abs(point.dot(up)) / vertical + point.dot(backward),
          );
        }
      }
    }
    distance *= cameraMode === "aerial" ? 1.12 : 1.04;
    camera.far = 6000;
    camera.updateProjectionMatrix();
    camera.position.copy(target).addScaledVector(backward, distance);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [fitRequest, focusDistrict, cameraMode, size.width, size.height]);

  useEffect(() => {
    const focus = buildings.find((b) => b.path === focusPath);
    const h = focus
      ? (appearances.get(focus.id)?.height ?? buildingHeight(focus.lines))
      : 8;
    storyTarget.set(focus?.x ?? center.x, h * 0.4, focus?.z ?? center.z);
    const distance = Math.max(20, h * 2.2);
    storyEye
      .copy(storyTarget)
      .add(new Vector3(distance * 0.7, distance * 0.4, distance));
  }, [focusPath, buildings, appearances, center, storyTarget, storyEye]);

  useEffect(() => {
    rippleProgress.current = releaseNames.length ? 0 : 2;
  }, [commitId, releaseNames]);
  useEffect(() => {
    if (!cinematic && controls.current) controls.current.update();
  }, [cinematic]);
  useFrame((state, delta) => {
    if (flight.current && !cinematic) {
      const progress = Math.min(
        1,
        (performance.now() - flight.current.startedAt) / 1150,
      );
      const smoothing = 1 - Math.exp(-delta * 7);
      camera.position.lerp(flight.current.eye, smoothing);
      controls.current?.target.lerp(flight.current.target, smoothing);
      if (progress >= 1) flight.current = null;
    }
    if (cinematic) {
      currentStoryEye.copy(storyEye);
      currentStoryEye.x += Math.sin(state.clock.elapsedTime * 0.15) * 4;
      camera.position.lerp(currentStoryEye, 1 - Math.exp(-delta * 2));
      controls.current?.target.lerp(storyTarget, 1 - Math.exp(-delta * 3));
      camera.lookAt(controls.current?.target ?? storyTarget);
    }
    if (scene.fog instanceof Fog) {
      const distance = camera.position.distanceTo(center);
      scene.fog.near = Math.max(80, distance + extent * 0.2);
      scene.fog.far = Math.max(220, distance + extent * 3);
    }
    if (ripple.current && rippleMaterial.current) {
      rippleProgress.current = Math.min(
        2,
        rippleProgress.current + delta * 0.3,
      );
      ripple.current.visible = rippleProgress.current < 1;
      ripple.current.scale.setScalar(1 + rippleProgress.current * extent * 0.7);
      rippleMaterial.current.opacity = Math.max(
        0,
        0.4 * (1 - rippleProgress.current),
      );
    }
  });

  const roadSegments = useMemo(() => {
    const byId = new Map(buildings.map((b) => [b.id, b]));
    return (showRoads ? roads : [])
      .flatMap((road) => {
        const from = byId.get(road.from),
          to = byId.get(road.to);
        if (
          !from ||
          !to ||
          from.status === "Demolished" ||
          to.status === "Demolished"
        )
          return [];
        const dx = to.x - from.x,
          dz = to.z - from.z;
        return [
          {
            ...road,
            from,
            to,
            length: Math.hypot(dx, dz),
            angle: Math.atan2(dz, dx),
          },
        ];
      })
      .slice(0, 80);
  }, [buildings, roads, showRoads]);

  return (
    <>
      <ambientLight intensity={0.7} color="#9bb4d9" />
      <hemisphereLight args={["#91b8e0", "#192b3c", 1.1]} />
      <directionalLight
        position={[-60, 100, -50]}
        intensity={2.2}
        color="#98c5ed"
      />
      <directionalLight
        position={[80, 40, 100]}
        intensity={1.3}
        color="#e6be9b"
      />
      <fog attach="fog" args={["#1b2d44", 100, 500]} />
      <Waterfront bounds={bounds} />
      <CityLandscaping districts={districts} />

      {districts.map((district) => (
        <group key={district.path}>
          <mesh position={[district.x, -0.02, district.z]}>
            <boxGeometry
              args={[district.width + 0.6, 0.12, district.depth + 0.6]}
            />
            <meshStandardMaterial
              transparent={!!focusDistrict && district.path !== focusDistrict}
              opacity={
                focusDistrict && district.path !== focusDistrict ? 0.35 : 1
              }
              color={
                zoneTints
                  ? new Color(zoneTints.get(district.path) ?? "#6b7f8f")
                      .lerp(new Color("#0b1524"), 0.62)
                      .getStyle()
                  : "#1b2934"
              }
              roughness={0.65}
              metalness={0.25}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh
                position={[
                  district.x,
                  0.025,
                  district.z + side * (district.depth / 2 + 0.65),
                ]}
              >
                <boxGeometry args={[district.width + 2.2, 0.055, 0.75]} />
                <meshStandardMaterial color="#080f1b" roughness={0.35} />
              </mesh>
              <mesh
                position={[
                  district.x,
                  0.06,
                  district.z + side * (district.depth / 2 + 0.5),
                ]}
              >
                <boxGeometry args={[district.width + 1, 0.025, 0.028]} />
                <meshBasicMaterial color="#ae9774" toneMapped={false} />
              </mesh>
              <mesh
                position={[
                  district.x + side * (district.width / 2 + 0.65),
                  0.025,
                  district.z,
                ]}
              >
                <boxGeometry args={[0.75, 0.055, district.depth + 2.2]} />
                <meshStandardMaterial color="#080f1b" roughness={0.35} />
              </mesh>
            </group>
          ))}
          {showLabels && !landmarkLabels && (
            <DistrictLabel
              path={district.path}
              position={[district.x, 1.5, district.z + district.depth / 2]}
            />
          )}
          {showLabels &&
            landmarkLabels &&
            district.buildings.map((building) => {
              const label = landmarkLabels.get(building.id);
              if (!label) return null;
              const height =
                appearances.get(building.id)?.height ??
                buildingHeight(building.lines);
              return (
                <DistrictLabel
                  key={`landmark-${building.id}`}
                  path={label.name}
                  subtitle={label.zone}
                  variant="landmark"
                  position={[building.x, height + 1.6, building.z]}
                />
              );
            })}
          {compact ? (
            <InstancedBuildings
              buildings={district.buildings}
              appearances={appearances}
              changes={activeChanges}
              focusDistrict={focusDistrict}
              isDimmed={isDimmed}
              commitId={commitId}
              viewMode={viewMode}
              selectedId={selectedId}
              onSelect={onSelect}
              onHover={onHover}
            />
          ) : (
            district.buildings.map((building) => (
              <BuildingMesh
                key={building.id}
                building={building}
                changeKind={activeChanges.get(building.path)}
                commitId={commitId}
                viewMode={viewMode}
                dimmed={isDimmed(building)}
                appearance={appearances.get(building.id)!}
                onSelect={onSelect}
                onHover={onHover}
                selected={selectedId === building.id}
              />
            ))
          )}
        </group>
      ))}
      {roadSegments.map((road) => (
        <mesh
          key={`${road.from.id}:${road.to.id}`}
          position={[
            (road.from.x + road.to.x) / 2,
            0.15,
            (road.from.z + road.to.z) / 2,
          ]}
          rotation={[0, -road.angle, 0]}
        >
          <boxGeometry
            args={[
              road.length,
              0.025,
              0.05 + Math.min(0.1, road.weight * 0.01),
            ]}
          />
          <meshBasicMaterial
            color="#75c6d4"
            transparent
            opacity={0.35}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh
        ref={ripple}
        position={[center.x, 0.16, center.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.96, 1, 80]} />
        <meshBasicMaterial
          ref={rippleMaterial}
          color="#efc892"
          transparent
          opacity={0.4}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!cinematic}
        enableDamping
        dampingFactor={0.065}
        minDistance={8}
        maxDistance={1200}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 - 0.025}
      />
      <NightEffects />
    </>
  );
}

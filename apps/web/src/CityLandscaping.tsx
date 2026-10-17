import { useLayoutEffect, useMemo, useRef } from "react";
import { Object3D, type InstancedMesh } from "three";
import { stableHash } from "./buildingVisuals";
import type { PlacedDistrict } from "./cityLayout";

export default function CityLandscaping({
  districts,
}: {
  districts: PlacedDistrict[];
}) {
  const parks = useRef<InstancedMesh>(null);
  const trees = useRef<InstancedMesh>(null);
  const locations = useMemo(
    () =>
      districts
        .flatMap((d) => {
          const occupied = new Set(
            d.buildings.map((b) => `${b.x.toFixed(3)},${b.z.toFixed(3)}`),
          );
          return [...d.slots]
            .filter(
              ([key, p]) =>
                !occupied.has(`${p.x.toFixed(3)},${p.z.toFixed(3)}`) &&
                stableHash(key) % 3 === 0,
            )
            .map(([, p]) => p);
        })
        .slice(0, 180),
    [districts],
  );
  useLayoutEffect(() => {
    const object = new Object3D();
    locations.forEach((p, i) => {
      object.position.set(p.x, 0.09, p.z);
      object.scale.set(1.7, 0.1, 1.7);
      object.updateMatrix();
      parks.current?.setMatrixAt(i, object.matrix);
      object.position.y = 0.85;
      object.scale.setScalar(0.8 + (i % 3) * 0.15);
      object.updateMatrix();
      trees.current?.setMatrixAt(i, object.matrix);
    });
    if (parks.current) parks.current.instanceMatrix.needsUpdate = true;
    if (trees.current) trees.current.instanceMatrix.needsUpdate = true;
  }, [locations]);
  if (!locations.length) return null;
  return (
    <>
      <instancedMesh
        ref={parks}
        args={[undefined, undefined, locations.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#213d36" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={trees}
        args={[undefined, undefined, locations.length]}
        frustumCulled={false}
      >
        <coneGeometry args={[0.6, 1.5, 6]} />
        <meshStandardMaterial color="#2d5d4f" roughness={0.85} />
      </instancedMesh>
    </>
  );
}

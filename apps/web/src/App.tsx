import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { sampleCity } from "./sampleCity";
import type { Building, CityProject, District } from "./types";

type PlacedBuilding = Building & {
  x: number;
  z: number;
  district: string;
};

type PlacedDistrict = {
  path: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  buildings: PlacedBuilding[];
};

function buildingHeight(lines: number) {
  return Math.max(0.7, Math.min(11, Math.log2(lines + 1) * 0.9));
}

function layoutCity(city: CityProject): PlacedDistrict[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(city.districts.length)));

  return city.districts.map((district, districtIndex) => {
    const localColumns = Math.max(1, Math.ceil(Math.sqrt(district.buildings.length)));
    const localRows = Math.max(1, Math.ceil(district.buildings.length / localColumns));
    const width = Math.max(7, localColumns * 2.3 + 2);
    const depth = Math.max(7, localRows * 2.3 + 2);
    const districtColumn = districtIndex % columns;
    const districtRow = Math.floor(districtIndex / columns);

    const x = districtColumn * 15;
    const z = districtRow * 15;

    const buildings = district.buildings.map((building, buildingIndex) => {
      const column = buildingIndex % localColumns;
      const row = Math.floor(buildingIndex / localColumns);

      return {
        ...building,
        district: district.path,
        x: x - width / 2 + 2 + column * 2.3,
        z: z - depth / 2 + 2 + row * 2.3,
      };
    });

    return {
      path: district.path,
      x,
      z,
      width,
      depth,
      buildings,
    };
  });
}

function BuildingMesh({
  building,
  onSelect,
}: {
  building: PlacedBuilding;
  onSelect: (building: PlacedBuilding) => void;
}) {
  const height = buildingHeight(building.lines);

  return (
    <mesh
      position={[building.x, height / 2, building.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(building);
      }}
    >
      <boxGeometry args={[1.5, height, 1.5]} />
      <meshStandardMaterial color="#75a7ff" roughness={0.72} metalness={0.05} />
    </mesh>
  );
}

function DistrictGround({ district }: { district: PlacedDistrict }) {
  return (
    <mesh position={[district.x, -0.08, district.z]}>
      <boxGeometry args={[district.width, 0.12, district.depth]} />
      <meshStandardMaterial color="#172033" roughness={1} />
    </mesh>
  );
}

function CityScene({
  city,
  onSelect,
}: {
  city: CityProject;
  onSelect: (building: PlacedBuilding) => void;
}) {
  const districts = useMemo(() => layoutCity(city), [city]);

  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[12, 22, 10]} intensity={2.6} />
      <gridHelper args={[120, 60, "#334155", "#172033"]} />
      {districts.map((district) => (
        <group key={district.path}>
          <DistrictGround district={district} />
          {district.buildings.map((building) => (
            <BuildingMesh key={building.id} building={building} onSelect={onSelect} />
          ))}
        </group>
      ))}
    </>
  );
}

export default function App() {
  const [city] = useState<CityProject>(sampleCity);
  const [selected, setSelected] = useState<PlacedBuilding | null>(null);

  const totalBuildings = city.districts.reduce(
    (total, district) => total + district.buildings.length,
    0,
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">REPO SKYLINE</p>
          <h1>{city.repository}</h1>
        </div>
        <div className="stats">
          <span>{city.districts.length} districts</span>
          <span>{totalBuildings} buildings</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <p className="panel-label">Districts</p>
          {city.districts.map((district: District) => (
            <div className="district-row" key={district.path}>
              <span>{district.path}</span>
              <strong>{district.buildings.length}</strong>
            </div>
          ))}
        </aside>

        <div className="canvas-wrap">
          <Canvas camera={{ position: [22, 24, 28], fov: 44 }}>
            <color attach="background" args={["#080d18"]} />
            <CityScene city={city} onSelect={setSelected} />
          </Canvas>
          <div className="hint">Click a building to inspect its Git-backed metrics.</div>
        </div>

        <aside className="panel inspector">
          <p className="panel-label">Building inspector</p>
          {selected ? (
            <>
              <h2>{selected.path.split("/").at(-1)}</h2>
              <p className="path">{selected.path}</p>
              <dl>
                <div>
                  <dt>District</dt>
                  <dd>{selected.district}</dd>
                </div>
                <div>
                  <dt>Lines</dt>
                  <dd>{selected.lines}</dd>
                </div>
                <div>
                  <dt>Commits</dt>
                  <dd>{selected.commits}</dd>
                </div>
                <div>
                  <dt>Primary author</dt>
                  <dd>{selected.primary_author ?? "Unknown"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="empty">Select a building in the city.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

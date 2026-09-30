import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import PlaybackControls from "./PlaybackControls";
import { sampleCity } from "./sampleCity";
import { visibleCityAt } from "./timeline";
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

export default function App() {
  const [city, setCity] = useState<CityProject>(sampleCity);
  const [selected, setSelected] = useState<PlacedBuilding | null>(null);
  const [dataSource, setDataSource] = useState<"generated" | "sample">("sample");
  const [commitIndex, setCommitIndex] = useState(
    Math.max(0, sampleCity.timeline.length - 1),
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/city.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("city.json not found");
        }
        return response.json() as Promise<CityProject>;
      })
      .then((generatedCity) => {
        if (!cancelled && generatedCity.districts) {
          const normalized = {
            ...generatedCity,
            timeline: generatedCity.timeline ?? [],
          };
          setCity(normalized);
          setCommitIndex(Math.max(0, normalized.timeline.length - 1));
          setDataSource("generated");
          setSelected(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataSource("sample");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentCommit = city.timeline[commitIndex] ?? null;
  const currentTimestamp =
    currentCommit?.timestamp ??
    city.timeline.at(-1)?.timestamp ??
    Number.MAX_SAFE_INTEGER;

  const visibleCity = useMemo(
    () => visibleCityAt(city, currentTimestamp),
    [city, currentTimestamp],
  );

  const totalBuildings = visibleCity.districts.reduce(
    (total, district) => total + district.buildings.length,
    0,
  );

  const currentDate = currentCommit
    ? new Date(currentCommit.timestamp * 1000).toLocaleString()
    : "No commit history";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">REPO SKYLINE</p>
          <h1>{city.repository}</h1>
        </div>
        <div className="stats">
          <span>{dataSource === "generated" ? "Git-backed data" : "Sample data"}</span>
          <span>{visibleCity.districts.length} active districts</span>
          <span>{totalBuildings} active buildings</span>
          <span>{city.timeline.length} commits</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <p className="panel-label">Districts at this commit</p>
          {visibleCity.districts.map((district: District) => (
            <div className="district-row" key={district.path}>
              <span>{district.path}</span>
              <strong>{district.buildings.length}</strong>
            </div>
          ))}
        </aside>

        <div className="canvas-wrap">
          <Canvas camera={{ position: [22, 24, 28], fov: 44 }}>
            <color attach="background" args={["#080d18"]} />
            <CityScene city={visibleCity} onSelect={setSelected} />
          </Canvas>
          <div className="hint">
            Drag to orbit · scroll to zoom · click a building to inspect
          </div>
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

      <footer className="timeline">
        <div className="timeline-topline">
          <PlaybackControls
            length={city.timeline.length}
            index={commitIndex}
            onIndexChange={(index) => {
              setSelected(null);
              setCommitIndex(index);
            }}
          />

          <div className="commit-card">
            <div>
              <p className="panel-label">Commit timeline</p>
              <strong>{currentCommit?.message ?? "No commits"}</strong>
              <p className="commit-meta">
                {currentCommit
                  ? `${currentCommit.author} · ${currentDate} · ${currentCommit.id.slice(0, 8)}`
                  : currentDate}
              </p>
            </div>
            <span className="change-count">
              {currentCommit?.changes.length ?? 0} file changes
            </span>
          </div>
        </div>

        <input
          className="timeline-range"
          type="range"
          min={0}
          max={Math.max(0, city.timeline.length - 1)}
          value={Math.min(commitIndex, Math.max(0, city.timeline.length - 1))}
          disabled={city.timeline.length === 0}
          onChange={(event) => {
            setSelected(null);
            setCommitIndex(Number(event.target.value));
          }}
          aria-label="Commit timeline"
        />

        <div className="timeline-labels">
          <span>{city.timeline.at(0)?.message ?? "Start"}</span>
          <span>
            {city.timeline.length > 0
              ? `${commitIndex + 1} / ${city.timeline.length}`
              : "0 / 0"}
          </span>
          <span>{city.timeline.at(-1)?.message ?? "Current"}</span>
        </div>
      </footer>
    </main>
  );
}

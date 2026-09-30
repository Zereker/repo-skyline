import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import PlaybackControls from "./PlaybackControls";
import {
  activeDistrictsAt,
  layoutCity,
  type PlacedBuilding,
  type PlacedDistrict,
} from "./cityLayout";
import { sampleCity } from "./sampleCity";
import type { CityEventKind, CityProject, District } from "./types";

function buildingHeight(lines: number) {
  return Math.max(0.7, Math.min(11, Math.log2(lines + 1) * 0.9));
}

function BuildingMesh({
  building,
  changeKind,
  onSelect,
}: {
  building: PlacedBuilding;
  changeKind?: CityEventKind;
  onSelect: (building: PlacedBuilding) => void;
}) {
  const height = buildingHeight(building.lines);
  const color =
    changeKind === "added"
      ? "#7ee787"
      : changeKind === "modified"
        ? "#ffd166"
        : changeKind === "renamed"
          ? "#c084fc"
          : "#75a7ff";

  const emissive =
    changeKind === "added" || changeKind === "modified" || changeKind === "renamed"
      ? color
      : "#000000";

  return (
    <mesh
      position={[building.x, height / 2, building.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(building);
      }}
    >
      <boxGeometry args={[1.5, height, 1.5]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={changeKind ? 0.28 : 0}
        roughness={0.72}
        metalness={0.05}
      />
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
  districts,
  activeChanges,
  onSelect,
}: {
  districts: PlacedDistrict[];
  activeChanges: Map<string, CityEventKind>;
  onSelect: (building: PlacedBuilding) => void;
}) {
  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[12, 22, 10]} intensity={2.6} />
      <gridHelper args={[120, 60, "#334155", "#172033"]} />

      {districts.map((district) => (
        <group key={district.path}>
          <DistrictGround district={district} />

          {district.buildings.map((building) => (
            <BuildingMesh
              key={building.id}
              building={building}
              changeKind={activeChanges.get(building.path)}
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

  const stableDistricts = useMemo(() => layoutCity(city), [city]);
  const activeDistricts = useMemo(
    () => activeDistrictsAt(stableDistricts, currentTimestamp),
    [stableDistricts, currentTimestamp],
  );

  const activeChanges = useMemo(() => {
    const map = new Map<string, CityEventKind>();

    for (const change of currentCommit?.changes ?? []) {
      if (change.kind !== "deleted") {
        map.set(change.path, change.kind);
      }
    }

    return map;
  }, [currentCommit]);

  const totalBuildings = activeDistricts.reduce(
    (total, district) => total + district.buildings.length,
    0,
  );

  const currentDate = currentCommit
    ? new Date(currentCommit.timestamp * 1000).toLocaleString()
    : "No commit history";

  const activeDistrictModels: District[] = activeDistricts.map((district) => ({
    path: district.path,
    buildings: district.buildings,
  }));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">REPO SKYLINE</p>
          <h1>{city.repository}</h1>
        </div>

        <div className="stats">
          <span>{dataSource === "generated" ? "Git-backed data" : "Sample data"}</span>
          <span>{activeDistricts.length} active districts</span>
          <span>{totalBuildings} active buildings</span>
          <span>{city.timeline.length} commits</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <p className="panel-label">Districts at this commit</p>
          {activeDistrictModels.map((district) => (
            <div className="district-row" key={district.path}>
              <span>{district.path}</span>
              <strong>{district.buildings.length}</strong>
            </div>
          ))}
        </aside>

        <div className="canvas-wrap">
          <Canvas camera={{ position: [22, 24, 28], fov: 44 }}>
            <color attach="background" args={["#080d18"]} />
            <CityScene
              districts={activeDistricts}
              activeChanges={activeChanges}
              onSelect={setSelected}
            />
          </Canvas>

          <div className="legend">
            <span><i className="legend-dot added" />Added</span>
            <span><i className="legend-dot modified" />Modified</span>
            <span><i className="legend-dot renamed" />Renamed</span>
          </div>

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

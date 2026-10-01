import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import CityScene from "./CityScene";
import CommitChanges from "./CommitChanges";
import PlaybackControls from "./PlaybackControls";
import StoryPanel from "./StoryPanel";
import {
  activeDistrictsAt,
  colorForContributor,
  layoutCity,
  type PlacedBuilding,
} from "./cityLayout";
import { sampleCity } from "./sampleCity";
import type {
  CityEventKind,
  CityProject,
  District,
  StoryMilestone,
} from "./types";

type ViewMode = "district" | "territory";

export default function App() {
  const [city, setCity] = useState<CityProject>(sampleCity);
  const [selected, setSelected] = useState<PlacedBuilding | null>(null);
  const [dataSource, setDataSource] = useState<"generated" | "sample">("sample");
  const [viewMode, setViewMode] = useState<ViewMode>("district");
  const [commitIndex, setCommitIndex] = useState(
    Math.max(0, sampleCity.timeline.length - 1),
  );
  const [storyPlaying, setStoryPlaying] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/city.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("city.json not found");
        return response.json() as Promise<CityProject>;
      })
      .then((generatedCity) => {
        if (!cancelled && generatedCity.districts) {
          const normalized: CityProject = {
            ...generatedCity,
            timeline: generatedCity.timeline ?? [],
            releases: generatedCity.releases ?? [],
            milestones: generatedCity.milestones ?? [],
          };

          setCity(normalized);
          setCommitIndex(Math.max(0, normalized.timeline.length - 1));
          setDataSource("generated");
          setSelected(null);
          setStoryIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setDataSource("sample");
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
      map.set(change.path, change.kind);
    }

    return map;
  }, [currentCommit]);

  useEffect(() => {
    if (!selected) return;

    const stillVisible = activeDistricts.some((district) =>
      district.buildings.some((building) => building.id === selected.id),
    );

    if (!stillVisible) setSelected(null);
  }, [activeDistricts, selected]);

  const totalBuildings = activeDistricts.reduce(
    (total, district) => total + district.buildings.length,
    0,
  );

  const contributorTerritories = useMemo(() => {
    const counts = new Map<string, number>();

    for (const district of activeDistricts) {
      for (const building of district.buildings) {
        const author = building.primary_author ?? "Unknown";
        counts.set(author, (counts.get(author) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [activeDistricts]);

  const currentDate = currentCommit
    ? new Date(currentCommit.timestamp * 1000).toLocaleString()
    : "No commit history";

  const activeDistrictModels: District[] = activeDistricts.map((district) => ({
    path: district.path,
    buildings: district.buildings,
  }));

  const storyMilestones = city.milestones ?? [];
  const activeStoryMilestone: StoryMilestone | null =
    storyMilestones[storyIndex] ?? null;

  const storyFocusPath = useMemo(() => {
    if (!activeStoryMilestone) return null;
    return (
      city.timeline.find((commit) => commit.id === activeStoryMilestone.commit_id)
        ?.changes[0]?.path ?? null
    );
  }, [activeStoryMilestone, city.timeline]);

  const jumpToMilestone = (index: number) => {
    const milestone = storyMilestones[index];
    if (!milestone) return;

    const nextCommitIndex = city.timeline.findIndex(
      (commit) => commit.id === milestone.commit_id,
    );

    if (nextCommitIndex >= 0) {
      setCommitIndex(nextCommitIndex);
      setStoryIndex(index);
      setSelected(null);
    }
  };

  useEffect(() => {
    if (!storyPlaying || storyMilestones.length === 0) return;

    const timer = window.setTimeout(() => {
      const next = storyIndex + 1;

      if (next >= storyMilestones.length) {
        setStoryPlaying(false);
        return;
      }

      jumpToMilestone(next);
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [storyPlaying, storyIndex, storyMilestones.length]);

  const releaseCommitIndices = useMemo(
    () =>
      city.releases
        .map((release) => ({
          release,
          index: city.timeline.findIndex(
            (commit) => commit.id === release.commit_id,
          ),
        }))
        .filter((item) => item.index >= 0),
    [city.releases, city.timeline],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">REPO SKYLINE</p>
          <h1>{city.repository}</h1>
        </div>

        <div className="topbar-actions">
          <div className="mode-toggle" aria-label="City view mode">
            <button
              type="button"
              className={viewMode === "district" ? "active" : ""}
              onClick={() => setViewMode("district")}
            >
              District
            </button>
            <button
              type="button"
              className={viewMode === "territory" ? "active" : ""}
              onClick={() => setViewMode("territory")}
            >
              Contributor Territory
            </button>
          </div>

          <div className="stats">
            <span>{dataSource === "generated" ? "Git-backed data" : "Sample data"}</span>
            <span>{activeDistricts.length} districts</span>
            <span>{totalBuildings} buildings</span>
            <span>{city.timeline.length} commits</span>
            <span>{city.releases.length} releases</span>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <p className="panel-label">
            {viewMode === "territory" ? "Contributor territories" : "Districts at this commit"}
          </p>

          {viewMode === "territory" ? (
            <div className="territory-list">
              {contributorTerritories.map(([author, count]) => {
                const share = totalBuildings > 0 ? Math.round((count / totalBuildings) * 100) : 0;

                return (
                  <div className="territory-row" key={author}>
                    <span
                      className="territory-swatch"
                      style={{ background: colorForContributor(author) }}
                    />
                    <span className="territory-copy">
                      <span title={author}>{author}</span>
                      <i>
                        <b
                          style={{
                            width: `${share}%`,
                            background: colorForContributor(author),
                          }}
                        />
                      </i>
                    </span>
                    <strong>{share}%</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            activeDistrictModels.map((district) => (
              <div className="district-row" key={district.path}>
                <span>{district.path}</span>
                <strong>{district.buildings.length}</strong>
              </div>
            ))
          )}
        </aside>

        <div className="canvas-wrap">
          <Canvas
            camera={{ position: [30, 28, 34], fov: 44 }}
            shadows
            dpr={[1, 1.75]}
          >
            <color attach="background" args={["#080d18"]} />
            <CityScene
              districts={activeDistricts}
              activeChanges={activeChanges}
              commitId={currentCommit?.id}
              releaseNames={currentCommit?.releases ?? []}
              viewMode={viewMode}
              onSelect={setSelected}
              cinematic={storyPlaying}
              focusPath={storyFocusPath}
            />
          </Canvas>

          <div className="city-hud">
            <span className="city-hud-live">
              <i />
              LIVE CITY
            </span>
            <strong>{currentCommit?.message ?? "No commit history"}</strong>
            <small>
              {currentCommit
                ? `${currentCommit.author} · ${currentDate} · ${currentCommit.id.slice(0, 8)}`
                : "Waiting for repository history"}
            </small>
          </div>

          <div className="legend">
            <span><i className="legend-dot added" />Added</span>
            <span><i className="legend-dot modified" />Modified</span>
            <span><i className="legend-dot deleted" />Deleted</span>
            <span><i className="legend-dot renamed" />Renamed</span>
            <span className="hotspot-legend"><i className="legend-dot hotspot" />Hotspot</span>
          </div>

          {storyPlaying && activeStoryMilestone ? (
            <div className="cinematic-caption">
              <span>STORY {storyIndex + 1} / {storyMilestones.length}</span>
              <strong>{activeStoryMilestone.title}</strong>
              <small>{activeStoryMilestone.description}</small>
            </div>
          ) : null}

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

          <CommitChanges commit={currentCommit} />
        </aside>
      </section>

      <StoryPanel
        milestones={storyMilestones}
        activeIndex={storyIndex}
        playing={storyPlaying}
        onSelect={jumpToMilestone}
        onPlay={() => {
          setStoryIndex(0);
          jumpToMilestone(0);
          setStoryPlaying(true);
        }}
        onStop={() => setStoryPlaying(false)}
      />

      <footer className="timeline">
        <div className="timeline-topline">
          <PlaybackControls
            length={city.timeline.length}
            index={commitIndex}
            onIndexChange={(index) => {
              setStoryPlaying(false);
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
              {currentCommit?.releases.length ? (
                <div className="release-badges">
                  {currentCommit.releases.map((release) => (
                    <span key={release}>Release {release}</span>
                  ))}
                </div>
              ) : null}
            </div>

            <span className="change-count">
              {currentCommit?.changes.length ?? 0} file changes
            </span>
          </div>
        </div>

        <div className="timeline-track">
          <input
            className="timeline-range"
            type="range"
            min={0}
            max={Math.max(0, city.timeline.length - 1)}
            value={Math.min(commitIndex, Math.max(0, city.timeline.length - 1))}
            disabled={city.timeline.length === 0}
            onChange={(event) => {
              setStoryPlaying(false);
              setSelected(null);
              setCommitIndex(Number(event.target.value));
            }}
            aria-label="Commit timeline"
          />

          {city.timeline.length > 1
            ? releaseCommitIndices.map(({ release, index }) => (
                <button
                  type="button"
                  className="release-marker"
                  key={release.name}
                  style={{
                    left: `${(index / (city.timeline.length - 1)) * 100}%`,
                  }}
                  title={release.name}
                  onClick={() => {
                    setStoryPlaying(false);
                    setCommitIndex(index);
                  }}
                />
              ))
            : null}
        </div>

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

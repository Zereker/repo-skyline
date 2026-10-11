import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { parseCity } from "./importCity";
import { analysisDescriptions, evidenceAt, evidenceScore } from "./analysis";
import { sampleCity } from "./sampleCity";
import type {
  CityEventKind,
  CityProject,
  District,
  StoryMilestone,
  ViewMode,
} from "./types";

export default function App() {
  const [city, setCity] = useState<CityProject>(sampleCity);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const setSelected = (building: PlacedBuilding | null) =>
    setSelectedId(building?.id ?? null);
  const [hovered, setHovered] = useState<PlacedBuilding | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [directoryDepth, setDirectoryDepth] = useState(2);
  const [showRoads, setShowRoads] = useState(true);
  const [ghostDays, setGhostDays] = useState(180);
  const [loadError, setLoadError] = useState("");
  const [contributor, setContributor] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const [dataSource, setDataSource] = useState<
    "generated" | "sample" | "imported"
  >("sample");
  const [viewMode, setViewMode] = useState<ViewMode>("district");
  const [commitIndex, setCommitIndex] = useState(
    Math.max(0, sampleCity.timeline.length - 1),
  );
  const [storyPlaying, setStoryPlaying] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);

  function loadCity(input: unknown, source: "generated" | "imported") {
    const project = parseCity(input);
    setCity(project);
    setCommitIndex(Math.max(0, project.timeline.length - 1));
    setDataSource(source);
    setSelected(null);
    setHovered(null);
    setContributor(null);
    setStoryIndex(0);
    setStoryPlaying(false);
    setPlaying(false);
    setLoadError("");
    setFitRequest((v) => v + 1);
  }
  useEffect(() => {
    const generation = loadGeneration.current;
    const controller = new AbortController();
    fetch("/city.json", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`city.json: HTTP ${response.status}`);
        // Vite's SPA fallback returns HTML for a missing city.json.
        if (!(response.headers.get("content-type") ?? "").includes("json"))
          return null;
        return response.json();
      })
      .then((project) => {
        if (
          project &&
          !controller.signal.aborted &&
          generation === loadGeneration.current
        )
          loadCity(project, "generated");
      })
      .catch((error) => {
        if (!controller.signal.aborted && generation === loadGeneration.current)
          setLoadError(String(error.message ?? error));
      });
    return () => controller.abort();
  }, []);
  function seek(index: number) {
    setPlaying(false);
    setStoryPlaying(false);
    setHovered(null);
    setCommitIndex(index);
  }
  useEffect(() => {
    if (!playing || city.timeline.length < 2) return;
    if (commitIndex >= city.timeline.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setHovered(null);
      setCommitIndex((i) => Math.min(i + 1, city.timeline.length - 1));
    }, 700 / speed);
    return () => clearTimeout(timer);
  }, [playing, speed, commitIndex, city.timeline.length]);

  const currentCommit = city.timeline[commitIndex] ?? null;
  const stableDistricts = useMemo(
    () => layoutCity(city, directoryDepth),
    [city, directoryDepth],
  );
  const activeDistricts = useMemo(
    () =>
      activeDistrictsAt(stableDistricts, commitIndex, currentCommit?.timestamp),
    [stableDistricts, commitIndex, currentCommit?.timestamp],
  );

  const activeChanges = useMemo(() => {
    const map = new Map<string, CityEventKind>();

    for (const change of currentCommit?.changes ?? []) {
      map.set(change.path, change.kind);
    }

    return map;
  }, [currentCommit]);

  const selected =
    activeDistricts
      .flatMap((d) => d.buildings)
      .find((b) => b.id === selectedId) ?? null;
  const evidence = useMemo(
    () => evidenceAt(city, activeDistricts, commitIndex),
    [city, activeDistricts, commitIndex],
  );
  const evidenceRows = [...evidence]
    .sort(
      (a, b) =>
        evidenceScore(b, viewMode, ghostDays) -
        evidenceScore(a, viewMode, ghostDays),
    )
    .filter((e) => evidenceScore(e, viewMode, ghostDays) > 0)
    .slice(0, 12);
  const currentRoads = useMemo(
    () =>
      (city.roads ?? [])
        .map((road) => ({
          ...road,
          weight:
            road.commit_indices?.filter((i) => i <= commitIndex).length ?? 0,
        }))
        .filter((road) => road.weight >= 2),
    [city, commitIndex],
  );
  const evidenceById = useMemo(
    () => new Map(evidence.map((e) => [e.building.id, e])),
    [evidence],
  );
  const sceneDistricts = useMemo(
    () =>
      activeDistricts.map((d) => ({
        ...d,
        buildings: d.buildings.map((b) => {
          const e = evidenceById.get(b.id);
          const score = e ? evidenceScore(e, viewMode, ghostDays) : 0;
          const analysisColor =
            viewMode === "ghost"
              ? score > 0
                ? "#a7a3bb"
                : "#334155"
              : viewMode === "provenance"
                ? e?.ai
                  ? "#c084fc"
                  : e?.human
                    ? "#62dba5"
                    : "#64748b"
                : analysisDescriptions[viewMode]
                  ? score > 0
                    ? `hsl(${Math.max(0, 60 - score * 8)} 80% 58%)`
                    : "#334155"
                  : undefined;
          return { ...b, analysis_color: analysisColor };
        }),
      })),
    [activeDistricts, evidenceById, viewMode, ghostDays],
  );

  const totalBuildings = activeDistricts.reduce(
    (total, district) =>
      total + district.buildings.filter((b) => b.status === "Active").length,
    0,
  );

  const contributorTerritories = useMemo(() => {
    const counts = new Map<string, number>();

    for (const district of activeDistricts) {
      for (const building of district.buildings.filter(
        (b) => b.status === "Active",
      )) {
        const author = building.primary_author ?? "Unknown";
        counts.set(author, (counts.get(author) ?? 0) + 1);
      }
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [activeDistricts]);

  const currentDate = currentCommit
    ? new Date(currentCommit.timestamp * 1000).toLocaleString()
    : "No commit history";

  const currentStats = useMemo(
    () => ({
      additions: (currentCommit?.changes ?? []).reduce(
        (sum, change) => sum + (change.additions ?? 0),
        0,
      ),
      deletions: (currentCommit?.changes ?? []).reduce(
        (sum, change) => sum + (change.deletions ?? 0),
        0,
      ),
    }),
    [currentCommit],
  );

  const selectedRecentActivity = selected
    ? (selected.history ?? [])
        .filter((snapshot) => snapshot.commit_index <= commitIndex)
        .slice(-5)
        .reverse()
    : [];

  const selectedStatus = selected?.status ?? "Active";
  const contributorCommits = city.timeline
    .slice(0, commitIndex + 1)
    .filter(
      (c) =>
        c.author_id === contributor ||
        (!c.author_id && c.author === contributor),
    );
  const contributorBuildings = activeDistricts
    .flatMap((d) => d.buildings)
    .filter((b) => b.status === "Active" && b.primary_author === contributor);

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
      city.timeline.find(
        (commit) => commit.id === activeStoryMilestone.commit_id,
      )?.changes[0]?.path ?? null
    );
  }, [activeStoryMilestone, city.timeline]);

  const jumpToMilestone = (index: number) => {
    const milestone = storyMilestones[index];
    if (!milestone) return;

    const nextCommitIndex = city.timeline.findIndex(
      (commit) => commit.id === milestone.commit_id,
    );

    if (nextCommitIndex >= 0) {
      setPlaying(false);
      setHovered(null);
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
            <button
              type="button"
              className={viewMode === "activity" ? "active" : ""}
              onClick={() => setViewMode("activity")}
            >
              Activity heatmap
            </button>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setFitRequest((v) => v + 1)}
          >
            Fit city
          </button>
          <label className="secondary-button import-button">
            Open city JSON
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Open city JSON"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const generation = ++loadGeneration.current;
                try {
                  if (file.size > 128 * 1024 * 1024)
                    throw new Error("Choose a city JSON smaller than 128 MB.");
                  const data = JSON.parse(await file.text());
                  if (generation === loadGeneration.current)
                    loadCity(data, "imported");
                } catch (error) {
                  if (generation === loadGeneration.current)
                    setLoadError(
                      error instanceof Error
                        ? error.message
                        : "Could not open city JSON.",
                    );
                }
              }}
            />
          </label>
          <details className="settings">
            <summary>Settings</summary>
            <label>
              <input
                type="checkbox"
                checked={showRoads}
                onChange={(e) => setShowRoads(e.target.checked)}
              />{" "}
              Co-change roads
            </label>
            <label>
              Directory level{" "}
              <select
                aria-label="Directory level"
                value={directoryDepth}
                onChange={(e) => {
                  setDirectoryDepth(Number(e.target.value));
                  setFitRequest((v) => v + 1);
                }}
              >
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
                <option value={99}>Full path</option>
              </select>
            </label>
            <label>
              Ghost threshold{" "}
              <select
                aria-label="Ghost threshold"
                value={ghostDays}
                onChange={(e) => setGhostDays(Number(e.target.value))}
              >
                {[90, 180, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </label>
          </details>
          <div className="stats">
            <span>
              {dataSource === "sample" ? "Sample data" : "Git-backed data"}
            </span>
            <span>{activeDistricts.length} districts</span>
            <span>{totalBuildings} buildings</span>
            <span>{city.timeline.length} commits</span>
            <span>{city.releases.length} releases</span>
          </div>
        </div>
      </header>

      {loadError && (
        <p role="alert" className="load-error">
          {loadError}
        </p>
      )}
      <section className="workspace">
        <aside className="panel">
          <p className="panel-label">Repository overview</p>
          <p>
            {totalBuildings} files ·{" "}
            {activeDistricts
              .reduce(
                (n, d) =>
                  n +
                  d.buildings
                    .filter((b) => b.status === "Active")
                    .reduce((s, b) => s + b.lines, 0),
                0,
              )
              .toLocaleString()}{" "}
            LOC
          </p>
          <p>
            {
              new Set(
                city.timeline
                  .slice(0, commitIndex + 1)
                  .map((c) => c.author_id ?? c.author),
              ).size
            }{" "}
            contributors by this commit
          </p>
          <details className="import-help">
            <summary>Analyze a local repository</summary>
            <p>Generate a city file, then open it above:</p>
            <code>repo-skyline analyze /path/to/repo -o city.json</code>
          </details>
          <label className="panel-label" htmlFor="analysis-view">
            Analysis view
          </label>
          <select
            id="analysis-view"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            {[
              ["district", "District"],
              ["territory", "Contributor Territory"],
              ["activity", "Activity heatmap"],
              ["ghost", "Ghost District"],
              ["risk", "Technical Debt indicators"],
              ["bugs", "Bug Crime Scene"],
              ["architecture", "Architecture Drift"],
              ["provenance", "AI vs Human provenance"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {viewMode === "activity" && (
            <p className="analysis-note">
              Changes in the 30 days ending at this commit. Blue = quiet; red =
              active.
            </p>
          )}
          {analysisDescriptions[viewMode] && (
            <section className="analysis-panel">
              <p className="analysis-note">{analysisDescriptions[viewMode]}</p>
              {evidenceRows.length === 0 ? (
                <p>No matching evidence at this commit.</p>
              ) : (
                evidenceRows.map((e) => (
                  <div className="evidence-row" key={e.building.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(e.building)}
                    >
                      {e.building.path}
                    </button>
                    <small>
                      {viewMode === "ghost"
                        ? `${Math.floor(e.age)} inactive days`
                        : viewMode === "risk"
                          ? `${e.churn.toFixed(1)} edits/LOC · ${e.building.contributor_count} contributors`
                          : viewMode === "bugs"
                            ? `${e.fixes} fix-labelled commits`
                            : viewMode === "architecture"
                              ? `${e.moves} cross-directory moves`
                              : `${e.ai} AI · ${e.human} human · ${e.unknown} unknown`}
                    </small>
                    {viewMode === "bugs" &&
                      e.commits.slice(-3).map((i) => (
                        <button
                          type="button"
                          className="evidence-commit"
                          key={i}
                          onClick={() => seek(i)}
                        >
                          {city.timeline[i].id.slice(0, 8)}:{" "}
                          {city.timeline[i].message}
                        </button>
                      ))}
                  </div>
                ))
              )}
              {viewMode === "architecture" && (
                <p>
                  {
                    currentRoads.filter((road) => {
                      const a = evidence.find(
                        (e) => e.building.id === road.from,
                      );
                      const b = evidence.find((e) => e.building.id === road.to);
                      return (
                        a && b && a.building.district !== b.building.district
                      );
                    }).length
                  }{" "}
                  repeated cross-district co-change links
                </p>
              )}
              {viewMode === "provenance" && (
                <p>
                  {evidence.reduce((n, e) => n + e.unknown, 0)} unmarked file
                  changes remain unknown.
                </p>
              )}
            </section>
          )}
          <p className="panel-label">
            {viewMode === "territory"
              ? "Contributor territories"
              : "Districts at this commit"}
          </p>

          {viewMode === "territory" ? (
            <div className="territory-list">
              {contributorTerritories.map(([author, count]) => {
                const share =
                  totalBuildings > 0
                    ? Math.round((count / totalBuildings) * 100)
                    : 0;

                return (
                  <button
                    type="button"
                    className="territory-row"
                    key={author}
                    onClick={() => setContributor(author)}
                  >
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
                  </button>
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
          {contributor && (
            <section className="contributor-detail">
              <p className="panel-label">Contributor detail</p>
              <h3>{contributor}</h3>
              <p>
                {contributorCommits.length} mainline commits ·{" "}
                {contributorBuildings.length} owned files
              </p>
              <p>
                {contributorCommits[0]
                  ? new Date(
                      contributorCommits[0].timestamp * 1000,
                    ).toLocaleDateString()
                  : "No mainline commits"}{" "}
                —{" "}
                {contributorCommits.at(-1)
                  ? new Date(
                      contributorCommits.at(-1)!.timestamp * 1000,
                    ).toLocaleDateString()
                  : ""}
              </p>
              {contributorBuildings.slice(0, 8).map((b) => (
                <button type="button" key={b.id} onClick={() => setSelected(b)}>
                  {b.path}
                </button>
              ))}
            </section>
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
              districts={sceneDistricts}
              activeChanges={activeChanges}
              roads={currentRoads}
              commitId={currentCommit?.id}
              releaseNames={currentCommit?.releases ?? []}
              viewMode={viewMode}
              onSelect={setSelected}
              onHover={setHovered}
              selectedId={selectedId ?? undefined}
              fitRequest={fitRequest}
              showRoads={showRoads}
              cinematic={storyPlaying}
              focusPath={storyFocusPath}
            />
          </Canvas>

          {hovered && (
            <div className="hover-detail" role="status">
              <strong>{hovered.path}</strong>
              <span>
                {hovered.lines} LOC · {hovered.commits} commits ·{" "}
                {hovered.primary_author ?? "Unknown"}
              </span>
            </div>
          )}
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
            <span>
              <i className="legend-dot added" />
              Added
            </span>
            <span>
              <i className="legend-dot modified" />
              Modified
            </span>
            <span>
              <i className="legend-dot deleted" />
              Deleted
            </span>
            <span>
              <i className="legend-dot renamed" />
              Renamed
            </span>
            <span className="hotspot-legend">
              <i className="legend-dot hotspot" />
              Hotspot
            </span>
            <span className="road-legend">
              <i className="legend-dot road" />
              Co-change
            </span>
          </div>

          {storyPlaying && activeStoryMilestone ? (
            <div className="cinematic-caption">
              <span>
                STORY {storyIndex + 1} / {storyMilestones.length}
              </span>
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
                  <dt>Status</dt>
                  <dd>{selectedStatus}</dd>
                </div>
                <div>
                  <dt>District</dt>
                  <dd>{selected.district}</dd>
                </div>
                <div>
                  <dt>Lines at commit</dt>
                  <dd>{selected.lines}</dd>
                </div>
                <div>
                  <dt>Total commits</dt>
                  <dd>{selected.commits}</dd>
                </div>
                <div>
                  <dt>Insertions</dt>
                  <dd>+{selected.additions ?? 0}</dd>
                </div>
                <div>
                  <dt>Deletions</dt>
                  <dd>-{selected.deletions ?? 0}</dd>
                </div>
                <div>
                  <dt>Contributors</dt>
                  <dd>{selected.contributor_count ?? 1}</dd>
                </div>
                <div>
                  <dt>Primary author</dt>
                  <dd>
                    <button
                      type="button"
                      onClick={() => {
                        setContributor(selected.primary_author ?? null);
                        setViewMode("territory");
                      }}
                    >
                      {selected.primary_author ?? "Unknown"}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {new Date(selected.created_at * 1000).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Last modified</dt>
                  <dd>
                    {selected.last_modified_at
                      ? new Date(
                          selected.last_modified_at * 1000,
                        ).toLocaleString()
                      : "Unknown"}
                  </dd>
                </div>
              </dl>

              <section className="recent-activity">
                <p className="panel-label">Recent activity</p>
                {selectedRecentActivity.length === 0 ? (
                  <p className="empty">
                    No historical snapshots in this sample.
                  </p>
                ) : (
                  <div className="activity-list">
                    {selectedRecentActivity.map((snapshot) => (
                      <button
                        type="button"
                        className="activity-row"
                        key={snapshot.commit_id}
                        onClick={() => seek(snapshot.commit_index)}
                      >
                        <span className={`activity-kind ${snapshot.kind}`}>
                          {snapshot.kind}
                        </span>
                        <span>{snapshot.lines} LOC</span>
                        <small>
                          +{snapshot.additions} / -{snapshot.deletions}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </section>
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
          setPlaying(false);
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
            playing={playing}
            speed={speed}
            onSpeedChange={setSpeed}
            onPlayingChange={(value) => {
              setStoryPlaying(false);
              setPlaying(value);
            }}
            onIndexChange={seek}
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
              <div className="commit-delta">
                <span>+{currentStats.additions}</span>
                <span>-{currentStats.deletions}</span>
              </div>
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

        <div className="history-activity" aria-label="History activity">
          {Array.from(
            { length: Math.min(80, city.timeline.length) },
            (_, bin) => {
              const bins = Math.min(80, city.timeline.length);
              const start = Math.floor((bin * city.timeline.length) / bins);
              const end = Math.floor(((bin + 1) * city.timeline.length) / bins);
              const count = city.timeline
                .slice(start, end)
                .reduce((n, c) => n + c.changes.length, 0);
              return (
                <button
                  type="button"
                  key={bin}
                  title={`${start + 1}–${end}: ${count} file changes`}
                  aria-label={`Seek to commit ${start + 1}`}
                  onClick={() => seek(start)}
                  style={{
                    height: `${Math.min(32, 4 + Math.log2(count + 1) * 4)}px`,
                  }}
                />
              );
            },
          )}
        </div>
        <div className="timeline-track">
          <input
            className="timeline-range"
            type="range"
            min={0}
            max={Math.max(0, city.timeline.length - 1)}
            value={Math.min(commitIndex, Math.max(0, city.timeline.length - 1))}
            disabled={city.timeline.length === 0}
            onChange={(event) => seek(Number(event.target.value))}
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
                  aria-label={`Release ${release.name}`}
                  onClick={() => seek(index)}
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

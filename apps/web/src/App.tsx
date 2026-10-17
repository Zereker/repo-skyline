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
import {
  applyBlueprintLandmarks,
  buildBlueprintLayout,
} from "./blueprintLayout";
import {
  BLUEPRINT_STOPS,
  BLUEPRINT_SUPPORT_ZONE,
  blueprintZoneForPath,
} from "./blueprint";
import {
  buildUrbanAppearances,
  moduleRoles,
  type BuildingLanguage,
} from "./urbanIdentity";
import {
  buildDistrictArchive,
  describeCity,
  describeDistrict,
} from "./districtArchive";
import { searchBuildings, searchDistricts } from "./citySearch";
import type {
  CityEventKind,
  CityProject,
  District,
  StoryMilestone,
  ViewMode,
} from "./types";

type GuideStop = {
  stopId: string;
  title: string;
  module: string;
  files: string[];
};

type BlueprintFocus = { stopId?: string; file?: string };

const isGuideStop = (value: unknown): value is GuideStop =>
  !!value &&
  typeof value === "object" &&
  typeof (value as GuideStop).stopId === "string" &&
  typeof (value as GuideStop).title === "string" &&
  typeof (value as GuideStop).module === "string" &&
  Array.isArray((value as GuideStop).files) &&
  (value as GuideStop).files.every((file) => typeof file === "string");

// Prefer exact files; only widen to parent modules when a stop has no explicit file yet.
function matchesGuideStop(buildings: PlacedBuilding[], stop: GuideStop) {
  const files = new Set(stop.files);
  const exact = buildings.filter((building) => files.has(building.path));
  if (exact.length > 0) return exact;
  const directories = stop.files
    .map((file) => file.split("/").slice(0, -1).join("/"))
    .filter(Boolean);
  return buildings.filter((building) =>
    directories.some((directory) => building.path.startsWith(`${directory}/`)),
  );
}

export default function App() {
  const [city, setCity] = useState<CityProject>(sampleCity);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const setSelected = (building: PlacedBuilding | null) =>
    setSelectedId(building?.id ?? null);
  const [hovered, setHovered] = useState<PlacedBuilding | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [directoryDepth, setDirectoryDepth] = useState(1);
  const [showRoads, setShowRoads] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [cityLayoutMode, setCityLayoutMode] = useState<
    "blueprint" | "directories"
  >("blueprint");
  const [fileQuery, setFileQuery] = useState("");
  const [focusedDistrict, setFocusedDistrict] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<"skyline" | "aerial">("skyline");
  const [immersive, setImmersive] = useState(false);
  const [buildingLanguage, setBuildingLanguage] =
    useState<BuildingLanguage>("modules");
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
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintStop, setBlueprintStop] = useState<GuideStop | null>(null);
  const [focusBuildingId, setFocusBuildingId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const blueprintFrame = useRef<HTMLIFrameElement>(null);
  const blueprintReady = useRef(false);
  const blueprintPending = useRef<Record<string, unknown>[]>([]);

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
  const blueprintLayout = useMemo(() => buildBlueprintLayout(city), [city]);
  const blueprintZones = blueprintLayout.districts.filter(
    (district) =>
      district.path !== BLUEPRINT_SUPPORT_ZONE && district.buildings.length > 0,
  ).length;
  const blueprintAvailable = blueprintZones >= 2;
  const effectiveLayout =
    cityLayoutMode === "blueprint" && blueprintAvailable
      ? "blueprint"
      : "directories";
  const stableDistricts = useMemo(
    () =>
      effectiveLayout === "blueprint"
        ? blueprintLayout.districts
        : layoutCity(city, directoryDepth),
    [city, effectiveLayout, directoryDepth, blueprintLayout],
  );
  const activeDistricts = useMemo(
    () =>
      activeDistrictsAt(
        stableDistricts,
        commitIndex,
        currentCommit?.timestamp,
        effectiveLayout === "blueprint" ? blueprintZoneForPath : undefined,
      ),
    [stableDistricts, commitIndex, currentCommit?.timestamp, effectiveLayout],
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
  const activeBuildings = useMemo(
    () =>
      activeDistricts
        .flatMap((d) => d.buildings)
        .filter((b) => b.status === "Active"),
    [activeDistricts],
  );
  const fileMatches = useMemo(
    () => searchBuildings(activeBuildings, fileQuery),
    [activeBuildings, fileQuery],
  );
  const matchedDistricts = useMemo(
    () => searchDistricts(activeDistricts, fileQuery),
    [activeDistricts, fileQuery],
  );
  const highlightPaths = useMemo(
    () =>
      fileQuery.trim() && fileMatches.length > 0
        ? new Set(fileMatches.map((building) => building.path))
        : null,
    [fileQuery, fileMatches],
  );
  function locateBuilding(building: PlacedBuilding) {
    setSelected(building);
    setFocusBuildingId(building.id);
    setFocusRequest((value) => value + 1);
    setFocusedDistrict(null);
  }
  const blueprintMatches = useMemo(
    () =>
      blueprintStop ? matchesGuideStop(activeBuildings, blueprintStop) : [],
    [activeBuildings, blueprintStop],
  );

  function openBlueprint(focus?: BlueprintFocus) {
    setBlueprintOpen(true);
    setBlueprintStop(null);
    blueprintPending.current = [];
    blueprintReady.current = false;
    if (focus?.stopId)
      blueprintPending.current.push({
        type: "skyline-city:focus-stop",
        stopId: focus.stopId,
      });
    if (focus?.file)
      blueprintPending.current.push({
        type: "skyline-city:focus-file",
        file: focus.file,
      });
  }
  function closeBlueprint() {
    setBlueprintOpen(false);
    setBlueprintStop(null);
    blueprintPending.current = [];
    blueprintReady.current = false;
  }
  function locateBlueprintStop() {
    const target = blueprintMatches[0];
    if (!target) return;
    setSelected(target);
    setFocusBuildingId(target.id);
    setFocusRequest((value) => value + 1);
    closeBlueprint();
  }
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== blueprintFrame.current?.contentWindow) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object") return;
      const message = data as { type?: string; stop?: unknown };
      if (message.type === "skyline-guide:ready") {
        blueprintReady.current = true;
        const frame = blueprintFrame.current?.contentWindow;
        for (const pending of blueprintPending.current)
          frame?.postMessage(pending, window.location.origin);
        blueprintPending.current = [];
        frame?.postMessage(
          {
            type: "skyline-city:context",
            repo: city.repository,
            commitIndex,
            commitId: currentCommit?.id ?? "",
            commitMessage: currentCommit?.message ?? "",
            commitCount: city.timeline.length,
            file: selected?.path ?? null,
          },
          window.location.origin,
        );
      } else if (
        message.type === "skyline-guide:stop" &&
        isGuideStop(message.stop)
      ) {
        setBlueprintStop(message.stop);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    city.repository,
    commitIndex,
    currentCommit?.id,
    currentCommit?.message,
    selected?.path,
  ]);
  useEffect(() => {
    if (!blueprintOpen || !blueprintReady.current) return;
    blueprintFrame.current?.contentWindow?.postMessage(
      {
        type: "skyline-city:context",
        repo: city.repository,
        commitIndex,
        commitId: currentCommit?.id ?? "",
        commitMessage: currentCommit?.message ?? "",
        commitCount: city.timeline.length,
        file: selected?.path ?? null,
      },
      window.location.origin,
    );
  }, [
    blueprintOpen,
    city.repository,
    commitIndex,
    currentCommit?.id,
    currentCommit?.message,
    selected?.path,
  ]);
  useEffect(() => {
    if (!blueprintOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBlueprint();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [blueprintOpen]);
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
  const buildingZones = useMemo(
    () =>
      new Map(
        activeBuildings.map((building) => [
          building.id,
          blueprintZoneForPath(building.path),
        ]),
      ),
    [activeBuildings],
  );
  const zoneTints = useMemo(() => {
    const tints = new Map(
      BLUEPRINT_STOPS.map((stop) => [stop.zone, stop.tint]),
    );
    tints.set(BLUEPRINT_SUPPORT_ZONE, "#6b7f8f");
    return tints;
  }, []);
  const landmarkLabels = useMemo(
    () =>
      new Map(
        [...blueprintLayout.landmarks].map(([id, landmark]) => [
          id,
          { name: landmark.name, zone: landmark.zone },
        ]),
      ),
    [blueprintLayout],
  );
  const urbanAppearances = useMemo(() => {
    const appearances = buildUrbanAppearances(
      activeDistricts.flatMap((d) => d.buildings),
      currentRoads,
      buildingLanguage,
    );
    return effectiveLayout === "blueprint"
      ? applyBlueprintLandmarks(
          appearances,
          blueprintLayout.landmarks,
          buildingZones,
          zoneTints,
        )
      : appearances;
  }, [
    activeDistricts,
    currentRoads,
    buildingLanguage,
    effectiveLayout,
    blueprintLayout,
    buildingZones,
    zoneTints,
  ]);
  const selectedAppearance = selected
    ? urbanAppearances.get(selected.id)
    : undefined;
  const zoneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const district of activeDistricts)
      counts.set(
        district.path,
        district.buildings.filter((building) => building.status === "Active")
          .length,
      );
    return counts;
  }, [activeDistricts]);
  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of activeDistricts.flatMap((d) => d.buildings)) {
      if (b.status !== "Active") continue;
      const role = urbanAppearances.get(b.id)!.role;
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    return counts;
  }, [activeDistricts, urbanAppearances]);
  const featuredCode = useMemo(
    () =>
      activeDistricts
        .flatMap((d) => d.buildings)
        .filter(
          (b) =>
            b.status === "Active" &&
            urbanAppearances.get(b.id)?.role === "source",
        )
        .sort(
          (a, b) =>
            urbanAppearances.get(b.id)!.prominence -
              urbanAppearances.get(a.id)!.prominence ||
            a.path.localeCompare(b.path),
        )
        .slice(0, 3),
    [activeDistricts, urbanAppearances],
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
                    ? `hsl(${Math.max(0, 60 - score * 8)}, 80%, 58%)`
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
        const author = building.primary_author ?? "未知";
        counts.set(author, (counts.get(author) ?? 0) + 1);
      }
    }

    return new Map(counts);
  }, [activeDistricts]);
  // Ranked by real commit counts, so contributors whose work arrived through
  // merge commits are visible even when they own no file outright.
  const contributorRoster = useMemo(() => {
    const people = city.contributors ?? [];
    const active = people.filter(
      (person) =>
        currentCommit == null ||
        person.last_commit_at <= currentCommit.timestamp,
    );
    return active
      .map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email ?? null,
        mainline: person.mainline_commits,
        merged: person.merged_commits,
        files: contributorTerritories.get(person.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.mainline + b.merged - (a.mainline + a.merged) ||
          b.files - a.files ||
          a.name.localeCompare(b.name),
      );
  }, [city.contributors, contributorTerritories, currentCommit]);
  const activeContributorCount = useMemo(() => {
    const seen = new Set(
      city.timeline
        .slice(0, commitIndex + 1)
        .map((commit) => commit.author_id ?? commit.author),
    );
    for (const person of contributorRoster) seen.add(person.id);
    return seen.size;
  }, [city.timeline, commitIndex, contributorRoster]);

  const currentDate = currentCommit
    ? new Date(currentCommit.timestamp * 1000).toLocaleString()
    : "暂无提交历史";

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
  const contributorPerson = contributorRoster.find(
    (person) => person.id === contributor,
  );

  const activeDistrictModels: District[] = activeDistricts.map((district) => ({
    path: district.path,
    buildings: district.buildings,
  }));
  const districtArchive = useMemo(
    () => buildDistrictArchive(city, activeDistricts),
    [city, activeDistricts],
  );
  const cityNote = useMemo(
    () => describeCity(city, [...districtArchive.values()]),
    [city, districtArchive],
  );

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
    <main className={`app-shell${immersive ? " immersive" : ""}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>{" "}
            REPO SKYLINE
          </p>
          <div className="brand-title">
            <h1>{city.repository}</h1>
            <span className="brand-edition">城市版</span>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="mode-toggle" aria-label="城市视图模式">
            <button
              type="button"
              className={viewMode === "district" ? "active" : ""}
              onClick={() => setViewMode("district")}
            >
              街区
            </button>
            <button
              type="button"
              className={viewMode === "territory" ? "active" : ""}
              onClick={() => setViewMode("territory")}
            >
              贡献者领地
            </button>
            <button
              type="button"
              className={viewMode === "activity" ? "active" : ""}
              onClick={() => setViewMode("activity")}
            >
              活跃热力
            </button>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setFitRequest((v) => v + 1)}
          >
            全览城市
          </button>
          <label className="secondary-button import-button">
            打开城市 JSON
            <input
              type="file"
              accept=".json,application/json"
              aria-label="打开城市 JSON"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const generation = ++loadGeneration.current;
                try {
                  if (file.size > 128 * 1024 * 1024)
                    throw new Error("请选择小于 128 MB 的城市 JSON 文件。");
                  const data = JSON.parse(await file.text());
                  if (generation === loadGeneration.current)
                    loadCity(data, "imported");
                } catch (error) {
                  if (generation === loadGeneration.current)
                    setLoadError(
                      error instanceof Error
                        ? error.message
                        : "无法打开城市 JSON。",
                    );
                }
              }}
            />
          </label>
          <button
            type="button"
            className="secondary-button guide-link"
            aria-pressed={blueprintOpen}
            onClick={() =>
              blueprintOpen
                ? closeBlueprint()
                : openBlueprint({ file: selected?.path })
            }
          >
            架构蓝图
          </button>
          <details className="settings">
            <summary>设置</summary>
            <label>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />{" "}
              街区标签
            </label>
            <label>
              <input
                type="checkbox"
                checked={showRoads}
                onChange={(e) => setShowRoads(e.target.checked)}
              />{" "}
              共改道路
            </label>
            <label>
              城市布局{" "}
              <select
                aria-label="城市布局"
                value={cityLayoutMode}
                onChange={(e) => {
                  setCityLayoutMode(
                    e.target.value as "blueprint" | "directories",
                  );
                  setFitRequest((v) => v + 1);
                }}
              >
                <option value="blueprint">蓝图分区</option>
                <option value="directories">真实目录</option>
              </select>
              {!blueprintAvailable && (
                <span className="settings-note">
                  当前仓库没有足够的蓝图模块，已按真实目录布局。
                </span>
              )}
            </label>
            <label>
              目录层级{" "}
              <select
                aria-label="目录层级"
                value={directoryDepth}
                disabled={cityLayoutMode === "blueprint"}
                onChange={(e) => {
                  setDirectoryDepth(Number(e.target.value));
                  setFitRequest((v) => v + 1);
                }}
              >
                <option value={1}>一级目录</option>
                <option value={2}>二级目录</option>
                <option value={99}>完整路径</option>
              </select>
            </label>
            <label>
              沉寂阈值{" "}
              <select
                aria-label="沉寂阈值"
                value={ghostDays}
                onChange={(e) => setGhostDays(Number(e.target.value))}
              >
                {[90, 180, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} 天
                  </option>
                ))}
              </select>
            </label>
          </details>
          <div className="stats">
            <span>{dataSource === "sample" ? "示例数据" : "Git 数据"}</span>
            <span>{activeDistricts.length} 个街区</span>
            <span>{totalBuildings} 栋建筑</span>
            <span>{city.timeline.length} 次提交</span>
            <span>{city.releases.length} 个版本</span>
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
          <section className="city-archive">
            <p className="panel-label">城市档案</p>
            <p className="archive-summary">{cityNote.summary}</p>
            {cityNote.domains.length > 0 && (
              <dl className="archive-domains">
                {cityNote.domains.map((domain) => (
                  <div key={domain.title}>
                    <dt>{domain.title}</dt>
                    <dd>{domain.detail}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <p className="panel-label">仓库概览</p>
          <p>
            {totalBuildings} 个文件 ·{" "}
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
            行代码
          </p>
          <p>
            {activeContributorCount} 位贡献者 · 截至本次提交
            {contributorRoster.some((person) => person.merged > 0) && (
              <small className="count-note">
                含{" "}
                {contributorRoster.filter((person) => person.merged > 0).length}{" "}
                位的合并分支提交
              </small>
            )}
          </p>
          <details className="import-help">
            <summary>分析本地仓库</summary>
            <p>先为本地仓库生成城市文件，再在上方打开：</p>
            <code>repo-skyline analyze /path/to/repo -o city.json</code>
          </details>
          <section className="building-language">
            <label className="panel-label" htmlFor="building-language">
              建筑语言
            </label>
            <select
              id="building-language"
              value={buildingLanguage}
              onChange={(event) => {
                setBuildingLanguage(event.target.value as BuildingLanguage);
                setFitRequest((v) => v + 1);
              }}
            >
              <option value="modules">模块职责 + 历史</option>
              <option value="loc">代码行数塔楼</option>
            </select>
            {effectiveLayout === "blueprint" ? (
              <>
                <div className="role-legend" aria-label="蓝图片区图例">
                  {BLUEPRINT_STOPS.map((stop) => (
                    <div key={stop.id} title={stop.title}>
                      <i style={{ background: stop.tint }} />
                      <span>{stop.zone}</span>
                      <b>{zoneCounts.get(stop.zone) ?? 0}</b>
                    </div>
                  ))}
                  <div title="未匹配到蓝图模块的文件">
                    <i style={{ background: "#6b7f8f" }} />
                    <span>{BLUEPRINT_SUPPORT_ZONE}</span>
                    <b>{zoneCounts.get(BLUEPRINT_SUPPORT_ZONE) ?? 0}</b>
                  </div>
                </div>
                <p className="identity-note">
                  {viewMode === "district"
                    ? "颜色对应蓝图片区，外形对应模块职责；地标塔按蓝图规划排序。"
                    : "外形保留蓝图规划；颜色跟随当前分析视图。"}
                </p>
              </>
            ) : buildingLanguage === "modules" ? (
              <>
                <div className="role-legend" aria-label="模块职责图例">
                  {Object.entries(moduleRoles)
                    .filter(([role]) => roleCounts.has(role))
                    .map(([role, definition]) => (
                      <div key={role} title={definition.description}>
                        <i style={{ background: definition.accent }} />
                        <span>{definition.label}</span>
                        <b>{roleCounts.get(role)}</b>
                      </div>
                    ))}
                </div>
                <p className="identity-note">
                  外形与材质对应模块职责；高度综合职责、代码行数和历史关注度。
                </p>
              </>
            ) : (
              <p className="identity-note">
                高度只按代码行数计算。切换到模块职责可看到园区、文化场馆和阶梯街区。
              </p>
            )}
          </section>
          <section className="city-search">
            <label className="panel-label" htmlFor="file-search">
              查找文件 / 街区
            </label>
            <div className="search-field">
              <input
                id="file-search"
                type="search"
                value={fileQuery}
                placeholder="例如 route.go 或 internal/pkg"
                autoComplete="off"
                onChange={(event) => setFileQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setFileQuery("");
                  if (event.key === "Enter" && fileMatches[0])
                    locateBuilding(fileMatches[0]);
                }}
              />
              {fileQuery && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="清空搜索"
                  onClick={() => setFileQuery("")}
                >
                  ×
                </button>
              )}
            </div>
            <p className="search-status" role="status">
              {fileQuery.trim()
                ? fileMatches.length > 0
                  ? `${fileMatches.length} 个匹配文件 · ${matchedDistricts.size} 个街区`
                  : "没有匹配的文件"
                : "输入路径片段即可定位建筑"}
            </p>
            {fileMatches.length > 0 && (
              <ul className="search-results">
                {fileMatches.map((building) => (
                  <li key={building.id}>
                    <button
                      type="button"
                      onClick={() => locateBuilding(building)}
                    >
                      <span className="result-path">{building.path}</span>
                      <small>
                        {building.lines.toLocaleString()} 行 ·{" "}
                        {building.commits} 次提交
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <label className="panel-label" htmlFor="analysis-view">
            分析视图
          </label>
          <select
            id="analysis-view"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            {[
              ["district", "街区"],
              ["territory", "贡献者领地"],
              ["activity", "活跃热力"],
              ["ghost", "沉寂街区"],
              ["risk", "技术债指标"],
              ["bugs", "缺陷现场"],
              ["architecture", "架构漂移"],
              ["provenance", "AI 与人工来源"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {viewMode === "activity" && (
            <p className="analysis-note">
              截至本次提交前 30 天内的变更。蓝色表示安静，红色表示活跃。
            </p>
          )}
          {analysisDescriptions[viewMode] && (
            <section className="analysis-panel">
              <p className="analysis-note">{analysisDescriptions[viewMode]}</p>
              {evidenceRows.length === 0 ? (
                <p>本次提交没有匹配的证据。</p>
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
                          ? `${e.churn.toFixed(1)} edits/行代码 · ${e.building.contributor_count} contributors`
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
          {buildingLanguage === "modules" &&
            viewMode === "district" &&
            featuredCode.length > 0 && (
              <section className="featured-code">
                <p className="panel-label">代码焦点 · 历史信号</p>
                {featuredCode.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => setSelected(b)}
                  >
                    <span>{b.path}</span>
                    <strong>{urbanAppearances.get(b.id)!.prominence}</strong>
                  </button>
                ))}
              </section>
            )}
          <p className="panel-label">
            {viewMode === "territory" ? "贡献者领地" : "本次提交的街区"}
          </p>

          {viewMode === "territory" ? (
            <div className="territory-list">
              {contributorRoster.slice(0, 12).map((person) => {
                const share =
                  totalBuildings > 0
                    ? Math.round((person.files / totalBuildings) * 100)
                    : 0;

                return (
                  <button
                    type="button"
                    className="territory-row"
                    key={person.id}
                    title={`${person.name} · ${person.mainline} 次主线提交${person.merged ? ` · ${person.merged} 次合并分支提交` : ""} · ${person.files} 个归属文件`}
                    onClick={() => setContributor(person.id)}
                  >
                    <span
                      className="territory-swatch"
                      style={{ background: colorForContributor(person.id) }}
                    />
                    <span className="territory-copy">
                      <span>{person.name}</span>
                      <i>
                        <b
                          style={{
                            width: `${share}%`,
                            background: colorForContributor(person.id),
                          }}
                        />
                      </i>
                    </span>
                    <strong>{person.mainline + person.merged}</strong>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {focusedDistrict && (
                <div className="focus-banner" role="status">
                  <span>
                    正在聚焦 <b>{focusedDistrict}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFocusedDistrict(null)}
                  >
                    显示全城
                  </button>
                </div>
              )}
              {activeDistrictModels.map((district) => {
                const stats = districtArchive.get(district.path);
                const note = stats
                  ? describeDistrict(city.repository, stats)
                  : null;
                const focused = focusedDistrict === district.path;
                const matched = matchedDistricts.has(district.path);
                return (
                  <button
                    type="button"
                    className={`district-row${focused ? " focused" : ""}${matched ? " matched" : ""}`}
                    key={district.path}
                    aria-pressed={focused}
                    title={`${note?.purpose ? `${note.purpose} · ` : ""}点击聚焦该街区`}
                    onClick={() =>
                      setFocusedDistrict(focused ? null : district.path)
                    }
                  >
                    <span className="district-row-copy">
                      <span className="district-name">{district.path}</span>
                      {note && <small>{note.purpose}</small>}
                    </span>
                    <strong>{district.buildings.length}</strong>
                  </button>
                );
              })}
            </>
          )}
          {contributor && (
            <section className="contributor-detail">
              <p className="panel-label">贡献者详情</p>
              <h3>{contributorPerson?.name ?? contributor}</h3>
              {contributorPerson?.email && (
                <small>{contributorPerson.email}</small>
              )}
              <p>
                {contributorCommits.length} 次主线提交
                {contributorPerson?.merged
                  ? ` · ${contributorPerson.merged} 次合并分支提交`
                  : ""}{" "}
                · {contributorBuildings.length} 个归属文件
              </p>
              <p>
                {contributorCommits[0]
                  ? new Date(
                      contributorCommits[0].timestamp * 1000,
                    ).toLocaleDateString()
                  : "无主线提交"}{" "}
                —{" "}
                {contributorCommits.at(-1)
                  ? new Date(
                      contributorCommits.at(-1)!.timestamp * 1000,
                    ).toLocaleDateString()
                  : ""}
              </p>
              {contributorPerson && contributorPerson.merged > 0 && (
                <p className="contributor-note">
                  这些提交在分支上完成，通过合并提交进入历史，因此不参与文件归属统计。
                </p>
              )}
              {contributorBuildings.slice(0, 8).map((b) => (
                <button type="button" key={b.id} onClick={() => setSelected(b)}>
                  {b.path}
                </button>
              ))}
            </section>
          )}
        </aside>

        <div
          className={`canvas-wrap${effectiveLayout === "blueprint" ? " city-scene-has-landmarks" : ""}`}
        >
          <Canvas
            camera={{ position: [80, 45, 120], fov: 42, far: 6000 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={["#15263d"]} />
            <CityScene
              districts={sceneDistricts}
              appearances={urbanAppearances}
              layoutDistricts={stableDistricts}
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
              showLabels={showLabels}
              zoneTints={
                effectiveLayout === "blueprint" ? zoneTints : undefined
              }
              landmarkLabels={
                effectiveLayout === "blueprint" ? landmarkLabels : undefined
              }
              focusDistrict={focusedDistrict}
              highlightPaths={highlightPaths}
              cameraMode={cameraMode}
              cinematic={storyPlaying}
              focusPath={storyFocusPath}
              focusBuildingId={focusBuildingId}
              focusRequest={focusRequest}
            />
          </Canvas>

          <div className="skyline-intro">
            <span className="skyline-kicker">
              滨江天际线 <i /> 蓝调时刻
            </span>
            <h2>代码写成的城市</h2>
            <p>每个文件都是一栋建筑，每次提交都是新的天际线。</p>
          </div>
          <div className="scene-toolbar" aria-label="场景控制">
            <div className="camera-toggle">
              <button
                type="button"
                aria-pressed={cameraMode === "skyline"}
                onClick={() => setCameraMode("skyline")}
              >
                天际线
              </button>
              <button
                type="button"
                aria-pressed={cameraMode === "aerial"}
                onClick={() => setCameraMode("aerial")}
              >
                俯视
              </button>
            </div>
            <button
              type="button"
              className="immersive-toggle"
              aria-pressed={immersive}
              onClick={() => setImmersive(!immersive)}
            >
              {immersive ? "显示面板" : "沉浸模式"}
            </button>
            <button
              type="button"
              className="blueprint-toggle"
              aria-pressed={blueprintOpen}
              onClick={() =>
                blueprintOpen
                  ? closeBlueprint()
                  : openBlueprint({ file: selected?.path })
              }
            >
              蓝图
            </button>
          </div>

          {hovered && (
            <div className="hover-detail" role="status">
              <strong>{hovered.path}</strong>
              <span>
                {hovered.lines} 行代码 · {hovered.commits} 次提交 ·{" "}
                {hovered.primary_author ?? "未知"}
              </span>
              <small>
                {
                  moduleRoles[
                    urbanAppearances.get(hovered.id)?.role ?? "unknown"
                  ].description
                }{" "}
                · 历史关注度 {urbanAppearances.get(hovered.id)?.prominence ?? 0}
                /100
              </small>
            </div>
          )}
          <div className="city-hud">
            <span className="city-hud-live">
              <i />
              实时仓库
            </span>
            <strong>{currentCommit?.message ?? "暂无提交历史"}</strong>
            <small>
              {currentCommit
                ? `${currentCommit.author} · ${currentDate} · ${currentCommit.id.slice(0, 8)}`
                : "等待仓库历史"}
            </small>
          </div>

          <div className="legend">
            <span>
              <i className="legend-dot added" />
              新增
            </span>
            <span>
              <i className="legend-dot modified" />
              修改
            </span>
            <span>
              <i className="legend-dot deleted" />
              删除
            </span>
            <span>
              <i className="legend-dot renamed" />
              重命名
            </span>
            <span className="hotspot-legend">
              <i className="legend-dot hotspot" />
              热点
            </span>
            <span className="road-legend">
              <i className="legend-dot road" />
              共改
            </span>
          </div>

          {storyPlaying && activeStoryMilestone ? (
            <div className="cinematic-caption">
              <span>
                故事 {storyIndex + 1} / {storyMilestones.length}
              </span>
              <strong>{activeStoryMilestone.title}</strong>
              <small>{activeStoryMilestone.description}</small>
            </div>
          ) : null}

          <div className="hint">
            <span className="view-crosshair" aria-hidden="true">
              ⌖
            </span>{" "}
            拖动旋转 · 滚轮缩放 · 点击查看建筑
          </div>
          <div className="waterfront-caption">
            <span>滨江岸线</span>
            <i /> <small>重新想象 Git 历史。</small>
          </div>
        </div>

        <aside className={`panel inspector${selected ? " has-selection" : ""}`}>
          <p className="panel-label">建筑详情</p>

          {selected ? (
            <>
              <h2>{selected.path.split("/").at(-1)}</h2>
              <p className="path">{selected.path}</p>
              {selectedAppearance && (
                <section
                  className="urban-identity"
                  data-role={selectedAppearance.role}
                >
                  <div className="identity-heading">
                    <i style={{ background: selectedAppearance.accent }} />
                    <strong>
                      {moduleRoles[selectedAppearance.role].label}
                    </strong>
                    <span>
                      {selectedAppearance.tier === "landmark"
                        ? "地标"
                        : selectedAppearance.tier === "anchor"
                          ? "重点"
                          : "普通"}
                    </span>
                  </div>
                  <p>
                    {moduleRoles[selectedAppearance.role].description} ·{" "}
                    {selectedAppearance.style}
                  </p>
                  <div className="prominence-meter">
                    <span>历史关注度</span>
                    <b>
                      {selectedAppearance.prominence}
                      <small>/100</small>
                    </b>
                  </div>
                  <div className="prominence-track">
                    <i
                      style={{
                        width: `${selectedAppearance.prominence}%`,
                        background: selectedAppearance.accent,
                      }}
                    />
                  </div>
                  <details className="identity-explanation">
                    <summary>为什么是这样一栋建筑？</summary>
                    <p>{selectedAppearance.classification}。</p>
                    <ul>
                      <li>
                        {selectedAppearance.signals.changes} 次文件变更 · 权重
                        45%
                      </li>
                      <li>
                        {selectedAppearance.signals.contributors} 位贡献者 ·
                        权重 20%
                      </li>
                      <li>
                        {selectedAppearance.signals.neighbours}{" "}
                        个观察到的共改邻居 · 权重 35%
                      </li>
                    </ul>
                    <p>
                      按本次提交的活跃文件做对数缩放，最小基准为 10 次变更、3
                      位贡献者和 3
                      个共改邻居。共改关系只使用已保留的历史证据。这是历史信号，不代表依赖关系或业务重要性。
                    </p>
                  </details>
                </section>
              )}
              <button
                type="button"
                className="blueprint-link-button"
                onClick={() => openBlueprint({ file: selected.path })}
              >
                <span>在蓝图中查看该模块</span>
                <span aria-hidden="true">→</span>
              </button>

              <dl>
                <div>
                  <dt>状态</dt>
                  <dd>{selectedStatus === "Active" ? "活跃" : "已拆除"}</dd>
                </div>
                <div>
                  <dt>街区</dt>
                  <dd>
                    {selected.district}
                    {(() => {
                      const stats = districtArchive.get(selected.district);
                      const note = stats
                        ? describeDistrict(city.repository, stats)
                        : null;
                      return note ? (
                        <small className="district-purpose">
                          {note.purpose}
                          {note.detail ? ` · ${note.detail}` : ""}
                        </small>
                      ) : null;
                    })()}
                  </dd>
                </div>
                <div>
                  <dt>提交时行数</dt>
                  <dd>{selected.lines}</dd>
                </div>
                <div>
                  <dt>提交次数</dt>
                  <dd>{selected.commits}</dd>
                </div>
                <div>
                  <dt>新增行</dt>
                  <dd>+{selected.additions ?? 0}</dd>
                </div>
                <div>
                  <dt>删除行</dt>
                  <dd>-{selected.deletions ?? 0}</dd>
                </div>
                <div>
                  <dt>贡献者</dt>
                  <dd>{selected.contributor_count ?? 1}</dd>
                </div>
                <div>
                  <dt>主要作者</dt>
                  <dd>
                    <button
                      type="button"
                      onClick={() => {
                        setContributor(selected.primary_author ?? null);
                        setViewMode("territory");
                      }}
                    >
                      {selected.primary_author ?? "未知"}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>
                    {new Date(selected.created_at * 1000).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>最后修改</dt>
                  <dd>
                    {selected.last_modified_at
                      ? new Date(
                          selected.last_modified_at * 1000,
                        ).toLocaleString()
                      : "未知"}
                  </dd>
                </div>
              </dl>

              <section className="recent-activity">
                <p className="panel-label">最近活动</p>
                {selectedRecentActivity.length === 0 ? (
                  <p className="empty">此示例没有历史快照。</p>
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
                          {snapshot.kind === "added"
                            ? "新增"
                            : snapshot.kind === "modified"
                              ? "修改"
                              : snapshot.kind === "deleted"
                                ? "删除"
                                : "重命名"}
                        </span>
                        <span>{snapshot.lines} 行</span>
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
            <p className="empty">在城市中点击一栋建筑。</p>
          )}

          <CommitChanges commit={currentCommit} />
        </aside>

        {blueprintOpen && (
          <section className="blueprint-view" aria-label="架构蓝图">
            <header className="blueprint-view-bar">
              <div className="blueprint-view-title">
                <span>架构蓝图</span>
                <strong>{city.repository}</strong>
                <small>
                  {currentCommit
                    ? `${currentCommit.id.slice(0, 8)} · ${currentCommit.message}`
                    : "暂无提交历史"}
                </small>
              </div>
              <div className="blueprint-view-link" aria-live="polite">
                {blueprintStop ? (
                  <>
                    <i />
                    <span>{blueprintStop.title}</span>
                    <small>
                      {blueprintMatches.length
                        ? `当前城市匹配到 ${blueprintMatches.length} 栋建筑`
                        : "当前城市没有匹配建筑"}
                    </small>
                  </>
                ) : (
                  <span>选择模块，与当前城市建立联系。</span>
                )}
              </div>
              <div className="blueprint-view-actions">
                <button
                  type="button"
                  className="blueprint-locate"
                  disabled={blueprintMatches.length === 0}
                  onClick={locateBlueprintStop}
                >
                  定位到城市
                </button>
                <a href="./guide.html" target="_blank" rel="noreferrer">
                  独立页面 ↗
                </a>
                <button type="button" onClick={closeBlueprint}>
                  关闭
                </button>
              </div>
            </header>
            <iframe
              ref={blueprintFrame}
              src="./guide.html?embedded=1"
              title="架构蓝图"
            />
          </section>
        )}
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
              <p className="panel-label">提交时间线</p>
              <strong>{currentCommit?.message ?? "暂无提交"}</strong>
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
                    <span key={release}>版本 {release}</span>
                  ))}
                </div>
              ) : null}
            </div>

            <span className="change-count">
              {currentCommit?.changes.length ?? 0} 个文件变更
            </span>
          </div>
        </div>

        <div className="history-activity" aria-label="历史活跃度">
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
                  title={`${start + 1}–${end}: ${count} 个文件变更`}
                  aria-label={`跳转到第 ${start + 1}`}
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
            aria-label="提交时间线"
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
                  aria-label={`版本 ${release.name}`}
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

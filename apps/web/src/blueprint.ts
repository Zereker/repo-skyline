import type { ArchitectureStyle } from "./urbanIdentity";

export type BlueprintStop = {
  id: string;
  title: string;
  zone: string;
  category: string;
  files: string[];
  directories?: string[];
  col: number;
  row: number;
  style: ArchitectureStyle;
  tint: string;
};

/**
 * The architectural plan shared by the city layout, the 3D landmarks and the
 * embedded blueprint. Grid columns run left to right; rows run back to front.
 */
export const BLUEPRINT_STOPS: BlueprintStop[] = [
  {
    id: "entry",
    title: "入口门廊",
    tint: "#93aec4",
    zone: "入口区",
    category: "启动入口",
    files: ["apps/web/src/main.tsx"],
    col: 0,
    row: 1,
    style: "gateway",
  },
  {
    id: "history",
    title: "Git 历史采集港",
    tint: "#54a39c",
    zone: "历史数据区",
    category: "Rust / 数据",
    files: [
      "crates/git-analyzer/src/lib.rs",
      "crates/repository-model/src/lib.rs",
      "crates/git-analyzer/tests/repository_history.rs",
    ],
    directories: ["crates/git-analyzer/src", "crates/repository-model/src"],
    col: 0,
    row: 0,
    style: "vault",
  },
  {
    id: "projection",
    title: "城市投影工坊",
    tint: "#b68a5a",
    zone: "投影工坊",
    category: "Rust / 投影",
    files: [
      "crates/city-model/src/lib.rs",
      "crates/repo-skyline-cli/src/main.rs",
    ],
    directories: ["crates/city-model/src", "crates/repo-skyline-cli/src"],
    col: 1,
    row: 0,
    style: "crown",
  },
  {
    id: "contract",
    title: "共享契约塔",
    tint: "#d9b273",
    zone: "契约广场",
    category: "共享契约",
    files: ["apps/web/src/types.ts"],
    col: 1,
    row: 1,
    style: "spiral",
  },
  {
    id: "gate",
    title: "导入校验关卡",
    tint: "#7f9fb4",
    zone: "校验关卡",
    category: "数据边界",
    files: ["apps/web/src/importCity.ts", "apps/web/src/sampleCity.ts"],
    col: 2,
    row: 0,
    style: "hall",
  },
  {
    id: "control",
    title: "状态控制中枢",
    tint: "#7d8fc2",
    zone: "状态中枢",
    category: "React / 状态",
    files: ["apps/web/src/App.tsx"],
    col: 2,
    row: 1,
    style: "twin",
  },
  {
    id: "layout",
    title: "稳定布局街区",
    tint: "#6a9d87",
    zone: "布局街区",
    category: "纯投影",
    files: [
      "apps/web/src/cityLayout.ts",
      "apps/web/src/buildingScale.ts",
      "apps/web/src/blueprint.ts",
      "apps/web/src/blueprintLayout.ts",
    ],
    col: 0,
    row: 2,
    style: "terrace",
  },
  {
    id: "identity",
    title: "模块造型馆",
    tint: "#b37f9d",
    zone: "造型馆",
    category: "视觉语义",
    files: [
      "apps/web/src/urbanIdentity.ts",
      "apps/web/src/buildingVisuals.ts",
      "apps/web/src/analysis.ts",
    ],
    col: 1,
    row: 2,
    style: "courtyard",
  },
  {
    id: "scene",
    title: "渲染总部",
    tint: "#5d8fc6",
    zone: "渲染总部",
    category: "Three.js / 视图",
    files: [
      "apps/web/src/CityScene.tsx",
      "apps/web/src/BuildingMesh.tsx",
      "apps/web/src/InstancedBuildings.tsx",
      "apps/web/src/FacadeMaterial.tsx",
      "apps/web/src/Waterfront.tsx",
      "apps/web/src/NightEffects.tsx",
      "apps/web/src/CityLandscaping.tsx",
      "apps/web/src/DistrictLabel.tsx",
    ],
    col: 3,
    row: 1,
    style: "slab",
  },
  {
    id: "replay",
    title: "回放与验收站",
    tint: "#9991b8",
    zone: "回放站",
    category: "交互 / 验证",
    files: [
      "apps/web/src/PlaybackControls.tsx",
      "apps/web/src/StoryPanel.tsx",
      "apps/web/src/CommitChanges.tsx",
      "apps/web/src/timeline.ts",
      "apps/web/src/cityLayout.test.ts",
      "apps/web/src/urbanIdentity.test.ts",
      "apps/web/e2e/skyline.spec.ts",
      "apps/web/e2e/guide.spec.ts",
    ],
    col: 2,
    row: 2,
    style: "pavilion",
  },
];

export const BLUEPRINT_SUPPORT_ZONE = "配套文件区";
export const BLUEPRINT_SUPPORT_CELL = { col: 3, row: 2 };

export type BlueprintZone = { path: string; col: number; row: number };

export const BLUEPRINT_ZONES: BlueprintZone[] = [
  ...BLUEPRINT_STOPS.map((stop) => ({
    path: stop.zone,
    col: stop.col,
    row: stop.row,
  })),
  { path: BLUEPRINT_SUPPORT_ZONE, ...BLUEPRINT_SUPPORT_CELL },
];

const normalized = (path: string) => path.replaceAll("\\", "/");

export type BlueprintClassification = {
  stop: BlueprintStop;
  exact: boolean;
};

/** Exact files win; otherwise a file inherits the module directory of a stop. */
export function blueprintStopForPath(
  path: string,
): BlueprintClassification | null {
  const value = normalized(path);
  for (const stop of BLUEPRINT_STOPS)
    if (stop.files.includes(value)) return { stop, exact: true };
  for (const stop of BLUEPRINT_STOPS) {
    for (const directory of stop.directories ?? []) {
      if (value.startsWith(`${directory}/`)) return { stop, exact: false };
    }
  }
  return null;
}

export function blueprintZoneForPath(path: string) {
  return blueprintStopForPath(path)?.stop.zone ?? BLUEPRINT_SUPPORT_ZONE;
}

export function blueprintStopById(id: string) {
  return BLUEPRINT_STOPS.find((stop) => stop.id === id);
}

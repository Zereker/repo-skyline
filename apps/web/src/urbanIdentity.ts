import { buildingFootprint, buildingHeight } from "./buildingScale";
import type { PlacedBuilding } from "./cityLayout";
import type { CityRoad } from "./types";

export type BuildingLanguage = "modules" | "loc";
export type ModuleRole =
  | "source"
  | "tests"
  | "docs"
  | "examples"
  | "infra"
  | "generated"
  | "assets"
  | "unknown";
export type ArchitectureStyle =
  | "spiral"
  | "gateway"
  | "pagoda"
  | "crown"
  | "slab"
  | "twin"
  | "campus"
  | "courtyard"
  | "terrace"
  | "vault"
  | "pavilion"
  | "hall";
export type FacadePattern =
  "curtain" | "ribbon" | "arcade" | "lattice" | "panels" | "quiet";
export type FacadeDesign = {
  pattern: FacadePattern;
  bayWidth: number;
  floorHeight: number;
  occupancy: number;
  warmth: number;
  brightness: number;
  seed: number;
  cool: string;
  warm: string;
};
export type UrbanAppearance = {
  role: ModuleRole;
  classification: string;
  language: BuildingLanguage;
  style: ArchitectureStyle;
  height: number;
  width: number;
  color: string;
  accent: string;
  roof: string;
  metalness: number;
  roughness: number;
  prominence: number;
  tier: "landmark" | "anchor" | "local";
  signals: { changes: number; contributors: number; neighbours: number };
  facade: FacadeDesign;
};

type RoleDefinition = {
  label: string;
  description: string;
  accent: string;
  colors: readonly string[];
  roofs: readonly string[];
  styles: readonly ArchitectureStyle[];
  patterns: readonly FacadePattern[];
  floorHeight: number;
  warmth: number;
  metalness: number;
  roughness: number;
};

export const moduleRoles: Record<ModuleRole, RoleDefinition> = {
  source: {
    label: "源代码",
    description: "商务塔楼",
    accent: "#73d1e7",
    colors: ["#236478", "#357a8a", "#427daa", "#32618d"],
    roofs: ["#77d6e8", "#b9dceb", "#91c7ff"],
    styles: ["spiral", "gateway", "crown", "twin", "slab"],
    patterns: ["curtain", "lattice"],
    floorHeight: 1.35,
    warmth: 0.12,
    metalness: 0.5,
    roughness: 0.25,
  },
  tests: {
    label: "测试",
    description: "研发园区",
    accent: "#81bca2",
    colors: ["#527a65", "#6b9787", "#587f83"],
    roofs: ["#a6bc97", "#648f7c", "#8ca896"],
    styles: ["campus", "hall"],
    patterns: ["ribbon", "panels"],
    floorHeight: 2.3,
    warmth: 0.35,
    metalness: 0.15,
    roughness: 0.65,
  },
  docs: {
    label: "文档",
    description: "文化场馆",
    accent: "#e0b47e",
    colors: ["#b18d66", "#c2aa84", "#a87e60", "#d2b899"],
    roofs: ["#8e6450", "#c3a47b", "#79624f"],
    styles: ["courtyard", "pavilion", "terrace"],
    patterns: ["arcade", "quiet"],
    floorHeight: 3.1,
    warmth: 0.95,
    metalness: 0.05,
    roughness: 0.85,
  },
  examples: {
    label: "示例",
    description: "阶梯住宅",
    accent: "#da9c9f",
    colors: ["#ac7377", "#a885a8", "#b97b61", "#887c9e"],
    roofs: ["#bd9b8c", "#997696", "#7c6877"],
    styles: ["terrace", "courtyard", "twin"],
    patterns: ["quiet", "curtain"],
    floorHeight: 1.8,
    warmth: 0.7,
    metalness: 0.1,
    roughness: 0.7,
  },
  infra: {
    label: "基础设施",
    description: "控制中心",
    accent: "#a898d0",
    colors: ["#555582", "#64628d", "#525b74"],
    roofs: ["#8984a9", "#66748f", "#a299b2"],
    styles: ["vault", "hall"],
    patterns: ["panels", "ribbon"],
    floorHeight: 2.5,
    warmth: 0.08,
    metalness: 0.6,
    roughness: 0.4,
  },
  generated: {
    label: "生成代码",
    description: "机械厂房",
    accent: "#9aa3ab",
    colors: ["#6f7781", "#7c848d", "#636b76"],
    roofs: ["#a7aeb6", "#8d959e"],
    styles: ["slab", "pavilion"],
    patterns: ["panels", "quiet"],
    floorHeight: 3.2,
    warmth: 0.05,
    metalness: 0.3,
    roughness: 0.6,
  },
  assets: {
    label: "资产与数据",
    description: "小型亭馆",
    accent: "#91b6bf",
    colors: ["#748c98", "#668c9b", "#8d9e9b"],
    roofs: ["#a9bbc0", "#8caaaa"],
    styles: ["pavilion", "vault"],
    patterns: ["quiet"],
    floorHeight: 3.2,
    warmth: 0.4,
    metalness: 0.2,
    roughness: 0.6,
  },
  unknown: {
    label: "其他文件",
    description: "未分类街区",
    accent: "#a2a9b2",
    colors: ["#737d8d", "#687589", "#88909c"],
    roofs: ["#a0a9b6"],
    styles: ["hall", "slab"],
    patterns: ["quiet"],
    floorHeight: 2,
    warmth: 0.4,
    metalness: 0.2,
    roughness: 0.6,
  },
};

export function identitySeed(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

const GENERATED_NAME =
  /(\.(gen|pb|pb\.gw|g|generated|min)\.(go|ts|tsx|js|jsx|mjs|cjs|css|dart|py|java|rb)$|\.snap$|_(test|spec)\.snap$|__snapshots__\/)/;
const GENERATED_LOCK =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|go\.sum|go\.mod\.sum|cargo\.lock|poetry\.lock|pipfile\.lock|gemfile\.lock|composer\.lock|packages\.lock\.json|podfile\.lock|flake\.lock)$/;
const GENERATED_DIR =
  /(^|\/)(vendor|third_party|node_modules|dist|build|out|\.next|\.nuxt|coverage|__pycache__|\.tox|\.venv|venv|target)\//;

/** Path-based roles are a visible heuristic, not an AST or dependency analysis. */
function isGenerated(path: string, name: string) {
  return (
    GENERATED_DIR.test(path) ||
    GENERATED_LOCK.test(name) ||
    GENERATED_NAME.test(name)
  );
}

/** Path-based roles are a visible heuristic, not an AST or dependency analysis. */
export function classifyModule(path: string): {
  role: ModuleRole;
  reason: string;
} {
  const p = path.replaceAll("\\", "/").toLowerCase();
  const name = p.split("/").at(-1) ?? p;
  // Machine-written output is checked first: a generated file inside src/ or tests/
  // is still generated, and should not compete with hand-written code for height.
  if (isGenerated(p, name))
    return { role: "generated", reason: "代码生成或锁定产物" };
  if (
    /(^|\/)(__tests__|tests?|specs?|fixtures?|testdata)(\/|$)/.test(p) ||
    /(^test_|[._-](test|spec)\.)/.test(name) ||
    /_test\.[^.]+$/.test(name)
  )
    return { role: "tests", reason: "测试或测试数据路径" };
  if (/(^|\/)(examples?|demos?|samples?|playground)(\/|$)/.test(p))
    return { role: "examples", reason: "示例或演示目录" };
  if (
    /(^|\/)(docs?|documentation)(\/|$)/.test(p) ||
    /\.(md|mdx|rst|adoc)$/.test(name) ||
    /^(readme|changes?|changelog|license|copying|authors|contributors)(\.|$)/.test(
      name,
    )
  )
    return {
      role: "docs",
      reason: "文档目录或文档文件名",
    };
  if (
    /(^|\/)(\.github|\.gitlab|\.devcontainer|scripts?|build|ci|config|configs?|deployment|docker|infra)(\/|$)/.test(
      p,
    ) ||
    /^(dockerfile|makefile|cmakelists\.txt|jenkinsfile|go\.(mod|work)|package(-lock)?\.json|cargo\.(toml|lock)|pyproject\.toml|requirements.*\.txt|setup\.(py|cfg)|tox\.ini|tsconfig.*\.json|.*\.config\.[^.]+|\.[^/]+)$/.test(
      name,
    ) ||
    /\.(ya?ml|toml|ini|lock|sh|bat|ps1)$/.test(name)
  )
    return {
      role: "infra",
      reason: "构建、配置或自动化路径",
    };
  if (
    /(^|\/)(assets?|static|public|media|data)(\/|$)/.test(p) ||
    /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp[34]|csv|json|xml)$/.test(name)
  )
    return { role: "assets", reason: "资产或数据目录" };
  if (
    /\.(rs|py|[cm]?[jt]sx?|go|java|kt|swift|c|cc|cpp|h|hpp|cs|rb|php|vue|svelte|ex|exs|scala|clj|dart|lua|css|scss|less|html?)$/.test(
      name,
    )
  )
    return {
      role: "source",
      reason: "辅助目录之外的源代码文件",
    };
  return { role: "unknown", reason: "没有可识别的模块职责约定" };
}

function moduleHeight(role: ModuleRole, lines: number, score: number) {
  const locHeight = buildingHeight(lines);
  if (role === "source")
    return Math.min(64, Math.max(2, locHeight * 0.9 + score * 0.29));
  if (role === "tests")
    return Math.min(15, Math.max(1.2, 1.2 + locHeight * 0.2 + score * 0.025));
  if (role === "docs")
    return Math.min(9, 1.2 + Math.log2(lines + 1) * 0.43 + score * 0.018);
  if (role === "examples")
    return Math.min(19, Math.max(1.4, 1.2 + locHeight * 0.4 + score * 0.06));
  if (role === "infra")
    return Math.min(12, Math.max(1.2, 1.2 + locHeight * 0.2 + score * 0.055));
  if (role === "generated")
    return Math.min(5.5, 0.9 + Math.log2(lines + 1) * 0.2);
  if (role === "assets")
    return Math.min(4.5, 0.9 + Math.log2(lines + 1) * 0.17);
  return Math.min(18, Math.max(1.1, locHeight * 0.45));
}

/** Only selected-commit aggregates and already-filtered road evidence enter here. */
export function buildUrbanAppearances(
  buildings: PlacedBuilding[],
  roads: CityRoad[],
  language: BuildingLanguage,
): Map<string, UrbanAppearance> {
  const active = buildings.filter((b) => b.status === "Active");
  const activeIds = new Set(active.map((b) => b.id));
  const neighbours = new Map<string, Set<string>>();
  for (const road of roads) {
    if (
      road.weight < 2 ||
      road.from === road.to ||
      !activeIds.has(road.from) ||
      !activeIds.has(road.to)
    )
      continue;
    for (const [id, other] of [
      [road.from, road.to],
      [road.to, road.from],
    ]) {
      if (!neighbours.has(id)) neighbours.set(id, new Set());
      neighbours.get(id)!.add(other);
    }
  }
  const maxima = active.reduce(
    (m, b) => ({
      changes: Math.max(m.changes, b.commits),
      contributors: Math.max(m.contributors, b.contributor_count ?? 0),
      neighbours: Math.max(m.neighbours, neighbours.get(b.id)?.size ?? 0),
    }),
    { changes: 10, contributors: 3, neighbours: 3 },
  );
  const normalized = (value: number, max: number) =>
    max > 0 ? Math.min(1, Math.log1p(value) / Math.log1p(max)) : 0;
  return new Map(
    buildings.map((b) => {
      const classification = classifyModule(b.path);
      const role = classification.role;
      const definition = moduleRoles[role];
      const seed = identitySeed(b.id);
      const variation = ((seed >>> 8) % 100) / 100;
      const signals = {
        changes: b.commits,
        contributors: b.contributor_count ?? 0,
        neighbours: neighbours.get(b.id)?.size ?? 0,
      };
      const prominence = Math.round(
        normalized(signals.changes, maxima.changes) * 45 +
          normalized(signals.contributors, maxima.contributors) * 20 +
          normalized(signals.neighbours, maxima.neighbours) * 35,
      );
      const tier =
        role === "source" && prominence >= 70
          ? "landmark"
          : prominence >= 45
            ? "anchor"
            : "local";
      const style =
        language === "loc"
          ? (["spiral", "gateway", "pagoda", "crown", "slab"] as const)[
              seed % 5
            ]
          : definition.styles[seed % definition.styles.length];
      return [
        b.id,
        {
          role,
          classification: classification.reason,
          language,
          style,
          height:
            language === "loc"
              ? buildingHeight(b.lines)
              : moduleHeight(role, b.lines, prominence),
          width: buildingFootprint(b.lines),
          color: definition.colors[(seed >>> 4) % definition.colors.length],
          accent: definition.accent,
          roof: definition.roofs[(seed >>> 11) % definition.roofs.length],
          metalness: definition.metalness,
          roughness: definition.roughness,
          prominence,
          tier,
          signals,
          facade: {
            pattern:
              language === "loc"
                ? "curtain"
                : definition.patterns[
                    (seed >>> 5) % definition.patterns.length
                  ],
            bayWidth: 0.3 + variation * 0.3 + (role === "docs" ? 0.3 : 0),
            floorHeight: definition.floorHeight * (0.85 + variation * 0.45),
            occupancy:
              0.27 +
              variation * 0.33 +
              Math.min(0.12, b.recent_activity * 0.018),
            warmth: definition.warmth,
            brightness:
              0.24 + variation * 0.2 + (tier === "landmark" ? 0.18 : 0),
            seed: seed % 10000,
            cool:
              role === "infra"
                ? "#b6a4ff"
                : role === "tests"
                  ? "#a1dec5"
                  : "#a1d6f5",
            warm: role === "docs" ? "#ffb65f" : "#ffd6a0",
          },
        } satisfies UrbanAppearance,
      ];
    }),
  );
}

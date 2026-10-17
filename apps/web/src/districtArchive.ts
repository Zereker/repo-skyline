import type { PlacedDistrict } from "./cityLayout";
import type { CityProject } from "./types";
import { classifyModule } from "./urbanIdentity";

export type DistrictStats = {
  path: string;
  files: number;
  lines: number;
  commits: number;
  contributors: number;
  roles: Map<string, number>;
  landmark?: string;
};

export type DistrictProfile = {
  summary: string;
  domains: Array<{ title: string; detail: string }>;
  districts: Record<string, string>;
};

/** Curated for the demo repository; generated from its own README and layout. */
export const PROJECT_PROFILES: Record<string, DistrictProfile> = {
  "models-proxy-go": {
    summary:
      "统一的 AI 模型代理网关：对外暴露 OpenAI / Anthropic / Gemini 等兼容协议，对内完成鉴权、预算治理、限流熔断、多上游调度、可观测计费与上游质量监测。",
    domains: [
      { title: "协议入口", detail: "一个地址兼容多家协议，客户端零改造接入" },
      {
        title: "鉴权与治理",
        detail: "API Key 鉴权、预算池、deny-by-default 访问控制",
      },
      { title: "多上游调度", detail: "同模型多上游，按健康度与评分选路" },
      { title: "可观测计费", detail: "每次调用落 access log 并聚合计费" },
      { title: "质量监测", detail: "错误归一化聚类、突增告警、掺水检测与探针" },
    ],
    districts: {
      "": "仓库根目录：构建入口、版本与项目约定文件",
      ".agents": "Agent 技能约定：评审、调用本仓库 API 的说明",
      ".claude": "Claude 技能与本地约定",
      ".codex": "Codex 本地配置",
      ".codex-artifacts": "Codex 生成的截图与产物",
      ".gitignore": "Git 忽略规则",
      ".golangci.yml": "Go 静态检查规则",
      ".gitlab-ci.yml": "GitLab CI 流水线",
      ".tekton": "Tekton 流水线配置",
      ".vscode": "编辑器调试与设置",
      "agent-skills": "面向调用方的 Agent 技能与参考资料",
      "apps/l7-gateway": "七层网关配置与脚本",
      "bot-skills": "面向运维的机器人技能（报表、定性判定）",
      cmd: "六个常驻服务与一次性 CLI 的进程入口",
      "cmd/core":
        "主代理服务：HTTP 8089 / metrics 9090，承载 relay / desk / tools 路由",
      "cmd/event_consumer": "消费 access log 事件并投影为计费与记录",
      "cmd/health_monitor": "周期性探活上游供应商，维护可用性状态",
      "cmd/model_selector_worker": "周期性生成资源池供应商评分排行",
      "cmd/provider_error_worker": "消费上游错误事件，归一化、聚类与突增告警",
      "cmd/request_record_export_worker":
        "多实例安全地执行请求记录导出并上传对象存储",
      configs: "各服务配置样例（真实配置已 gitignore）",
      container: "依赖注入容器装配",
      deploy: "各服务 Dockerfile、website 前端与 grafana 部署",
      docs: "设计文档与实施计划",
      internal: "核心业务代码：网关、业务服务与可复用组件",
      "internal/apps": "各服务的应用层装配",
      "internal/apps/gateway": "HTTP 路由、handler 与 API 编排层",
      "internal/apps/gateway/handlers/desk":
        "管理端 API：统计、配置、预算池与计费",
      "internal/apps/gateway/handlers/relay":
        "AI 代理转发：chat、anthropic、gemini、video、audio",
      "internal/apps/gateway/route": "路由集中注册",
      "internal/pkg": "可复用的领域组件与基础设施",
      "internal/pkg/bot": "各供应商适配器（实现 IBaseBot）",
      "internal/pkg/components": "模型与配置查找、限流、缓存、预算池",
      "internal/pkg/infra": "配置装载、DB / Redis 初始化与 GORM 模型",
      "internal/pkg/infra/dal/model":
        "数据库表模型（*.gen.go 由代码生成，勿手改）",
      "internal/pkg/models": "各 provider / feature 的请求响应结构体",
      "internal/pkg/observability": "access log 累积器、错误事件流与聚类",
      "internal/pkg/prom": "Prometheus 指标 helper",
      "internal/pkg/runtime": "业务运行时：服务接口、治理与编排",
      "internal/pkg/runtime/governance": "访问控制、限流熔断、软限流与配额引擎",
      "internal/pkg/runtime/service": "业务服务接口与实现",
      openspec: "变更提案与规格说明",
      scripts: "运维脚本、数据库迁移与接口测试集合",
      "scripts/db/migrations": "数据库迁移脚本",
      tester: "接口与端到端测试",
      web: "管理后台前端（Next.js）",
      "web/src/app": "Next.js 页面与路由",
      "web/src/components": "管理端 UI 组件",
      "web/src/hooks": "前端状态与副作用封装",
      "web/src/lib": "前端工具与 API 客户端",
    },
  },
};

const PATH_PURPOSE: Array<[RegExp, string]> = [
  [/handlers?\/relay/, "模型代理转发入口"],
  [/handlers?\/desk/, "管理端 API"],
  [/gateway\/route|^route\.go|routes?\.go/, "路由注册"],
  [/governance|ratelimit|circuit|quota/, "访问控制与限流熔断"],
  [/runtime\/service/, "业务服务层"],
  [/\bbot\b/, "上游供应商适配"],
  [/infra\/dal|\bdal\b|migrations?/, "数据访问与迁移"],
  [/\bmodels?\b|\.gen\.go/, "协议与数据模型"],
  [/observability|accesslog|metrics|\bprom\b/, "日志、指标与可观测"],
  [/components/, "界面组件"],
  [/\bhooks\b/, "前端状态与副作用"],
  [/\blib\b/, "工具库与 API 客户端"],
  [/\.github|\.gitlab|\.tekton|ci\b/, "持续集成流水线"],
  [/scripts?/, "运维与工具脚本"],
  [/\bdocs?\b|\.mdx?$/, "设计与说明文档"],
  [/openspec|specs?\//, "变更提案与规格"],
  [/tests?|tester|__tests__/, "测试"],
  [/configs?|\.ya?ml$|\.toml$/, "配置"],
  [/deploy|docker/i, "部署产物"],
  [/skills?/, "技能约定"],
  [/examples?|demos?/, "示例"],
];

const ROLE_LABEL: Record<string, string> = {
  source: "源代码",
  tests: "测试",
  docs: "文档",
  examples: "示例",
  infra: "基础设施",
  assets: "资产与数据",
  unknown: "其他文件",
};

export function districtStats(district: PlacedDistrict): DistrictStats {
  const roles = new Map<string, number>();
  let lines = 0;
  let commits = 0;
  const contributors = new Set<string>();
  let landmark: string | undefined;
  let landmarkLines = -1;
  for (const building of district.buildings) {
    if (building.status !== "Active") continue;
    lines += building.lines;
    commits = Math.max(commits, building.commits);
    if (building.primary_author) contributors.add(building.primary_author);
    roles.set(
      classifyModule(building.path).role,
      (roles.get(classifyModule(building.path).role) ?? 0) + 1,
    );
    if (building.lines > landmarkLines) {
      landmarkLines = building.lines;
      landmark = building.path;
    }
  }
  return {
    path: district.path,
    files: district.buildings.filter((b) => b.status === "Active").length,
    lines,
    commits,
    contributors: contributors.size,
    roles,
    landmark,
  };
}

export function buildDistrictArchive(
  city: CityProject,
  districts: PlacedDistrict[],
): Map<string, DistrictStats> {
  return new Map(
    districts.map((district) => [district.path, districtStats(district)]),
  );
}

function genericPurpose(path: string, stats: DistrictStats) {
  for (const [pattern, purpose] of PATH_PURPOSE)
    if (pattern.test(path)) return purpose;
  const dominant = [...stats.roles].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (dominant === "tests") return "测试代码";
  if (dominant === "docs") return "文档";
  if (dominant === "assets") return "资产与数据";
  return "业务代码";
}

export type DistrictNote = {
  purpose: string;
  detail: string;
  source: "profile" | "inferred";
};

export function describeDistrict(
  repository: string,
  stats: DistrictStats,
): DistrictNote {
  const profile = PROJECT_PROFILES[repository];
  const curated = profile?.districts[stats.path];
  if (curated) return { purpose: curated, detail: "", source: "profile" };
  const purpose = genericPurpose(stats.path, stats);
  const roles = [...stats.roles]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([role, count]) => `${ROLE_LABEL[role] ?? role} ${count}`)
    .join(" · ");
  return {
    purpose,
    detail: [roles, stats.lines ? `${stats.lines.toLocaleString()} 行` : ""]
      .filter(Boolean)
      .join(" · "),
    source: "inferred",
  };
}

export type CityNote = {
  summary: string;
  domains: Array<{ title: string; detail: string }>;
};

export function describeCity(
  city: CityProject,
  stats: DistrictStats[],
): CityNote {
  const profile = PROJECT_PROFILES[city.repository];
  const files = stats.reduce((sum, item) => sum + item.files, 0);
  const lines = stats.reduce((sum, item) => sum + item.lines, 0);
  const generated = `由 ${city.repository} 的 Git 历史生成：${city.timeline.length} 次提交、${files} 个文件、${lines.toLocaleString()} 行代码。街区对应目录，建筑对应文件，高度由代码行数与历史关注度共同决定。`;
  if (profile)
    return {
      summary: `${profile.summary}\n${generated}`,
      domains: profile.domains,
    };
  return { summary: generated, domains: [] };
}

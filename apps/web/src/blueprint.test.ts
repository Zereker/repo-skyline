import { describe, expect, it } from "vitest";
import {
  buildBlueprintLayout,
  applyBlueprintLandmarks,
  projectBuildingName,
} from "./blueprintLayout";
import { BLUEPRINT_SUPPORT_ZONE, blueprintZoneForPath } from "./blueprint";
import type { CityProject } from "./types";
import { buildUrbanAppearances } from "./urbanIdentity";
import { buildingHeight } from "./buildingScale";

function city(): CityProject {
  return {
    repository: "blueprint-fixture",
    timeline: [
      {
        id: "c0",
        timestamp: 100,
        author: "alice",
        message: "initial",
        changes: [],
        releases: [],
      },
      {
        id: "c1",
        timestamp: 200,
        author: "bob",
        message: "move",
        changes: [],
        releases: [],
      },
    ],
    releases: [],
    milestones: [],
    districts: [
      {
        path: "src",
        buildings: [
          {
            id: "types",
            path: "apps/web/src/types.ts",
            lines: 100,
            commits: 3,
            created_at: 100,
            history: [
              {
                commit_id: "c0",
                commit_index: 0,
                timestamp: 100,
                path: "apps/web/src/types.ts",
                lines: 100,
                additions: 100,
                author_id: "alice",
                kind: "added",
              },
            ],
          },
          {
            id: "app",
            path: "apps/web/src/App.tsx",
            lines: 900,
            commits: 3,
            created_at: 100,
            history: [
              {
                commit_id: "c0",
                commit_index: 0,
                timestamp: 100,
                path: "apps/web/src/App.tsx",
                lines: 900,
                additions: 900,
                author_id: "alice",
                kind: "added",
              },
            ],
          },
          {
            id: "moved",
            path: "crates/git-analyzer/src/notes.rs",
            lines: 400,
            commits: 2,
            created_at: 100,
            history: [
              {
                commit_id: "c0",
                commit_index: 0,
                timestamp: 100,
                path: "src/notes.txt",
                lines: 380,
                additions: 380,
                author_id: "alice",
                kind: "added",
              },
              {
                commit_id: "c1",
                commit_index: 1,
                timestamp: 200,
                path: "crates/git-analyzer/src/notes.rs",
                lines: 400,
                additions: 20,
                author_id: "bob",
                kind: "renamed",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("blueprint city layout", () => {
  it("regroups real files into the plan's functional zones", () => {
    const layout = buildBlueprintLayout(city());
    const zones = layout.districts.map((district) => district.path);
    expect(zones).toContain("契约广场");
    expect(zones).toContain("状态中枢");
    expect(zones).toContain(BLUEPRINT_SUPPORT_ZONE);
    expect(blueprintZoneForPath("apps/web/src/types.ts")).toBe("契约广场");
    expect(blueprintZoneForPath("unknown/file.xyz")).toBe(
      BLUEPRINT_SUPPORT_ZONE,
    );
    const contract = layout.districts.find(
      (district) => district.path === "契约广场",
    )!;
    expect(contract.buildings.map((building) => building.path)).toContain(
      "apps/web/src/types.ts",
    );
  });

  it("keeps historical lots in their original zone after a move", () => {
    const layout = buildBlueprintLayout(city());
    const support = layout.districts.find(
      (district) => district.path === BLUEPRINT_SUPPORT_ZONE,
    )!;
    const docs = layout.districts.find(
      (district) => district.path === "历史数据区",
    )!;
    expect(
      [...support.slots.keys()].some((key) => key.endsWith("src/notes.txt")),
    ).toBe(true);
    expect(
      [...support.slots.keys()].some((key) =>
        key.endsWith("crates/git-analyzer/src/notes.rs"),
      ),
    ).toBe(false);
    expect(
      [...docs.slots.keys()].some((key) =>
        key.endsWith("crates/git-analyzer/src/notes.rs"),
      ),
    ).toBe(true);
  });

  it("makes the shared contract tower the tallest planned landmark", () => {
    const source = city();
    const layout = buildBlueprintLayout(source);
    const buildings = layout.districts.flatMap(
      (district) => district.buildings,
    );
    const appearances = applyBlueprintLandmarks(
      buildUrbanAppearances(buildings, [], "modules"),
      layout.landmarks,
      new Map(
        buildings.map((building) => [
          building.id,
          blueprintZoneForPath(building.path),
        ]),
      ),
      new Map([
        ["契约广场", "#d9b273"],
        ["状态中枢", "#7d8fc2"],
        ["配套文件区", "#6b7f8f"],
      ]),
    );
    const contract = appearances.get("types")!;
    const app = appearances.get("app")!;
    const moved = appearances.get("moved")!;
    expect(contract.style).toBe("spiral");
    expect(contract.tier).toBe("landmark");
    expect(contract.height).toBeGreaterThan(app.height);
    expect(contract.height).toBeGreaterThan(moved.height);
    expect(contract.height).toBeGreaterThan(buildingHeight(100));
  });

  it("is deterministic for the same repository", () => {
    const first = buildBlueprintLayout(city());
    const second = buildBlueprintLayout(city());
    expect(first.districts.map((district) => district.path)).toEqual(
      second.districts.map((district) => district.path),
    );
    expect(first.districts.map((district) => [district.x, district.z])).toEqual(
      second.districts.map((district) => [district.x, district.z]),
    );
    expect([...first.landmarks.keys()]).toEqual([...second.landmarks.keys()]);
  });
});

describe("project-derived building names", () => {
  it("names landmarks from the repository rather than the blueprint", () => {
    const layout = buildBlueprintLayout(city());
    const names = [...layout.landmarks.values()].map(
      (landmark) => landmark.name,
    );
    expect(names).toContain("types.ts");
    expect(names).toContain("git-analyzer");
    expect(names).not.toContain("共享契约塔");
    expect(names).not.toContain("Git 历史采集港");
  });

  it("uses the crate for Rust paths and the filename for web modules", () => {
    expect(projectBuildingName("crates/git-analyzer/src/lib.rs")).toBe(
      "git-analyzer",
    );
    expect(projectBuildingName("apps/web/src/types.ts")).toBe("types.ts");
    expect(projectBuildingName("README.md")).toBe("README.md");
  });
});

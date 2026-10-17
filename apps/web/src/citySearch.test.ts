import { describe, expect, it } from "vitest";
import type { PlacedBuilding } from "./cityLayout";
import { matchesQuery, searchBuildings, searchDistricts } from "./citySearch";

function building(path: string, lines: number, commits = 10): PlacedBuilding {
  return {
    id: path,
    path,
    lines,
    commits,
    created_at: 100,
    recent_activity: 0,
    status: "Active",
    district: path.split("/").slice(0, -1).join("/") || "_root",
    x: 0,
    z: 0,
  };
}

describe("city search", () => {
  const buildings = [
    building("internal/apps/gateway/route/route.go", 1808, 267),
    building("internal/pkg/bot/openai.go", 240, 40),
    building("web/src/components/api-keys-view.tsx", 300, 60),
    building("docs/api.md", 900, 13),
  ];

  it("matches path fragments case-insensitively", () => {
    expect(matchesQuery("internal/App.tsx", "APP")).toBe(true);
    expect(matchesQuery("internal/App.tsx", "route")).toBe(false);
    expect(matchesQuery("internal/App.tsx", "  ")).toBe(false);
  });

  it("ranks matches by size then commits and limits the list", () => {
    expect(searchBuildings(buildings, "route").map((b) => b.path)).toEqual([
      "internal/apps/gateway/route/route.go",
    ]);
    expect(searchBuildings(buildings, ".go").map((b) => b.path)).toEqual([
      "internal/apps/gateway/route/route.go",
      "internal/pkg/bot/openai.go",
    ]);
    expect(searchBuildings(buildings, ".go", 1)).toHaveLength(1);
    expect(searchBuildings(buildings, "zzz")).toEqual([]);
    expect(searchBuildings(buildings, "  ")).toEqual([]);
  });

  it("collects districts by their own path or their buildings", () => {
    const districts = [
      { path: "docs", buildings: [building("docs/api.md", 900, 13)] },
      {
        path: "web/src/components",
        buildings: [building("web/src/components/api-keys-view.tsx", 300, 60)],
      },
    ];
    expect([...searchDistricts(districts, "api")]).toEqual([
      "docs",
      "web/src/components",
    ]);
    expect([...searchDistricts(districts, "docs")]).toEqual(["docs"]);
    expect([...searchDistricts(districts, "")]).toEqual([]);
  });

  it("ignores demolished buildings", () => {
    const gone = {
      ...building("old/route.go", 999),
      status: "Demolished" as const,
    };
    expect(searchBuildings([...buildings, gone], "route")).toHaveLength(1);
  });
});

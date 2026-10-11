import { describe, it, expect } from "vitest";
import { activeDistrictsAt, layoutCity } from "./cityLayout";
import { parseCity } from "./importCity";
import { evidenceAt } from "./analysis";
import type { CityProject, FileSnapshot } from "./types";
function project(): CityProject {
  const timestamps = [100, 200, 300, 400, 500];
  const paths = ["src/a.ts", "src/a.ts", "lib/a.ts", "lib/a.ts", "lib/a.ts"];
  const kinds = [
    "added",
    "modified",
    "renamed",
    "modified",
    "deleted",
  ] as const;
  const history: FileSnapshot[] = timestamps.map((timestamp, i) => ({
    commit_id: `c${i}`,
    commit_index: i,
    timestamp,
    path: paths[i],
    kind: kinds[i],
    author_id: i === 0 ? "alice" : "bob",
    lines: i === 4 ? 0 : 10 + i,
    additions: i === 0 ? 10 : 1,
    deletions: i === 4 ? 13 : 0,
  }));
  return {
    repository: "fixture",
    districts: [
      {
        path: "lib",
        buildings: [
          {
            id: "file",
            path: "lib/a.ts",
            lines: 0,
            commits: 5,
            created_at: 100,
            history,
          },
        ],
      },
    ],
    timeline: timestamps.map((timestamp, i) => ({
      id: `c${i}`,
      timestamp,
      author: history[i].author_id,
      message: i === 3 ? "fix: regression [ai-assisted]" : "update",
      changes: [{ path: paths[i], kind: kinds[i] }],
      releases: [],
    })),
    releases: [],
    milestones: [],
    roads: [],
  };
}
describe("history replay", () => {
  it("uses cumulative ownership and statistics without future data", () => {
    const city = project();
    const layout = layoutCity(city);
    const first = activeDistrictsAt(layout, 0, 100)[0].buildings[0];
    const third = activeDistrictsAt(layout, 3, 400)[0].buildings[0];
    expect(first.commits).toBe(1);
    expect(first.additions).toBe(10);
    expect(first.contributor_count).toBe(1);
    expect(third.primary_author).toBe("alice");
    expect(third.commits).toBe(4);
    expect(third.last_modified_at).toBe(400);
    expect(first.deleted_at).toBeNull();
  });
  it("keeps unique stable positions across seeks and exact rename origins", () => {
    const city = project();
    const second = structuredClone(city.districts[0].buildings[0]);
    second.id = "other";
    city.districts[0].buildings.push(second);
    const layout = layoutCity(city);
    const before = activeDistrictsAt(layout, 1, 200).flatMap(
      (d) => d.buildings,
    );
    expect(new Set(before.map((b) => `${b.x},${b.z}`)).size).toBe(2);
    const renamed = activeDistrictsAt(layout, 2, 300).flatMap(
      (d) => d.buildings,
    );
    expect(renamed[0].district).toBe("lib");
    expect(renamed[0].from_x).toBe(before[0].x);
    expect(renamed[0].from_z).toBe(before[0].z);
    expect(
      activeDistrictsAt(layout, 1, 200).flatMap((d) => d.buildings),
    ).toEqual(before);
    expect(
      activeDistrictsAt(layout, 3, 400)[0].buildings[0].from_x,
    ).toBeUndefined();
  });
  it("keeps demolition for one commit and derives only past evidence", () => {
    const city = project();
    const layout = layoutCity(city);
    expect(activeDistrictsAt(layout, 4, 500)[0].buildings[0].status).toBe(
      "Demolished",
    );
    expect(activeDistrictsAt(layout, 5, 600)).toEqual([]);
    expect(
      evidenceAt(city, activeDistrictsAt(layout, 2, 300), 2)[0].fixes,
    ).toBe(0);
    const evidence = evidenceAt(city, activeDistrictsAt(layout, 3, 400), 3)[0];
    expect(evidence.fixes).toBe(1);
    expect(evidence.ai).toBe(1);
    expect(evidence.human).toBe(0);
    expect(evidence.unknown).toBe(3);
    expect(evidence.moves).toBe(1);
  });
  it("allocates non-overlapping districts even with hundreds of buildings", () => {
    const city = project();
    const b = city.districts[0].buildings[0];
    city.districts[0].buildings = Array.from({ length: 500 }, (_, i) => ({
      ...b,
      id: `file-${i}`,
      path: `lib/f${i}`,
      history: [],
    }));
    city.districts.push({
      path: "other",
      buildings: [{ ...b, id: "extra", path: "other/a", history: [] }],
    });
    const [left, right] = layoutCity(city);
    expect(left.x + left.width / 2).toBeLessThan(right.x - right.width / 2);
  });
});
describe("city import", () => {
  it("accepts generated data and fills optional collections", () => {
    const city = project();
    expect(parseCity(city).repository).toBe("fixture");
    const minimal = { repository: "empty", districts: [], timeline: [] };
    expect(parseCity(minimal).releases).toEqual([]);
  });
  it("rejects bad indices, invalid metrics and duplicate identities", () => {
    const city = project();
    city.districts[0].buildings[0].history![0].commit_index = 99;
    expect(() => parseCity(city)).toThrow();
    const nan = project();
    nan.districts[0].buildings[0].lines = NaN;
    expect(() => parseCity(nan)).toThrow();
    const dup = project();
    dup.districts[0].buildings.push(dup.districts[0].buildings[0]);
    expect(() => parseCity(dup)).toThrow();
  });
});

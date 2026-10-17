import { describe, expect, it } from "vitest";
import {
  activeDistrictsAt,
  layoutCity,
  type PlacedBuilding,
} from "./cityLayout";
import { buildingHeight } from "./buildingScale";
import { buildUrbanAppearances, classifyModule } from "./urbanIdentity";
import type { CityProject } from "./types";

function file(
  id: string,
  path: string,
  overrides: Partial<PlacedBuilding> = {},
): PlacedBuilding {
  return {
    id,
    path,
    lines: 100,
    commits: 10,
    contributor_count: 2,
    created_at: 100,
    recent_activity: 0,
    status: "Active",
    district: "src",
    x: 0,
    z: 0,
    ...overrides,
  };
}

describe("module identity", () => {
  it("requires more than an initial commit to become a code landmark", () => {
    const appearance = buildUrbanAppearances(
      [file("initial", "src/main.py", { commits: 1, contributor_count: 1 })],
      [],
      "modules",
    ).get("initial")!;
    expect(appearance.tier).toBe("local");
    expect(appearance.prominence).toBeLessThan(30);
  });
  it("uses supporting-path conventions before a source extension", () => {
    for (const [path, role] of [
      ["src/flask/app.py", "source"],
      ["tests/test_basic.py", "tests"],
      ["examples/tutorial/tests/test_auth.py", "tests"],
      ["src/foo.test.ts", "tests"],
      ["docs/conf.py", "docs"],
      ["CHANGES.rst", "docs"],
      ["examples/tutorial/app.py", "examples"],
      [".github/workflows/ci.yml", "infra"],
      ["scripts/release.py", "infra"],
      ["pyproject.toml", "infra"],
      ["public/logo.svg", "assets"],
      ["strange.blob", "unknown"],
    ])
      expect(classifyModule(path).role).toBe(role);
  });

  it("distinguishes a highly connected code file from a large but quiet document", () => {
    const files = [
      file("app", "src/app.py", {
        lines: 1500,
        commits: 450,
        contributor_count: 33,
      }),
      file("doc", "CHANGES.rst", {
        lines: 100000,
        commits: 1,
        contributor_count: 1,
      }),
      file("test", "tests/test_app.py"),
    ];
    const roads = [{ from: "app", to: "test", weight: 5 }];
    const modules = buildUrbanAppearances(files, roads, "modules");
    expect(modules.get("app")!.prominence).toBeGreaterThan(
      modules.get("doc")!.prominence,
    );
    expect(modules.get("app")!.tier).toBe("landmark");
    expect(modules.get("app")!.height).toBeGreaterThan(
      modules.get("doc")!.height,
    );
    expect(modules.get("doc")!.height).toBeLessThanOrEqual(9);
    expect(modules.get("test")!.style).not.toBe(modules.get("app")!.style);
    const loc = buildUrbanAppearances(files, roads, "loc");
    expect(loc.get("doc")!.height).toBe(buildingHeight(100000));
    expect(loc.get("doc")!.height).toBeGreaterThan(loc.get("app")!.height);
  });

  it("counts unique active co-change neighbours and excludes weak or absent endpoints", () => {
    const files = [
      file("a", "src/a.ts"),
      file("b", "src/b.ts"),
      file("gone", "src/gone.ts", { status: "Demolished" }),
    ];
    const profiles = buildUrbanAppearances(
      files,
      [
        { from: "a", to: "b", weight: 3 },
        { from: "b", to: "a", weight: 8 },
        { from: "a", to: "gone", weight: 99 },
        { from: "a", to: "missing", weight: 99 },
        { from: "a", to: "a", weight: 99 },
      ],
      "modules",
    );
    expect(profiles.get("a")!.signals.neighbours).toBe(1);
    expect(profiles.get("gone")!.signals.neighbours).toBe(0);
    expect(
      buildUrbanAppearances(
        files,
        [{ from: "a", to: "b", weight: 1 }],
        "modules",
      ).get("a")!.signals.neighbours,
    ).toBe(0);
  });

  it("keeps identities deterministic while varying facades within the same module", () => {
    const files = Array.from({ length: 20 }, (_, i) =>
      file(`id-${i}`, `src/file-${i}.py`),
    );
    const first = buildUrbanAppearances(files, [], "modules");
    const reordered = buildUrbanAppearances(
      [...files].reverse(),
      [],
      "modules",
    );
    for (const b of files) expect(first.get(b.id)).toEqual(reordered.get(b.id));
    expect(
      new Set([...first.values()].map((p) => p.color)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set([...first.values()].map((p) => p.style)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set([...first.values()].map((p) => p.facade.floorHeight)).size,
    ).toBeGreaterThan(1);
  });

  it("does not let future file metrics or a future rename alter past prominence", () => {
    const city: CityProject = {
      repository: "history",
      releases: [],
      milestones: [],
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
          message: "rename",
          changes: [],
          releases: [],
        },
      ],
      districts: [
        {
          path: "src",
          buildings: [
            {
              id: "identity",
              path: "src/a.py",
              lines: 100,
              commits: 1,
              created_at: 100,
              history: [
                {
                  commit_id: "c0",
                  commit_index: 0,
                  timestamp: 100,
                  path: "src/a.py",
                  lines: 100,
                  additions: 100,
                  author_id: "alice",
                  kind: "added",
                },
              ],
            },
          ],
        },
      ],
    };
    const at = (project: CityProject, index: number) =>
      buildUrbanAppearances(
        activeDistrictsAt(
          layoutCity(project),
          index,
          project.timeline[index].timestamp,
        ).flatMap((d) => d.buildings),
        [],
        "modules",
      ).get("identity")!;
    const before = at(city, 0);
    const future = structuredClone(city);
    const b = future.districts[0].buildings[0];
    b.path = "docs/a.md";
    b.lines = 90000;
    b.commits = 999;
    b.contributor_count = 80;
    b.history!.push({
      commit_id: "c1",
      commit_index: 1,
      timestamp: 200,
      path: "docs/a.md",
      lines: 90000,
      additions: 89900,
      author_id: "bob",
      kind: "renamed",
    });
    expect(at(future, 0)).toEqual(before);
    expect(at(future, 1).role).toBe("docs");
    expect(at(future, 1).signals.changes).toBe(2);
  });
});

describe("generated code classification", () => {
  it("keeps machine-written output out of the source role", () => {
    const cases: Array<[string, string]> = [
      ["internal/pkg/infra/dal/models/access_log_new.gen.go", "generated"],
      ["api/service.pb.go", "generated"],
      ["api/service.pb.gw.go", "generated"],
      ["src/schema.g.dart", "generated"],
      ["web/dist/assets/index-abc123.min.js", "generated"],
      ["web/.next/server/chunks/main.js", "generated"],
      ["go.sum", "generated"],
      ["web/package-lock.json", "generated"],
      ["Cargo.lock", "generated"],
      ["src/__snapshots__/button.snap", "generated"],
      ["vendor/github.com/x/y/y.go", "generated"],
      ["internal/gateway/route.go", "source"],
      ["src/schema.ts", "source"],
      ["go.mod", "infra"],
      ["web/src/components/view.tsx", "source"],
    ];
    for (const [path, role] of cases)
      expect([path, classifyModule(path).role]).toEqual([path, role]);
  });

  it("caps generated buildings well below hand-written code of the same size", () => {
    const files = [
      file("gen", "internal/models/access_log.gen.go", { lines: 9000 }),
      file("src", "internal/gateway/route.go", { lines: 9000 }),
    ];
    const profiles = buildUrbanAppearances(files, [], "modules");
    const generated = profiles.get("gen")!;
    const source = profiles.get("src")!;
    expect(generated.role).toBe("generated");
    expect(generated.height).toBeLessThanOrEqual(5.5);
    expect(generated.height).toBeLessThan(source.height * 0.2);
    expect(generated.style === "slab" || generated.style === "pavilion").toBe(
      true,
    );
  });
});

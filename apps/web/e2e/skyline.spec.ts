import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const generated = JSON.parse(
  readFileSync(new URL("../public/city.json", import.meta.url), "utf8"),
);
test("real Git city supports views, contributor inspection, playback and story", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "贡献者领地", exact: true }).click();
  await page.locator(".territory-row").first().click();
  await expect(page.getByText("贡献者详情", { exact: true })).toBeVisible();
  await page.locator(".contributor-detail button").first().click();
  await expect(page.locator(".inspector .path")).toBeVisible();
  await page.getByRole("button", { name: "活跃热力", exact: true }).click();
  await expect(page.getByText(/截至本次提交前 30 天内的变更/)).toBeVisible();
  for (const mode of ["ghost", "risk", "bugs", "architecture", "provenance"]) {
    await page.getByLabel("分析视图").selectOption(mode);
    await expect(page.getByLabel("分析视图")).toHaveValue(mode);
    await expect(page.locator(".analysis-panel")).toBeVisible();
  }
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "播放故事", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "停止故事", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止故事", exact: true }).click();
  await page.getByRole("button", { name: "全览城市", exact: true }).click();
  await page.screenshot({
    path: "test-results/skyline-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("import is validated, replaces the city, seeks and stops at the end", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  await page.getByLabel("打开城市 JSON").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"districts":[]}'),
  });
  await expect(page.getByRole("alert")).toContainText("城市 JSON 无效");
  await expect(page.locator("h1")).toHaveText(generated.repository);
  const small = {
    ...generated,
    repository: "Imported repository",
    timeline: generated.timeline.slice(0, 2),
    districts: [],
    roads: [],
    milestones: [],
    releases: [],
  };
  await page.getByLabel("打开城市 JSON").setInputFiles({
    name: "city.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(small)),
  });
  await expect(page.locator("h1")).toHaveText("Imported repository");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("播放速度").selectOption("5");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("提交时间线")).toHaveValue("1");
  await page.getByLabel("提交时间线").fill("0");
  await expect(page.getByLabel("提交时间线")).toHaveValue("0");
});
test("missing generated JSON shows sample, mobile controls remain reachable", async ({
  page,
}) => {
  await page.route("**/city.json", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("示例数据", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "全览城市", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/skyline-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("waterfront camera, immersive panels, labels and chapter controls work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "俯视", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "俯视", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "天际线", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "天际线", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "沉浸模式", exact: true }).click();
  await expect(page.locator(".workspace > .panel").first()).toBeHidden();
  await page.getByRole("button", { name: "显示面板", exact: true }).click();
  await expect(page.locator(".workspace > .panel").first()).toBeVisible();
  await expect(page.locator(".story-steps")).toBeHidden();
  await page.getByRole("button", { name: "展开章节", exact: true }).click();
  await expect(page.locator(".story-steps")).toBeVisible();
  await page.getByRole("button", { name: "收起章节", exact: true }).click();
  await page.getByText("设置", { exact: true }).click();
  await page.getByLabel("街区标签", { exact: true }).check();
  await expect(page.locator(".landmark-label").first()).toBeAttached();
  await page.getByLabel("街区标签", { exact: true }).uncheck();
  await expect(page.locator(".landmark-label")).toHaveCount(0);
});

test("module language explains a selected file and can switch to LOC towers", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  await expect(page.getByLabel("建筑语言", { exact: true })).toHaveValue(
    "modules",
  );
  await expect(page.getByLabel("蓝图片区图例")).toContainText("契约广场");
  await page.locator(".featured-code button").first().click();
  await expect(page.locator(".urban-identity")).toHaveAttribute(
    "data-role",
    "source",
  );
  const path = await page.locator(".inspector .path").innerText();
  await page.getByText("为什么是这样一栋建筑？", { exact: true }).click();
  await expect(page.locator(".identity-explanation")).toContainText(
    "个观察到的共改邻居",
  );
  await page.getByText("设置", { exact: true }).click();
  await page.getByLabel("城市布局").selectOption("directories");
  await expect(page.getByLabel("模块职责图例")).toContainText("源代码");
  await page.getByLabel("建筑语言", { exact: true }).selectOption("loc");
  await expect(page.getByLabel("模块职责图例")).toHaveCount(0);
  await expect(page.locator(".inspector .path")).toHaveText(path);
  await page.getByLabel("建筑语言", { exact: true }).selectOption("modules");
  await expect(page.getByLabel("模块职责图例")).toBeVisible();
});

test("large real Git fixture retains module families in compact rendering", async ({
  page,
}) => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const root = mkdtempSync(join(tmpdir(), "skyline-browser-"));
  try {
    const git = (args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
    git(["init", "-b", "main"]);
    git(["config", "user.name", "Fixture Builder"]);
    git(["config", "user.email", "fixture@example.test"]);
    git(["config", "commit.gpgsign", "false"]);
    const families = [
      ["src", "py"],
      ["tests", "py"],
      ["docs", "md"],
      ["examples", "js"],
    ];
    for (const [directory] of families) mkdirSync(join(root, directory));
    for (let i = 0; i < 500; i++) {
      const [directory, extension] = families[i % families.length];
      writeFileSync(
        join(root, directory, `file-${i}.${extension}`),
        "line one\nline two\n",
      );
    }
    git(["add", "-A"]);
    git(["commit", "-m", "create 500 buildings"]);
    git(["tag", "v1.0"]);
    const output = join(root, "city.json");
    execFileSync(
      resolve("../../target/debug/repo-skyline"),
      ["analyze", root, "-o", output],
      { stdio: "pipe" },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
    await page.getByLabel("打开城市 JSON").setInputFiles(output);
    await expect(page.getByText("500 栋建筑", { exact: true })).toBeVisible();
    for (const label of ["源代码", "测试", "文档", "示例"]) {
      await expect(page.getByLabel("模块职责图例")).toContainText(label);
    }
    await page.getByRole("button", { name: "贡献者领地", exact: true }).click();
    await page.locator(".territory-row").first().click();
    await page.locator(".contributor-detail button").first().click();
    await expect(page.locator(".inspector .path")).toBeVisible();
    await expect(
      page.locator(".release-badges").getByText("版本 v1.0", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "全览城市", exact: true }).click();
    await page.screenshot({
      path: "test-results/skyline-large.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const focusCity = {
  repository: "focus-fixture",
  districts: [
    {
      path: "internal",
      buildings: [
        {
          id: "route",
          path: "internal/gateway/route/route.go",
          lines: 1808,
          commits: 267,
          created_at: 100,
          history: [
            {
              commit_id: "c0",
              commit_index: 0,
              timestamp: 100,
              path: "internal/gateway/route/route.go",
              lines: 1808,
              additions: 1808,
              author_id: "alice",
              kind: "added",
            },
          ],
        },
        {
          id: "shared",
          path: "internal/pkg/shared/ctx.go",
          lines: 240,
          commits: 40,
          created_at: 100,
          history: [
            {
              commit_id: "c0",
              commit_index: 0,
              timestamp: 100,
              path: "internal/pkg/shared/ctx.go",
              lines: 240,
              additions: 240,
              author_id: "alice",
              kind: "added",
            },
          ],
        },
      ],
    },
    {
      path: "web/src/components",
      buildings: [
        {
          id: "view",
          path: "web/src/components/api-keys-view.tsx",
          lines: 300,
          commits: 60,
          created_at: 100,
          history: [
            {
              commit_id: "c0",
              commit_index: 0,
              timestamp: 100,
              path: "web/src/components/api-keys-view.tsx",
              lines: 300,
              additions: 300,
              author_id: "bob",
              kind: "added",
            },
          ],
        },
      ],
    },
  ],
  timeline: [
    {
      id: "c0",
      timestamp: 100,
      author: "alice",
      message: "initial",
      changes: [],
      releases: [],
    },
  ],
  contributors: [],
  releases: [],
  milestones: [],
  roads: [],
};

test("district focus isolates one district and restores the whole city", async ({
  page,
}) => {
  await page.route("**/city.json", (route) =>
    route.fulfill({ json: focusCity }),
  );
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  const row = page
    .locator(".district-row")
    .filter({ hasText: "internal" })
    .first();
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".focus-banner")).toContainText(
    "正在聚焦 internal",
  );
  await page.getByRole("button", { name: "显示全城", exact: true }).click();
  await expect(page.locator(".focus-banner")).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-pressed", "false");
});

test("search locates a building and highlights its matches", async ({
  page,
}) => {
  await page.route("**/city.json", (route) =>
    route.fulfill({ json: focusCity }),
  );
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  await page.getByLabel("查找文件 / 街区").fill("route.go");
  await expect(page.locator(".search-status")).toContainText("1 个匹配文件");
  await expect(page.locator(".search-results button").first()).toContainText(
    "internal/gateway/route/route.go",
  );
  await page.locator(".search-results button").first().click();
  await expect(page.locator(".inspector .path")).toHaveText(
    "internal/gateway/route/route.go",
  );
  await page.getByRole("button", { name: "清空搜索", exact: true }).click();
  await expect(page.locator(".search-results")).toHaveCount(0);
  await expect(page.locator(".search-status")).toContainText("输入路径片段");
});

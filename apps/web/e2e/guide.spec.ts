import { test, expect } from "@playwright/test";

test("engineering guide shows real dependencies and completes its ten-stop route", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/guide.html");
  await expect(
    page.getByRole("heading", { name: "共享契约塔", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /依赖方/ }).click();
  await expect(page.locator(".reference-list li")).toHaveCount(14);
  await expect(
    page.locator(".reference-list em").filter({ hasText: "类型" }),
  ).toHaveCount(14);
  await page
    .getByRole("button", { name: "查看 App.tsx 所属模块", exact: true })
    .click();
  await expect(page.locator("#note-title")).toHaveText("状态控制中枢");
  await page
    .getByRole("button", { name: "开始 10 分钟导览", exact: true })
    .click();
  await expect(page.locator("#note-title")).toHaveText("入口门廊");
  await expect(
    page.getByRole("button", { name: "导览路线", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate("STOPS.reduce((sum, stop) => sum + stop.seconds, 0)"),
  ).toBe(600);
  for (let index = 0; index < 10; index++)
    await page.locator("#next-stop").click();
  await expect(
    page.getByRole("progressbar", { name: "导览完成进度" }),
  ).toHaveAttribute("aria-valuenow", "10");
  await expect(page.locator("#tour-status")).toContainText("十站已完成");
  await page.getByRole("searchbox", { name: "查找模块" }).fill("urbanIdentity");
  await page.getByRole("searchbox", { name: "查找模块" }).press("Enter");
  await expect(page.locator("#note-title")).toHaveText("模块造型馆");
  await page.getByRole("searchbox", { name: "查找模块" }).press("Escape");
  await page.locator("#building-contract").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#note-title")).toHaveText("共享契约塔");
  expect(errors).toEqual([]);
});

test("guide remains usable offline as one file and fits a mobile screen", async ({
  browser,
}) => {
  const context = await browser.newContext({
    offline: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    const remoteRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
    });
    await page.goto(new URL("../public/guide.html", import.meta.url).href);
    await page
      .getByRole("button", { name: "开始 10 分钟导览", exact: true })
      .click();
    await expect(page.locator("#note-title")).toHaveText("入口门廊");
    await page.locator("#next-stop").click();
    await expect(page.locator("#note-title")).toHaveText("Git 历史采集港");
    expect(remoteRequests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

const linkedCity = {
  repository: "repo-skyline-fixture",
  districts: [
    {
      path: "apps/web/src",
      buildings: [
        {
          id: "types",
          path: "apps/web/src/types.ts",
          lines: 107,
          commits: 2,
          created_at: 100,
          history: [
            {
              commit_id: "c0",
              commit_index: 0,
              timestamp: 100,
              path: "apps/web/src/types.ts",
              lines: 100,
              additions: 100,
              deletions: 0,
              author_id: "alice",
              kind: "added",
            },
            {
              commit_id: "c1",
              commit_index: 1,
              timestamp: 200,
              path: "apps/web/src/types.ts",
              lines: 107,
              additions: 7,
              deletions: 0,
              author_id: "bob",
              kind: "modified",
            },
          ],
        },
        {
          id: "app",
          path: "apps/web/src/App.tsx",
          lines: 900,
          commits: 1,
          created_at: 200,
          history: [
            {
              commit_id: "c1",
              commit_index: 1,
              timestamp: 200,
              path: "apps/web/src/App.tsx",
              lines: 900,
              additions: 900,
              deletions: 0,
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
      message: "create the shared contract",
      changes: [{ path: "apps/web/src/types.ts", kind: "added" }],
      releases: [],
    },
    {
      id: "c1",
      timestamp: 200,
      author: "bob",
      message: "wire the city app",
      changes: [{ path: "apps/web/src/App.tsx", kind: "added" }],
      releases: [],
    },
  ],
  releases: [],
  milestones: [],
  roads: [],
};

test("blueprint shares repository, commit and selection with the city", async ({
  page,
}) => {
  await page.route("**/city.json", (route) =>
    route.fulfill({ json: linkedCity }),
  );
  await page.goto("/");
  await expect(page.getByText("Git 数据", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "架构蓝图", exact: true }).click();
  const frame = page.frameLocator('iframe[title="架构蓝图"]');
  await expect(frame.locator("#linked-context")).toContainText(
    "repo-skyline-fixture",
  );
  await expect(frame.locator("#linked-context")).toContainText("c1 · 2/2");
  await frame.locator('.route-item[data-id="contract"]').click();
  await expect(page.locator(".blueprint-view-link")).toContainText(
    "匹配到 1 栋建筑",
  );
  await page.getByRole("button", { name: "定位到城市", exact: true }).click();
  await expect(page.locator(".inspector .path")).toHaveText(
    "apps/web/src/types.ts",
  );
  await expect(page.locator(".blueprint-view")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "在蓝图中查看该模块",
      exact: true,
    })
    .click();
  await expect(frame.locator("#note-title")).toHaveText("共享契约塔");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByLabel("提交时间线").fill("0");
  await page.getByRole("button", { name: "架构蓝图", exact: true }).click();
  await expect(frame.locator("#linked-context")).toContainText("c0 · 1/2");
});

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
  await expect(
    page.getByText("Git-backed data", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Contributor Territory", exact: true })
    .click();
  await page.locator(".territory-row").first().click();
  await expect(
    page.getByText("Contributor detail", { exact: true }),
  ).toBeVisible();
  await page.locator(".contributor-detail button").first().click();
  await expect(page.locator(".inspector .path")).toBeVisible();
  await page
    .getByRole("button", { name: "Activity heatmap", exact: true })
    .click();
  await expect(page.getByText(/Changes in the 30 days/)).toBeVisible();
  for (const mode of ["ghost", "risk", "bugs", "architecture", "provenance"]) {
    await page.getByLabel("Analysis view").selectOption(mode);
    await expect(page.getByLabel("Analysis view")).toHaveValue(mode);
    await expect(page.locator(".analysis-panel")).toBeVisible();
  }
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play story", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop story", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop story", exact: true }).click();
  await page.getByRole("button", { name: "Fit city", exact: true }).click();
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
  await expect(
    page.getByText("Git-backed data", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Open city JSON").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"districts":[]}'),
  });
  await expect(page.getByRole("alert")).toContainText("Invalid city JSON");
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
  await page.getByLabel("Open city JSON").setInputFiles({
    name: "city.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(small)),
  });
  await expect(page.locator("h1")).toHaveText("Imported repository");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Playback speed").selectOption("5");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Commit timeline")).toHaveValue("1");
  await page.getByLabel("Commit timeline").fill("0");
  await expect(page.getByLabel("Commit timeline")).toHaveValue("0");
});
test("missing generated JSON shows sample, mobile controls remain reachable", async ({
  page,
}) => {
  await page.route("**/city.json", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fit city", exact: true }),
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

test("large real Git fixture renders compact buildings and preserves inspection", async ({
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
    mkdirSync(join(root, "src"));
    for (let i = 0; i < 500; i++)
      writeFileSync(join(root, "src", `file-${i}.txt`), "line one\nline two\n");
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
    await expect(
      page.getByText("Git-backed data", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Open city JSON").setInputFiles(output);
    await expect(
      page.getByText("500 buildings", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Contributor Territory", exact: true })
      .click();
    await page.locator(".territory-row").first().click();
    await page.locator(".contributor-detail button").first().click();
    await expect(page.locator(".inspector .path")).toBeVisible();
    await expect(
      page
        .locator(".release-badges")
        .getByText("Release v1.0", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fit city", exact: true }).click();
    await page.screenshot({
      path: "test-results/skyline-large.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

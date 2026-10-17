import type { CityProject } from "./types";
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function integer(v: unknown) {
  return typeof v === "number" && Number.isSafeInteger(v);
}
function nonnegative(v: unknown) {
  return integer(v) && (v as number) >= 0;
}
function text(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
const kinds = new Set(["added", "modified", "deleted", "renamed"]);
export function parseCity(input: unknown): CityProject {
  const invalid = () => {
    throw new Error(
      "城市 JSON 无效。请使用 repo-skyline analyze <仓库路径> -o city.json 生成。",
    );
  };
  if (
    !object(input) ||
    !text(input.repository) ||
    !Array.isArray(input.districts) ||
    !Array.isArray(input.timeline)
  )
    return invalid();
  const timelineLength = input.timeline.length;
  const commits = new Set<string>();
  for (const commit of input.timeline) {
    if (
      !object(commit) ||
      !text(commit.id) ||
      commits.has(commit.id) ||
      !integer(commit.timestamp) ||
      typeof commit.author !== "string" ||
      typeof commit.message !== "string" ||
      !Array.isArray(commit.changes)
    )
      return invalid();
    commits.add(commit.id);
    if (commit.releases == null) commit.releases = [];
    if (!Array.isArray(commit.releases) || !commit.releases.every(text))
      return invalid();
    for (const change of commit.changes) {
      if (
        !object(change) ||
        !text(change.path) ||
        !kinds.has(String(change.kind))
      )
        return invalid();
      for (const field of ["additions", "deletions", "lines_after"])
        if (change[field] != null && !nonnegative(change[field]))
          return invalid();
    }
  }
  const ids = new Set<string>();
  for (const district of input.districts) {
    if (
      !object(district) ||
      !text(district.path) ||
      !Array.isArray(district.buildings)
    )
      return invalid();
    for (const b of district.buildings) {
      if (
        !object(b) ||
        !text(b.id) ||
        ids.has(b.id) ||
        !text(b.path) ||
        !nonnegative(b.lines) ||
        !nonnegative(b.commits) ||
        !integer(b.created_at)
      )
        return invalid();
      ids.add(b.id);
      if (b.history != null && !Array.isArray(b.history)) return invalid();
      let previous = -1;
      for (const s of (b.history ?? []) as unknown[]) {
        if (
          !object(s) ||
          !nonnegative(s.commit_index) ||
          (s.commit_index as number) <= previous ||
          (s.commit_index as number) >= input.timeline.length ||
          !text(s.path) ||
          !nonnegative(s.lines) ||
          !integer(s.timestamp) ||
          !text(s.author_id) ||
          !kinds.has(String(s.kind))
        )
          return invalid();
        const c = input.timeline[s.commit_index as number];
        if (s.commit_id !== c.id || s.timestamp !== c.timestamp)
          return invalid();
        for (const field of ["additions", "deletions"])
          if (s[field] != null && !nonnegative(s[field])) return invalid();
        previous = s.commit_index as number;
      }
    }
  }
  for (const key of ["releases", "milestones", "roads", "contributors"])
    if (input[key] == null) input[key] = [];
  if (
    !Array.isArray(input.releases) ||
    !Array.isArray(input.milestones) ||
    !Array.isArray(input.roads)
  )
    return invalid();
  for (const person of input.contributors as unknown[]) {
    if (
      !object(person) ||
      !text(person.id) ||
      !text(person.name) ||
      !nonnegative(person.mainline_commits) ||
      !nonnegative(person.merged_commits) ||
      !integer(person.first_commit_at) ||
      !integer(person.last_commit_at)
    )
      return invalid();
  }
  for (const release of input.releases)
    if (
      !object(release) ||
      !text(release.name) ||
      !commits.has(String(release.commit_id)) ||
      !integer(release.timestamp)
    )
      return invalid();
  for (const m of input.milestones)
    if (
      !object(m) ||
      !text(m.id) ||
      !text(m.kind) ||
      !text(m.title) ||
      typeof m.description !== "string" ||
      !commits.has(String(m.commit_id)) ||
      !integer(m.timestamp)
    )
      return invalid();
  for (const road of input.roads) {
    if (
      !object(road) ||
      !ids.has(String(road.from)) ||
      !ids.has(String(road.to)) ||
      !nonnegative(road.weight)
    )
      return invalid();
    if (
      road.commit_indices != null &&
      (!Array.isArray(road.commit_indices) ||
        !road.commit_indices.every(
          (i: unknown) => nonnegative(i) && (i as number) < timelineLength,
        ))
    )
      return invalid();
  }
  return input as unknown as CityProject;
}

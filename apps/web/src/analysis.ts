import type { CityProject, ViewMode } from "./types";
import type { PlacedDistrict, PlacedBuilding } from "./cityLayout";
import { directoryOf } from "./cityLayout";
export type Evidence = {
  building: PlacedBuilding;
  age: number;
  churn: number;
  fixes: number;
  moves: number;
  ai: number;
  human: number;
  unknown: number;
  commits: number[];
};
export function evidenceAt(
  city: CityProject,
  districts: PlacedDistrict[],
  index: number,
): Evidence[] {
  const timestamp = city.timeline[index]?.timestamp ?? 0;
  return districts
    .flatMap((d) => d.buildings)
    .filter((b) => b.status === "Active")
    .map((building) => {
      const past = (building.history ?? []).filter(
        (s) => s.commit_index <= index,
      );
      let fixes = 0,
        moves = 0,
        ai = 0,
        human = 0,
        unknown = 0;
      const commits: number[] = [];
      for (let i = 0; i < past.length; i++) {
        const s = past[i];
        const message = city.timeline[s.commit_index]?.message ?? "";
        if (/\b(fix|bug|regression|revert|hotfix)\b/i.test(message)) {
          fixes++;
          commits.push(s.commit_index);
        }
        if (
          s.kind === "renamed" &&
          past[i - 1] &&
          directoryOf(s.path) !== directoryOf(past[i - 1].path)
        )
          moves++;
        if (/\[ai-assisted\]|^AI-assisted:/i.test(message)) ai++;
        else if (/\[human-authored\]|^Human-authored:/i.test(message)) human++;
        else unknown++;
      }
      return {
        building,
        age: Math.max(
          0,
          (timestamp - (building.last_modified_at ?? building.created_at)) /
            86400,
        ),
        churn:
          ((building.additions ?? 0) + (building.deletions ?? 0)) /
          Math.max(1, building.lines),
        fixes,
        moves,
        ai,
        human,
        unknown,
        commits,
      };
    });
}
export const analysisDescriptions: Partial<Record<ViewMode, string>> = {
  ghost:
    "Files unchanged for the chosen number of days at this commit. Inactivity alone does not mean abandonment.",
  risk: "Technical debt indicators: cumulative line edits / current LOC, plus contributor count. These are review signals, not a debt diagnosis.",
  bugs: "Bug Crime Scene: commits mentioning fix, bug, regression, revert or hotfix. The message is evidence, not proof of a defect.",
  architecture:
    "Architecture Drift: cross-directory renames and repeated co-change links. Co-change is not an AST dependency.",
  provenance:
    "AI vs Human: only explicit [ai-assisted] / [human-authored] or AI-assisted: / Human-authored: commit labels. Unmarked work stays unknown.",
};
export function evidenceScore(e: Evidence, view: ViewMode, ghostDays: number) {
  if (view === "ghost") return e.age >= ghostDays ? e.age : 0;
  if (view === "risk") return e.churn;
  if (view === "bugs") return e.fixes;
  if (view === "architecture") return e.moves;
  if (view === "provenance") return e.ai + e.human;
  return e.building.recent_activity;
}

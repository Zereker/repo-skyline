export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export type FileSnapshot = {
  commit_id: string;
  commit_index: number;
  timestamp: number;
  path: string;
  lines: number;
  additions?: number;
  deletions?: number;
  author_id: string;
  kind: ChangeKind;
};

export type Building = {
  id: string;
  path: string;
  lines: number;
  commits: number;
  additions: number;
  deletions: number;
  contributor_count?: number;
  primary_author?: string | null;
  created_at: number;
  deleted_at?: number | null;
  last_modified_at?: number;
  history?: FileSnapshot[];
};

export type District = {
  path: string;
  buildings: Building[];
};

export type CityEventKind = ChangeKind;

export type CityEvent = {
  path: string;
  old_path?: string | null;
  kind: CityEventKind;
  additions: number;
  deletions: number;
  lines_after?: number | null;
};

export type TimelineCommit = {
  id: string;
  timestamp: number;
  author: string;
  message: string;
  changes: CityEvent[];
  releases: string[];
};

export type CityRoad = {
  from: string;
  to: string;
  weight: number;
};

export type ReleaseMarker = {
  name: string;
  commit_id: string;
  timestamp: number;
};

export type StoryMilestoneKind =
  | "first_commit"
  | "commit_100"
  | "commit_1000"
  | "first_major_contributor"
  | "largest_change"
  | "largest_refactor"
  | "largest_module"
  | "most_active_month"
  | "ownership_transition"
  | "release";

export type StoryMilestone = {
  id: string;
  kind: StoryMilestoneKind;
  title: string;
  description: string;
  commit_id: string;
  timestamp: number;
};

export type CityProject = {
  repository: string;
  districts: District[];
  timeline: TimelineCommit[];
  releases: ReleaseMarker[];
  milestones: StoryMilestone[];
  roads?: CityRoad[];
};

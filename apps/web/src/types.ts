export type Building = {
  id: string;
  path: string;
  lines: number;
  commits: number;
  primary_author?: string | null;
  created_at: number;
  deleted_at?: number | null;
};

export type District = {
  path: string;
  buildings: Building[];
};

export type CityEventKind = "added" | "modified" | "deleted" | "renamed";

export type CityEvent = {
  path: string;
  old_path?: string | null;
  kind: CityEventKind;
};

export type TimelineCommit = {
  id: string;
  timestamp: number;
  author: string;
  message: string;
  changes: CityEvent[];
  releases: string[];
};

export type ReleaseMarker = {
  name: string;
  commit_id: string;
  timestamp: number;
};

export type StoryMilestoneKind =
  | "first_commit"
  | "first_major_contributor"
  | "largest_change"
  | "largest_refactor"
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
};

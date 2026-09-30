export type Building = {
  id: string;
  path: string;
  lines: number;
  commits: number;
  primary_author?: string | null;
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
};

export type CityProject = {
  repository: string;
  districts: District[];
  timeline: TimelineCommit[];
};

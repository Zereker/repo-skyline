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

export type CityProject = {
  repository: string;
  districts: District[];
};

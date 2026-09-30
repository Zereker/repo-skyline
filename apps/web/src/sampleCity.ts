import type { CityProject } from "./types";

export const sampleCity: CityProject = {
  repository: "repo-skyline",
  districts: [
    {
      path: "crates/git-analyzer",
      buildings: [
        {
          id: "crates/git-analyzer/src/lib.rs",
          path: "crates/git-analyzer/src/lib.rs",
          lines: 280,
          commits: 7,
          primary_author: "Zereker",
        },
        {
          id: "crates/git-analyzer/Cargo.toml",
          path: "crates/git-analyzer/Cargo.toml",
          lines: 12,
          commits: 4,
          primary_author: "Zereker",
        },
      ],
    },
    {
      path: "crates/city-model",
      buildings: [
        {
          id: "crates/city-model/src/lib.rs",
          path: "crates/city-model/src/lib.rs",
          lines: 58,
          commits: 4,
          primary_author: "Zereker",
        },
      ],
    },
    {
      path: "apps/web",
      buildings: [
        {
          id: "apps/web/src/main.tsx",
          path: "apps/web/src/main.tsx",
          lines: 20,
          commits: 1,
          primary_author: "Zereker",
        },
        {
          id: "apps/web/src/App.tsx",
          path: "apps/web/src/App.tsx",
          lines: 160,
          commits: 1,
          primary_author: "Zereker",
        },
      ],
    },
  ],
};

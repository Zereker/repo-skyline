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
  timeline: [
    {
      id: "a6481a7",
      timestamp: 1790750000,
      author: "Zereker",
      message: "chore: initialize Repo Skyline",
      changes: [{ path: "README.md", kind: "added" }],
    },
    {
      id: "51f4a68",
      timestamp: 1790751800,
      author: "Zereker",
      message: "feat: walk real commit history",
      changes: [{ path: "crates/git-analyzer/src/lib.rs", kind: "modified" }],
    },
    {
      id: "890110d",
      timestamp: 1790755200,
      author: "Zereker",
      message: "feat: implement stable git CLI history analyzer",
      changes: [{ path: "crates/git-analyzer/src/lib.rs", kind: "modified" }],
    },
  ],
};

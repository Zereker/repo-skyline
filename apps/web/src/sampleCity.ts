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
          created_at: 1790751200,
          deleted_at: null,
        },
        {
          id: "crates/git-analyzer/Cargo.toml",
          path: "crates/git-analyzer/Cargo.toml",
          lines: 12,
          commits: 4,
          primary_author: "Zereker",
          created_at: 1790750900,
          deleted_at: null,
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
          created_at: 1790751000,
          deleted_at: null,
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
          created_at: 1790754000,
          deleted_at: null,
        },
        {
          id: "apps/web/src/App.tsx",
          path: "apps/web/src/App.tsx",
          lines: 160,
          commits: 1,
          primary_author: "Zereker",
          created_at: 1790754000,
          deleted_at: null,
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
      releases: [],
    },
    {
      id: "51f4a68",
      timestamp: 1790751800,
      author: "Zereker",
      message: "feat: walk real commit history",
      changes: [{ path: "crates/git-analyzer/src/lib.rs", kind: "modified" }],
      releases: [],
    },
    {
      id: "890110d",
      timestamp: 1790755200,
      author: "Zereker",
      message: "feat: implement stable git CLI history analyzer",
      changes: [{ path: "crates/git-analyzer/src/lib.rs", kind: "modified" }],
      releases: ["v0.1.0"],
    },
  ],
  releases: [
    {
      name: "v0.1.0",
      commit_id: "890110d",
      timestamp: 1790755200,
    },
  ],
  milestones: [
    {
      id: "first-commit",
      kind: "first_commit",
      title: "First commit",
      description: "The city foundation.",
      commit_id: "a6481a7",
      timestamp: 1790750000,
    },
    {
      id: "largest-change",
      kind: "largest_change",
      title: "Biggest construction wave",
      description: "A large commit reshaped the city.",
      commit_id: "890110d",
      timestamp: 1790755200,
    },
    {
      id: "release-v0.1.0",
      kind: "release",
      title: "Release v0.1.0",
      description: "A Git tag marks a city milestone.",
      commit_id: "890110d",
      timestamp: 1790755200,
    },
  ],
};

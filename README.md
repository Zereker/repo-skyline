# Repo Skyline

> Every repository has a skyline. Every commit builds the city.

Repo Skyline turns Git history into a living city. Directories become districts, files become buildings, commits become construction events, and contributors become the builders shaping the skyline over time.

## Docs

- [使用指南（中文）](docs/USER_GUIDE.md)
- [Product Requirements](docs/PRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Roadmap](docs/ROADMAP.md)
- [PRD acceptance and data semantics](docs/ACCEPTANCE.md)

## Current MVP

- Parse real Git commit history
- Track file create / modify / delete / rename events
- Build a reusable repository history model
- Project files into stable districts and buildings
- Map LOC to building height
- Replay repository history on a commit timeline
- Animate building construction and demolition
- Pulse modified buildings and highlight renames
- Show floating district labels
- Inspect current commit file changes
- Switch to Contributor Territory mode
- Orbit, zoom, and inspect individual buildings
- Cap rendered buildings for large-repository demos

## Quick start

Requirements:

- Rust stable
- Git
- Node.js 22+

Generate city data from this repository:

```bash
cargo run -p repo-skyline-cli -- analyze . \
  -o apps/web/public/city.json
```

Start the visualization:

```bash
cd apps/web
npm install
npm run dev
```

The web app loads `/city.json` when present and falls back to clearly labelled sample data otherwise. Use **Open city JSON** to switch to data generated from any local repository. Invalid input shows an error and preserves the current city.

## Demo a real repository

Use the helper script with either a Git URL or an existing local clone:

```bash
bash scripts/demo-repo.sh https://github.com/facebook/react.git
```

The optional second argument limits rendered buildings while keeping the Git timeline:

```bash
bash scripts/demo-repo.sh https://github.com/facebook/react.git 1800
```

The helper caches external clones under `.demo-cache/` and writes the generated project to:

```text
apps/web/public/city.json
```

You can also call the CLI directly:

```bash
cargo run -p repo-skyline-cli -- analyze ../react \
  -o apps/web/public/city.json \
  --max-buildings 2500
```

## Validate the full demo pipeline

```bash
bash scripts/validate-demo.sh
```

This runs:

1. Rust workspace tests
2. Real Git analysis against Repo Skyline itself
3. `city.json` generation
4. Web dependency install
5. Production web build

The same smoke pipeline is configured in GitHub Actions.

## Architecture

```text
Git repository
  -> git-analyzer
  -> RepositoryHistory
  -> city-model
  -> CityProject JSON
  -> React / Three.js renderer
```

Git parsing and city projection are deliberately separated so future views such as ownership, architecture, bugs, and AI activity can reuse the same repository history model.

## Workspace

```text
crates/repository-model
crates/git-analyzer
crates/city-model
crates/repo-skyline-cli
apps/web
scripts
docs
```

## Demo controls

- Play / Pause / Replay
- 0.5x / 1x / 2x / 5x playback
- Timeline scrubber
- District / Contributor Territory switch
- Orbit / Pan / Zoom
- Building selection
- Current commit file-change inspector

## Analysis views

- **District**: group files by level 1, level 2 or full directory paths in Settings.
- **Contributor Territory**: cumulative additions ownership at the selected commit;
  click a contributor to inspect their mainline commits and owned files.
- **Activity heatmap**: changes during the previous 30 days.
- **Ghost District**: files inactive for a configurable number of days.
- **Technical Debt indicators**: churn density and contributor counts for review.
- **Bug Crime Scene**: fix-labelled commits with links back to the timeline.
- **Architecture Drift**: cross-directory moves and repeated co-change links.
- **AI vs Human provenance**: explicit commit labels; unmarked work stays unknown.

Play and Story Mode are mutually exclusive. File details, ownership and analytical
views reflect the selected commit rather than future totals. Large scenes use
shared instanced geometry automatically. Fit city resets the camera.

## Git history scope

The analyzer follows HEAD's first-parent lineage. Merge diffs enter once, against
the first parent. Mainline and merge authors are shown; this is not a complete
attribution of side-branch commits. Bare repositories and detached HEAD work.
Shallow clones need `git fetch --unshallow` before analysis.

## Validation

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
bash scripts/validate-demo.sh
cd apps/web
npx playwright install chromium
npm run test:e2e
```

See [acceptance notes](docs/ACCEPTANCE.md) for the exact evidence definitions and
limits of each view.

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

## Metropolis building language

The default **Module roles + history** language gives source files business towers,
tests research campuses, documentation civic halls, examples residential terraces,
and infrastructure utility buildings. Roles are inferred from paths and extensions;
unrecognized files remain unclassified. Facades, roof forms, materials and lighting
vary deterministically within each family. Large scenes retain these families in
instanced rendering.

Height combines module role, LOC and **history prominence**. Prominence uses
log-normalized file changes (45%), contributor counts (20%) and observed active
co-change neighbours (35%), with minimum normalization scales of 10/3/3. All
metrics reflect the selected commit; co-change evidence is limited to the retained
road data. This is a historical attention signal, not a dependency or business
importance score. Select a building and open **Why this building?** for its evidence.

Use **Building language → LOC towers** for the LOC-only height mapping. Contributor
and analytical views override the color channel while preserving building forms.

## Navigating large cities

- **District focus**: click a district in the left panel to isolate it. Other
  districts fade, the camera fits the focused one, and a banner offers to restore
  the whole city.
- **File search**: type a path fragment in the left panel to list matching active
  buildings (largest first) and the districts they live in. Selecting a result
  flies the camera to that building and opens its inspector; while a query is
  active, non-matching buildings are dimmed.

Both interactions share one dimming channel, so detailed and instanced rendering
stay consistent. Repositories with thousands of files remain navigable without
clicking individual buildings.

## Architecture field guide

Open **Architecture blueprint** in the web app, or open
`apps/web/public/guide.html` directly. This self-contained HTML file embeds its
styles, SVG city map, source snapshot and interaction code, and works offline
without a server.

The web UI is in Chinese. The in-app blueprint is linked to the loaded city
rather than being a separate page. By default the 3D city uses the blueprint plan: ten functional zones
(entry, history harbor, projection works, contract plaza, import checkpoint,
state control, layout district, identity studio, rendering quarter and replay
station) plus a supporting-files zone. Each zone has its own ground tint and a
named landmark. Building labels are generated from the repository itself (for
example `types.ts`, `App.tsx`, or the `git-analyzer` crate), while the blueprint
zone is shown as a secondary line. The shared contract landmark is the tallest
planned building, and ordinary buildings are capped below their zone landmark. The settings panel can
switch between this blueprint plan and the real directory layout. Repositories
without enough blueprint matches fall back to real directories automatically. The app keeps its repository name, commit timeline and selection visible;
the guide receives the current commit as context. Selecting a module reports its
source paths back to the app, which counts matching buildings and can locate the
first one with a camera flight. A selected building can conversely open the
blueprint at its matching module. The embedded bridge uses `postMessage`; the
standalone page remains available for offline reading and sharing.

The engineering-drawing view maps ten real Repo Skyline module groups, explains
their responsibilities and design boundaries, and provides a manually paced
600-second onboarding route. The dependency layer distinguishes type-only and
runtime imports. `types.ts` is the main tower, with 14 direct type consumers in
the current 26-module production frontend snapshot. A source-graph check verifies the
embedded import registry against the actual TypeScript source graph.

## Contributor attribution

Contributors are ranked by commit count and split into two kinds:

- **mainline commits** are replayed on the timeline.
- **merged commits** were authored on side branches and entered through merge
  commits. They are counted, shown separately in the contributor panel, and never
  replayed twice.

Identities are resolved through `.mailmap` (both the `<proper> <commit>` and the
named form), then by case-insensitive email, so one person is one contributor.
Repositories that merge heavily show contributors the first-parent walk alone
would have hidden entirely.

## Generated code

`*.gen.go`, `*.pb.go`, `*.min.js`, snapshots, lockfiles and vendored or build
output directories are classified as generated code. They render as low uniform
blocks and are capped well below hand-written code of the same size, so machine
output no longer dominates the skyline. The classification is path-based, like
the other module roles.

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

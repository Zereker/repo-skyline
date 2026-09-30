# Repo Skyline

> Every repository has a skyline. Every commit builds the city.

Repo Skyline turns Git history into a living city. Directories become districts, files become buildings, commits become construction events, and contributors become the builders shaping the skyline over time.

## Docs

- [Product Requirements](docs/PRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Roadmap](docs/ROADMAP.md)

## Current MVP

- Parse real Git commit history
- Track file create / modify / delete / rename events
- Build a repository history model
- Project active files into districts and buildings
- Map LOC to building height
- Show commit counts and primary contributors
- Render the city in React + Three.js
- Orbit, zoom, and inspect buildings

## Quick start

Requirements:

- Rust stable
- Git
- Node.js 22+

Generate city data from a repository:

```bash
cargo run -p repo-skyline-cli -- analyze . -o apps/web/public/city.json
```

Start the visualization:

```bash
cd apps/web
npm install
npm run dev
```

The web app loads `/city.json` when present and falls back to bundled sample data otherwise.

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
docs
```

## Next milestones

1. Verify the full CLI pipeline against real repositories.
2. Add timeline events and playback.
3. Add deterministic district layout and labels.
4. Add contributor territory view.
5. Build the Hackathon story-mode demo.

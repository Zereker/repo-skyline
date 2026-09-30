# Repo Skyline

> Every repository has a skyline. Every commit builds the city.

Repo Skyline turns Git history into a living city. Directories become districts, files become buildings, commits become construction events, and contributors become the builders shaping the skyline over time.

## Docs

- [Product Requirements](docs/PRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Roadmap](docs/ROADMAP.md)

## MVP

- Parse Git history in Rust
- Directory -> district
- File -> building
- LOC -> building height
- Commit -> construction event
- Timeline replay
- Contributor ownership overlays
- React + Three.js visualization

## Architecture

```text
Git repository
  -> Git analyzer
  -> repository history model
  -> city projection
  -> web renderer
```

The detailed design deliberately separates Git parsing from the city projection so future views such as ownership, architecture, bugs, and AI activity can reuse the same repository history model.

## Workspace

```text
crates/git-analyzer
crates/city-model
apps/web
docs
```

## Next milestone

```text
repo-skyline analyze .
```

should output real commit history and a deterministic city model backed by Git data.

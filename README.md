# Repo Skyline

> Every repository has a skyline. Every commit builds the city.

Repo Skyline turns Git history into a living city. Directories become districts, files become buildings, commits become construction events, and contributors become the builders shaping the skyline over time.

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
  -> Rust analyzer
  -> normalized history model
  -> city model
  -> web renderer
```

## Workspace

```text
crates/git-analyzer
crates/city-model
apps/web
docs
```

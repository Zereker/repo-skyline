# Repo Skyline Roadmap

## P0 — Working data pipeline

- Read a real local Git repository
- Walk commit history
- Collect file changes and authors
- Build a normalized history model
- Convert repository state into districts and buildings

## P1 — Visual demo

- Render districts and buildings
- Add pan / zoom / orbit camera
- Add commit timeline
- Animate file creation, growth, deletion, and rename
- Show commit metadata

## P2 — Differentiation

- Contributor territories
- Ownership migration
- Repository hotspots
- Story mode
- Ghost districts / knowledge risk

## Demo goal

Every visible change in the city must come from real Git history.

## PRD completion iteration

P0/P1 and the named P2 views are implemented with explicit Git-evidence semantics. See [ACCEPTANCE.md](ACCEPTANCE.md) for scope and checks. Further work: benchmark large repositories, improve analytical precision with optional external evidence, and add recording/export.

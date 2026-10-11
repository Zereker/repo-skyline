# PRD acceptance and data semantics

This iteration implements the PRD's P0/P1 features and Git-evidence versions of
all listed P2 views. The MVP exclusions in PRD §11 still apply.

| PRD feature | Delivered behavior | Validation |
| --- | --- | --- |
| Local repository input | `repo-skyline analyze <path> -o city.json`; open any generated file with **Open city JSON**, or load `/city.json` | Git fixtures; browser import and invalid-input checks |
| Git history, authors, timestamps, line edits | Exact text-blob line counts, NUL-delimited filenames, first-parent diffs including merges, lightweight/annotated tags | Rust real-repository fixtures |
| Directories and buildings | Level 1 / Level 2 / full-path grouping; unique stable historical slots; logarithmic LOC height | Web replay and layout tests |
| Timeline and animations | Play, Pause, Replay, Seek, four speeds; creation, update, demolition, cross-district rename; activity bars and release markers | Browser playback/seek checks; replay tests |
| Commit and file panels | Commit metadata/deltas; historical LOC, contributor count, cumulative ownership, dates and clickable recent changes | Web past-only statistics tests; browser inspection |
| Contributors and ownership | Contribution totals up to the selected commit; details, territories and true leader-change milestones | Rust and Web ownership tests |
| Activity heatmap | File changes in the 30 days ending at the selected commit | Web history tests |
| Camera and overview | Orbit/pan/zoom, fit city, repository LOC/file/contributor counts | Browser controls and responsive checks |
| Story | First commit, 100/1000 commits, first author to three commits, largest edits/refactor/module expansion, busiest calendar month, ownership transitions, tags; cinematic focus | Rust projection tests; browser playback exclusivity |
| Ghost District | Configurable 90/180/365-day inactivity at the selected commit | Past-only evidence tests |
| Technical Debt View | Review indicators: cumulative line edits/current LOC and contributor concentration | Past-only evidence tests |
| Bug Crime Scene | Fix/bug/regression/revert/hotfix commit-message evidence, affected files and links to commits | Past-only evidence tests |
| Architecture Drift | Cross-directory rename counts and repeated co-change links, available only after their evidence commits | Road identity and replay tests |
| AI vs Human View | Explicit `[ai-assisted]` / `[human-authored]` or `AI-assisted:` / `Human-authored:` subject markers; all other work unknown | Provenance evidence tests |
| Co-change roads | Same-file identities across renames; commit-indexed edge weights; only repeated relationships between active buildings | Rust road tests; Web replay |

## History scope

The timeline follows HEAD's **first-parent lineage**, in ancestry order rather
than timestamp order. At a merge, side-branch work enters via the diff against
that merge's first parent. This gives each timeline step the actual tree state of
that commit without replaying a side branch twice. The displayed author is the
mainline/merge commit author; this is not a complete attribution of individual
side-branch contributions. Tags outside the selected lineage are omitted.

Empty repositories report a readable HEAD error. Bare repositories and detached
HEADs work. Shallow clones report `git fetch --unshallow` rather than showing an
incomplete history as a full lifecycle. Binary blobs have no text LOC; a zero-LOC
building is not a claim about binary size. Invalid UTF-8 filenames are skipped
with a warning. Text with no final newline is counted correctly.

Ownership is the cumulative additions leader, with commit count and then author
ID as deterministic tie breakers. It is a contribution proxy, not surviving-line
blame or responsibility. A last editor does not automatically become the owner.
Deleted/recreated files get separate identities. Historical inspector statistics
and analytical views use no snapshots after the selected commit.

## Evidence limits

Inactivity is not proof of abandonment. Churn and contributor counts are review
signals, not automatic technical-debt conclusions. Fix words in commit subjects
are not a verified defect or issue association. Co-change is not an AST dependency.
AI/human markers are author-provided provenance, not code detection.

Co-change generation skips commits touching more than 200 tracked files to avoid
quadratic work and bulk-import coupling. The project retains the strongest 120
pairs; the scene displays up to 80. Historical weights count only evidence up to
the selected commit. Legacy JSON without edge history does not show inferred
historical roads. Above 400 visible files, shared instanced boxes replace detailed
building geometry while retaining timeline animations, hover and selection.
`--max-buildings` limits visualization, not the commit history.

## Checks

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
bash scripts/validate-demo.sh
cd apps/web
npm run test:e2e
```

Browser checks need Playwright Chromium (`npx playwright install chromium`), or a
local executable selected with `SKYLINE_BROWSER_PATH`. CI checks out full Git
history, generates a real city and runs unit, build and browser checks.

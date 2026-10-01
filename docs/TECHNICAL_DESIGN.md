# Repo Skyline 技术方案

## 1. 技术目标

Repo Skyline 的技术核心不是 3D 渲染，而是建立一条稳定、可扩展的数据链路：

```text
Git Repository
    ↓
Git History Analyzer
    ↓
Normalized Repository History
    ↓
City Projection Engine
    ↓
Timeline Snapshots / Events
    ↓
Web Renderer
```

设计原则：

1. Git 数据层与可视化层彻底解耦
2. 所有视觉变化都必须可追溯到真实 Git 事件
3. MVP 优先保证跨语言
4. 城市布局需要稳定，同一文件不应每帧随机跳动
5. Timeline 不应为每个 Commit 重建整座城市
6. 后续可以扩展 Ownership、Dependency、Technical Debt 等视角

---

## 2. 技术栈

### Core / Analyzer

- Rust
- gix / gitoxide
- serde
- anyhow
- rayon（后续）
- chrono / time（根据需要）

### Frontend

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- @react-three/drei（建议加入）
- Zustand（建议用于 timeline / selection state）

### 数据交换

Hackathon MVP：

```text
Rust CLI -> city.json -> Web App
```

后续：

```text
Rust -> WASM
```

或：

```text
Tauri Desktop App
Rust Backend <-> WebView
```

MVP 不建议一开始上 Tauri / WASM，先把数据链路跑通。

---

## 3. Workspace 结构

推荐：

```text
repo-skyline/
├── Cargo.toml
├── crates/
│   ├── git-analyzer/
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── commits.rs
│   │       ├── files.rs
│   │       ├── authors.rs
│   │       └── stats.rs
│   │
│   ├── city-model/
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── city.rs
│   │       ├── events.rs
│   │       └── layout.rs
│   │
│   └── repo-skyline-cli/
│       └── src/main.rs
│
├── apps/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── city/
│       │   ├── timeline/
│       │   ├── stores/
│       │   └── types/
│       └── package.json
│
├── examples/
│   └── city.json
│
└── docs/
    ├── PRD.md
    ├── TECHNICAL_DESIGN.md
    └── ROADMAP.md
```

---

## 4. Git Analyzer

### 4.1 输入

```text
/path/to/git/repository
```

### 4.2 输出

统一 Repository History Model。

不要让前端直接理解 Git。

示例：

```json
{
  "repository": {
    "name": "repo-skyline",
    "first_commit_at": 0,
    "last_commit_at": 0
  },
  "commits": [],
  "files": [],
  "authors": [],
  "events": []
}
```

---

## 5. Commit Model

建议：

```rust
pub struct CommitRecord {
    pub id: String,
    pub parents: Vec<String>,
    pub author_id: String,
    pub author_name: String,
    pub timestamp: i64,
    pub message: String,
    pub changes: Vec<FileChange>,
}
```

FileChange：

```rust
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: ChangeKind,
    pub additions: u32,
    pub deletions: u32,
}
```

---

## 6. File Lifetime Model

每个文件不仅需要当前状态，还需要生命周期。

```rust
pub struct ReleaseRecord {
    pub name: String,
    pub commit_id: String,
    pub timestamp: i64,
}

pub struct FileRecord {
    pub id: String,
    pub path: String,
    pub directory: String,
    pub created_at: i64,
    pub deleted_at: Option<i64>,
    pub last_modified_at: i64,
    pub commit_count: u32,
    pub additions: u64,
    pub deletions: u64,
    pub current_lines: u64,
    pub authors: Vec<AuthorContribution>,
}
```

文件 ID 不要直接使用 path。

原因：

```text
src/a.rs
-> rename
src/core/a.rs
```

如果 ID = path，会被误认为两栋建筑。

应该维护稳定 file identity。

MVP 如果 rename tracking 成本过高，可先降级为：

```text
delete old building + create new building
```

但数据模型必须预留稳定 ID。

---

## 7. Event Model

Timeline 最好消费 Event，而不是原始 Commit。

例如：

```rust
pub enum CityEventKind {
    BuildingCreated,
    BuildingUpdated,
    BuildingDeleted,
    BuildingMoved,
}

pub struct CityEvent {
    pub commit_id: String,
    pub timestamp: i64,
    pub file_id: String,
    pub kind: CityEventKind,
    pub before: Option<BuildingMetrics>,
    pub after: Option<BuildingMetrics>,
}
```

这样前端只需要：

```text
Event -> Animation
```

而不是：

```text
Commit -> Git semantics -> UI
```

---

## 8. LOC 计算

### MVP 方案

初期可以通过：

- commit diff additions/deletions
- 当前文件 line count

维护近似 LOC。

如果从第一个 Commit 开始 replay：

```text
LOC(t+1) = max(0, LOC(t) + additions - deletions)
```

优点：

- 快
- 无需每个 Commit checkout
- 足够用于建筑高度

限制：

- binary
- rename
- diff corner case

第一版接受近似值。

---

## 9. District 生成

### Directory Level

建议 MVP 使用一级目录。

例如：

```text
src/
tests/
docs/
packages/
```

根目录文件放：

```text
_root
```

后续支持：

- Level 2
- semantic grouping
- module grouping

---

## 10. City Layout

核心要求：

> 同一文件的位置必须尽量稳定。

否则 Timeline 播放时整座城市会不断抖动。

### 推荐算法

第一版：

```text
Directory Treemap
    ↓
District Rectangle
    ↓
Within district: deterministic grid packing
```

输入：

- file id
- file size
- district

输出：

```rust
pub struct BuildingLayout {
    pub x: f32,
    pub z: f32,
    pub width: f32,
    pub depth: f32,
}
```

Height 不属于 layout：

```text
height = visual metric
```

### 稳定性

文件排序使用：

```text
stable hash(file_id)
```

而不是修改时间。

这样 Commit 发生时不会导致所有建筑重排。

---

## 11. 建筑尺寸映射

建议：

### Height

```text
height = log1p(LOC)
```

不要线性映射。

否则：

- 20 行文件看不见
- 20,000 行文件变摩天大楼

示例：

```text
height = clamp(log2(lines + 1) * scale, min, max)
```

### Footprint

MVP 固定 footprint。

后续：

```text
sqrt(function_count)
sqrt(commit_count)
```

---

## 12. Contributor Ownership

File ownership：

```text
author contribution score
= additions + weighted modifications
```

MVP 简化：

```text
Primary Author
= author with highest total additions
```

后续可加入：

- recency decay
- commit count
- surviving lines
- git blame

---

## 13. Timeline Engine

不要生成每个 Commit 的完整 City Snapshot。

否则：

```text
20,000 commits × 10,000 files
```

会爆内存。

### 推荐方案

```text
Initial State
+
Ordered CityEvent[]
```

前端维护当前 CityState。

向前播放：

```text
apply(event)
```

向后 Seek：

MVP：

- 找最近 checkpoint
- 从 checkpoint replay

Checkpoint 可每：

- 100 commits
- 500 commits
- 或每月

生成一次。

结构：

```text
Checkpoint 0
event...
event...
Checkpoint 1
event...
```

---

## 14. Frontend State

建议 Zustand：

```ts
type AppState = {
  repository: RepositoryMeta
  buildings: Map<string, BuildingState>
  districts: District[]
  events: CityEvent[]
  currentEventIndex: number
  selectedBuildingId?: string
  hoveredBuildingId?: string
  playing: boolean
  speed: number
}
```

---

## 15. Rendering

React Three Fiber Scene：

```text
Canvas
├── CameraControls
├── Ground
├── DistrictLayer
│   ├── District
│   └── Labels
├── BuildingLayer
│   └── InstancedMesh
├── SelectionLayer
└── Effects
```

### 重要性能设计

不要：

```text
1 file = 1 React mesh component
```

大型 Repo 会非常慢。

建议：

```text
THREE.InstancedMesh
```

按视觉类别分组：

- normal
- selected
- active
- deleted animation

例如 10,000 个 buildings 可以少量 draw calls 完成。

---

## 16. Camera

MVP：

- Orbit
- Pan
- Zoom
- Fit city

默认使用等距 / 斜俯视视角。

不必做第一人称。

---

## 17. Releases and Story Mode

Git tags are resolved to their underlying commit and exposed as release markers on the timeline.

The city projection also derives a bounded set of story milestones:

- First commit
- Major contributor
- Largest construction wave
- Largest refactor / urban renewal
- Recent representative releases

Story Mode maps each milestone back to its commit, jumps the timeline, and drives a cinematic camera toward the first changed building in that commit.

This keeps the demo data-driven: the presentation is generated from Git history instead of a hand-authored animation script.

## 18. Animation

Commit 事件视觉：

### Create

建筑从：

```text
height = 0
```

升到目标高度。

### Modify

短暂：

- emissive/highlight
- height transition

### Delete

建筑：

- shrink
- fade
- disappear

### Rename

后续版本：

建筑沿路径移动到新 District。

---

## 19. 色彩策略

MVP 默认：

```text
District -> color
```

Contributor View：

```text
Author -> color
```

Activity View：

```text
recent commit frequency -> intensity
```

避免同时把多个指标编码进颜色。

---

## 20. CLI

建议新增：

```text
repo-skyline analyze ./repo -o city.json
```

参数：

```text
repo-skyline analyze <path>

--output
--max-commits
--since
--until
--checkpoint-size
```

Hackathon Demo：

```bash
repo-skyline analyze ../react -o examples/react.json
cd apps/web
npm run dev
```

---

## 21. 第一阶段 API

Rust：

```rust
pub fn analyze_repository(path: impl AsRef<Path>) -> Result<RepositoryHistory>;

pub fn project_city(history: &RepositoryHistory) -> Result<CityProject>;
```

不要把两层混成：

```rust
analyze_repository() -> City
```

推荐改成：

```text
Git domain
↓
City projection
```

这样未来可以增加：

- graph view
- ownership view
- bug view

而不需要重新解析 Git。

---

## 22. 推荐 Domain Layer

```text
git-analyzer
    ↓
repository-model
    ↓
city-model
```

当前项目还没有 repository-model crate。

建议接下来新增：

```text
crates/repository-model
```

放：

- CommitRecord
- FileRecord
- AuthorRecord
- FileChange
- RepositoryHistory

这样：

```text
git-analyzer
```

只负责 Git。

```text
city-model
```

只负责可视化投影。

---

## 23. 性能目标

Hackathon MVP：

- 1,000 commits：< 2 秒目标
- 10,000 commits：< 10 秒目标
- 10,000 buildings：保持交互
- Timeline playback：60 FPS 为理想，30 FPS 可接受

先测：

- repo-skyline 本仓库
- React
- Vue
- 一个中大型 Rust Repo

Linux Kernel 不作为 MVP 性能基准。

---

## 24. 缓存

分析结果输出 JSON。

例如：

```text
.repo-skyline/cache.json
```

用以下内容生成 cache key：

- HEAD SHA
- analyzer version
- config hash

如果 HEAD 未变化：

直接使用缓存。

---

## 25. 错误处理

需要明确处理：

- 非 Git 目录
- Bare repository
- Empty repository
- Detached HEAD
- Shallow clone
- Binary file
- Invalid UTF-8 path
- 巨型 commit
- Merge commit
- Rename detection failure

MVP 对无法处理的文件：

skip + warning。

不要 panic。

---

## 26. Merge Commit

MVP：

默认按 first-parent diff 或普通 tree diff 处理。

需要避免：

Merge Commit 导致已经存在的文件被重复计算。

实现前必须建立测试 Repo 覆盖：

- normal commit
- branch
- merge
- rename
- delete

---

## 27. Testing

### Rust Unit Tests

测试：

- LOC accumulation
- file create
- file delete
- rename
- author contribution
- district extraction

### Fixture Repo

在 tests/fixtures 创建一个小 Git Repo：

```text
commit 1: create a.rs
commit 2: modify a.rs
commit 3: create src/b.rs
commit 4: rename b.rs
commit 5: delete a.rs
```

解析结果必须 deterministic。

---

## 28. CI

GitHub Actions：

### Rust

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

### Web

```bash
npm ci
npm run build
```

---

## 29. 下一步实施顺序

### Phase 1 — Domain Model

新增：

```text
crates/repository-model
```

完成：

- CommitRecord
- FileChange
- AuthorRecord
- RepositoryHistory

### Phase 2 — Real Git Parsing

使用 gix：

- open repo
- resolve HEAD
- walk commits
- extract metadata
- compare trees
- build changes

### Phase 3 — City Projection

```text
RepositoryHistory
↓
District[]
Building[]
CityEvent[]
```

### Phase 4 — CLI

输出：

```text
examples/demo.json
```

### Phase 5 — Web MVP

先渲染：

- static districts
- static buildings

然后增加：

- timeline
- events
- animation

### Phase 6 — Hackathon Polish

- commit panel
- contributor view
- story mode
- visual effects
- demo repository

---

## 30. 当前最重要的架构决策

**不要让 git-analyzer 直接返回 City。**

应该改为：

```text
git-analyzer
    ↓
RepositoryHistory
    ↓
city-model
    ↓
CityProject
```

这是当前最值得尽早调整的一点。

否则未来所有新的视角都会和 Git 解析耦合。

---

## 31. 技术里程碑

### M1

```text
repo-skyline analyze .
```

能够输出真实 Commit 数据。

### M2

输出：

```text
districts + buildings
```

### M3

Web 页面出现真实 Repository 城市。

### M4

Timeline 可以 Replay。

### M5

Contributor View + Hackathon Demo。

---

## 32. 最终技术原则

Repo Skyline 应坚持：

> Git 是事实来源，城市只是它的投影。

只要这个原则保持住，未来无论增加：

- Ownership
- Architecture
- Bug
- AI
- Risk
- Story

都可以建立在同一个 Repository History Model 之上。

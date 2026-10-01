# Repo Skyline 产品需求文档

## 1. 项目定位

**Repo Skyline** 是一个 Git 仓库历史可视化项目。

核心理念：

> Every repository has a skyline. Every commit builds the city.

它把 Git Repository 映射为一座会随时间演化的城市：

| Git 概念 | 城市隐喻 |
|---|---|
| Repository | 城市 |
| Directory | 城区 / District |
| File | 建筑 |
| Commit | 建设施工 |
| Developer | 建设者 |
| Dependency / Co-change | 道路 |
| Refactor | 城市更新 |
| Delete | 拆迁 |
| Release / Tag | 城市发展节点 |
| Hotspot | 高强度施工区域 |
| Ownership | 开发者势力范围 |
| Technical Debt | 潜在老旧城区 |

目标不是替代 GitHub、GitKraken 或 GitLens，而是提供一种新的观察 Git 历史的方式：

**从“读取 Commit”变成“观看软件如何成长”。**

---

## 2. 产品目标

### 2.1 让 Git 历史可观看

用户可以通过时间轴，从项目第一个 Commit 开始，观察 Repository 逐步成长为当前状态。

### 2.2 让代码结构变得直观

通过城区、建筑、道路、热区等视觉隐喻，让用户快速理解：

- 主要模块
- 文件规模
- 模块活跃度
- 核心贡献者
- Ownership 变化
- 大规模重构
- 项目发展阶段

### 2.3 形成强 Demo 与传播效果

目标 Demo：

- “10 Years of React in 60 Seconds”
- “How VS Code Grew Into a City”
- “The Evolution of Rust”
- “Linux Kernel as a City”

---

## 3. 目标用户

- 开源项目开发者
- 新加入大型代码库的工程师
- Tech Lead / Engineering Manager
- 技术内容创作者
- Hackathon / Developer Tool 用户

---

## 4. 核心交互

用户选择一个本地 Git Repository。

系统完成分析后生成城市。

用户可以：

- 平移 / 缩放 / 旋转城市
- Hover / Click 建筑查看文件详情
- 拖动时间轴查看任意历史时刻
- 播放 / 暂停 Repository 演化
- 查看当前 Commit
- 查看 Contributor
- 切换不同分析视角

---

## 5. Git → City 映射规则

### Repository → City

一个 Repository 对应一座城市。

### Directory → District

一级 / 二级目录映射为城区。

例如：

```text
src/
tests/
docs/
packages/
examples/
```

分别形成不同 District。

### File → Building

一个文件对应一栋建筑。

建筑属性：

- Height → LOC / 文件规模
- Footprint → 文件权重或历史修改规模
- District → 所属目录
- Owner → 主要贡献者
- Activity → 最近修改频率
- Created At → 建筑出现时间
- Deleted At → 建筑拆除时间

### Commit → Construction Event

Commit 触发：

- 文件创建 → 建筑出现
- 文件修改 → 建筑更新 / 高亮
- 文件删除 → 建筑消失
- 文件 rename → 建筑迁移
- 大量结构变化 → 城市更新事件

### Developer → Builder / Territory

每个 Author 对应一个 Contributor。

后续版本支持 Contributor Territory：

- 不同开发者控制不同代码区域
- Ownership 随时间发生迁移
- 长期无人维护区域逐渐成为 Ghost District

### Co-change → Road

MVP 优先使用 Co-change 关系代替真实代码依赖：

> 两个文件经常在同一个 Commit 中被修改，则认为存在较强关系。

这样可以跨语言工作，不依赖 AST。

---

## 6. Timeline

时间轴是核心功能。

支持：

- Play
- Pause
- Seek
- Commit Marker
- Tag / Release Marker
- Speed: 0.5x / 1x / 2x / 5x

播放时城市状态随 Git 历史变化。

---

## 7. Commit Panel

当前 Commit 显示：

- Commit hash
- Author
- Timestamp
- Message
- Files changed
- Insertions
- Deletions

相关建筑同步高亮。

---

## 8. Building Detail

点击建筑显示：

- File path
- LOC
- Commit count
- Main contributor
- Contributor count
- Created date
- Last modified date
- Recent activity
- Current status

---

## 9. Story Mode

自动选取重要历史事件：

- First Commit
- 100th / 1000th Commit
- First major contributor
- Largest change
- Largest refactor
- Most active month
- Important tag / release
- Major ownership transition

Story Mode 自动播放，适合作为 Hackathon Demo。

---

## 10. MVP 范围

### P0

必须完成：

- 本地 Git Repository 读取
- Commit History 解析
- File / Author / Timestamp / Insertions / Deletions
- Directory → District
- File → Building
- LOC → Height
- Timeline
- Play / Pause / Seek
- File created / modified / deleted 动画
- Commit Panel
- Building Detail

### P1

优先完成：

- Contributor Color / Ownership
- Release / Tag markers
- Rename handling
- Activity heatmap
- Camera controls
- Repository Overview

### P2

扩展能力（其中 Story Mode / Contributor Territory 已进入 MVP）：

- Contributor Territory
- Ownership Migration
- Ghost District
- Co-change Roads
- Technical Debt View
- Story Mode (implemented MVP)
- AI vs Human View
- Bug Crime Scene
- Architecture Drift

---

## 11. MVP 不做

首版不做：

- GitHub OAuth
- Cloud account
- 多人协作
- 精确跨语言 AST dependency
- Technical Debt 自动结论
- AI Code Detection
- Issue / PR 深度关联
- 真实交通模拟

---

## 12. 页面结构

### Top Bar

- Repo Skyline
- Repository name
- View switcher
- Settings

### Main Canvas

- Isometric / 2.5D City
- District labels
- Buildings
- Roads (later)
- Selection / Hover

### Side Panel

- Repo overview
- Commit detail
- File detail
- Contributor detail

### Bottom Timeline

- History activity
- Commit markers
- Tags
- Playback controls

---

## 13. Demo 流程

1. 打开 Repo Skyline
2. 选择一个真实 Repository
3. 系统分析 Git History
4. 生成当前城市
5. 将时间轴拖回项目早期
6. 点击 Play
7. 建筑随 Commit 不断出现 / 变化 / 消失
8. 展示一次大型重构
9. 切换 Contributor / Ownership 视角
10. 回到当前时间

核心演示点：

> 这里的每一次建筑变化，都来自真实 Git History。

---

## 14. 成功标准

### 视觉

用户 5 秒内能理解：

> “这是一个 Git Repository 变成的城市。”

### 技术

所有可视变化必须来自真实 Git 数据。

### 产品

用户不仅觉得“酷”，还能回答：

- 哪些模块最大？
- 哪些模块最活跃？
- 谁主要维护什么？
- 项目什么时候发生过巨大变化？
- 某个模块是如何成长起来的？

---

## 15. 当前实现状态

当前 Web MVP 已具备：

- 建筑生长 / 修改脉冲 / 删除拆除动画
- District 悬浮标签
- 当前 Commit 文件变化列表
- Contributor Territory 模式
- Git Tag / Release Marker
- 自动识别 First Commit / Major Contributor / Largest Change / Largest Refactor / Release
- Story Mode 关键事件跳转与自动播放
- Story Mode cinematic camera focus
- 大型仓库 `--max-buildings` 演示保护

## 16. 一句话介绍

**Repo Skyline turns Git history into a living city.**

中文：

**把一个 Git 仓库的整个生命周期，变成一座会生长的城市。**

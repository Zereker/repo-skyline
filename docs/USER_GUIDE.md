# Repo Skyline 使用指南

Repo Skyline 把 Git 历史展示为一座随提交演化的城市：目录是城区，文件是建筑，提交触发建筑的创建、更新、迁移和拆除。

当前使用流程是 **在本地分析 Git 仓库，生成 JSON，再通过浏览器查看**。网页导入的是城市数据文件，不是 Git 仓库文件夹。本文保留界面的英文按钮名，方便逐项对照。

## 1. 环境准备

需要安装：

- Git。
- Rust stable，包含 Cargo；可参考 [Rust 安装说明](https://www.rust-lang.org/tools/install)。
- Node.js 22+，包含 npm；可从 [Node.js 官网](https://nodejs.org/) 安装。
- 支持 WebGL 的现代浏览器，建议使用近期版本的 Chrome、Edge 或 Firefox。

以下命令使用 Bash 语法，适用于 macOS、Linux，以及 Windows 的 WSL 或 Git Bash。使用 WSL 时，建议在同一 WSL 环境中安装上述工具。

检查安装：

```bash
git --version
rustc --version
cargo --version
node --version
npm --version
```

## 2. 第一次启动

### 下载项目

```bash
git clone https://github.com/Zereker/repo-skyline.git
cd repo-skyline
```

### 生成城市数据

先用 Repo Skyline 自身的历史体验完整流程。在项目根目录执行：

```bash
cargo run -p repo-skyline-cli -- analyze . \
  -o apps/web/public/city.json
```

第一次运行会下载 Rust 依赖并编译。成功后，终端会打印输出路径、城区数、建筑数和提交数。

### 启动网页

```bash
cd apps/web
npm ci
npm run dev
```

打开终端显示的地址，通常为 `http://localhost:5173`；端口被占用时，以终端实际地址为准。保持终端运行，结束时按 `Ctrl+C`。

网页会自动读取 `apps/web/public/city.json`，初始展示最后一个提交对应的城市。顶部的 **Git-backed data** 表示正在查看 Git 分析数据；**Sample data** 表示正在查看内置示例。

## 3. 分析自己的仓库

### 方法一：生成文件后手动导入

回到 Repo Skyline 项目根目录，把 `/path/to/your-repo` 替换为目标仓库的真实路径：

```bash
cargo run -p repo-skyline-cli -- analyze "/path/to/your-repo" \
  -o city.json
```

随后点击网页顶部的 **Open city JSON**，选择刚生成的 `city.json`。导入后会停止播放，并切换到新仓库的最新状态。路径包含空格时保留引号。

导入的内容只在当前页面使用；刷新后会重新读取 `/city.json` 或内置示例。希望刷新后仍显示该仓库，可使用方法二。

### 方法二：替换启动时的数据

在项目根目录执行：

```bash
cargo run -p repo-skyline-cli -- analyze "/path/to/your-repo" \
  -o apps/web/public/city.json
```

刷新网页即可加载新数据。仓库有新提交或切换分支后，也需要重新分析并刷新；网页不会实时监控 Git。

### 方法三：使用演示脚本

在项目根目录执行：

```bash
# 已有本地克隆
bash scripts/demo-repo.sh "/path/to/your-repo" 1800

# 通过 Git URL 克隆并分析
bash scripts/demo-repo.sh https://github.com/facebook/react.git 1800
```

第二个参数是建筑数量上限，省略时为 `2500`。脚本将外部仓库缓存到 `.demo-cache/`，数据输出到 `apps/web/public/city.json`，完成后仍需启动网页或刷新已打开的网页。

远程仓库需要能通过本机 Git 访问；私有仓库使用本机已有的 Git 认证。网页本身没有 GitHub OAuth 登录入口。脚本适合普通工作区克隆；裸仓库可直接使用 CLI 分析。

### CLI 参数

| 参数                            | 含义                                          |
| ------------------------------- | --------------------------------------------- |
| `analyze <path>`                | 分析该路径仓库当前 HEAD 的历史                |
| `-o <path>` / `--output <path>` | 输出城市 JSON，默认写入当前目录的 `city.json` |
| `--max-buildings <数量>`        | 限制输出的建筑数量；不设置时不限制            |

查看完整帮助：

```bash
cargo run -p repo-skyline-cli -- analyze --help
```

## 4. 城市浏览与历史回放

### 相机与建筑

| 操作         | 效果                   |
| ------------ | ---------------------- |
| 鼠标左键拖动 | 旋转视角               |
| 鼠标右键拖动 | 平移视角               |
| 鼠标滚轮     | 缩放                   |
| 悬停建筑     | 查看文件提示           |
| 点击建筑     | 打开文件详情           |
| **Fit city** | 将整座城市重新放入视野 |

触屏上可用单指旋转、双指缩放和平移。小屏幕的侧栏和时间轴会重排，必要时向下滚动查看。Story 自动播放期间相机由故事控制；点击 **Stop story** 后恢复手动操作。

建筑高度采用文件行数（LOC）的对数映射，适合比较大小，不是“一层等于一行”。重命名时建筑会迁移；删除时会拆除。

### 时间轴

底部时间轴支持：

- **Play / Pause**：播放或暂停连续提交回放。
- **Replay**：从第一个提交重新播放。
- **0.5x / 1x / 2x / 5x**：调整回放速度。
- 拖动滑块：跳到任意提交，并停止当前播放。
- 点击历史活跃柱：跳到对应提交区间的起点。
- 点击 Tag 标记：跳到标签所对应的提交。

到达最后一个提交后播放停止；此时点击 **Play** 会从头开始。速度是回放速度，不代表真实时间流速。

底部 Commit 卡片显示提交信息、作者、时间、短哈希、增删行数及文件变化数。右侧面板列出当前提交的文件变化。

### 文件和贡献者详情

点击建筑后，可查看路径、状态、LOC、累计修改次数、累计增删行数、贡献者数量、主要贡献者、创建和修改时间，以及近期变化。点击近期变化可跳到对应提交。

切换 **Contributor Territory** 后，点击左侧贡献者条目，可查看其主线提交数量、持有的文件和提交日期范围；点击文件详情中的主要贡献者也能打开该面板。

这些统计随时间轴变化。主要贡献者按截至当前提交的累计新增行数确定，不等于最后编辑者，也不等于当前存活代码的逐行归属。

## 5. 分析视图与设置

顶部提供常用视图快捷按钮；左侧 **Analysis view** 下拉框可选择全部视图。

| 界面名称                      | 用途与数据含义                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **District**                  | 按目录观察模块规模和布局                                                                       |
| **Contributor Territory**     | 按累计贡献归属着色，观察贡献者领地变化                                                         |
| **Activity heatmap**          | 当前提交时间之前 30 天内的文件修改活跃度；蓝色较低，红色较高                                   |
| **Ghost District**            | 查找截至当前提交长期没有修改的文件；不活跃不等于已被放弃                                       |
| **Technical Debt indicators** | 展示累计增删行数与当前 LOC 的比值，以及贡献者数量，用于人工审查                                |
| **Bug Crime Scene**           | 查找提交信息包含 `fix`、`bug`、`regression`、`revert`、`hotfix` 的文件变化，可点击证据提交跳转 |
| **Architecture Drift**        | 查看跨目录重命名和重复共变关系；共变关系不是精确代码依赖                                       |
| **AI vs Human provenance**    | 展示显式标记的 AI 辅助或人工提交，未标记的变化保持 unknown                                     |

AI/Human 视图识别提交标题中的 `[ai-assisted]`、`[human-authored]`，或标题开头的 `AI-assisted:`、`Human-authored:`，不区分大小写。例如：

```text
[ai-assisted] add search panel
Human-authored: fix timeline selection
```

它不会检测代码是否由 AI 生成。Bug 关键词也只是线索，不代表已验证缺陷或已关联 Issue。

打开顶部 **Settings** 可调整：

| 设置                | 选项                                           |
| ------------------- | ---------------------------------------------- |
| **Co-change roads** | 显示或隐藏文件共变道路                         |
| **Directory level** | 一级目录、二级目录、完整目录路径；默认二级目录 |
| **Ghost threshold** | 90、180 或 365 天；默认 180 天                 |

## 6. Story Mode 演示

城市下方的 **Story Mode** 会根据 Git 历史选择关键事件，包括首次提交、100/1000 次提交、主要贡献者、最大修改、重构、活跃月份、归属迁移和 Tag。只有符合条件的事件才会出现。

1. 点击事件卡片，跳到对应提交。
2. 点击 **Play story**，从第一个故事事件自动播放，相机随事件聚焦。
3. 点击 **Stop story**，结束故事播放。

Story 与普通时间轴播放互斥。开始其中一种会停止另一种；手动拖动时间轴也会停止自动播放。

建议演示顺序：先展示最新城市，再 **Replay** 观察生长，切换 **Contributor Territory** 查看分工，最后用 **Play story** 展示重要历史事件。

## 7. 大仓库与数据范围

大仓库可先限制为 500 或 1000 栋建筑，例如：

```bash
cargo run --release -p repo-skyline-cli -- analyze "/path/to/large-repo" \
  -o apps/web/public/city.json \
  --max-buildings 1000
```

`--max-buildings` 优先保留最终模型中行数较大的文件，再按修改次数排序。限制后仍保留完整时间轴，但城市和文件规模统计只涵盖保留的建筑，不能当作全仓库总量。它也不会省略 Git 分析过程，因此不保证显著缩短分析时间。

超过 400 栋可见建筑时，界面自动使用简化的实例化建筑，仍支持动画、悬停和选择。若画面拥挤，可隐藏道路、降低建筑上限，再点击 **Fit city**。

理解数据时还需注意：

- 分析从目标仓库的当前 HEAD 出发，沿第一父链回放，不是所有分支提交的逐条展示。合并变更在合并提交处纳入，作者显示为主线或合并作者，不能据此完整统计分支内每位作者的贡献。
- 未提交的工作区修改不会进入城市。切换分支后需重新分析。
- 二进制文件不计算文本 LOC；零高度不代表文件没有内容。无法解码的文件名会跳过并提示。
- 道路来自重复共同修改；超过 200 个跟踪文件的大提交不参与共变计算。模型保留最强的 120 对关系，场景最多展示 80 条。
- Tag 只展示所选第一父链上的标签，不是 GitHub Release API 数据。

## 8. 常见问题

### 显示 Sample data，没有我的仓库

确认分析命令执行成功，并且输出在 `apps/web/public/city.json`；然后刷新网页。也可以使用 **Open city JSON** 手动导入。没有生成文件时，内置示例属于正常回退行为。

### 提示 shallow repository

分析需要完整提交历史。先在目标仓库目录执行：

```bash
git fetch --unshallow --tags
```

再重新分析。不要在新克隆时使用 `--depth`。

### 提示 HEAD 或仓库路径错误

检查路径是否指向 Git 仓库，以及仓库是否至少有一个提交。空仓库无法生成历史城市。相对路径以执行命令时的工作目录为准。

### JSON 导入失败

使用本项目 CLI 生成的城市文件，不要导入 GitHub API JSON 或普通配置文件。手动导入文件应小于 128 MB；JSON 内容必须符合城市数据格式。导入失败会显示错误并保留原城市。

### 城市空白、视角偏移或卡顿

先点击 **Fit city**。确认浏览器启用 WebGL，必要时启用硬件加速或换用近期版本浏览器。大仓库可重新生成更低建筑上限的数据，并在 Settings 隐藏道路。

### 某个分析视图没有证据

当前提交之前可能没有符合条件的记录。尝试将时间轴移到最后；AI/Human 视图需要显式提交标记，Ghost 视图也可能因仓库近期活跃而没有结果。

### 刷新后恢复了旧仓库

手动导入不会写入启动数据。将目标数据输出到 `apps/web/public/city.json`，再刷新即可。

## 9. 构建静态网页

希望网页默认展示某个仓库时，先生成 `apps/web/public/city.json`，再执行：

```bash
cd apps/web
npm ci
npm run build
npx vite preview
```

打开终端显示的预览地址，通常为 `http://localhost:4173`。构建结果位于 `apps/web/dist/`；`vite preview` 用于本地预览。

部署时应将整个 `dist/` 放在站点根路径，因为网页默认从 `/city.json` 读取数据。生成数据包含文件路径、提交信息和贡献者身份，公开托管前请确认这些内容适合公开。

更详细的数据定义、验收记录和验证命令见 [ACCEPTANCE.md](ACCEPTANCE.md)。

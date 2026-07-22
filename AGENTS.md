# Galois Agent Instructions

真实模型测试必须流式监控，不可以只看最终结果。运行 `npm run build`、`npm run package:mac`、脚本探针或真实模型命令时，需要持续轮询输出，直到进程退出。

## 文档基准

优先阅读 `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md`。当 README、skill 文档、历史注释和源码不一致时，以该文档记录的“当前事实 + 迁移目标”为准。

相关文档：

- `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md`
- `docs/APP_DEVELOPMENT_SCENARIOS.md`
- `docs/PLUGIN_ENVIRONMENT.md`
- `docs/MACOS_DMG_ONBOARDING.md`
- `docs/PROJECT_STRUCTURE_AND_MIGRATION_AUDIT.md`
- `.agents/skills/*/SKILL.md`

## 模式判定

Galois 只有三种工作模式。不要要求用户声明“我是开发者”才能进入构建模式；优先用启动目录和任务目标判断。

1. **源码开发模式（Source Development Mode）**：当前工作目录不在 `~/Documents/Galois/` 下，且是 Galois 源码仓库。修改当前源码仓库。
2. **构建模式（Build Mode）**：当前工作目录在 `~/Documents/Galois/workbench/Galois-vscode-core/` 下，或用户在应用内要求开发页面、按钮、快捷键、主题、设置、CORE/APP 能力。修改完整外部副本。
3. **协助模式（Assist Mode）**：当前工作目录在具体笔记项目下，或任务目标是写作、整理、标签、媒体、搜索、笔记项目脚本。修改笔记项目内容和笔记项目脚本。

目录判断：

1. 工作目录不包含 `/Documents/Galois/`，并且包含 `APP/`、`CORE/`、`package.json`、本 `AGENTS.md` 等源码标记时，进入源码开发模式。
2. 工作目录包含 `/Documents/Galois/workbench/Galois-vscode-core/` 时，进入构建模式。
3. 工作目录位于 `~/Documents/` 下，并且该目录或其上级目录包含 `.dnote_runtime.json`、`command/commands.json`、`.dnote/`、`script/`、`media/` 或 Markdown 笔记文件时，进入协助模式。

## Skill 路由

- `dnote-runtime`：当前笔记项目、`.dnote_runtime.json`、active file、光标、选区、协助模式入口。
- `dnote-project-overview`：协助模式初始化时生成有界项目地图；了解已有 Markdown、命令、脚本、配置与媒体概况，禁止用无上限递归目录代替。
- `dnote-tags`：Frontmatter tags、正文 `#标签`、`re:`、`run:`、文件图标、标签解析。
- `dnote-command-scripts`：`command/commands.json`、Slash content 命令、项目脚本、反应式表达式、生命周期钩子、项目依赖。
- `dnote-search`：文件树搜索、标签布尔查询、正则标签过滤、图与搜索联动的查询语义。
- `dnote-app-plugins`：APP 页面、右栏按钮、快捷键、动作、Blood 订阅、插件服务脚本、`plugin.json`。
- `dnote-configs`：主题、字号、快捷键配置、布局、窗口状态、Settings UI、配置 IPC。
- `dnote-graph-view`：`APP/graph-view` 标签格/拓扑图、lattice 算法、标签数量滑杆、虚标签合并、图搜索联动。

## 项目形态

Galois 是 TypeScript / Electron / Vite / React 同仓项目：

- `CORE/`：Electron 主进程、IPC、窗口、布局、Blood 状态同步、ActionRegistry、平台能力桥。
- `APP/`：器官插件层，插件即组件，插件即应用能力。
- `template-project/`：DMG 首次启动可复制的模板笔记项目。
- `~/Documents/Galois/workbench/Galois-vscode-core/`：packaged app 启动时从 App 内经典代码拷出的完整可写运行工作台。
- `{projectPath}/media/`：笔记项目自己的可见媒体归档目录。
- `{projectPath}/.dnote_assets/`：笔记项目自己的生成媒体资产目录，如视频时间线元数据和片段。
- 完整视频 `![video](media/file.ext)` 与时间线片段 `@video[label](file.ext?t=start,end)` 是两套路径契约；后者只引用 `.dnote_assets/videos/` 内的文件名。不要把 `media/...` 路径直接写进 `@video`。

当前架构是 Blood-first。`CORE/services.ts`、`CORE/platform.ts`、`CORE/extensionHost.ts` 等 VS Code 风格基础设施已经存在，但还不是 Blood 的替代品。新开发可以借鉴这些服务边界，但不能把迁移目标写成已完成事实。

## 边界原则

1. `CORE` 保持极简、通用、尽量无业务状态，只提供文件、命令、终端、窗口、配置、平台/脚本桥和跨窗口 Blood 同步。
2. 具体业务控制、生命周期维护、周期执行、脚本环境拼接、缓存读取等逻辑应在 `APP/` 器官内闭环。
3. 组件不直接互相调用业务逻辑，只读写 Blood channel；状态改变后广播变化频道。
4. `APP` 组件运行外部脚本后，应自行读取结果并写入 Blood，禁止在主进程中为某个业务写专用 `fs.watch`。
5. 新脚本执行优先使用统一桥：插件服务脚本用 `electronAPI.runScript`，笔记项目脚本用 `electronAPI.runProjectScript`。

Blood key 只能使用 `system.*`、`layout.*`、`actions.*`、`events.*`。动作信号必须写 timestamp，不要用 boolean。

## 快捷键注册表

运行中的编辑器会把 `ActionRegistry` 的完整快照写入当前项目的
`.dnote_runtime.json.shortcutRegistry`。其中每个 action 都包含 `id`、作用域、
默认快捷键、当前生效快捷键和 `default / overridden / unbound` 状态。

Agent 新增或修改 APP action、项目命令快捷键前，必须先读取这个运行时注册表；
不得只搜索源码中的 `defaultShortcut`，也不得只查看用户的 `shortcuts.json`。
全局 action 与所有作用域冲突，同一 `sourceType` 内的 action 互相冲突。若运行时
快照暂不可用，再联合检查 `CORE/ActionRegistry.ts`、`APP/*/actions/`、当前项目
`command/commands.json` 和 `~/Documents/Galois/config/shortcuts.json`。

## 模式边界

源码开发模式：

- 修改当前源码仓库中的 `APP/`、`CORE/`、`docs/`、`.agents/skills/`、`AGENTS.md`、打包脚本和模板。
- 页面开发、按钮开发、快捷键开发、主题开发、设置开发、CORE/平台开发都修改当前源码仓库。
- 用户要求把当前源码应用到 `~/Documents/Galois/workbench/Galois-vscode-core/`
  时，先完成类型检查和普通构建，再在当前源码仓库运行
  `npm run sync:workbench`。若改动涉及 `CORE/main.ts`、`CORE/preload.ts`、
  Electron IPC 或需要立即重启外部工作台，运行
  `npm run sync:workbench -- --reopen`。该命令会在目标 Git 工作树不干净时拒绝覆盖，
  保留外部 workbench 中源码仓库不存在的 `APP/[plugin]/` 用户插件目录，并在同步后
  自动创建一个 Git 回滚提交，使下一次同步仍可直接执行。
- 功能开发默认只运行 `npx tsc --noEmit` 和 `npm run build`。不要因为“源码开发模式”或“构建模式”自动运行 `npm run package:mac`。

构建模式：

- 修改 `~/Documents/Galois/workbench/Galois-vscode-core/` 这个完整外部副本。
- 可以改外部副本中的 `APP/`、`CORE/`、`docs/`、`.agents/skills/`、`AGENTS.md`、主题、配置 schema 和模板。
- 外部副本必须优先使用 Git 作为安全网；经典代码恢复只作为最后兜底。
- 已经位于外部 workbench 时直接编辑，不要运行 `sync:workbench`（源和目标相同）。
- 不要把构建模式的改动写入具体笔记项目，也不要修改已安装 `.app` bundle。
- 构建模式的“构建”表示开发/构造功能，不等于打包发布。开发页面、按钮、快捷键、主题时只做类型检查和普通构建验证，除非用户明确要求 DMG/打包/发布。

协助模式：

- 默认工作对象是当前笔记项目。
- 必须先读取 `{projectPath}/.dnote_runtime.json`，再判断当前文件、光标和选区。
- 每个任务首次进入某个笔记项目时，必须随后使用 `dnote-project-overview` 生成一次有界项目地图；同一任务内复用该摘要，仅在切换项目或目录结构发生实质变化后刷新。
- 项目概况只能列出受限数量的路径、命令元数据和媒体统计，不得为“了解项目”读取全部 Markdown 正文、展开无限目录树或注入缓存/依赖目录。
- 可以修改当前笔记项目中的 Markdown、`command/commands.json`、`script/`、`.dnote/`、`pyproject.toml`、`uv.lock`、`media/`。
- 可以帮助用户编写和管理笔记项目脚本、动态标签、Slash content 命令、生命周期钩子和项目依赖。
- 不要修改 `APP/`、`CORE/`、`docs/`、`.agents/skills/`、`AGENTS.md`、`package.json`。

## 依赖与环境

应用层由 `package.json`、`package-lock.json`、Electron/Vite 打包流程负责，DMG 用户不应手动管理应用层 Node 依赖。

插件层服务脚本放在 `APP/[plugin]/services/`，解释器和包声明放在该插件自己的 `plugin.json` 或 PEP 723 元数据里。插件服务脚本不得偷用笔记项目 `.venv`。

笔记项目层由项目自己管理 `command/commands.json`、`script/`、`.dnote/config.json`、`pyproject.toml`、`uv.lock`、PEP 723 和 `.venv/`。

## 开发、发布与验证

日常功能开发、极简测试、页面/按钮/快捷键/主题开发：

```bash
npx tsc --noEmit
npm run build
```

如果当前 App 已通过 `npm run dev` 或 packaged launcher 启动，页面、按钮、主题和快捷键开发优先依赖 Vite/HMR，不要为了“让页面出现”运行 `npm run build`。新增 `APP/[plugin]/index.ts` 会在开发态被自动扫描并注册。

涉及 `CORE/main.ts`、`CORE/preload.ts`、Electron IPC、启动器、打包脚本或原生依赖时，属于内核/平台改动。此类改动需要重新编译 Electron 主进程并重启外部 workbench：

```bash
npm run rebuild:reopen
```

禁止把“构建一个主题”“构建模式”“build a page/button/shortcut/theme”理解为需要生成 DMG。

只有当用户明确要求“打包”“DMG”“发布”“分发”“package:mac”时，才进入发布验证。

当前发布目标是 unsigned 内部/本地 DMG：

- 不做 Developer ID signing。
- 不做 notarization。
- 不做 staple。

发布前至少验证：

```bash
npx tsc --noEmit
npm run build
npm run package:mac
```

如果生成 DMG，最终回复需要给出 `.dmg` 绝对路径。

## 文件长度与 Git

- 原则上每个 TS/TSX 文件不超过 400 行。修改遗留大文件时优先抽 hooks、services 或工具文件。
- 当前迁移后的受管 APP/CORE 文件没有超过 500 行；400 行上下且职责单一的文件可以保留，禁止为了凑行数按任意区段拆分。
- 工作树可能很脏，不要回滚用户或前序任务改动。
- 不要使用 `git reset --hard` 或 `git checkout --`，除非用户明确要求。
- 推送前确认远端和目标分支。
- 推送主分支前必须完成类型检查、构建和 DMG 打包验证。

# DNOTE Agent Instructions

真实模型测试必须流式监控，不可以只看最终结果。运行 `npm run build`、`npm run package:mac`、脚本探针或真实模型命令时，需要持续轮询输出，直到进程退出。

## 文档基准

优先阅读 `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md`。当 README、skill 文档、历史注释和源码不一致时，以该文档记录的“当前事实 + 迁移目标”为准。

相关文档：

- `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md`
- `docs/EXTENSION_WORKSPACE.md`
- `docs/PLUGIN_ENVIRONMENT.md`
- `docs/MACOS_DMG_ONBOARDING.md`
- `.agents/skills/*/SKILL.md`

## 项目形态

DNOTE 是 TypeScript / Electron / Vite / React 同仓项目：

- `CORE/`：Electron 主进程、IPC、窗口、布局、Blood 状态同步、ActionRegistry、平台能力桥。
- `APP/`：器官插件层，插件即组件，插件即应用能力。
- `extensions/`：随包分发并种子复制到用户扩展目录的 side-loaded script extension 示例。
- `template-project/`：DMG 首次启动可复制的模板笔记项目。

当前架构是 Blood-first。`CORE/services.ts`、`CORE/platform.ts`、`CORE/extensionHost.ts` 等 VS Code 风格基础设施已经存在，但还不是 Blood 的替代品。新开发可以借鉴这些服务边界，但不能把迁移目标写成已完成事实。

## 仿生设计原则

血液：

- 整个项目维持共享状态。
- 组件不直接互相调用业务逻辑，只读写 Blood channel。
- 状态改变后广播变化频道。

器官：

- `APP/` 下的组件都是器官。
- 插件 UI、业务逻辑、hooks、services、actions 应在器官内闭环。

器官抗体：

- 组件订阅自己关心的 Blood channel。
- 收到广播后只处理相关变化。
- 动作信号通过 `lastAction` 或 Blood channel 进入器官。

## CORE 与 APP 边界

1. `CORE` 保持极简、通用、尽量无业务状态，只提供文件、命令、终端、窗口、配置、平台/脚本桥和跨窗口 Blood 同步。
2. 具体业务控制、生命周期维护、周期执行、脚本环境拼接、缓存读取等逻辑应在 `APP/` 器官内闭环。
3. `APP` 组件运行外部脚本后，应自行读取结果并写入 Blood，禁止在主进程中为某个业务写专用 `fs.watch`。
4. 新脚本执行优先使用统一桥：
   - 插件服务脚本：`electronAPI.runScript`
   - 笔记项目脚本：`electronAPI.runProjectScript`

## Blood Channel 命名

所有 Blood key 必须属于以下命名空间之一：

| 前缀 | 用途 |
| --- | --- |
| `system.*` | 焦点、窗口、区域、运行时、配置状态 |
| `layout.*` | 面板拆分、关闭、弹出、合并 |
| `actions.*` | 用户输入转译后的动作信号 |
| `events.*` | 文件保存、打开文件、脚本完成等业务事件 |

动作信号必须写 timestamp：

```typescript
// ComponentRegistry.ts 内部，action.id 已经是 "[plugin-name].[actionName]" 形式
// 最终键格式为：actions.[plugin-name].[actionName].[areaId]
Blood.updateKey(`actions.${act.id}.${context.areaId}`, Date.now());
```

不要用 boolean。连续点击同一个按钮时 boolean 无法表达新事件。

## APP 插件目录规范

任何 `APP/[plugin-name]/` 插件应遵循：

```text
APP/[plugin-name]/
├── index.ts
├── [PluginView].tsx
├── actions/
│   ├── [ActionName]Action.ts
│   └── index.ts
├── hooks/            （可选）
├── services/         （可选，Python/脚本辅助）
├── README.md         （可选）
└── plugin.json       （可选，解释器声明等元数据）
```

视图主文件直接放在插件根目录。不要随意新增 `components/`，除非该插件已有明确约定。

当前已注册的内置 APP 插件（`typeId`）：`editor`、`fileTree`、`graphView`、`linkGraph`、`terminal`、`settings`、`agent`、`videoTimeline`。

`APP/env-check/` 目录**不是**内置注册插件（无 index.ts），它是 side-loaded script extension 的开发示例，使用 `extensions/env-check/` 的资产结构。

动作声明接口（定义在 `CORE/ComponentRegistry.ts`）：

```typescript
export interface OrganAction {
  id: string;
  label: string;
  defaultShortcut?: string;
  isToolbar?: boolean;
  icon?: React.ReactNode;  // 可选
}
```

`id` 使用 `[plugin-name].[actionName]`，例如 `editor.save`、`graphView.recenter`。

## 依赖与环境分层

应用层：

- 由 `package.json`、`package-lock.json`、Electron/Vite 打包流程负责。
- DMG 用户不应手动管理应用层 Node 依赖。
- 发布前应使用干净 `npm ci` 环境验证。

插件层：

- 插件服务脚本放在 `APP/[plugin]/services/` 或 side-loaded extension 的 `services/`。
- 插件需要解释器时，在自己的 `plugin.json` 里声明 `interpreters`。
- 插件服务脚本不得偷用笔记项目 `.venv`。
- Python 插件服务脚本优先用 PEP 723 + `uv run script.py`。

笔记项目层：

- `command/commands.json`、`script/on_project_*.py`、动态标签脚本、反应式表达式脚本由笔记项目自己管理。
- 可使用项目 `.venv`、`.dnote/config.json`、`pyproject.toml`、`uv.lock` 或 PEP 723。

## 扩展工作区

源码开发模式：

- 助手可以修改 `APP/`、`docs/`、`.agents/skills/`、项目脚本。
- Vite HMR 支持内置插件快速调试。

DMG 安装模式：

- `.app` bundle 是只读应用资产，不是插件开发目录。
- 助手默认服务用户打开的笔记项目。
- 插件开发应放在 Electron `userData/extensions/` 或用户显式添加的 App 外部开发扩展路径。
- 当前 side-loaded extension 支持 metadata、interpreter lookup、service scripts 和 Extension Lab 运行；动态 UI bundle 加载仍是迁移目标。

## 编辑器当前事实

编辑器有两个面向用户的主模式：

- Live Preview：CodeMirror 6 编辑态实时预览。
- Reading：阅读渲染 + 局部交互式编辑。

Source 模式只保留为内部保底路径，不作为普通用户主入口。

当前 Reading 模式支持：

- 点击块进入局部文本编辑。
- `/` slash commands，从 Reading 块编辑器中插入同一套内置、自定义、项目 content 命令。
- Markdown 表格单元格编辑。
- 表格 hover 工具条增行、增列。
- 媒体和 CLIP 行级拖入。

编辑器新增命令、列表、表格体验时，应优先保持 Live Preview 与 Reading 共用命令执行逻辑，避免两套命令漂移。

## 项目指令与 Slash Menu

`command/commands.json` 分流：

- `"script"`：后台脚本命令，默认隐藏于 `/` 菜单，通过快捷键或动作触发，输出到 `.dnote_cache/` 并广播 `events.commandExecuted.{id}`。
- `"content"`：插值模板命令，在 `/` 菜单显示，插入正文或反应式表达式。
- `"scope"`：`global` / `all` / `true` 表示全局；`editor`、`fileTree`、`graphView` 等表示局部。

## Graph View 当前事实

只把 `APP/graph-view` 视为标签格/拓扑图。

图谱算法目标：

- 实体标签不被数量滑杆减少。
- 数量/粒度滑杆只影响虚标签合并与抽象层展示。
- 重复且没有其它所指的虚标签需要合并，最抽象层应展示尽可能少的节点。
- 避免 dense NxN 爆炸，优先使用 bitmask、支持集等价类、候选上限和 transitive reduction。

Python 依赖必须来自插件服务脚本自己的声明，不能依赖某个笔记项目环境。`lattice.py` 不应要求用户手动安装 `numpy`。

## macOS DMG

当前发布目标是 unsigned 内部/本地 DMG：

- 不做 Developer ID signing。
- 不做 notarization。
- 不做 staple。

打包命令：

```bash
npm run package:mac
```

产物目录：

```text
.build/
```

发布前至少验证：

- `npx tsc --noEmit`
- `npm run build`
- `npm run package:mac`

如果生成 DMG，最终回复需要给出 `.dmg` 绝对路径。

## 文件长度与模块化

原则上每个 TS/TSX 文件不超过 400 行。当前有遗留大文件，例如 `APP/editor/Editor.tsx` 和 `APP/editor/MarkdownPreview.tsx`。修改这些文件时：

- 优先抽 hooks、services 或独立工具文件。
- 如果正在修紧急体验问题，允许小范围修改遗留大文件，但不要继续把新复杂逻辑堆进去。
- 后续重构应把编辑器命令执行、Reading 交互、Markdown 表格操作拆出。

## Git 与发布注意事项

- 工作树可能很脏，不要回滚用户或前序任务改动。
- 不要使用 `git reset --hard` 或 `git checkout --`，除非用户明确要求。
- 推送前确认远端和目标分支。
- 推送主分支前必须完成类型检查、构建和 DMG 打包验证。

项目框架
TypeScript/Electron/React 包揽前后端 (Electron Main 为后端，Vite/React 为前端，保持同仓统一)
现阶段开发目标，跑通基础结构


APP/
    demo——plugging/
CORE/


项目架构使用仿生设计：

血液：
整个项目维持一个state，所有组件不直接和其它组件通讯，只修改state，state修改后向其它组件广播哪些频道被修改了

器官：
APP下的组件，插件即是组件即是应用本身

器官抗体：
收到广播后检查自己关注的频道是否有变化，没变化就不关心有变化就执行程序

插件需要实现一些统一的接口：
插件需要注册到的注册表
插件监听什么数据
触发插件运行的条件

解耦与高内聚设计规范（APP 与 CORE 的边界）：
1. 核心后端（CORE）应当保持极简、无状态，只作为通用底层 API 提供者（如文件读写、执行命令）和跨窗口状态广播总线。
2. 所有涉及具体业务的控制逻辑、生命周期维护、周期性执行（定时器）、脚本环境准备（如环境变量拼接）等，必须在 APP 内的组件（器官）中独立闭环实现，不得侵入 CORE。
3. 当 APP 中的组件通过 execCommand 运行外部脚本后，组件应当自行读取生成的文件并利用 Blood 更新全局状态，以实现跨窗口的器官抗体触发，绝对禁止在主进程中编写专用文件监听器（fs.watch）。

4. APP 插件目录组织与动作/按钮接口规范 (APP Plugin Layout & Action Spec)：
任何在 `APP/` 下创建的组件/器官，都必须遵循以下**规范化文件目录结构**与**统一动作声明接口**：

#### A. 目录结构规范
```
APP/[plugin-name]/
├── index.ts                # 统一入口：暴露组件对象、名称、图标以及所有的 Actions 声明
├── components/             # UI 组件目录
│   └── [PluginView].tsx    # 主渲染界面组件
├── actions/                # 动作逻辑与按钮声明目录（对应 button1, button2 等）
│   ├── [SaveAction].ts     # 具体动作逻辑与图标 SVG 定义
│   └── index.ts            # 导出所有 actions
├── hooks/                  # 器官专属逻辑与自定义 Hook (可选)
└── services/               # 专属计算服务与数据读取逻辑 (可选)
```

#### B. 统一动作与按钮接口定义
每个具体动作或右侧栏按钮都必须是一个满足以下接口的声明对象：
```typescript
import React from 'react';

export interface OrganAction {
  id: string;              // 全局唯一标识符，格式为 "[plugin-name].[actionName]" (例如 "editor.save")
  label: string;           // 按钮悬浮提示/动作显示名称
  defaultShortcut?: string;// 默认热键绑定，统一为小写，使用 "+" 连接（如 "meta+s", "control+l"）
  isToolbar?: boolean;     // 是否自动挂载到统一右侧栏 (true 时，聚焦该面板自动在右侧栏渲染该按钮)
  icon: React.ReactNode;   // 统一图标规格：14x14px 细线条线框 SVG (currentColor, strokeWidth=1.5)
}
```

#### C. 仿生双向反射链路
- **输入感觉**：用户在右侧栏点击按钮或按下快捷键时，`ActionRegistry.runAction` 被调用。
- **血液流通**：CORE 拦截输入，并将其转化为血液信号：`Blood.updateKey('actions.[id].[areaId]', Date.now())`。  
  ⚠️ 动作信号**必须使用 timestamp**（`Date.now()`），不要用 `true`。理由：同一个按钮连续点击也要触发，boolean 无法区分。
- **抗体捕获**：`ComponentWrapper` 通过 `Blood.subscribe` 直接监听 `actions.*` 频道变化，提取 `lastAction` 并注入到插件组件的 prop 里。在 `[PluginView].tsx` 中，通过 `useEffect(() => { if (lastAction?.id === 'xxx') ... }, [lastAction])` 捕获并执行。

#### D. 血液频道命名规范（Blood Channel Namespace）
所有 Blood key 必须属于以下四个命名空间之一：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `system.*` | 焦点、窗口、区域、运行时状态 | `system.focusedAreaId`, `system.areaComponentTypes.{id}` |
| `layout.*` | 面板拆分、关闭、弹出、合并 | `layout.splitArea.{id}`, `layout.removeArea.{id}`, `layout.popArea.{id}` |
| `actions.*` | 用户输入转译后的动作信号（timestamp） | `actions.editor.save.{areaId}` = `Date.now()` |
| `events.*` | 文件保存、打开文件、脚本完成等业务事件 | `events.openFile.{areaId}`, `events.fileSaved.{path}` |

**禁止**在 CORE 里使用 `project.*`、`debug.*` 等非规范前缀。这些应迁移到上述四个命名空间中。

#### 5. 项目指令与插值片段配置规范 (`commands.json` & Slash Menu)
任何在项目 `command/commands.json` 中配置的动作均需遵循以下分流设计，并在 `Editor` 面板中闭环实现：
- **后台脚本指令 (`"script"` 字段)**：用于在后台通过 `execCommand` 静默运行外部 Python 脚本。为了防止菜单杂乱且不污染正文，此类命令**必须在编辑器斜线 `/` 菜单中隐藏**，仅通过全局/局域快捷键或右侧栏挂载动作静默触发，执行完毕后将结果状态写回 `.dnote_cache/`，并通过 `events.commandExecuted.{id}` 广播。
- **插值模板指令 (`"content"` 字段)**：用于在光标处插入富文本或反应式插值小部件占位符（如 `{{ ... }}`）。此类指令**必须在编辑器斜线 `/` 自动补全菜单中显示**，插入文本后依靠渲染层的 `ReactiveExpression` 钩子实现自动解析执行。
- **作用域自定义声明 (`"scope"` 字段)**：配置指令在哪些页面/视图可被快捷键触发。
  - `"global"` / `"all"` / `true`：全局快捷键，在任何页面聚焦时（甚至无焦点时）均可触发。含 `"script"` 的命令默认值为 `"global"`。
  - `"editor"`、`"fileTree"`、`"graphView"` 等页面/组件类型 ID：局域快捷键，仅在聚焦于对应的组件页面时，快捷键才生效。含 `"content"` 的插值命令默认值为 `"editor"`。

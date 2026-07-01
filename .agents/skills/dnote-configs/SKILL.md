---
name: dnote-configs
description: "Use in Galois Build Mode for global user configuration: themes, font sizes, keybindings, shortcuts, workspace layout, window state, settings persistence, and config files under ~/Documents/Galois/config."
---

# Galois Configuration Files Specification (`dnote-configs`)

本文档定义 Galois 应用中所有配置文件的存储路径、序列化格式、Schema 规范，以及读写这些配置的正确方式。

## 0. 模式边界

使用本 skill 代表 agent 已进入 **Build Mode / theme and configuration build**，或在源码开发模式中修改配置系统。

在构建模式下，本 skill 可以修改完整外部副本中的 Settings UI、配置 schema、主题种子、配置 IPC 和默认值，也可以修改 `~/Documents/Galois/config/` 下的用户配置。

在源码开发模式下，本 skill 修改当前源码仓库中的 Settings UI、配置 schema、主题种子、配置 IPC 和默认值。

在协助模式下，只有当用户明确要求调整自己的全局配置时，才修改 `~/Documents/Galois/config/`；不要因为写笔记而修改 APP/CORE。

适用任务：

- 新增或修改 Settings 中的全局配置项。
- 修改主题、字号、快捷键、布局、窗口状态。
- 排查配置没有即时生效、没有写入文稿目录、或误写入 `.app` bundle 的问题。

不适用任务：

- 用户只是要写笔记、改标签、插入媒体或搜索笔记。这些属于 Assist Mode。
- 笔记项目自己的脚本依赖配置。这些属于 `dnote-command-scripts`。

---

## 1. Galois Home 根目录

所有全局用户配置集中存储在用户可见的文稿目录中，便于查找、备份和删除：

| 平台 | 路径 |
|------|------|
| macOS | `~/Documents/Galois/` |
| Windows | 用户文档目录下的 `Galois/` |
| Linux | 用户文档目录下的 `Galois/` |

在 Electron 主进程中通过 `app.getPath('documents')` 拼接 `Galois` 获取该目录。当前实现不要再使用 `app.getPath('userData')` 作为 Galois 的配置、布局、快捷键或用户扩展目录。

---

## 2. 配置文件注册表

### 2.1 主题与偏好 (`galois.config.json`)

存储主题偏好、编辑器样式、终端选项等全局设置。

- **路径**：`~/Documents/Galois/config/galois.config.json`
- **Blood 频道**：`system.config`（App 启动时加载并写入 Blood）

```json
{
  "theme": "default-light",
  "editor": {
    "fontSize": 14,
    "fontFamily": "Fira Code",
    "lineHeight": 1.6,
    "autosaveDelay": 500
  },
  "graph": {
    "showOrphans": true,
    "maxNodes": 500,
    "nodeFontSize": 9,
    "controlFontSize": 11,
    "drawerFontSize": 12
  },
  "terminal": {
    "shell": "",
    "fontSize": 13,
    "autoStartAgy": true,
    "autoStartAgyConfigured": false
  },
  "appearance": {
    "uiFontSize": 12,
    "panelTitleSize": 11,
    "sidebarLabelSize": 11,
    "sidebarIconSize": 14,
    "fileTreeTitleSize": 11,
    "fileTreeTagSize": 8.5,
    "slashMenuTitleSize": 11,
    "slashMenuDescriptionSize": 9,
    "timelineFontSize": 11
  }
}
```

内置主题会在启动时作为可修改种子复制到：

- **路径**：`~/Documents/Galois/config/themes/*.css`

用户可以直接编辑这些 CSS，或复制一份新的 `custom-name.css`。渲染层必须通过 `electronAPI.listThemes()` 和 `electronAPI.getThemeCss(themeId)` 获取主题列表与 CSS，不要直接使用 Node `fs`。

主题 IPC：

```typescript
listThemes(): Promise<Array<{ id: string; name: string; path: string; source: string }>>
getThemeCss(themeId: string): Promise<string>
```

`themeId` 会被清理为 `[a-zA-Z0-9_-]`，对应
`~/Documents/Galois/config/themes/{themeId}.css`。

### 2.2 键盘快捷键 (`shortcuts.json`)

存储用户自定义快捷键映射。

- **路径**：`~/Documents/Galois/config/shortcuts.json`
- **格式**：`{ "actionId": "combo" }` 平铺结构（大小写不敏感，`+` 分隔）

```json
{
  "editor.save":         "meta+s",
  "editor.toggleMode":   "meta+e",
  "editor.delete":       "meta+backspace",
  "terminal.clear":      "control+l",
  "fileTree.openFolder": "meta+o",
  "panel.splitHorizontal": "meta+d",
  "panel.splitVertical":   "meta+shift+d",
  "panel.popOut":          "meta+shift+p",
  "panel.close":           "meta+w"
}
```

快捷键格式规则：
- 全小写
- 修饰键：`meta`（⌘/Win）、`control`、`alt`、`shift`
- 使用 `+` 连接，无空格
- 最后一段为实际按键（如 `s`、`backspace`、`enter`）

### 2.3 面板工作区布局 (`layout.json`)

存储递归网格分割布局树。如果该文件在启动时存在，Galois 会精确还原上次的面板布局。

- **路径**：`~/Documents/Galois/config/layout.json`

布局节点分为两种类型：`split`（分割节点）和 `area`（叶节点面板）。

```json
{
  "type": "split",
  "direction": "horizontal",
  "ratio": 0.22,
  "first": {
    "type": "area",
    "id": "file-tree-root",
    "componentType": "fileTree"
  },
  "second": {
    "type": "split",
    "direction": "horizontal",
    "ratio": 0.55,
    "first": {
      "type": "area",
      "id": "editor-root",
      "componentType": "editor"
    },
    "second": {
      "type": "area",
      "id": "graph-root",
      "componentType": "graphView"
    }
  }
}
```

`componentType` 有效值（已注册插件 typeId）：

| typeId | 说明 |
|--------|------|
| `editor` | Lattice Editor 文本编辑器 |
| `fileTree` | Lattice Explorer 文件浏览器 |
| `graphView` | Lattice Graph 标签拓扑图 |
| `terminal` | Terminal Console 终端控制台 |
| `settings` | Preferences 偏好设置 |
| `videoTimeline` | 视频时间轴剪辑 |

### 2.4 主窗口状态 (`window-state.json`)

存储 Electron 主窗口的位置和尺寸，用于多次启动的无缝还原。

- **路径**：`~/Documents/Galois/config/window-state.json`

```json
{
  "x": 100,
  "y": 80,
  "width": 1440,
  "height": 900
}
```

### 2.5 项目打开状态 (`project-state.json`)

存储项目级恢复状态，例如最近打开的文件、面板状态、光标相关状态。读写接口：

```typescript
getProjectState(projectPath: string): Promise<any>
setProjectState(projectPath: string, state: any): Promise<boolean>
```

该文件是全局配置状态的一部分，路径为：

- **路径**：`~/Documents/Galois/config/project-state.json`

---

## 3. 配置 IPC 读写通道

渲染进程（APP 插件）**禁止**直接通过 Node `fs` 读写这些配置文件。
必须使用 Electron preload 注入的安全 bridge 接口：

```typescript
// 读取全局配置
const config = await window.electronAPI.getConfig();   // => Promise<any>
// 写入全局配置
await window.electronAPI.setConfig(config);            // => Promise<boolean>
// 读取可用主题与主题 CSS
const themes = await window.electronAPI.listThemes();
const css = await window.electronAPI.getThemeCss('default-light');

// 读取快捷键配置
const shortcuts = await window.electronAPI.getShortcuts(); // => Promise<any>
// 写入快捷键配置
await window.electronAPI.setShortcuts(shortcuts);          // => Promise<boolean>

// 读取布局配置
const layout = await window.electronAPI.getLayout();   // => Promise<any>
// 写入布局配置
await window.electronAPI.setLayout(layout);            // => Promise<boolean>

// 读取/写入项目恢复状态
const state = await window.electronAPI.getProjectState(projectPath);
await window.electronAPI.setProjectState(projectPath, state);
```

---

## 4. 运行时配置启动顺序

`CORE/App.tsx` 在主窗口初始化时（`initApp()`）按以下顺序加载配置：

```
0. electronAPI.getRuntimeInfo() + electronAPI.getEnvironmentStatus()（并行）
      → Blood: system.runtimeMode, system.sourcePluginPath,
               system.canWriteSourcePlugins, system.agentWorkspace, system.environmentStatus

1. electronAPI.getConfig()
      → Blood: system.config
      （主题应用在 App 挂载时的独立 useEffect 中，监听 events.themeChanged 和 system.config）

2. 项目路径恢复：
   - 读取 localStorage('dnote_last_project')
   - 调用 electronAPI.pathExists() 验证路径有效性
   - 若无效则 electronAPI.getDevDefaultProject()（开发/首次启动 fallback）
      → Blood: system.projectPath

3. electronAPI.getShortcuts()
      → ActionRegistry.loadShortcuts(shortcuts)

4. electronAPI.getLayout()
      → setLayout(savedLayout)（还原面板布局，空布局时回退 defaultLayout）
```

---

## 5. 开发环境快捷键文件

在**开发环境**中（`npm run dev`），项目根目录可能存在 `dnote_shortcuts.json`，
这是历史开发期参考文件，不会影响当前生产环境的 `~/Documents/Galois/config/shortcuts.json`：

```json
{
  "editor.save": "meta+s",
  "terminal.clear": "control+l"
}
```

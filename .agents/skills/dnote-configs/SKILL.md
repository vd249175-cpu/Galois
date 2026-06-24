---
name: dnote-configs
description: Guidelines on how to locate, read, and write DNOTE workspace configuration files (theme, keybindings shortcuts, workspace split layout, window size bounds).
---

# DNOTE Configuration Files Specification (`dnote-configs`)

本文档定义 DNOTE 应用中所有配置文件的存储路径、序列化格式、Schema 规范，以及读写这些配置的正确方式。

---

## 1. App Data 根目录

所有全局用户配置存储在平台标准应用数据容器中：

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/DNOTE/` |
| Windows | `%APPDATA%\DNOTE\` |
| Linux | `~/.config/DNOTE/` |

在 Electron 主进程中通过 `app.getPath('userData')` 获取该目录。

---

## 2. 配置文件注册表

### 2.1 主题与偏好 (`dnote.config.json`)

存储主题偏好、编辑器样式、终端选项等全局设置。

- **路径**：`{userData}/dnote.config.json`
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
    "maxNodes": 500
  },
  "terminal": {
    "shell": "",
    "fontSize": 13,
    "autoStartAgy": true
  }
}
```

### 2.2 键盘快捷键 (`shortcuts.json`)

存储用户自定义快捷键映射。**注意**：开发时工作区根目录下的 `dnote_shortcuts.json` 是本地开发快捷键文件，生产环境中该文件路径为 `{userData}/shortcuts.json`。

- **路径**：`{userData}/shortcuts.json`
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

存储递归网格分割布局树。如果该文件在启动时存在，DNOTE 会精确还原上次的面板布局。

- **路径**：`{userData}/layout.json`

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
| `linkGraph` | Lattice Link Graph 双链关系图谱 |
| `terminal` | Terminal Console 终端控制台 |
| `settings` | Preferences 偏好设置 |
| `agent` | Antigravity 助手 |

### 2.4 主窗口状态 (`window-state.json`)

存储 Electron 主窗口的位置和尺寸，用于多次启动的无缝还原。

- **路径**：`{userData}/window-state.json`

```json
{
  "x": 100,
  "y": 80,
  "width": 1440,
  "height": 900
}
```

---

## 3. 配置 IPC 读写通道

渲染进程（APP 插件）**禁止**直接通过 Node `fs` 读写这些配置文件。
必须使用 Electron preload 注入的安全 bridge 接口：

```typescript
// 读取全局配置
const config = await window.electronAPI.getConfig();   // => Promise<any>
// 写入全局配置
await window.electronAPI.setConfig(config);            // => Promise<boolean>

// 读取快捷键配置
const shortcuts = await window.electronAPI.getShortcuts(); // => Promise<any>
// 写入快捷键配置
await window.electronAPI.setShortcuts(shortcuts);          // => Promise<boolean>

// 读取布局配置
const layout = await window.electronAPI.getLayout();   // => Promise<any>
// 写入布局配置
await window.electronAPI.setLayout(layout);            // => Promise<boolean>
```

---

## 4. 运行时配置启动顺序

App.tsx 在主窗口初始化时按以下顺序加载配置：

```
1. electronAPI.getConfig()       → 写入 Blood: system.config
                                  → 调用 applyTheme(config.theme)
2. localStorage('dnote_last_project') → 写入 Blood: system.projectPath
   或 electronAPI.getDevDefaultProject()（开发环境 fallback）
3. electronAPI.getShortcuts()    → ActionRegistry.loadShortcuts(shortcuts)
4. electronAPI.getLayout()       → setLayout(savedLayout)（还原面板布局）
```

---

## 5. 开发环境快捷键文件

在**开发环境**中（`npm run dev`），项目根目录存在 `dnote_shortcuts.json`，
这是开发时的默认快捷键覆盖文件，不会影响生产环境的 `{userData}/shortcuts.json`：

```json
{
  "editor.save": "meta+s",
  "terminal.clear": "control+l"
}
```

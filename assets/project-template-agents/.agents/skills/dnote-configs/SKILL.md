---
name: dnote-configs
description: Guidelines on how to locate, read, and write Galois workspace configuration files (theme, keybindings shortcuts, workspace split layout, window size bounds).
---

# Galois Configuration Files Specification (`dnote-configs`)

本文档定义 Galois 应用中所有配置文件的存储路径、序列化格式、Schema 规范，以及读写这些配置的正确方式。

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
| `linkGraph` | Lattice Link Graph 双链关系图谱 |
| `terminal` | Terminal Console 终端控制台 |
| `settings` | Preferences 偏好设置 |
| `agent` | Antigravity 助手 |
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

`CORE/App.tsx` 在主窗口初始化时（`initApp()`）按以下顺序加载配置：

```
0. electronAPI.getRuntimeInfo() + electronAPI.getEnvironmentStatus()（并行）
      → Blood: system.runtimeMode, system.extensionPath, system.sourcePluginPath,
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

# 💻 Terminal Console（终端控制台插件）

Terminal Console 是 DNOTE 的**命令执行器官**，提供基于 `xterm.js` + `node-pty` 的真实 PTY 终端体验。支持多标签页、项目工作目录自动切换，并可按用户设置接入外部 `agy` CLI 会话。

---

## 🌟 核心功能特性

### 1. 🐚 真实 PTY 终端（非 exec 模拟）
- 底层使用 `node-pty` 创建真正的伪终端（PTY），非 `child_process.exec` 命令行模拟
- 完整支持交互式程序（`vim`、`python`、`agy` 等）、终端颜色、ANSI 转义序列
- 通过 Electron IPC 双向传输：
  - 渲染层 → 主进程：键盘输入 (`writeTerminal`)
  - 主进程 → 渲染层：输出流 (`onTerminalOutput`)

### 2. 🗂️ 持久化多标签页
终端标签状态存储在 Blood 全局状态中（`system.terminalTabs`、`system.terminalActiveTabId`），
**跨组件 remount 保持存活**（React 重渲染不会销毁 PTY 会话）：

- 标签页创建后，对应的 DOM 容器和 xterm 实例挂载到模块级 `xtermInstances` Map 中，生命周期独立于 React 组件树
- 组件重新挂载时自动将孤儿容器重新附加到新的 DOM wrapper 中，恢复输出显示

### 3. 🚀 命令行助手可选接入
`agy/Antigravity` 是外部可选工具，不随 DNOTE 打包，也不由 DNOTE 管理更新。

首次在项目目录创建终端标签时：
1. 如果用户 shell 已经自动启动了 Antigravity，DNOTE 只发送 `/add-dir {projectPath}` 同步工作目录。
2. 如果设置中启用了“启动时自动运行外部 agy”，DNOTE 会发送 `agy --add-dir {projectPath}`。
3. 默认不主动启动 `agy`，避免 packaged app 与用户自己的助手版本管理打架。

### 4. 🔄 项目切换自动追踪
监听 `Blood: system.projectPath` 变化：
- 若当前项目已有对应标签页 → 自动切换到该标签页
- 若无对应标签页 → 自动在新项目路径下创建新标签页

### 5. 📐 自动尺寸适配
内置 `ResizeObserver` 监听容器尺寸变化：
- 自动调用 `fit.fit()` 使 xterm 列数适配容器宽度
- 同步调用 `electronAPI.resizeTerminal(tabId, cols, rows)` 通知 PTY 更新窗口大小
- 防止终端行折叠乱码问题

### 6. ➕ 标签页管理
- **新建标签**：点击 `+` 按钮或 `terminal.openNative` 动作（`control+shift+t`）在当前工作目录创建新 PTY
- **关闭标签**：标签 ×  按钮 → 终止 PTY 进程 → 释放 xterm 实例 → 从 Blood 状态移除（保留至少 1 个标签）
- **清空终端**：`terminal.clear` 动作（`control+l`）→ 清屏 + 发送 `clear\r`

---

## 🎨 终端主题

内置 VS Code Dark 风格配色（`background: #141414`），完整 16 色 ANSI 调色板：

```
背景: #141414    前景: #cccccc
黑:   #1e1e1e    亮黑:  #3d3d3d
红:   #f44747    亮红:  #f44747
绿:   #6a9955    亮绿:  #6a9955
...（完整 16 色映射）
```

---

## 🧬 仿生接入规范

```
typeId:     'terminal'
reads:      system.projectPath
writes:     []  （终端通过 PTY 输出，不写入 Blood 状态）
dependsOn:  []
```

## ⚡ 右侧栏动作

| 动作 ID | 默认快捷键 | 说明 |
|---------|-----------|------|
| `terminal.clear` | `control+l` | 清空终端输出 |
| `terminal.openNative` | `control+shift+t` | 在当前目录打开新终端标签 |

## 📁 目录结构

```
APP/terminal/
├── index.ts              # 导出 TerminalComponent + terminalActions
├── Terminal.tsx          # 主组件（xterm.js + node-pty + 多标签管理）
└── actions/
    ├── ClearAction.ts
    ├── OpenTerminalAction.ts
    └── index.ts
```

## ⚠️ 技术注意事项

- xterm 实例使用模块级 `xtermInstances: Map<string, XTermInstance>` 存储，绕开 React 生命周期
- PTY 进程在 Electron 主进程中运行，通过 IPC channel `terminal:spawn`、`terminal:write`、`terminal:output`、`terminal:exit` 通信
- 标签页关闭时需主动调用 `electronAPI.killTerminal(tabId)` 避免孤儿进程

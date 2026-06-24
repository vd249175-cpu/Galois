# 🤖 Antigravity 助手（AI 代理插件）

Agent 是 DNOTE 的 **AI 感知器官**，提供上下文感知的 AI 聊天界面，实时感知用户正在编辑的文档、光标位置和选区内容，并支持直接在聊天框中执行终端命令。

---

## 🌟 核心功能特性

### 1. 📡 编辑器上下文感知 HUD

顶部 Context Sensor 状态栏实时显示以下信息（订阅 `Blood: system.editorCursor.{lastFocusedEditorId}`）：

| 字段 | 来源 | 说明 |
|------|------|------|
| 项目名称 | `system.projectPath` 的 basename | 当前打开的笔记项目 |
| 活跃文件 | `cursor.filePath` 的 basename | 编辑器中当前打开的文件名 |
| 光标位置 | `cursor.line:cursor.column` | 实时光标坐标（0-indexed） |
| 选区字符数 | `cursor.selectedText.length` | 当前选中文本的字符数量 |

`cursor` 数据由 Editor 器官写入 Blood，当用户切换到不同编辑器面板时，Agent 自动追踪 `system.lastFocusedEditorId` 并动态订阅新的 areaId 对应的光标频道。

### 2. 💬 上下文感知聊天界面

- **消息气泡**：用户消息右侧（强调色），AI 消息左侧（磨砂玻璃态）
- **自动滚底**：新消息到来时自动滚动到底部
- **上下文注入**：发送消息时自动将当前光标位置、选中文本注入到 AI 请求上下文中
- `agent.clear` 动作（`control+shift+k`）→ 清除所有会话记录，重置到欢迎消息

### 3. ⚡ 终端命令直接执行

在输入框中以 `!` 前缀发送的内容会被识别为命令并立即执行：

```
用户输入: !ls -la
  └──> electronAPI.execCommand("ls -la", projectPath)
       └──> 捕获 stdout/stderr
            └──> 以代码块样式显示执行结果（isCode: true 消息格式）
```

这允许在不切换到终端面板的情况下快速执行项目相关命令。

### 4. 🔗 agy CLI 集成（设计目标）

Agent 插件设计为 `agy` CLI 的前端展示层：
- 参考 `.dnote_runtime.json` 中的上下文向 agy 发送带上下文的查询
- agy 基于当前文档内容、光标位置、选中文本给出精准回答
- 当前为 800ms 延迟的占位模拟响应，待接入真实 agy IPC 通道

---

## 🧬 仿生接入规范

```
typeId:     'agent'
reads:      system.projectPath, system.lastFocusedEditorId,
            system.editorCursor.{lastFocusedEditorId}（动态订阅）
writes:     []
dependsOn:  ['editor']  （依赖 editor 提供 editorCursor 数据）
```

## ⚡ 右侧栏动作

| 动作 ID | 默认快捷键 | 说明 |
|---------|-----------|------|
| `agent.clear` | `control+shift+k` | 清除所有聊天记录 |

## 📁 目录结构

```
APP/agent/
├── index.ts              # 导出 AgentComponent + agentActions
├── Agent.tsx             # 主组件（Context HUD + 聊天界面 + 命令执行）
└── actions/
    ├── ClearAgentAction.ts
    └── index.ts
```

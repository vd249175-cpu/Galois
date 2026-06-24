# 🤖 AI 智能副驾驶（Copilot Agent 插件）

Agent 是 DNOTE 的 **AI 协作器官**，提供基于 LLM 代理（Agent）的流式对话与代码重构界面。它专门服务于当前聚焦打开的文档，能通过执行本地编辑器工具直接读取和重构笔记内容。

---

## 🌟 核心功能特性

### 1. 🛠️ 自定义 LLM 模型与供应商设置 (Model Settings)
点击右上角的 **⚙️ 模型设置** 按钮，可以展开模型配置抽屉：
- **API 供应商**：支持 `Ollama (本地)`、`OpenAI (官方)` 以及 `自定义 OpenAI 兼容 API`（支持 DeepSeek、One-API、OpenRouter 等）
- **接口端点 (Base URL)**：支持自定义，例如本地 Ollama 默认 `http://localhost:11434/v1`
- **模型名称**：指定要调用的模型（如 `llama3`, `gpt-4o-mini`, `deepseek-chat` 等）
- **API 密钥**：输入相对应的访问 Token，本地 Ollama 可留空。设置将自动持久化至 `localStorage`

### 2. 🧰 智能副驾驶工具集 (Agent Tools)
该 Copilot 注册了本地编辑器工具，供大模型在需要时自主调用：

| 工具名称 | 参数 | 说明 |
| :--- | :--- | :--- |
| **`get_document_content`** | 无 | 读取当前活跃编辑器的全部 Markdown 文本内容，返回给大模型，每行带有 `行号:文字` 的前缀。 |
| **`edit_document_lines`** | `replacementText` | 替换修改文档中的多行。输入必须为多行 `行号:修改内容` 格式。支持一次性修改多行，并支持超出当前行数范围的行号写入（会自动用空行补全/填充）。 |

> 💡 **上下文自动融合机制**：每次发送对话时，当前活跃文档的全文内容（格式化为 `行号:文字` 前缀）、当前光标位置（行、列）、以及用户鼠标选中的文本片段，都会**自动以隐藏后缀的形式追加在发送给大模型的用户提示词最末尾**。大模型默认拥有最新的全量上下文，因此我们移除了独立的光标/选区获取工具。
>
> 💡 **仿生双向刷新环**：当大模型调用 `edit_document_lines` 修改了文件后，会通过 `updateBloodKey(BC.events.fileSaved(currentFile), Date.now())` 广播。Editor 面板收到更新信号后会**立即重新加载文档**，使用户直接在屏幕上看到 AI 重构代码的动态改变！

### 3. 💬 流式输出与执行状态 HUD
- **流式对话**：大模型的回答以打字机字符流的形式实时在界面上滚动渲染。
- **工具调用日志**：当大模型决定调用工具时，界面上会清晰用图标和颜色提示状态，例如：
  - `📖 正在读取文档文本内容...`
  - `✍️ 正在重构并修改文档第 3-8 行...`
  - `✅ edit_document_lines 执行完成`
- **容错提示**：如果 API 配置错误或网络超时，界面会以红色警示框显示报错并指导用户检查设置。

### 4. 🗂️ 会话历史管理 (Conversation Management)
- **新建会话**：点击顶部的 `+ 新建` 可以开启全新的对话，不同会话的上下文完全隔离。
- **切换与保存**：支持在顶部下拉菜单中查看并快速切换历史会话，历史会话自动持久化在 `localStorage` 中。
- **删除会话**：点击 `🗑️ 删除` 快速清空不需要的过往对话。
- **清除历史**：快捷键 `control+shift+k` (或点击顶部清除) 重置当前活跃会话的聊天气泡。

---

## 🧬 仿生接入规范

```
typeId:     'agent'
reads:      system.projectPath, system.lastFocusedEditorId,
            events.openFile., system.editorCursor.
writes:     events.fileSaved. (写入文档修改)
dependsOn:  ['editor']  （依赖 editor 提供当前编辑文件与光标位置）
```

## ⚡ 右侧栏动作

| 动作 ID | 默认快捷键 | 说明 |
|---------|-----------|------|
| `agent.clear` | `control+shift+k` | 清除当前会话的聊天记录，重置为空白会话 |

## 📁 目录结构

```
APP/agent/
├── index.ts              # 导出 AgentComponent + agentActions
├── Agent.tsx             # 极简 Agent 主组件（流式对话 + 供应商配置 + 编辑器工具调用 + 会话管理）
└── actions/
    ├── ClearAgentAction.ts
    └── index.ts
```

---
name: dnote-runtime
description: "Use when assisting a Galois user with writing, editing, tagging, explaining, or scripting notes and Codex needs the current note project, active file, cursor, or selected text from .dnote_runtime.json."
---

# Galois Note Project Runtime Coordinates (`dnote-runtime`)

本文档定义 Galois 工作区如何将当前编辑焦点、选区和光标坐标实时发布到笔记项目目录，供 AI Agent 或外部工具感知用户上下文。

---

## 1. 运行时状态文件位置

Galois 当前由 `APP/editor/hooks/useRuntimeSync.ts` 维护一个防抖写入器，将 Blood 状态实时同步为项目根目录下的文件。该逻辑已经从 `CORE/App.tsx` 迁出，以保持 CORE 不依赖 editor 专属频道：

- **路径**：`{projectPath}/.dnote_runtime.json`
- **写入触发条件**：以下任一 Blood 频道发生变化时触发（防抖 150ms）：
  - `system.projectPath` — 项目路径变更
  - `system.lastFocusedEditorId` — 聚焦编辑器切换
  - `system.editorCursor.{areaId}` — 光标移动或选区变化
  - `events.openFile.{areaId}` — 打开新文件

---

## 2. 文件 Schema 规范

```json
{
  "projectPath":    "/Users/example/Desktop/my-notes",
  "activeEditorId": "editor-root",
  "activeFile":     "/Users/example/Desktop/my-notes/example.md",
  "openFiles": {
    "editor-root": "/Users/example/Desktop/my-notes/example.md"
  },
  "cursors": {
    "editor-root": {
      "line": 13,
      "column": 4,
      "selectedText": "温顺",
      "scrollTop": 120,
      "scrollLeft": 0,
      "filePath": "/Users/example/Desktop/my-notes/example.md"
    }
  },
  "cursor": {
    "line":         13,
    "column":       4,
    "selectedText": "温顺"
  },
  "timestamp": 1782305164904
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `projectPath` | `string` | 当前加载的笔记项目根目录绝对路径 |
| `activeEditorId` | `string \| null` | 当前聚焦编辑器的 `areaId`（如 `"editor-root"`） |
| `activeFile` | `string \| null` | 编辑器中当前打开文件的绝对路径；无文件时为 `null` |
| `openFiles` | `object` | areaId → 当前打开文件路径，用于恢复多个 editor 面板 |
| `cursors` | `object` | areaId → 光标对象，用于恢复多个 editor 面板 |
| `cursor` | `object \| null` | 光标状态对象；无光标数据时为 `null` |
| `cursor.line` | `number` | 光标所在行号（当前 editor 运行时状态为 **1 indexed**） |
| `cursor.column` | `number` | 光标所在列字符索引（当前 editor 运行时状态为 **1 indexed**） |
| `cursor.selectedText` | `string` | 当前高亮选中的文本片段；无选区时为 `""` |
| `timestamp` | `number` | 最后更新的 Unix 毫秒时间戳 |

---

## 3. 相关 Blood 频道

外部命令行助手和其他组件可以通过以下 Blood 频道实时订阅这些状态，
无需直接读取 `.dnote_runtime.json` 文件：

| Blood Key | 格式 | 写入者 | 内容 |
|-----------|------|--------|------|
| `system.projectPath` | `string` | fileTree | 当前项目根目录路径 |
| `system.lastFocusedEditorId` | `string` | editor | 最后聚焦的 editor areaId |
| `system.activeEditors` | `string[]` | editor | 所有当前活跃的 editor areaId 列表 |
| `system.editorCursor.{areaId}` | `object` | editor | 光标状态对象（见下方结构） |

`system.editorCursor.{areaId}` 的值结构：

```typescript
{
  line:         number,   // 当前 editor 运行时状态为 1-indexed
  column:       number,   // 当前 editor 运行时状态为 1-indexed
  selectedText: string,   // 选中文本（可为空字符串）
  scrollTop:    number,   // editor 滚动位置
  scrollLeft:   number,   // editor 横向滚动位置
  filePath:     string,   // 当前打开的文件绝对路径
}
```

注意：`.dnote_runtime.json` 和 `system.editorCursor.*` 使用 1-indexed
`line`/`column`，而项目脚本环境变量 `DNOTE_CURSOR_LINE` 和
`DNOTE_CURSOR_COL` 当前由 editor 命令执行路径传入 0-indexed 值。

### 使用示例（Agent 插件中）

```typescript
import { useBloodChannel, Blood } from '../../CORE/Blood';

// 动态订阅最后聚焦编辑器的光标状态
const lastFocusedEditorId = useBloodChannel(
  ['system.lastFocusedEditorId'],
  () => Blood.getValue<string | null>('system.lastFocusedEditorId', null)
);

const editorCursor = useBloodChannel(
  [`system.editorCursor.${lastFocusedEditorId}`],
  () => Blood.getValue(`system.editorCursor.${lastFocusedEditorId}`, null)
);

// editorCursor.line, editorCursor.column, editorCursor.selectedText, editorCursor.filePath
```

---

## 4. Assist Mode 使用指南

协助模式是笔记项目内的默认身份。agent 启动在具体笔记项目下，或任务是写作、整理、标签、媒体、搜索、笔记项目脚本时，应把当前笔记项目视为工作边界。

如果 agent 的启动目录位于 `~/Documents/` 下，并且该目录或其上级目录看起来像笔记项目，应直接进入协助模式。笔记项目标记包括 `.dnote_runtime.json`、`command/commands.json`、`.dnote/`、`script/`、`media/` 或 Markdown 笔记文件。不要因为同时能看到外部 Galois workbench 就切到源码开发模式。

当用户要写笔记、改写文字、整理标签、插入媒体、解释当前段落、或基于当前位置生成内容时，进入 **Assist Mode**：

1. **首先读取** `.dnote_runtime.json` 以了解用户当前正在编辑的文档和光标位置。
2. 若 `cursor.selectedText` 非空，将其视为用户的**直接操作目标**或上下文引用。
3. 对比 `timestamp` 确保数据是最新的（超过 30 秒未更新说明用户可能已切换工作区）。
4. 通过 `activeFile` 的路径读取笔记内容，结合 `cursor.line` 定位用户关注的段落。
5. 默认只处理当前笔记项目和当前文件；不要因为协助写笔记而修改 `APP/` 或 `CORE/`。

Assist Mode 常见输出目标：

- 改写或续写当前段落。
- 给当前笔记补 `tags:` 或正文 `#标签`。
- 插入 `[[WikiLink]]`、Markdown 链接、表格、列表、引用块。
- 插入媒体引用 `![media](media/file.ext)` 或视频剪辑 `@video[label](file.mp4?t=start,end)`。
- 解释或生成 `command/commands.json` 的 `content` 插入片段。

媒体归档桥：

```typescript
archiveMedia(srcPath: string, projectPath: string): Promise<string>
archiveMediaData(fileName: string, mimeType: string, data: ArrayBuffer, projectPath: string): Promise<string>
getPathForFile(file: File): string
```

这些接口把文件复制到 `{projectPath}/media/` 并返回相对路径。Markdown 中
使用 `![media](media/file.ext)`、`![audio](media/file.ext)` 或
`![video](media/file.ext)`。

如果用户明确要求“新增应用页面、添加右栏按钮、实现应用快捷键、修改主题/设置、修改打包或终端机制”，切换到 Build Mode，并阅读 `AGENTS.md` 的构建模式规则。笔记项目脚本、标签计算、Slash content 命令和生命周期钩子仍属于协助模式。

---

## 5. 写入实现（参考 useRuntimeSync）

`.dnote_runtime.json` 由 editor 插件内的 `useRuntimeSync` Hook 维护，**不依赖** `fs.watch` 等文件监听器（符合 CORE 极简无状态原则）：

```typescript
// APP/editor/hooks/useRuntimeSync.ts（节选）
Blood.subscribe((changedKeys) => {
  const isRelevant = Array.from(changedKeys).some(key =>
    key === 'system.projectPath' ||
    key === 'system.lastFocusedEditorId' ||
    key.startsWith('system.editorCursor.') ||
    key.startsWith('events.openFile.')
  );
  if (isRelevant) {
    // 防抖 150ms，组合多次快速变化
    scheduleWrite();
  }
});
```

同一份 runtime state 也会通过 `electronAPI.setProjectState(projectPath,
runtimeState)` 持久化到 `~/Documents/Galois/config/project-state.json`，用于
恢复打开文件、光标和滚动状态。

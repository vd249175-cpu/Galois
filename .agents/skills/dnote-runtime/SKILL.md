---
name: dnote-runtime
description: Guidelines on how to read and interpret DNOTE's note project runtime coordinates (.dnote_runtime.json) to synchronize AI context with user cursor position and focused files.
---

# DNOTE Note Project Runtime Coordinates (`dnote-runtime`)

本文档定义 DNOTE 工作区如何将当前编辑焦点、选区和光标坐标实时发布到笔记项目目录，供 AI Agent 或外部工具感知用户上下文。

---

## 1. 运行时状态文件位置

DNOTE 当前由 `APP/editor/hooks/useRuntimeSync.ts` 维护一个防抖写入器，将 Blood 状态实时同步为项目根目录下的文件。该逻辑已经从 `CORE/App.tsx` 迁出，以保持 CORE 不依赖 editor 专属频道：

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
| `cursor.line` | `number` | 光标所在行号（当前 editor 运行时状态为 **1 indexed**） |
| `cursor.column` | `number` | 光标所在列字符索引（当前 editor 运行时状态为 **1 indexed**） |
| `cursor.selectedText` | `string` | 当前高亮选中的文本片段；无选区时为 `""` |
| `timestamp` | `number` | 最后更新的 Unix 毫秒时间戳 |

---

## 3. 相关 Blood 频道

AI Agent 插件（`APP/agent/`）和其他组件可以通过以下 Blood 频道实时订阅这些状态，
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
  filePath:     string,   // 当前打开的文件绝对路径
}
```

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

## 4. AI Agent 使用指南

当协助用户在 DNOTE 项目中编写文档、调试脚本或解决问题时：

1. **首先读取** `.dnote_runtime.json` 以了解用户当前正在编辑的文档和光标位置。
2. 若 `cursor.selectedText` 非空，将其视为用户的**直接操作目标**或上下文引用。
3. 对比 `timestamp` 确保数据是最新的（超过 30 秒未更新说明用户可能已切换工作区）。
4. 通过 `activeFile` 的路径读取笔记内容，结合 `cursor.line` 定位用户关注的段落。

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

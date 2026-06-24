---
name: dnote-runtime
description: Guidelines on how to read and interpret DNOTE's note project runtime coordinates (.dnote_runtime.json) to synchronize AI context with user cursor position and focused files.
---

# DNOTE Note Project Runtime Coordinates (`dnote-runtime`)

This document defines how the DNOTE workspace application publishes its active focus, editor selection, and cursor coordinates to note projects in real-time.

---

## 1. Runtime State File Location

The active state file is written directly inside the root folder of the currently loaded note project:
* **Path**: `[projectPath]/.dnote_runtime.json`
* **Trigger condition**: Writes are triggered on startup, active editor switches, selection changes, and cursor movement (throttled to 150ms).

---

## 2. File Schema Specification

The runtime coordinate file uses the following schema:
```json
{
  "projectPath": "/Users/apexwave/Desktop/DNOTE/template-project",
  "activeEditorId": "editor-root",
  "activeFile": "/Users/apexwave/Desktop/DNOTE/template-project/拉布拉多.md",
  "cursor": {
    "line": 13,
    "column": 4,
    "selectedText": "温顺"
  },
  "timestamp": 1782305164904
}
```

### 2.1 Schema Fields Description:
* **`projectPath`**: Absolute directory path of the active note folder.
* **`activeEditorId`**: The `areaId` string of the currently focused editor.
* **`activeFile`**: The absolute path of the file currently opened and focused in the editor panel (returns `null` if no file is open).
* **`cursor`**: Object containing cursor locations:
  * `line`: The current cursor line (0-indexed).
  * `column`: The current cursor column character index (0-indexed).
  * `selectedText`: The string fragment currently highlighted or selected by the user.
* **`timestamp`**: Unix epoch millisecond timestamp indicating the last update.

---

## 3. Guidelines for AI Agents

Whenever you are helping the user build features, write markdown, compile scripts, or resolve issues in a DNOTE project:
1. **Always read this file first** to understand what document the user is currently working on and what part of the document they are currently focused on.
2. If `selectedText` is populated, treat it as a direct instruction target or context reference.
3. Keep track of the `timestamp` to ensure you are not relying on stale data.

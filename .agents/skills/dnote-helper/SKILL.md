---
name: dnote-helper
description: Read and synchronize coordinates (focused file, cursor position, selected text) from DNOTE's workspace runtime file .dnote_runtime.json.
---

# DNOTE Context Helper Skill

This skill allows the agent to synchronize its perception with the active DNOTE editor environment.

Whenever the user asks a question or triggers a code editing task, you should proactively check for the presence of the `.dnote_runtime.json` file at the root of the workspace directory.

## How to use:
1. Locate the file: `[projectPath]/.dnote_runtime.json`.
2. Read the file contents. It contains:
   - `projectPath`: The absolute path of the open project.
   - `activeFile`: The absolute path of the file currently open in the DNOTE editor.
   - `cursor`: An object containing:
     - `line`: The current row of the editor cursor (1-indexed).
     - `column`: The current column of the editor cursor (1-indexed).
     - `selectedText`: Any text currently highlighted/selected by the user.
3. Use these coordinates to tailor your responses, target file edits, and understand what code the user is currently referencing or focusing on.

---
name: dnote-command-scripts
description: Covenants and guidelines for authoring DNOTE project custom commands (commands.json), environment variables, JSON output protocols, and project lifecycle python scripts.
---

# DNOTE Project Commands & Shortcut Scripts (`dnote-command-scripts`)

This document defines how note project commands are declared and how scripts are executed in DNOTE note projects.

---

## 1. Project Commands Configuration (`command/commands.json`)

Each note project can register custom actions and bind them to keyboard combinations inside a `command/commands.json` registry file:
```json
{
  "commands": [
    {
      "id": "project.calculateTags",
      "label": "运行深度标签计算",
      "shortcut": "meta+shift+l",
      "script": "uv run script/calculate_tags.py"
    },
    {
      "id": "project.runPipeline",
      "label": "执行生成构建",
      "shortcut": "meta+alt+b",
      "script": "uv run script/build_project.py"
    }
  ]
}
```

---

## 2. Standard Environment Variables

When a script is executed via DNOTE's shell/PTY system, the execution layer injects the following context-rich environment variables:
* **`DNOTE_PROJECT_PATH`**: Absolute folder path of the note project.
* **`DNOTE_ACTIVE_FILE`**: Absolute path of the current note file focused in the active editor.
* **`DNOTE_OUTPUT_FILE`**: Target filepath (usually a JSON cache file under `.dnote_cache/`) where the script must write its execution output.
* **`DNOTE_CURSOR_LINE`**: Current cursor line position (0-indexed).
* **`DNOTE_CURSOR_COL`**: Current cursor column position.
* **`DNOTE_SELECTED_TEXT`**: Current highlighted text fragment in the editor.

---

## 3. Standard JSON Output Protocol

Custom command scripts must follow the DNOTE structured payload contract by writing their outcome to the path designated in `DNOTE_OUTPUT_FILE`:
```python
import os
import json
import time

output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'output.json')

# ... execution logic ...

result = {
  "status": "success",     # "success" | "error"
  "message": "Calculations completed successfully.",
  "data": {
    "tags": ["AI", "Modularity"],
    "metrics": {
      "wordCount": 120,
      "readTime": 1
    }
  },
  "timestamp": int(time.time())
}

with open(output_file, 'w', encoding='utf-8') as f:
  json.dump(result, f, indent=2, ensure_ascii=False)
```

---

## 4. Lifecycle Hook Scripts

DNOTE automatically hooks into directory opening/closing events to trigger environment setup or cleanup tasks. Place these Python scripts in the `script/` folder under your note project:
* **`script/on_project_open.py`**: Executes when the folder workspace is loaded in DNOTE (e.g. to launch background indexing, check cargo/python requirements, fetch cloud sync metadata).
* **`script/on_project_close.py`**: Executes when switching workspaces or exiting DNOTE (e.g. to commit cache files, kill background daemons, release file locks).

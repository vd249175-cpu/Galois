---
name: dnote-helper
description: Developer guide and skill reference for the DNOTE workspace application, covering plugin authoring, config directories, tag resolvers, command configurations, and runtimes.
---

# DNOTE Developer Guide & AI Agent Skill Reference

This skill document defines the architectural patterns, configurations, extension mechanisms, and developer guidelines for the **DNOTE Workspace Application** (built with Electron, React, TypeScript, and node-pty).

---

## 1. Directory Structure & App Locations

### 1.1 Configuration & Persisted State
All global user configuration files are stored inside the platform-specific user application data directory (e.g., `~/Library/Application Support/DNOTE/` on macOS):
* **`dnote.config.json`**: Global preference parameters (theme, editor details, terminal font/shell auto-start).
* **`shortcuts.json`**: Dynamic shortcut keybindings flat-mapped as `{"[actionId]": "shortcut-combination"}` (e.g., `{"editor.save": "meta+s"}`).
* **`layout.json`**: Workspace split grid layout object serialized on layout modification.
* **`window-state.json`**: Position and size coordinates of the main window, persisted on resize/move.

### 1.2 Development Default Project
* Bundled sample notebook workspace: `template-project/` (contains script templates, sample markdown notes, commands registry).
* User's Getting Started folder: Automatically copies `template-project` into `~/Documents/DNOTE Projects/Getting Started` on the first launch.

---

## 2. Reading Runtime State
The application writes a runtime coordination descriptor (`.dnote_runtime.json`) inside the active note project's root folder upon focal area changes, editor selection, or cursor movements:
```json
{
  "projectPath": "/absolute/path/to/project",
  "activeEditorId": "editor-root",
  "activeFile": "/absolute/path/to/project/note.md",
  "cursor": {
    "line": 14,
    "column": 2,
    "selectedText": "optional highlighted text"
  },
  "timestamp": 1782305164904
}
```
**AI Prompting tip**: When answering requests or editing files inside a DNOTE workspace, inspect this file first to know which note is currently focused by the user and where their cursor resides!

---

## 3. How to Write APP Plugins
All modular panes/features are implemented under `APP/[plugin-name]/` using the **Bionic feedback loop** (血液流通).

### 3.1 Plugin Layout Spec
```
APP/[plugin-name]/
├── index.ts                # Main registry configuration exports
├── components/
│   └── [PluginView].tsx    # Primary React render component
└── actions/
    ├── [SaveAction].ts     # Action definitions implementing OrganAction
    └── index.ts            # Exports actions list
```

### 3.2 Index Registration (`index.ts`)
```typescript
import { PluginView } from './components/PluginView';
import { pluginActions } from './actions';

export const MyPluginComponent = {
  typeId: 'myPlugin',
  displayName: '我的插件名称',
  iconName: 'custom-icon-class-or-svg',
  component: PluginView,
  actions: pluginActions,
  bloodChannels: ['system.projectPath'], // Blood state keys to auto-subscribe
  manifest: {
    description: 'Description of what this plugin performs',
    reads: ['system.projectPath'],
    writes: ['events.myPlugin.finish.*'],
    dependsOn: [] // Array of dependencies (e.g. ['fileTree'])
  }
};
```

### 3.3 Writing Custom Actions (`OrganAction`)
Each action (rendered as buttons in the Right Sidebar or bound to keyboard hotkeys) must implement the `OrganAction` schema:
```typescript
import React from 'react';

export interface OrganAction {
  id: string;              // "[plugin-name].[actionName]" (e.g. "editor.save")
  label: string;           // Tooltip name
  defaultShortcut?: string;// Modifiers + key (e.g. "meta+s", "control+shift+c")
  isToolbar?: boolean;     // Set true to mount automatically on the sidebar toolbar
  icon: React.ReactNode;   // 14x14px outline SVG (stroke="currentColor", strokeWidth=1.5)
}
```

### 3.4 Capturing Actions (`lastAction` Antibody)
```typescript
function PluginView({ lastAction }) {
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'myPlugin.actionName') {
      // Execute the business action callback
    }
  }, [lastAction]);
}
```

---

## 4. Writing Tags, Commands & Shortcut Scripts

### 4.1 Writing Tags
Tags in DNOTE can be declared in three progressive ways:
1. **Static inline tags**: Statically search text files for inline words prefixed with `#` (e.g., `#todo`, `#ideas`, `#金毛`).
2. **Regex tags**: Defined in the tag resolver configuration or parsed dynamically to match arbitrary patterns.
3. **Script-based tags**: Declared in note properties (e.g., `run:calculate_tags.py`). The tag resolver executes the specified Python script under the workspace directory, which returns dynamically computed tags.

### 4.2 How to Write Command Shortcuts
Project-specific commands are configured inside `[project-root]/command/commands.json`:
```json
{
  "commands": [
    {
      "id": "project.runTests",
      "label": "运行单元测试",
      "shortcut": "meta+shift+t",
      "script": "uv run script/run_tests.py"
    }
  ]
}
```

### 4.3 Python Scripts Covenants
Scripts located in `[project-root]/script/` must adopt the **Standard JSON Output Protocol**:
1. Communicate inputs via DNOTE environment variables:
   * `DNOTE_PROJECT_PATH`: Workspace root directory.
   * `DNOTE_ACTIVE_FILE`: Absolute path of the current active markdown editor file.
   * `DNOTE_OUTPUT_FILE`: Path where the script must output its JSON results.
2. Output a structured JSON file to `DNOTE_OUTPUT_FILE` containing:
   ```json
   {
     "status": "success",
     "message": "Details about execution status...",
     "data": {
       "resultMap": {}
     },
     "timestamp": 1782305164
   }
   ```

### 4.4 Workspace Lifecycles
Define lifecycle hooks by placing specific python scripts inside `[project-root]/script/`:
* `on_project_open.py`: Automatically runs when a project directory is loaded.
* `on_project_close.py`: Automatically runs when another folder is opened or the app quits.

---

## 5. DNOTE Search Functionality
Search in DNOTE is driven by two main layers:
1. **Tag Search & Graph Layouts**: Dynamic connections are calculated using `lattice.py` (located in `APP/graph-view/services/lattice.py`).
2. **File Searching & Grep**: Performed through the `listDir` / `readFile` APIs. Advanced search and AI-assisted lookups utilize the index structure inside `.dnote_runtime.json` to instantly parse and map context.

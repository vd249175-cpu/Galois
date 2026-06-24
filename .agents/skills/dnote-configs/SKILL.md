---
name: dnote-configs
description: Guidelines on how to locate, read, and write DNOTE workspace configuration files (theme, keybindings shortcuts, workspace split layout, window size bounds).
---

# DNOTE Configuration Files Specification (`dnote-configs`)

This document defines the storage paths, serialization formats, schema standards, and instructions for reading and modifying configurations in the DNOTE application.

---

## 1. App Data Root Directory

All global, user-specific configurations are stored outside the read-only application package in the platform's standard application data container:
* **macOS**: `~/Library/Application Support/DNOTE/`
* **Windows**: `%APPDATA%\DNOTE\`
* **Linux**: `~/.config/DNOTE/`

In the Electron main process, this directory is obtained via:
```typescript
const configDir = app.getPath('userData');
```

---

## 2. Config Files Registry

### 2.1 Theme & Preferences (`dnote.config.json`)
Stores theme preferences, editor styling, and terminal options.
* **Path**: `dnote.config.json` inside the user data root.
* **Schema**:
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

### 2.2 Keyboard Shortcuts (`shortcuts.json`)
Stores custom keybindings mapped from action identifiers to string keyboard combinations.
* **Path**: `shortcuts.json` inside the user data root.
* **Keybinding Format**: Standard combination strings (all lowercase, separated by `+` without spaces). Meta modifier is normalized to `meta`. E.g., `meta+s`, `meta+shift+d`.
* **Schema**:
```json
{
  "editor.save": "meta+s",
  "terminal.clear": "meta+k",
  "sidebar.toggle": "meta+b"
}
```

### 2.3 Panel Workspace Layout (`layout.json`)
Stores the split pane layout tree. If this file exists on startup, DNOTE restores the layout grid exactly as the user left it.
* **Path**: `layout.json` inside the user data root.
* **Layout Object Structure**: Nodes are either `split` structures or leaf `area` components.
* **Schema Example**:
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

### 2.4 Main Window State (`window-state.json`)
Stores position and size coordinates of the main Electron window to ensure seamless multi-launch restoration.
* **Path**: `window-state.json` inside the user data root.
* **Schema**:
```json
{
  "x": 100,
  "y": 80,
  "width": 1200,
  "height": 800
}
```

---

## 3. Configuration IPC Channels

To maintain the decoupling contract, renderer processes (and APP plugins) MUST NOT read or write these files directly using filesystem modules. Instead, utilize the secure window context bridge:
* `window.electronAPI.getConfig() => Promise<any>`
* `window.electronAPI.setConfig(config: any) => Promise<boolean>`
* `window.electronAPI.getShortcuts() => Promise<any>`
* `window.electronAPI.setShortcuts(shortcuts: any) => Promise<boolean>`
* `window.electronAPI.getLayout() => Promise<any>`
* `window.electronAPI.setLayout(layout: any) => Promise<boolean>`

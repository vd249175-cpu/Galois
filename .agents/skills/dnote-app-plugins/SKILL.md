---
name: dnote-app-plugins
description: Authoring guide for DNOTE APP plugins (organs), covering directory structure, index entry configurations, OrganAction buttons injection, and bionic feedback state loop patterns.
---

# DNOTE APP Organ Plugins Specification (`dnote-app-plugins`)

This document defines the folder conventions, interface configurations, and execution loops for creating new plugins (organs) in the DNOTE application.

---

## 1. Directory Structure Conventions

Any feature or panel built under the `APP/` folder must adhere to the standard directory layout:
```
APP/[plugin-name]/
├── index.ts                # Entry file exporting plugin definition
├── components/             # React view components
│   └── [PluginView].tsx    # Main render view component
├── actions/                # Plugin actions directory
│   ├── [CustomAction].ts   # Custom action file
│   └── index.ts            # Exports actions list
└── hooks/                  # Custom React hooks (optional)
```

---

## 2. Plugin Entry Registry (`index.ts`)

The plugin must export its configuration, component, and actions in the following format:
```typescript
import { PluginView } from './components/PluginView';
import { pluginActions } from './actions';

export const MyPlugin = {
  typeId: 'myPlugin',                  // Unique plugin identifier (camelCase)
  displayName: '插件显示名称',
  iconName: 'custom-icon',             // Main icon name
  component: PluginView,
  actions: pluginActions,              // Array of custom OrganActions
  bloodChannels: [                     // Auto-subscribed state channels
    'system.projectPath',
    'events.fileSaved.'                // Prefix match (subscribes all saves)
  ],
  manifest: {
    description: 'Description of this plugin...',
    reads: ['system.projectPath', 'events.fileSaved.*'],
    writes: ['events.myPlugin.done.*'],
    dependsOn: []                      // Implicit dependency plugins list
  }
};
```

---

## 3. Right Sidebar Custom Actions (`OrganAction`)

Every keyboard shortcut or toolbar action button inside a plugin must implement the `OrganAction` interface:
```typescript
export interface OrganAction {
  id: string;               // Global unique: "[plugin-name].[actionName]"
  label: string;            // Hover tooltip label
  defaultShortcut?: string; // Shortcut combination: all lowercase (e.g. "meta+s")
  isToolbar?: boolean;      // True if it should render in the Right Sidebar when focused
  icon: React.ReactNode;    // 14x14px SVG outline (currentColor, strokeWidth=1.5)
}
```

---

## 4. Bionic State Feedback Loop (抗体捕获反射弧)

To achieve strict decoupling, plugins DO NOT communicate directly with each other. They communicate via the **Blood state bus**:

```
[User Action Input] ──> ActionRegistry.runAction 
                       └──> Blood.updateKey('actions.[id].[areaId]', Date.now())  (Timestamp!)
                            └──> ComponentWrapper (Subscribed to actions.*)
                                 └──> injects lastAction prop ──> [PluginView].tsx (Capture via useEffect)
```

### 4.1 Antibody Capture Pattern (`[PluginView].tsx`):
```typescript
import { useEffect } from 'react';

interface PluginViewProps {
  areaId: string;
  state: Record<string, any>;
  lastAction: { id: string; timestamp: number } | null;
}

export function PluginView({ areaId, state, lastAction }: PluginViewProps) {
  useEffect(() => {
    if (!lastAction) return;

    switch (lastAction.id) {
      case 'myPlugin.save':
        handleSave();
        break;
      case 'myPlugin.clear':
        handleClear();
        break;
    }
  }, [lastAction]);

  const handleSave = () => {
    // Save logic ...
  };
}
```

---

## 5. Blood Namespace Restrictions

All state keys mapped using the Blood bus must reside in one of the four registered namespaces:
* **`system.*`**: Focus, window coords, component mappings, runtime constants. E.g., `system.focusedAreaId`.
* **`layout.*`**: Splitting, closing, merging, popping, or moving panels. E.g., `layout.splitArea.{id}`.
* **`actions.*`**: Translated user action signals (using `Date.now()` timestamps). E.g., `actions.editor.save.{id}`.
* **`events.*`**: Broad workflow notifications (file saved, project open triggers). E.g., `events.fileSaved.{path}`.

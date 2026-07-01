---
name: dnote-app-plugins
description: Authoring guide for Galois APP plugins (organs), covering current Blood-based plugin registration, actions, plugin-owned services, and command-line assistant workflows.
---

# Galois APP Organ Plugins Specification

This guide describes the current plugin system. Galois is still Blood-first. A
VS Code-style DI service layer exists, but plugins are not fully migrated to it.
Use DI services when they already fit the local code, but do not assume Blood
has been replaced.

Read `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md` before making large plugin or
packaging changes.
For plugin-owned runtimes, also read `docs/PLUGIN_ENVIRONMENT.md`.
For source vs installed extension directories, also read
`docs/EXTENSION_WORKSPACE.md`.

## 1. Plugin Directory Layout

Use this skill only for APP organs, side-loaded extensions, extension commands,
plugin manifests, and plugin-owned service scripts. If the user asks for
notebook commands, dynamic tags, lifecycle hooks, reactive expressions, or slash
menu content snippets, use the notebook project script workflow instead.

Every plugin under `APP/` should follow this layout:

```text
APP/[plugin-name]/
├── index.ts
├── [PluginView].tsx
├── actions/
│   ├── [ActionName]Action.ts
│   └── index.ts
├── hooks/
├── services/
└── plugin.json
```

The main view file lives directly in the plugin root. Do not create a
`components/` folder unless a future refactor establishes that convention.

`services/` is for plugin-owned helper scripts or calculation assets. These are
packaged as extra resources and can be resolved through
`electronAPI.getServiceScriptPath(pluginFolder, scriptName)`.

## 2. Registration Entry

The active renderer entry is the repository root `index.tsx`. It scans
`./APP/*/index.ts` with `import.meta.glob(..., { eager: true })` and registers
any exported object that has `typeId` and `component`.

Naming rules:

- Built-in APP plugin folders use `APP/[kebab-name]/`.
- Renderer `typeId` values use stable lower camelCase, for example
  `graphView`.
- Action ids use `[plugin-name].[actionName]`.
- Side-loaded extension folders live under
  `~/Documents/Galois/extensions/[extension-id]/`.
- Extension command ids use `[extensionId].[commandName]`.
- Do not reuse notebook project command ids for extension commands.

Each plugin `index.ts` should re-export its component object and actions:

```typescript
export { MyPluginComponent } from './MyPluginView';
export { myPluginActions } from './actions';
```

The component object should match `AreaComponent` from
`CORE/ComponentRegistry.ts`.

```typescript
export const MyPluginComponent = {
  typeId: 'myPlugin',
  displayName: 'My Plugin',
  shortName: 'Plugin',
  iconName: 'custom',
  component: MyPluginView,
  actions: myPluginActions,
  bloodChannels: [BC.system.projectPath],
  manifest: {
    description: 'What this plugin does',
    reads: [BC.system.projectPath],
    writes: [],
    dependsOn: [],
  },
};
```

## 3. Blood Channels and Manifest

Plugins communicate through Blood channels. Do not introduce ad hoc top-level
channel prefixes. Valid namespaces are:

```text
system.*
layout.*
actions.*
events.*
```

Use `CORE/BloodChannels.ts` (`BC` and `BC_PREFIX`) instead of hardcoded strings
when practical. If a channel is missing, add it there first.

`manifest.reads` and `manifest.writes` are documentation and validation aids.
Keep them aligned with actual `bloodChannels`, `updateBloodKey`, and
`Blood.updateKey` usage.

`plugin.json` is plugin metadata, not the primary runtime registration source.
It should still be kept current because packaged plugin resources and future
extension tooling may read it.

## 4. Actions and Toolbar Buttons

Actions use `OrganAction`:

```typescript
export interface OrganAction {
  id: string;
  label: string;
  defaultShortcut?: string;
  isToolbar?: boolean;
  icon?: React.ReactNode;
}
```

Action IDs use `[plugin-name].[actionName]`, for example `editor.save` or
`graphView.recenter`.

`ComponentRegistry` registers plugin actions with `ActionRegistry`. When an
action runs, it writes a timestamp signal via `Blood.updateKey`. Because `act.id`
is already in `[plugin-name].[actionName]` form, the resulting key is:

```text
actions.[plugin-name].[actionName].[areaId] = Date.now()
// example: actions.editor.save.editor-root = 1718000000000
```

`AreaShell` listens for matching `actions.*` signals and injects `lastAction`
into the plugin view. Plugin views should handle actions in a `useEffect` keyed
on `lastAction`.

## 5. Plugin-Owned Environment

Plugins own their plugin-level runtime needs.

If a plugin has scripts under `APP/[plugin]/services/`, any interpreter override
should live in that plugin's `plugin.json`:

```json
{
  "id": "graphView",
  "interpreters": {
    "python": "uv run"
  }
}
```

Use `uv run` for Python service scripts with PEP 723 inline dependencies so uv
can resolve those dependencies from the script file itself.

Plugin service scripts should not rely on the selected notebook project's
`.venv` unless the script is explicitly a notebook project script. The project
environment belongs to the notebook project layer.

Prefer the shared script bridge (`electronAPI.runScript` or the service wrapper)
over hand-built shell strings when adding new plugin script execution. Existing
non-script shell operations may still use direct `execCommand`; do not copy that
pattern for plugin service scripts or notebook project scripts.

## 6. Command-Line Assistant Workflow

In source developer mode, the built-in terminal can start the command-line
assistant and work directly inside the repository. It may create and edit
plugins under `APP/`, update docs, and run checks.

In packaged DMG mode, the installed `.app` bundle should not be treated as a
writable plugin development workspace. The assistant should focus on the
selected notebook project and the writable `~/Documents/Galois/extensions/`
workspace. It may inspect packaged plugin files as read-only context, but it
must not modify the installed app bundle.

When the assistant creates a plugin, it should update:

- `APP/[plugin]/index.ts`
- `APP/[plugin]/[PluginView].tsx`
- `APP/[plugin]/actions/index.ts`
- `APP/[plugin]/plugin.json`
- Any plugin-specific README or documentation if the behavior is nontrivial

When the app is installed from a DMG and `system.canWriteSourcePlugins` is
false, new user plugin work should be placed under `system.extensionPath`
or a configured App-external development extension path instead of `APP/`.
Dynamic UI loading from those directories is a migration target; today they
support side-loaded script extensions, metadata/interpreter lookup, and
assistant workspace context.

The current built-in host for writable extensions discovers
`~/Documents/Galois/extensions/` plus configured development paths, reads
`plugin.json`, lists contributed commands, and runs declared service scripts
through the extension host/platform bridge. It does not yet load arbitrary React
UI bundles from user extension directories.

The host refreshes side-loaded extension manifests and command declarations
while the app is running. Edits to a service script are read from disk on the
next command run. This means external script-extension development should not
require an app restart for manifest or service changes. Creating a new renderer
panel still requires source `APP/*/index.ts` development with Vite HMR, or a
future dynamic UI bundle loader.

Discovered extension commands are registered as global Galois actions after
refresh. They may be triggered from Settings → Environment & Extensions, or by a
shortcut in `~/Documents/Galois/config/shortcuts.json` once the command id is
known.

Side-loaded extension services are not VS Code extensions with a full editor
mutation API. They may read `DNOTE_PROJECT_PATH` and project runtime context
such as `.dnote_runtime.json`, and they may return JSON to the host. They should
not directly rewrite the active Markdown file to replace the user's current
selection unless the user explicitly requests trusted file-level automation.
Selection replacement, text insertion, slash commands, and cursor-sensitive
editing belong to editor actions or notebook project `commands.json` `content`
commands until Galois exposes a formal editor patch API for extensions.

Interpreter override lookup reads the manifest that owns the service script.
For a service script inside a registered App-external development extension
root, Galois reads that extension's `plugin.json` before falling back to built-in
APP manifests, same-id user extension manifests, global app config, and built-in
defaults.

When authoring a side-loaded script extension, use this minimal shape:

```text
extensions/[extension-id]/
├── plugin.json
└── services/
    └── [service].py
```

Declare command-to-service mappings in `contributes.commands[*].service` and
runtime hints in `services[*].runtime`. Keep this compatible with
`docs/EXTENSION_WORKSPACE.md`.

## 7. File Size and Modularity

The project rule remains: TS/TSX files should generally stay under 400 lines.
Several legacy files exceed this today. Do not make them larger when adding
features. Extract hooks or services when touching those areas.

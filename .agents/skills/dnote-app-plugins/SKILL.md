---
name: dnote-app-plugins
description: "Use in Galois Source Development Mode or Build Mode for APP organ development: standalone pages, right sidebar buttons, keyboard shortcuts, renderer interactions, plugin-owned services, plugin.json manifests, and Blood-based plugin registration."
---

# Galois APP Organ Plugins Specification

This guide describes the current plugin system. Galois is still Blood-first. A
VS Code-style DI service layer exists, but plugins are not fully migrated to it.
Use DI services when they already fit the local code, but do not assume Blood
has been replaced.

Read `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md` before making large plugin or
packaging changes.
For plugin-owned runtimes, also read `docs/PLUGIN_ENVIRONMENT.md`.
For common page/button/shortcut tasks, also read
`docs/APP_DEVELOPMENT_SCENARIOS.md`.

## 0. Mode Scope

Use this skill after choosing **Source Development Mode** or **Build Mode** for
APP organ work.

Mode target rule:

- **Source Development Mode**: the working directory is not under
  `~/Documents/Galois/` and is the real Galois source repository. Edit that
  source repository.
- **Build Mode**: the working directory is
  `~/Documents/Galois/workbench/Galois-vscode-core/`, or the user asks inside
  the app to build pages, buttons, shortcuts, themes, settings, or APP/CORE
  behavior. Edit the full external workbench copy.
- **Assist Mode**: the working directory is a notebook project, or the task is
  note writing, note management, tags, media, search, or notebook project
  scripts. Do not use APP organ development.

APP organ build covers:

- Standalone pages or panels under `APP/[plugin-name]/`.
- Right sidebar toolbar buttons declared as APP actions.
- Keyboard shortcuts backed by APP actions.
- Plugin-owned services under `APP/[plugin-name]/services/`.
- Plugin metadata and interpreter declarations in `APP/[plugin-name]/plugin.json`.
- Renderer UX, hooks, state subscriptions, and Blood channel integration.

Do not use this skill when the user is simply writing notes, adding note tags,
or inserting current-note content. Use Assist Mode plus `dnote-runtime`,
`dnote-tags`, or `dnote-command-scripts` instead.

Do not put notebook project automation in `APP/`. If the requested feature is
specific to one notebook project, use the notebook capability workflow:
`command/commands.json`, `script/`, `.dnote/`, `pyproject.toml`, and `uv.lock`.

## 1. Plugin Directory Layout

Use this skill only for APP organs, plugin manifests, plugin-owned service
scripts, renderer pages, toolbar buttons, and shortcuts. If the user asks for
notebook commands, dynamic tags, lifecycle hooks, reactive expressions, or slash
menu content snippets, use the notebook project script workflow instead.

In source development mode, the active development target is the current
Galois source repository that contains this `SKILL.md`.

In build mode for a packaged app, the active development target is the writable
runtime workbench at:

```text
~/Documents/Galois/workbench/Galois-vscode-core/
```

That external workbench is for packaged-app Build Mode. It is not the target
when the user is working in the real source repo.
The packaged `.app` bundle is only a launcher, classic seed, and recovery
source. Do not create separate agent-doc or plugin-development directories as
the default answer.

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

`services/` is for plugin-owned helper scripts or calculation assets. In source
development they live in the current repo. In packaged mode they are copied
into the external workbench and can be resolved through
`electronAPI.getServiceScriptPath(pluginFolder, scriptName)`. Packaged Galois
resolves the external workbench first, then falls back to the classic seed
bundled inside the app.

## 2. Registration Entry

The active renderer entry is the repository root `index.tsx`. It scans
`./APP/*/index.ts` with `import.meta.glob(..., { eager: true })` and registers
any exported object that has `typeId` and `component`.

Naming rules:

- Built-in APP plugin folders use `APP/[kebab-name]/`.
- Renderer `typeId` values use stable lower camelCase, for example
  `graphView`.
- Action ids use `[plugin-name].[actionName]`.
- Do not reuse notebook project command ids for APP actions.

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

`AreaComponent.dynamicActionPrefixes` may be used when a plugin needs to receive
dynamic action ids, for example project commands or custom commands whose ids
are not known at registration time.

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

Renderer bridge parameters:

```typescript
getServiceScriptPath(pluginFolder: string, scriptName: string): Promise<string>
runScript(
  scriptPath: string,
  stdin: string,
  cwd: string,
  envExtra?: Record<string, string>
): Promise<{ stdout: string; stderr: string }>
```

- `pluginFolder` is the folder under `APP/`, for example `graph-view`.
- `scriptName` is resolved inside `APP/[pluginFolder]/services/`.
- In packaged mode, service path resolution checks the external workbench first
  and then the packaged classic seed.
- `cwd` is usually the selected notebook project path so the service can read
  project files via `DNOTE_PROJECT_PATH` or stdin payloads.
- `envExtra` is merged after the secure base environment; use it only for
  explicit context such as `DNOTE_PROJECT_PATH`.

## 6. Command-Line Assistant Workflow

In source developer mode, the built-in terminal can start the command-line
assistant and work directly inside the current source repository. It may create
and edit plugins under `APP/`, update docs, and run checks.

In packaged DMG mode, opening the app hands off to the external runtime
workbench. The assistant should edit:

```text
~/Documents/Galois/workbench/Galois-vscode-core/
```

Use that workbench for packaged-app `APP/`, `CORE`, `.agents/skills/`,
`AGENTS.md`, and `docs/` changes. It may inspect packaged plugin files as
read-only seed context, but it must not modify the installed app bundle.

The external workbench should be a Git repository when Git is available. Prefer
`git status`, branches, commits, `git restore`, or `git revert` before using the
classic restore script.

When the assistant creates a plugin, it should update:

- `APP/[plugin]/index.ts`
- `APP/[plugin]/[PluginView].tsx`
- `APP/[plugin]/actions/index.ts`
- `APP/[plugin]/plugin.json`
- Any plugin-specific README or documentation if the behavior is nontrivial

APP service scripts are not VS Code extensions with a full editor mutation API.
They may read project context through environment variables or
`.dnote_runtime.json`, and they may return JSON to the host. Cursor-sensitive
editing should be implemented as editor actions or notebook project
`commands.json` `content` commands until Galois exposes a formal editor patch
API for plugin services.

Interpreter override lookup reads the owning APP plugin's `plugin.json` in the
active runtime tree. Packaged app mode checks the external workbench before
falling back to global defaults.

## 7. File Size and Modularity

The project rule remains: TS/TSX files should generally stay under 400 lines.
Several legacy files exceed this today. Do not make them larger when adding
features. Extract hooks or services when touching those areas.

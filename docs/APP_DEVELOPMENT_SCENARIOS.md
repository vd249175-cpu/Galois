# APP Development Scenarios

This guide is for APP/Core feature development.

When you are working in the real Galois source repository, edit that current
repository directly. Do not jump to the packaged app runtime workbench.

Packaged app users get a writable whole-code runtime workbench copied to:

```text
~/Documents/Galois/workbench/Galois-vscode-core/
```

For packaged app users, the installed app bundle is the classic seed and
recovery source. Do not edit the `.app` bundle. Change the external workbench
copy instead, then run it with:

```bash
~/Documents/Galois/workbench/run-galois-workbench.sh
```

If the workbench breaks, restore the classic copy from Settings or run:

```bash
~/Documents/Galois/workbench/restore-galois-workbench.sh
```

Before using classic restore in packaged app mode, prefer Git inside the
external workbench:

```bash
cd ~/Documents/Galois/workbench/Galois-vscode-core
git status
```

Use commits, branches, `git restore`, or `git revert` as the normal recovery
path. Classic restore is only the final fallback when Git cannot recover the
workspace or the user explicitly wants a clean seed.

## Build Mode Taxonomy

Use this document after the agent has selected **Source Development Mode** or
**Build Mode**.

Mode target rule:

- **Source Development Mode**: the working directory is not under
  `~/Documents/Galois/` and is the real Galois source repository. Edit the
  current source repository.
- **Build Mode**: the working directory is
  `~/Documents/Galois/workbench/Galois-vscode-core/`, or the user asks inside
  the app to build pages, buttons, shortcuts, themes, settings, or APP/CORE
  behavior. Edit the complete external workbench copy.
- **Assist Mode**: the working directory is a notebook project, or the task is
  writing, tagging, media, search, or notebook project scripts. Do not use this
  APP/Core development document.

If the user is asking for help writing, summarizing, tagging, or editing notes,
stay in Assist Mode and use `.dnote_runtime.json` plus note-project skills
instead.

Build work has five feature categories. Source Development Mode and Build Mode
use the same categories; only the target tree differs:

- **Page development**: user-visible app features such as pages, panels, views,
  renderer interactions, plugin-owned services, or plugin metadata. Work in
  `APP/[plugin-name]/`.
- **Button development**: right sidebar buttons, toolbar buttons, actions, and
  `actions.*` Blood signals.
- **Shortcut development**: `OrganAction.defaultShortcut`, shortcut config,
  action dispatch, and shortcut live reload behavior.
- **Theme/settings development**: themes, font sizes, keybindings, layout,
  Settings UI, config schema, config IPC, and default values.
- **CORE/platform build**: shared platform capability such as IPC, file/process
  bridges, terminal spawning, configuration, windows, layout, Blood sync, or
  read-only bundle boundaries. Work in `CORE/` only when the behavior is
  genuinely cross-plugin.
- **Release/environment build**: build, package, DMG, external workbench,
  Node/uv/AGY checks, native binaries, and macOS app-bundle constraints.

Decision rule:

- Page, panel, toolbar button, or keyboard action: APP development in Source
  Development Mode or Build Mode.
- Theme, font size, layout, shortcut settings, or Settings UI: theme/settings
  development in Source Development Mode or Build Mode.
- Notebook automation, templates, dynamic tags, or lifecycle hooks: Assist Mode
  with notebook project skills.
- Generic shell/file/config/window/runtime bridge: CORE/platform build.
- DMG, `.app`, dependency install, or external workbench: release/environment
  build.

## 1. Develop A Standalone Page

Use this when the user asks for a new panel, page, workspace view, or organ.

Create or edit:

```text
APP/[plugin-name]/
├── index.ts
├── [PluginView].tsx
├── actions/
│   └── index.ts
├── services/      optional
└── plugin.json    optional metadata/interpreters
```

Checklist:

- Export an `AreaComponent` object from `index.ts`.
- Use a stable `typeId`, for example `noteAnalyzer`.
- Put the main React view directly under the plugin root.
- Register actions through the component `actions` array.
- Use Blood channels from `CORE/BloodChannels.ts`; add missing channels there
  before hardcoding new strings.
- Keep the page logic inside APP hooks/services; do not push page-specific
  business logic into CORE.

## 2. Develop A Right Sidebar Button

Use this when the user asks for a button in the right action bar for an existing
page.

Create or edit:

```text
APP/[plugin-name]/actions/[ActionName]Action.tsx
APP/[plugin-name]/actions/index.ts
APP/[plugin-name]/[PluginView].tsx
```

Action shape:

```typescript
export const myAction = {
  id: 'pluginName.actionName',
  label: 'Action Label',
  defaultShortcut: 'meta+shift+y',
  isToolbar: true,
  icon: <svg width="14" height="14" viewBox="0 0 16 16" />
};
```

Behavior:

- `isToolbar: true` makes the action appear in the right sidebar when that panel
  is focused.
- `ActionRegistry` converts clicks/shortcuts into timestamp Blood signals.
- `AreaShell` injects `lastAction` into the plugin view.
- The view should handle it with `useEffect(() => { ... }, [lastAction])`.

Do not directly call another plugin's private functions. Communicate through
Blood, events, or shared platform services.

## 3. Develop A Keyboard Shortcut

Use this when the user asks for a shortcut for an existing behavior.

Preferred path:

- Add `defaultShortcut` to the relevant APP action.
- Make sure the action id is stable: `[pluginName].[actionName]`.
- Let users override it in Settings, persisted under
  `~/Documents/Galois/config/shortcuts.json`.

For notebook project commands:

- Use `[notebook-project]/command/commands.json`.
- `script` commands are background automation and are hidden from `/`.
- `content` commands are slash-menu/editor insertion commands.

## Decision Rule

- Need a new UI panel: standalone page.
- Need a visible right-side button for an existing page: toolbar action.
- Need only a keybinding for existing behavior: shortcut on an action.
- Need notebook-specific automation or slash insertion: `command/commands.json`.
- Need plugin-owned background service: `APP/[plugin]/services/`.

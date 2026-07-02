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

Important wording rule: **Build Mode** means "modify or construct app
capabilities in the writable source tree." It does not mean release packaging.
User phrases such as "构建一个主题", "build a page", "design a button", or
"add a shortcut" mean feature implementation unless the user explicitly asks
for "DMG", "package", "打包", "发布", or "分发".

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
- **Release/environment build**: package, DMG, external workbench,
  Node/uv/AGY checks, native binaries, and macOS app-bundle constraints.

Decision rule:

- Page, panel, toolbar button, or keyboard action: APP development in Source
  Development Mode or Build Mode.
- Theme, font size, layout, shortcut settings, or Settings UI: theme/settings
  development in Source Development Mode or Build Mode.
- Notebook automation, templates, dynamic tags, or lifecycle hooks: Assist Mode
  with notebook project skills.
- Generic shell/file/config/window/runtime bridge: CORE/platform build.
- DMG, `.app`, dependency install, external workbench bootstrap, or native
  binary repair: release/environment build.

Validation rule:

- Page/button/shortcut/theme feature work: run `npx tsc --noEmit` and
  `npm run build` only as verification when needed.
- Do not use `npm run build` to make a page appear in the running app. The
  running workbench should stay on `npm run dev`; Vite/HMR and Galois' dev APP
  entry scanner make new or changed APP pages usable without a build.
- Existing renderer page/button/theme changes should appear through HMR. New
  `APP/[plugin]/index.ts` entries are scanned and registered in development
  mode.
- CORE/main/preload, IPC, launcher, native binary, or package script changes are
  kernel/platform changes. Use `npm run rebuild:reopen` after those changes so
  Electron is rebuilt and the external workbench is reopened.
- Do **not** run `npm run package:mac` for feature tests or Build Mode tasks.
- Run `npm run package:mac` only when the user explicitly asks for DMG,
  packaging, release, distribution, or app-bundle verification.

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
  defaultShortcut: 'control+alt+h',
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

Shortcut quality rules:

- Prefer no default shortcut for demos unless the user explicitly asks for one.
- If a default is requested, avoid common macOS/app chords such as `meta+s`,
  `meta+w`, `meta+q`, `meta+p`, `meta+shift+p`, `meta+shift+k`,
  `meta+shift+m`, `space`, arrow keys, and single-letter shortcuts unless the
  target view is a dedicated media/timeline surface.
- Check existing `ActionRegistry` defaults and
  `~/Documents/Galois/config/shortcuts.json` before choosing a chord.
- The UI hint must exactly match `defaultShortcut`; do not display Option when
  the binding uses Command/Meta.
- If the shortcut is experimental, mention it is user-overridable in Settings.

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

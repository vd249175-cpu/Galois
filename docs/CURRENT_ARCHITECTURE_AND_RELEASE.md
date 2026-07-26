# Galois Current Architecture and Release Baseline

This document records the current project reality. It should be treated as the
baseline for development, plugin work, notebook scripting, and macOS packaging.

## Current Decision

Galois is not yet a general public macOS distribution. It is currently a
developer-oriented Electron workspace that can run and build locally, with a
path toward an unsigned local/internal DMG.

Current practical status:

- Suitable for source development and internal dogfooding.
- Suitable for producing local test builds.
- Not yet suitable for broad non-developer macOS distribution.
- Developer ID signing, notarization, and stapling are intentionally out of
  scope for now because the project is not using an Apple Developer Program
  subscription.

The intended distribution target is a direct macOS DMG, not the Mac App Store.
The application intentionally exposes terminal, shell, local file, and script
execution capabilities, which do not fit the App Store sandbox model.

## Runtime Shape

Galois is a TypeScript, Electron, Vite, and React application. The root
`index.tsx` is the active renderer entry. It auto-registers plugins from
`APP/*/index.ts` with `ComponentRegistry` before rendering `CORE/App.tsx`.

`CORE` provides the application shell:

- Electron windows and secondary panel windows.
- IPC bridges for file access, shell commands, scripts, terminal PTY, config,
  layout, and cross-window Blood state sync.
- Layout, action routing, focus tracking, and toolbar injection.
- The shared Blood state bus and channel namespace.

`APP` contains organ plugins. A plugin owns its UI, actions, hooks, service
scripts, and business lifecycle. Plugins communicate through Blood channels and
must not directly call each other.

The current implementation is Blood-first. A VS Code-style DI layer exists in
`CORE/services.ts`, but plugin migration to those services is incomplete. New
documentation should describe DI as available infrastructure, not as a finished
replacement for Blood.

## User-Facing Storage Layout

Galois intentionally keeps user-visible state in Documents instead of scattering
editable files inside hidden application support folders.

- App-level preferences, shortcuts, layout, logs, and the packaged app's
  editable runtime workbench live under `~/Documents/Galois/`.
- The packaged app runtime workbench lives at
  `~/Documents/Galois/workbench/Galois-vscode-core/`.
- The packaged `.app` is a launcher, classic seed, and recovery source. When
  opened in packaged mode it hands off to the external editable runtime
  workbench.
- The external runtime workbench should be a Git repository when Git is available.
  Agents should prefer Git status, branches, commits, restore, or revert before
  using classic-code recovery.
- The default starter notebook lives under
  `~/Documents/Galois Projects/Getting Started`.
- Discoverable notebook Markdown files are direct children of the selected
  notebook root: `{projectPath}/note.md`. The current file tree, tag resolver,
  and graph do not recursively discover Markdown under `docs/`, `script/`,
  `media/`, `.dnote/`, or arbitrary subdirectories. Agents must create new
  notes at the project root unless this storage contract is deliberately
  migrated in source first.
- Notebook media belongs to the notebook project. Dragged Markdown media is
  archived under `{projectPath}/media/`; generated video timeline assets live
  under `{projectPath}/.dnote_assets/`.
- Full Markdown video embeds and timeline clips have distinct path contracts.
  `![video](media/file.ext)` resolves from the notebook root, while
  `@video[label](file.ext?t=start,end)` resolves the file name from
  `{projectPath}/.dnote_assets/videos/`. A `media/...` path is not a timeline
  asset reference.
- The inline player first uses Electron/Chromium's native media backend.
  Recognizing a container extension such as MOV does not guarantee that its
  codec can be decoded. When native decoding fails, local media exposes an mpv
  original-format fallback through the typed `media:playWithMpv` bridge. The
  fallback opens mpv's native playback window, passes timeline start/end values,
  and never creates a converted copy. `brew install mpv` supplies the current
  development dependency. A future in-surface backend would still require a
  native libmpv render context; DOM video elements cannot host libmpv directly.
- Markdown math is rendered locally with KaTeX. Inline `$...$` and `\(...\)`
  expressions plus multiline `$$...$$` and `\[...\]` display blocks use the same
  `MarkdownPreview` path for ordinary notes and reactive/generated Markdown.
  Fenced and inline code are protected before math parsing.
- Safe inline HTML remains an explicit allowlist rather than unrestricted raw
  HTML. `<kbd>...</kbd>` is supported by the shared inline renderer, including
  table cells and reactive/generated Markdown.
- Frontmatter `tags:` are manually managed tags. Body `#hashtags` are derived
  tags and are never copied into Frontmatter during load or save. The top tag
  toolbar may remove only manual tags; body tags are source-labelled and must be
  changed in the Markdown body.
- Runtime/cache files such as `.dnote_runtime.json` and `.dnote_cache/` remain
  project-local and should not be packaged into the starter template.
- Editor undo/redo history is project-local too:
  `{projectPath}/.dnote_cache/editor-history.json` keeps per-file history across
  document switches, Live/Reading mode switches, and App restarts until the user
  removes the project cache.
- The last selected notebook is stored in
  `~/Documents/Galois/config/project-state.json` under
  `__galoisApp.lastProjectPath`. Renderer `localStorage` is only a legacy
  migration source, so changing renderer origins or rebuilding the UI does not
  reset the selected notebook to the starter project.
- The File Tree folder button and `fileTree.openFolder` action open a native
  directory picker owned by the live main window. Main-process IPC must resolve
  that window when the action runs; it must not capture the pre-startup `null`
  window value while handlers are registered.
- A popped-out area includes its own activity bar, keeps its `areaId`, and subscribes to
  `layout.changeAreaType.{areaId}` through cross-window Blood sync. Selecting an
  organ in the main window's activity bar therefore changes the floating
  window in place and updates `layout.poppedAreas.{areaId}` for later merging.
- Media remove controls own their pointer events in both Live Preview and
  Reading mode. Activating the cross removes the Markdown reference and saves
  the note instead of first exposing/focusing the media source line.
- The installed `.app` bundle and `Contents/Resources/APP/` are treated as
  read-only application assets.

## Built-In Command-Line Assistant

Galois includes an external-terminal assistant workflow. The terminal plugin
uses `node-pty` for ordinary embedded shell tabs, but `agy` is launched only by
an explicit native-terminal action so assistant sessions are not tied to
renderer refresh, HMR, layout remounts, or embedded PTY lifecycle.

`agy/Antigravity` is not bundled with Galois. Users install and update it through
their own toolchain. Galois only detects whether the command exists and, when the
user clicks the AGY terminal button, opens the system Terminal with a generated
`agy --add-dir ...` command.

In source/developer mode, the assistant is expected to be able to:

- Edit files under `APP/` in the current source repository to create or modify plugins.
- Edit notebook project scripts under `script/`.
- Run build, type-check, and project diagnostic commands.
- Benefit from Vite hot reload while plugin code changes.

In a packaged DMG, the installed app bundle is not the editable runtime. It is
the classic seed and recovery source. The assistant should use the external
runtime workbench at `~/Documents/Galois/workbench/Galois-vscode-core/` for
packaged-app APP, CORE, docs, AGENTS, and skill changes.

In packaged mode, opening the app launches the external workbench through
`~/Documents/Galois/workbench/run-galois-workbench.sh`. The internal packaged
code should be treated as immutable seed material, not as the active development
workspace.

The packaged launcher shows a small startup status window immediately after the
user clicks the macOS app. This avoids the confusing blank interval while the
external workbench, Vite dev server, and Electron process are being prepared.

Runtime development split:

- APP renderer pages, toolbar buttons, themes, and shortcut changes should use
  the running `npm run dev` workbench and Vite/HMR. Do not run `npm run build`
  just to make a page appear.
- New `APP/[plugin]/index.ts` entries are discovered by the development APP
  entry scanner and registered without a production build.
- CORE/main/preload, Electron IPC, launcher startup, package scripts, or native
  binary changes require rebuilding Electron and reopening the workbench with
  `npm run rebuild:reopen`.
- A separate source checkout can replace the clean external runtime workbench
  with `npm run sync:workbench`; add `-- --reopen` when Electron CORE/preload
  must be rebuilt and the workbench reopened. The command refuses dirty managed
  files and same-path source/target execution. Target-only `APP` plugin folders
  may remain dirty: they are excluded from replacement and from the
  managed-source rollback commit, so user plugins survive unchanged.

At startup the app publishes runtime facts into Blood:

- `system.runtimeMode`
- `system.sourcePluginPath`
- `system.canWriteSourcePlugins`
- `system.agentWorkspace`
- `system.environmentStatus`
- `system.projectEnvironmentRepair` (written by FirstRunSetup during environment
  repair, not at startup; read by settings and onboarding components)

The native AGY launcher uses `system.agentWorkspace` to add the selected
notebook project plus the external runtime workbench in packaged mode. Do not
add separate plugin or agent-document directories by default.

Assistant tasks must be routed by layer:

- Notebook commands, dynamic tags, lifecycle hooks, reactive expressions, and
  slash snippets belong to the selected notebook project (`command/`, `script/`,
  `.dnote/`, `pyproject.toml`).
- APP plugins, plugin manifests, and plugin-owned service scripts belong to the
  current source repository in source/developer mode, or to the external
  workbench's `APP/[plugin]/` directory in packaged mode.

Assist Mode initialization is deliberately bounded. After reading the selected
project's `.dnote_runtime.json`, an assistant should run the repository's
`dnote-project-overview` skill once to obtain a capped map of Markdown paths,
project commands, script/config structure, dependencies, and media counts. The
map excludes note bodies, caches, dependency trees, and unbounded recursive
listings. Reuse it during the task and refresh it only after a project switch or
a material structure change.

Complex end-to-end work uses `dnote-complete-project` as a coordinator before
domain skills. Canonical executable references are kept in source control:

- `.agents/skills/dnote-app-plugins/scripts/scaffold_plugin.py` generates a
  complete non-overwriting APP organ with action, Blood, service, and error
  handling boundaries.
- `template-project/08_完整Markdown与程序生成验收.md` and
  `script/render_showcase.py` exercise ordinary and program-generated Markdown
  through the same interaction contract.
- `.agents/skills/dnote-complete-project/scripts/validate_reference_examples.py`
  checks both references deterministically so documentation drift is detected.

## Naming Protocol

Use these names consistently so humans, plugins, and the assistant do not cross
layers:

- Product/user-facing name: `Galois`.
- Legacy environment prefix: keep `DNOTE_*` for script environment variables
  until a deliberate compatibility migration is implemented.
- Built-in APP plugin folder: `APP/[kebab-name]/`.
- Built-in plugin `typeId`: lower camelCase, for example `graphView`.
- Organ action id: `[pluginName].[actionName]`, for example `editor.save`.
- Notebook command id: project-scoped id such as `project.noteStats` or
  `custom.insertStatus`.
- Blood keys must use only `system.*`, `layout.*`, `actions.*`, or `events.*`
  and should be declared in `CORE/BloodChannels.ts` before use.

## Environment Ownership

There are three dependency layers. Keep them separate.

### Application Layer

The application layer is the Electron app itself. Its Node dependencies are
defined by `package.json` and must be resolved before packaging. End users should
not manage these dependencies after installing the DMG.

Release builds must be produced from a clean install, not from a symlinked or
shared `node_modules` directory.

Application dependency status should be verified from Settings → 环境与扩展.
Git is part of the required safety net for both the current source repository
and the packaged app external workbench. If Git is missing from the external
workbench, the app can still run, but agent recovery falls back to the classic
restore script.

### Plugin Layer

Each plugin owns its plugin-local runtime needs.

Plugin service scripts live under `APP/[plugin]/services/` in the active code
tree. In source/developer mode that is the current source repository; in
packaged mode that is the external runtime workbench. If a plugin needs a
specific interpreter or runtime command, it should declare that in
`APP/[plugin]/plugin.json` under an `interpreters` field. The packaged app
resolves built-in service scripts from the external workbench first, then falls
back to the packaged classic seed.

Creating a new renderer UI panel means editing `APP/*/index.ts` in the current
source repository during source development, or in the external workbench during
packaged app modification.

Currently registered built-in APP plugins (typeId): `editor`, `fileTree`,
`graphView`, `terminal`, `settings`,
`videoTimeline`.

Plugin scripts should not assume a notebook project's `.venv` unless they are
explicitly operating as project scripts. Plugin code should prefer the shared
script execution bridge so interpreter selection remains centralized.

Plugin interpreter overrides and host-level fallback interpreters are configured
from Settings → 环境与扩展. Plugin-owned dependencies should still be declared in
the plugin manifest or PEP 723 script metadata.

Interpreter lookup reads the owning APP plugin's `plugin.json` in the active
runtime tree. Packaged mode checks the external workbench before falling back to
global defaults.

See `docs/PLUGIN_ENVIRONMENT.md` for the plugin metadata and interpreter
contract, and `docs/APP_DEVELOPMENT_SCENARIOS.md` for page/button/shortcut
development workflows.

### Notebook Project Layer

Notebook project scripts and lifecycle hooks belong to the notebook project.
They live under the selected project's `script/` and `command/` folders.

Notebook projects may provide their own Python environment through:

- A project `.venv`.
- A project `.dnote/config.json` interpreter override.
- `uv` with `pyproject.toml`, `uv.lock`, or PEP 723 inline script metadata.

Lifecycle hooks such as `script/on_project_open.py`,
`script/on_project_run.py`, and `script/on_project_close.py` must be authored so
they can bootstrap or verify their own project-level dependencies.

Hook contract:

- `script/on_project_open.*`: runs after a project is selected and before the
  background lifecycle hook. Use it for cache initialization and environment
  checks. It should finish quickly and be safe to run more than once.
- `script/on_project_run.*`: starts after `on_project_open.*`. It may keep
  running as a daemon. If it does, it must write a PID or shutdown marker so
  `on_project_close.*` can stop it.
- `script/on_project_close.*`: runs when switching projects or closing the app
  window. Use it for final state writes, daemon shutdown, and cleanup.
- Lifecycle hooks receive `DNOTE_PROJECT_PATH`, `DNOTE_THREAD_ID`, and
  `DNOTE_OUTPUT_FILE`. Their JSON output files live under `script/` by default
  (`on_project_open.json`, `on_project_run.json`, `on_project_close.json`).

The Settings → 环境与扩展 page detects the selected project's `.venv`, but it
does not merge that environment into plugin service scripts.

## Script Execution Contract

Project commands are declared in `command/commands.json`.

Commands with `script` are background commands. They are hidden from the editor
slash menu and triggered by shortcut or toolbar action. They write JSON output to
`.dnote_cache/{command_id}.json` and broadcast
`events.commandExecuted.{command_id}`.

Commands with `content` are insertion snippets. They appear in the slash menu
and can insert reactive expressions such as `{{ ... }}` into the note.

Project commands, reactive expressions, and dynamic tags use the unified
`runProjectScript` bridge. That bridge centralizes project path injection,
environment variables, PATH setup, stdout/stderr, and command execution.
`scriptName` execution is constrained to the notebook project's `script/`
directory. Advanced `command` entries are still project-owned shell commands and
should be treated as trusted project automation.

Plugin service scripts use `runScript` because plugin-owned services and
notebook project scripts intentionally have different environment ownership.

## Graph Topology Baseline

The graph-view concept-granularity slider controls only virtual concepts; real
note nodes remain present. A value of `0` is a hard real-only boundary. The
renderer clears its current virtual layer synchronously and applies only the
latest asynchronous `lattice.py` result, so an older slider request cannot
reintroduce virtual nodes after the user returns to zero.

Graph navigation targets the editor, not the file browser. A single click on a
real note node opens that node's backing Markdown through
`events.openFile.{lastFocusedEditorId}`. Clicking a virtual concept creates a
collision-safe temporary `概念-*.md` at the notebook root with Frontmatter tags
and supporting WikiLinks, then opens it through the same editor path. A disk
content change followed by save promotes the note and removes its temporary
marker. If it remains equal to the generated template, leaving it, switching
node/project, clicking graph whitespace, or unmounting graph-view deletes it
and broadcasts `events.fileSaved.*`. Existing promoted files are never
overwritten. `system.fileSearchQuery` may highlight graph nodes from an existing
file-tree search, but graph clicks never write the file-tree query.

Graph hover/selection focus is transitive in the outgoing lattice direction:
the focused node, one direct parent layer, and every reachable descendant and
edge remain visible through the deepest leaf layer. Unrelated branches dim, and
canvas defocus restores the complete graph.

## Editor UX Baseline

The editor now exposes two user-facing modes:

- Live Preview: CodeMirror 6 editing with Markdown decorations/widgets.
- Reading: rendered Markdown with local interactive editing affordances.

Reactive expression values that contain block Markdown are passed through the
same `MarkdownPreview` component as ordinary Reading mode content. Tables,
links, media, block editing, drag/drop, and slash commands therefore share the
normal page logic. Edits are written back to the expression's JSON key and
pause interval refresh until the user manually reruns the expression; the edit
control still opens the source expression line.

Source mode remains an internal fallback and should not be presented as a
primary user workflow.

The slash command executor is shared between Live Preview and Reading mode.
Reading block editors pass an absolute Markdown range and the current draft text
into the same command execution path, so `/table`, headings, lists, custom
snippets, and project `content` commands should behave consistently across both
modes.

Reading mode table support is interactive: table cells are editable in place,
and table hover controls can append rows or columns while preserving standard
Markdown table syntax.

The editor also publishes `shortcutRegistry` in `.dnote_runtime.json`. This is
the agent-facing runtime inventory of registered actions, scopes, defaults,
active bindings, overrides, and unbound actions. Agents should consult it before
assigning shortcuts. `panel.splitVertical` intentionally has no default shortcut
so project commands may use `meta+shift+d` without triggering panel split.

## macOS DMG Readiness

Current answer: Galois can build, but should be treated as an internal/test DMG
until the following items are complete.

Before distributing a DMG to normal users, the project needs:

- Clean dependency installation and reproducible build verification.
- Product icon and release metadata.
- A first-run environment guide for `uv`, Python, shell access, and optional
  command-line assistant setup.
- A packaged template project without runtime cache files, generated outputs,
  or machine-local state.
- A clear distinction between source developer mode and installed app mode.

Because Developer ID signing, notarization, and stapling are not planned, any
DMG produced now is an unsigned/internal build. Users may need to approve the
app manually through macOS Gatekeeper, and this should be stated in release
notes instead of hidden.

The DMG onboarding flow should guide users through environment setup instead of
expecting them to run `run.sh`. `run.sh` remains a source developer bootstrap
script.

See `docs/MACOS_DMG_ONBOARDING.md` for the first-run setup plan.

## Documentation Rule

When docs disagree with code, update the docs to state current behavior and
separately name the intended migration. Do not describe a migration target as if
it already exists.

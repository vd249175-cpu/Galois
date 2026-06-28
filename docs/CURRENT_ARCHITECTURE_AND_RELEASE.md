# DNOTE Current Architecture and Release Baseline

This document records the current project reality. It should be treated as the
baseline for development, plugin work, notebook scripting, and macOS packaging.

## Current Decision

DNOTE is not yet a general public macOS distribution. It is currently a
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

DNOTE is a TypeScript, Electron, Vite, and React application. The root
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

## Built-In Command-Line Assistant

DNOTE includes a terminal-oriented assistant workflow. The terminal plugin uses
`node-pty` to run a real shell and can optionally start the external `agy`
command-line assistant in the current workspace.

`agy/Antigravity` is not bundled with DNOTE. Users install and update it through
their own toolchain. DNOTE only detects whether the command exists and, when the
user explicitly enables terminal auto-start, sends the command into the PTY.

In source/developer mode, the assistant is expected to be able to:

- Edit files under `APP/` to create or modify plugins.
- Edit notebook project scripts under `script/`.
- Run build, type-check, and project diagnostic commands.
- Benefit from Vite hot reload while plugin code changes.

In a packaged DMG, the installed app bundle is not a plugin development
workspace. The assistant should help users write notebook scripts and operate on
their selected notebook project. For plugin development after packaging, users
should use the writable user extension directory exposed at Electron `userData`
`extensions/`.

At startup the app publishes runtime facts into Blood:

- `system.runtimeMode`
- `system.extensionPath`
- `system.sourcePluginPath`
- `system.canWriteSourcePlugins`
- `system.agentWorkspace`
- `system.environmentStatus`

The terminal assistant uses `system.agentWorkspace` to add the notebook project,
the user extension directory, and readable plugin context. See
`docs/EXTENSION_WORKSPACE.md`.

## Environment Ownership

There are three dependency layers. Keep them separate.

### Application Layer

The application layer is the Electron app itself. Its Node dependencies are
defined by `package.json` and must be resolved before packaging. End users should
not manage these dependencies after installing the DMG.

Release builds must be produced from a clean install, not from a symlinked or
shared `node_modules` directory.

Application dependency status should be verified from Settings → 环境与扩展.

### Plugin Layer

Each plugin owns its plugin-local runtime needs.

Plugin service scripts live under `APP/[plugin]/services/`. If a plugin needs a
specific interpreter or runtime command, it should declare that in
`APP/[plugin]/plugin.json` under an `interpreters` field. The packaged app can
load plugin service scripts from `Contents/Resources/APP/[plugin]/services`.

User-developed extensions live under Electron `userData/extensions/`. This
directory is writable in installed app mode and is now created and exposed by
the runtime. Dynamic UI bundle loading from that directory is a migration target;
source `APP/*/index.ts` remains the current auto-registration path.

Plugin scripts should not assume a notebook project's `.venv` unless they are
explicitly operating as project scripts. Plugin code should prefer the shared
script execution bridge so interpreter selection remains centralized.

Plugin interpreter overrides and host-level fallback interpreters are configured
from Settings → 环境与扩展. Plugin-owned dependencies should still be declared in
the plugin manifest or PEP 723 script metadata.

When a service script is launched from a registered side-loaded or App-external
development extension path, interpreter lookup reads that owning extension's
`plugin.json` before falling back to built-in APP plugin manifests and global
defaults.

See `docs/PLUGIN_ENVIRONMENT.md` for the plugin metadata and interpreter
contract, and `docs/EXTENSION_WORKSPACE.md` for source vs installed extension
workspace rules.

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

## Editor UX Baseline

The editor now exposes two user-facing modes:

- Live Preview: CodeMirror 6 editing with Markdown decorations/widgets.
- Reading: rendered Markdown with local interactive editing affordances.

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

## macOS DMG Readiness

Current answer: DNOTE can build, but should be treated as an internal/test DMG
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

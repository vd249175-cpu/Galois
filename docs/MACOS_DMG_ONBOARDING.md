# macOS DMG Onboarding Plan

This document defines the first-run setup that a packaged Galois DMG should
guide users through.

Galois currently targets unsigned local/internal DMG builds. Developer ID
signing, notarization, and stapling are intentionally not part of the current
release plan.

The app is not a Mac App Store target because it intentionally exposes local
terminal, PTY, file, and script execution workflows.

## Goals

The DMG onboarding flow should make a normal user aware of required local tools
without asking them to run the source developer `run.sh`.

It should verify:

- macOS version and architecture.
- `uv` availability for Python project scripts.
- Python availability or project-local `.venv` availability.
- Shell access for project commands.
- Optional command-line assistant availability.
- Git availability for external runtime workbench rollback.
- A writable notebook project location.
- A writable external runtime workbench at
  `~/Documents/Galois/workbench/Galois-vscode-core/`.
- Clear unsigned-app guidance for macOS Gatekeeper prompts.

## First-Run States

### Ready

All required checks pass. Galois opens the last project or copies the template
project into the user's Documents folder.

### Needs Setup

One or more required tools are missing. The app should show exact commands and
allow the user to re-check after installing.

Suggested checks:

```bash
uv --version
python3 --version
$SHELL --version
agy --version
git --version
```

`agy` is optional. Missing `agy` should not block note editing or project
scripts. Galois does not bundle `agy/Antigravity`; users install and update it
outside the app.

Install `agy` manually if the terminal assistant workflow is desired:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Galois does not auto-start `agy` inside the embedded PTY. Users start the
assistant from the Terminal panel's `AGY` button, which opens the system Terminal
with the current project and runtime workbench passed as `--add-dir` entries.

The app exposes these checks through `app:getEnvironmentStatus` and mirrors the
result into `system.environmentStatus`.

Current implementation also exposes a Settings tab named "环境与扩展" that can
re-run these checks, configure interpreter overrides, show project `.venv`
status, display install commands, and open the external runtime workbench.

The current implementation also shows a first-run setup screen before the main
workspace is used for the first time. The screen can jump directly to
Settings → 环境与扩展.

### Limited Mode

The user can edit notes, browse files, and use non-script plugins, but script
features are disabled or clearly marked unavailable.

Limited mode applies when:

- `uv` is missing and no project `.venv` is configured.
- Shell execution is unavailable.
- A plugin service runtime is missing.
- The external runtime workbench cannot be created or written.

## User Guidance

The UI should explain setup in concrete, copyable commands.

Recommended `uv` installation options:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

or:

```bash
brew install uv
```

Recommended Python installation:

```bash
brew install python
```

If the user prefers per-project environments, Galois should point them to
project-level `.venv`, `.dnote/config.json`, `pyproject.toml`, or PEP 723 script
metadata.

## Template Project Hygiene

The packaged template project should not include runtime state:

- `.dnote_runtime.json`
- `.dnote_cache/`
- `script/*.json` generated outputs
- PID files
- machine-local logs

Keep source examples, markdown notes, command definitions, scripts, user-facing
project media, and dependency manifests.

Media ownership rule:

- Dropped Markdown images, audio, and video files belong in the notebook project
  under `{projectPath}/media/`.
- Generated video timeline assets belong in `{projectPath}/.dnote_assets/`.
- App-level configuration, shortcuts, layout, and logs belong under
  `~/Documents/Galois/`.
- APP/CORE source development belongs under
  `~/Documents/Galois/workbench/Galois-vscode-core/`.

## Build Prerequisites

Before producing a release DMG:

- Run from a clean `npm ci` install.
- Avoid symlinked `node_modules`.
- Set product icon and release metadata.
- Launch the built app from the DMG on a clean macOS user profile.
- Document the unsigned-app open flow for Gatekeeper.

Developer ID signing, hardened runtime, entitlements, notarization, and staple
are not required for the current internal distribution plan.

## Local Clean Reinstall

For an internal clean-install verification, use the repository workflow:

```bash
npm run release:reinstall:mac
```

It packages both macOS architectures, stops the external workbench, removes
only `~/Documents/Galois/`, replaces `/Applications/Galois.app`, and launches
the new app. It intentionally preserves notebook projects under
`~/Documents/Galois Projects/`. Detailed packaging output is written to
`.build/package-reinstall.log`; the console prints only phase progress and a
failure tail when needed.

## Developer Mode

`run.sh` remains the source developer bootstrap. It may install or check tools
interactively because it is intended for a writable repository checkout.

The installed DMG should use a first-run setup screen instead.

## External Source Workbench

Installed apps should never ask users or the assistant to edit the `.app`
bundle. The packaged `.app` is a launcher, classic seed, and recovery source.
When opened, it should hand off to:

```text
~/Documents/Galois/workbench/Galois-vscode-core/
```

This directory contains the active external `CORE/`, `APP/`, `.agents/`,
`docs/`, and root build files. The command-line assistant adds it to its
workspace context automatically.

If Git is available, this workbench is initialized as a Git repository. Agent
recovery should use Git first; classic-code restore is the final fallback.

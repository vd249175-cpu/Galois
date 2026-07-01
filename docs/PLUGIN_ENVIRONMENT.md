# Plugin Environment Contract

This document defines how Galois APP plugins describe plugin-owned runtime
needs across source development and packaged-app runtime.

## Current Workspace Rule

In source development, the active workspace is the current Galois source
repository. APP plugin code and service scripts belong under:

```text
APP/[plugin]/
```

In packaged app mode, the packaged `.app` is a launcher, classic seed, and
recovery source. It is not the editable runtime. On startup, Galois ensures and
launches:

```text
~/Documents/Galois/workbench/Galois-vscode-core/
```

This external workbench contains the packaged app's running `CORE/`, `APP/`,
`.agents/`, `docs/`, and root build files. Packaged-app APP plugin code and
plugin service scripts belong there:

```text
~/Documents/Galois/workbench/Galois-vscode-core/APP/[plugin]/
```

Notebook project scripts are separate and stay in the selected notebook project
under `command/`, `script/`, `.dnote/`, `pyproject.toml`, or `.venv/`.

## plugin.json Fields

`plugin.json` is plugin metadata. Renderer registration still comes from
`APP/[plugin]/index.ts`, but `plugin.json` is the stable place for interpreter
and package declarations.

Recommended shape:

```json
{
  "id": "graphView",
  "name": "Lattice Graph",
  "version": "1.0.0",
  "description": "Force-directed DAG visualization of tag relations.",
  "interpreters": {
    "python": "uv run",
    "node": "node",
    "typescript": "node --experimental-strip-types",
    "bash": "bash"
  },
  "packages": {
    "python": [
      { "name": "networkx>=3.0", "import": "networkx" }
    ]
  },
  "services": [
    {
      "name": "lattice.py",
      "runtime": "python",
      "entry": "services/lattice.py",
      "dependencies": ["networkx"]
    }
  ]
}
```

## Naming Protocol

- Product name: `Galois`.
- Built-in APP plugin folder: `APP/[kebab-name]/`.
- Built-in plugin `typeId`: lower camelCase, for example `graphView`.
- Organ action id: `[pluginName].[actionName]`, for example
  `editor.save`.
- Notebook command id: project-scoped, for example `project.noteStats`.
- Legacy script environment variables still use `DNOTE_*` until a deliberate
  compatibility migration is implemented.

## Interpreter Resolution

For APP plugin service scripts, interpreter lookup uses this order:

1. Active runtime tree `APP/[plugin]/plugin.json` `interpreters`.
2. Packaged classic seed `APP/[plugin]/plugin.json` `interpreters` when running packaged mode.
3. Global app config interpreter defaults.
4. Built-in fallback such as `uv run`, `node`, or `bash`.

Plugin scripts should not automatically use a notebook project's `.venv`.
Notebook environments belong to notebook project scripts.

## Service Scripts

Service scripts live under:

```text
APP/[plugin]/services/
```

Renderer code should resolve service scripts through:

```typescript
const scriptPath = await window.electronAPI.getServiceScriptPath(
  'graph-view',
  'lattice.py'
);
```

Then run them through the shared script bridge:

```typescript
await window.electronAPI.runScript(scriptPath, stdinPayload, projectPath, env);
```

Prefer `uv run script.py` for Python service scripts with PEP 723 inline
dependencies. Do not use `uv run python script.py` for scripts that rely on
PEP 723 metadata, because that bypasses script metadata resolution.

## Dependency Style

Prefer one of these styles:

- PEP 723 inline metadata for single-file Python service scripts.
- `plugin.json` package declarations for plugin-wide or service-local packages.
- Standard-library-only scripts with the built-in interpreter fallback.

Avoid hidden dependency on the developer machine. A plugin should fail clearly
if its runtime is missing.

## Editor Boundary

APP service scripts may read project context through `DNOTE_PROJECT_PATH` and
`{projectPath}/.dnote_runtime.json`, and may return JSON to the host. They are
not yet a formal editor mutation API.

Cursor-sensitive editing should be implemented as editor actions or notebook
project `commands.json` `content` commands until Galois exposes a stable editor
patch API for plugin services.

## Git And Recovery

The current source repository and packaged external workbench should both use
Git as the safety net when available. Agent recovery should prefer Git status,
branches, commits, `git restore`, or `git revert`.

Classic-code restore from the packaged app is the final fallback, not the normal
development flow.

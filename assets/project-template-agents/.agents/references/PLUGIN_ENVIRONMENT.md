# Plugin Environment Contract

This document defines how APP plugins describe plugin-owned runtime needs.

Plugin environment is separate from notebook project environment. A plugin may
ship service scripts under `APP/[plugin]/services/`; those scripts are packaged
with the application and are owned by the plugin.

## plugin.json Fields

`plugin.json` is metadata. Runtime registration still comes from
`APP/[plugin]/index.ts`, but `plugin.json` is used as the stable description for
packaging, tooling, and future extension management.

Built-in source plugins live under `APP/`. User extension projects live under
`~/Documents/Galois/extensions/`; see `docs/EXTENSION_WORKSPACE.md`.
Side-loaded script extensions are discovered by the extension host until a
dynamic renderer bundle loader exists.

## Naming Protocol

- Built-in APP plugin folder: `APP/[kebab-name]/`.
- Built-in plugin `typeId`: lower camelCase, for example `graphView`.
- User extension folder: `~/Documents/Galois/extensions/[extension-id]/`.
- Extension `plugin.json` id: stable kebab-case or lower camelCase.
- Extension command id: `[extensionId].[commandName]`, for example
  `env-check.runProbe`.
- Service script names must resolve inside the extension or plugin `services/`
  directory. Do not reference notebook project scripts from plugin manifests.
- Plugin-owned environment declarations live in `plugin.json`; notebook project
  environment declarations live in the notebook project.

Recommended shape:

```json
{
  "id": "graphView",
  "name": "Lattice Graph",
  "version": "1.0.0",
  "description": "Force-directed DAG visualization of tag relations.",
  "dependencies": ["fileTree"],
  "bloodChannels": [
    "system.projectPath",
    "system.resolvedTags",
    "events.fileSaved.*"
  ],
  "interpreters": {
    "python": "uv run",
    "node": "node",
    "typescript": "node --experimental-strip-types",
    "bash": "bash"
  },
  "packages": {
    "python": [
      { "name": "numpy>=1.26", "import": "numpy" }
    ]
  },
  "services": [
    {
      "name": "lattice.py",
      "runtime": "python",
      "entry": "services/lattice.py",
      "dependencies": ["networkx"]
    }
  ],
  "triggerConditions": {}
}
```

## Interpreter Resolution

For plugin service scripts, interpreter lookup uses this order:

1. The owning App-external development extension `plugin.json`
   `interpreters`, when the script lives inside a registered dev extension path.
2. Built-in `APP/[plugin]/plugin.json` `interpreters`, when the script is a
   built-in service.
3. Same-id user extension `~/Documents/Galois/extensions/[plugin]/plugin.json`
   `interpreters`.
4. Global app config `interpreters`.
5. Built-in fallback such as `uv run`, `node`, or `bash`.

Plugin scripts should not automatically use a notebook project's `.venv`.
Notebook environments belong to notebook project scripts.

App-external development extension paths participate in interpreter resolution:
when a service script lives inside a registered development extension root, the
app reads that extension's `plugin.json` before falling back to built-in APP
plugin manifests, same-id user extension manifests, global app config, and
built-in defaults.

## Service Scripts

Service scripts live under:

```text
APP/[plugin]/services/
```

Packaged app path:

```text
Contents/Resources/APP/[plugin]/services/
```

Renderer code should resolve service scripts through:

```typescript
const scriptPath = await window.electronAPI.getServiceScriptPath(
  'graph-view',
  'lattice.py'
);
```

Then run it through the shared script bridge:

```typescript
await window.electronAPI.runScript(scriptPath, stdinPayload, projectPath, env);
```

## Dependency Style

Prefer one of these styles:

- Python PEP 723 inline metadata for single-file service scripts.
- `plugin.json` package declarations for side-loaded plugin packages:
  `packages.python[*]` for plugin-wide packages, and
  `services[*].dependencies` for service-local packages.
- Global interpreter fallback only for simple scripts with standard-library
  dependencies.

The extension import/host flow treats `plugin.json` as the plugin environment
contract. When a `.zip` extension package is imported, Galois installs it into
`~/Documents/Galois/extensions/`, reads `plugin.json`, creates a plugin-local
`uv` environment when needed, and installs missing packages declared by the
plugin.

Notebook project dependencies are not used for plugin service scripts. A plugin
service receives the selected notebook path through `DNOTE_PROJECT_PATH`, but
its process `cwd` is the plugin root so `uv` resolves the plugin's own
environment.

Service scripts may read project runtime context, including
`{DNOTE_PROJECT_PATH}/.dnote_runtime.json`, when they need to understand the
current focused note or cursor. That file is context, not an editor mutation
API. A side-loaded service should return JSON to the host and should not rewrite
the active Markdown file to replace a selection unless the user explicitly asks
for trusted file-level automation. Cursor-sensitive edits belong to editor
actions or notebook project `commands.json` `content` commands until a formal
extension editor patch API exists.

Use `uv run` rather than `uv run python` for Python service scripts that contain
PEP 723 metadata. `uv run script.py` lets uv read the script's inline
dependencies, while `uv run python script.py` bypasses that metadata.

Avoid hidden dependency on the developer machine. A plugin should fail with a
clear error if its runtime is missing.

## Known Migration Target

Current code still has some direct shell execution in APP plugins for non-script
tasks. New script execution should use `runScript` for plugin services or
`runProjectScript` for notebook project scripts.

Dynamic renderer loading of user extension UI bundles is not implemented yet.
The extension directory currently supports writable script-extension packages,
metadata/interpreter lookup, and command-line assistant context.

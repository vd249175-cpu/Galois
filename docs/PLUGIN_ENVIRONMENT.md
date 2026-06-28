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
Electron `userData/extensions/`; see `docs/EXTENSION_WORKSPACE.md`.
Side-loaded script extensions are hosted by the built-in Extension Lab organ
until a dynamic renderer bundle loader exists.

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

For plugin service scripts, interpreter lookup should use this order:

1. `APP/[plugin]/plugin.json` `interpreters`.
2. User extension plugin `userData/extensions/[plugin]/plugin.json`
   `interpreters`.
3. Global app config `interpreters`.
4. Built-in fallback such as `uv run`, `node`, or `bash`.

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

Extension Lab treats `plugin.json` as the plugin environment contract. When a
`.zip` extension package is dropped into Extension Lab, DNOTE imports it into
Electron `userData/extensions/`, reads `plugin.json`, creates a plugin-local
`uv` environment, and installs missing packages declared by the plugin.

Notebook project dependencies are not used for plugin service scripts. A plugin
service receives the selected notebook path through `DNOTE_PROJECT_PATH`, but
its process `cwd` is the plugin root so `uv` resolves the plugin's own
environment.

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

# Extension Workspace Contract

This document defines where plugin and assistant work should happen in source
development mode and in an installed macOS app.

## Directory Layers

### Built-In Source Plugins

Path in source development:

```text
APP/[plugin-name]/
```

These plugins are compiled by Vite through the root `index.tsx`
`import.meta.glob('./APP/*/index.ts')` registration. They are editable in a
repository checkout and support hot reload during development.

Path in a packaged app:

```text
Contents/Resources/APP/[plugin-name]/
```

This path is read-only application material. The installed `.app` bundle should
not be treated as a writable plugin workspace.

### User Extension Workspace

Runtime path:

```text
${app.getPath('userData')}/extensions/
```

The app now creates this directory through `app:ensureExtensionsDir` and exposes
it through `app:getRuntimeInfo`.

This is the stable writable location for user-developed or user-installed
extension projects after DNOTE is installed from a DMG.

### Development Extension Paths

DNOTE also supports VS Code-style external development paths. These are
configured in `dnote.config.json`:

```json
{
  "extensions": {
    "devPaths": [
      "/absolute/path/to/my-extension"
    ]
  }
}
```

Each path can point either to one extension folder containing `plugin.json`, or
to a folder that contains multiple extension folders. Development paths are
listed before `${userData}/extensions/`, so a development extension can override
a user-installed extension with the same `id`.

Current state:

- The directory is created and listed by the runtime.
- Plugin interpreter lookup reads `plugin.json` from the script's owning
  extension root, including App-external development paths. Built-in `APP/`
  plugin manifests remain the fallback for built-in service scripts.
- The built-in terminal assistant adds this directory to its workspace context.
- The built-in Extension Lab organ can discover side-loaded extensions and run
  their declared service scripts from this directory.
- Extension Lab can add and remove App-external development extension paths.

Known migration target:

- Dynamic runtime loading of user extension UI bundles is not implemented yet.
- Until a plugin bundle loader exists, source `APP/*/index.ts` remains the only
  renderer component auto-registration path. Side-loaded extensions should use
  built-in host organs for now.

## Expected Extension Shape

User extensions should mirror the APP organ layout so migration between source
plugins and user extensions is straightforward:

```text
extensions/[plugin-name]/
├── plugin.json
└── services/
```

`plugin.json` should follow `docs/PLUGIN_ENVIRONMENT.md`.

Current side-loaded script extension shape:

```json
{
  "id": "env-check",
  "kind": "script-extension",
  "activationEvents": [
    "onCommand:env-check.runProbe"
  ],
  "interpreters": {
    "python": "uv run"
  },
  "contributes": {
    "commands": [
      {
        "command": "env-check.runProbe",
        "title": "Run Python dependency probe",
        "category": "Environment",
        "service": "env_probe.py"
      }
    ]
  },
  "services": [
    {
      "name": "env_probe.py",
      "runtime": "python",
      "entry": "services/env_probe.py",
      "dependencies": ["numpy"]
    }
  ]
}
```

This mirrors the mature VS Code manifest idea, but with a DNOTE-specific
runtime: `contributes.commands[*].service` maps a command to a declared service
script. The Extension Host resolves that service through Platform before it
touches the OS.

The app seeds bundled examples from repository/package `extensions/` into
`${userData}/extensions/` on startup, but only when the target extension folder
does not already exist. User edits in the side-loaded directory are not
overwritten.

## Runtime Info IPC

Renderer code can inspect the current runtime mode:

```typescript
const runtimeInfo = await window.electronAPI.getRuntimeInfo();
```

Important fields:

- `mode`: `source-dev` or `installed-app`.
- `extensionPath`: writable user extension workspace.
- `extensionDevPaths`: App-external extension development paths.
- `sourcePluginPath`: source or packaged built-in plugin path.
- `canWriteSourcePlugins`: true only when the source plugin path is writable.
- `agentWorkspace.readableDirs`: directories the command-line assistant should
  be allowed to inspect.
- `agentWorkspace.writableDirs`: directories the command-line assistant may
  safely modify.

The app mirrors these values into Blood:

- `system.runtimeMode`
- `system.extensionPath`
- `system.sourcePluginPath`
- `system.canWriteSourcePlugins`
- `system.agentWorkspace`

Development paths are also added to `system.agentWorkspace`, so the built-in
command-line assistant can inspect and edit them without touching the installed
`.app` bundle.

Extension service scripts can be resolved through:

```typescript
const scriptPath = await window.electronAPI.getExtensionServiceScriptPath(
  'env-check',
  'env_probe.py'
);
```

## Assistant Workspace Rules

The built-in terminal starts the command-line assistant with the selected
notebook project as the primary directory.

It then adds runtime workspace directories:

- User extension workspace.
- Built-in source plugin directory in source development.
- Built-in packaged plugin directory as read-only context in installed mode.

The assistant should write to:

- The selected notebook project.
- `${userData}/extensions/`.
- `APP/` only when `system.canWriteSourcePlugins` is true.

The assistant should not write into:

- `Contents/Resources/APP/` inside an installed app bundle.
- Application packaged assets.
- Generated cache directories unless a command explicitly owns them.

## Why This Matters

macOS app bundles are not reliable writable development directories. Treating
the installed bundle as a plugin workspace can break updates, user permissions,
and any future signing or notarization strategy.

Separating built-in plugins, user extensions, and notebook project scripts keeps
the app shippable while preserving the assistant-driven development workflow.

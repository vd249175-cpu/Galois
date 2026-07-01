# Extension Workspace Contract

This document defines where plugin and assistant work should happen in source
development mode and in an installed macOS app.

## Directory Layers

### Galois Home

Runtime path:

```text
~/Documents/Galois/
```

This is the user-visible home for app-level data: configuration, shortcuts,
layout state, logs, and side-loaded extensions. It is not a notebook project
and should not receive dropped note media.

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
~/Documents/Galois/extensions/
```

The app now creates this directory through `app:ensureExtensionsDir` and exposes
it through `app:getRuntimeInfo`.

This is the stable writable location for user-developed or user-installed
extension projects after Galois is installed from a DMG.

Notebook media is intentionally separate from this extension workspace. Dragged
Markdown media belongs in the selected notebook project at `{projectPath}/media/`;
generated video timeline assets belong in `{projectPath}/.dnote_assets/`.

### Development Extension Paths

Galois also supports VS Code-style external development paths. These are
configured in `~/Documents/Galois/config/galois.config.json`:

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
listed before `~/Documents/Galois/extensions/`, so a development extension can
override a user-installed extension with the same `id`.

Current state:

- The directory is created and listed by the runtime.
- Side-loaded extension manifests and command declarations are refreshed while
  Galois is running. The host publishes `system.extensions`,
  `system.extensionCommands`, and `system.extensionRefreshTimestamp` through
  Blood.
- Service script edits are picked up on the next command run because the
  extension host resolves and executes the script from disk each time.
- Plugin interpreter lookup reads `plugin.json` from the script's owning
  extension root, including App-external development paths. Built-in `APP/`
  plugin manifests remain the fallback for built-in service scripts.
- The built-in terminal assistant adds this directory to its workspace context.
- The extension host can discover side-loaded extensions and run their declared
  service scripts from this directory.
- Extension development tooling can add and remove App-external development
  extension paths through the extension host/platform bridge.

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

This mirrors the mature VS Code manifest idea, but with a Galois-specific
runtime: `contributes.commands[*].service` maps a command to a declared service
script. The Extension Host resolves that service through Platform before it
touches the OS.

Important editor boundary: side-loaded script extensions currently provide
service execution, manifest refresh, dependency setup, and assistant context.
They do not yet provide a stable API for replacing the current editor selection.
Services may read `.dnote_runtime.json` as context and return JSON, but
cursor-sensitive document edits should be implemented as editor actions or
notebook project `commands.json` `content` commands until a formal extension
editor patch API exists.

The app seeds bundled examples from repository/package `extensions/` into
`~/Documents/Galois/extensions/` on startup, but only when the target extension
folder does not already exist. User edits in the side-loaded directory are not
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
- `agentWorkspace.readableDirs`: user extension directories the command-line
  assistant should be allowed to inspect. Built-in `APP/` source is not added by
  default because it can conflict with project and extension skills.
- `agentWorkspace.writableDirs`: directories the command-line assistant may
  safely modify.

The app mirrors these values into Blood:

- `system.runtimeMode`
- `system.extensionPath`
- `system.extensions`
- `system.extensionCommands`
- `system.extensionRefreshTimestamp`
- `system.sourcePluginPath`
- `system.canWriteSourcePlugins`
- `system.agentWorkspace`

Development paths are also added to `system.agentWorkspace`, so the built-in
command-line assistant can inspect and edit user extensions without touching the
installed `.app` bundle or built-in `APP/` source tree.

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
- Registered App-external extension development paths.

The assistant should write to:

- The selected notebook project.
- `~/Documents/Galois/extensions/`.
- Registered App-external extension development paths.

The assistant should not write into:

- Built-in `APP/` source by default; add it manually only for core development.
- `Contents/Resources/APP/` inside an installed app bundle.
- Application packaged assets.
- Generated cache directories unless a command explicitly owns them.

Before editing, the assistant should decide the layer:

- Notebook commands, dynamic tags, lifecycle hooks, reactive expressions, and
  slash snippets are notebook project work and should stay in the selected
  project.
- APP plugins, side-loaded extensions, extension commands, plugin manifests, and
  plugin-owned services are extension work and should stay in the user extension
  workspace or an explicitly registered development extension path.

## Why This Matters

macOS app bundles are not reliable writable development directories. Treating
the installed bundle as a plugin workspace can break updates, user permissions,
and any future signing or notarization strategy.

Separating built-in plugins, user extensions, and notebook project scripts keeps
the app shippable while preserving the assistant-driven development workflow.

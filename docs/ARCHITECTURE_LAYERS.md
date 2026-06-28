# DNOTE Architecture Layers

DNOTE follows the same architectural idea as VS Code: Electron is an
implementation detail, not the architecture itself.

The current codebase includes a simplified VS Code-style instantiation kernel in
`CORE/instantiation.ts`. It is inspired by VS Code's
`src/vs/platform/instantiation/common/*`, but DNOTE does not vendor the full VS
Code workbench, editor, platform, or extension host.

## Five Layers

```text
User
  |
  v
1. Workbench / UI
  |
  v
2. Core
  |
  v
3. Extension Host
  |
  v
4. Platform
  |
  v
5. OS
```

## 1. Workbench / UI

Responsibility: render and collect user intent.

Current examples:

- `CORE/App.tsx`
- `CORE/LayoutEngine.tsx`
- `CORE/AreaShell.tsx`
- `CORE/LeftActivityBar.tsx`
- `CORE/RightSidebar.tsx`
- `CORE/SettingsModal.tsx`
- Plugin view components such as `APP/editor/Editor.tsx`

Workbench code should not decide how OS files, terminals, or script runtimes are
implemented. It should send intent to Core or Extension Host services.

## 2. Core

Responsibility: scheduling, registries, state, and event flow.

Current examples:

- `CORE/Blood.ts`
- `CORE/BloodChannels.ts`
- `CORE/ComponentRegistry.ts`
- `CORE/ActionRegistry.ts`
- `CORE/instantiation.ts`
- Core state/layout/workspace command services in `CORE/services.ts`

Core should not contain plugin business logic such as graph algorithms,
project-specific command behavior, or Python dependency policy.

## 3. Extension Host

Responsibility: load, inspect, and run built-in, side-loaded, and development
extensions.

Current implementation:

- `CORE/extensionHost.ts`
- Built-in first-party organs under `APP/`
- Side-loaded script extensions under `${userData}/extensions/`
- Development extension paths configured in `dnote.config.json`
- Example script extension under `extensions/env-check/`
- VS Code-style manifest concepts: `activationEvents` and
  `contributes.commands`

Current scope:

- Discover side-loaded script extensions.
- Add and remove App-external development extension paths.
- Read command contributions from extension manifests.
- Run contributed commands by mapping them to declared service scripts.
- Resolve and run extension service scripts through Platform.
- Sync extension paths into `system.agentWorkspace` for the command-line
  assistant.

Migration target:

- Load external renderer UI bundles.
- Apply extension trust and permission checks.
- Provide a stable `dnote.*` extension API rather than raw Electron IPC.

## 4. Platform

Responsibility: wrap OS and Electron capabilities behind stable services.

Current implementation:

- `CORE/platform.ts`
- Electron IPC handlers in `CORE/main.ts`
- Preload bridge in `CORE/preload.ts`

Platform owns:

- File access
- Process and script execution
- Terminal spawning
- Window and path operations
- Runtime and environment inspection
- Extension directory discovery

Extensions should go through Extension Host and Platform services rather than
calling scattered `window.electronAPI.*` methods directly.

## 5. OS

Responsibility: real macOS, shell, filesystem, process, and terminal work.

The OS layer is reached only through Electron main process and Node APIs.

## Current Direction

The first hard boundary now exists:

```text
Extension Lab UI
  -> IExtensionHostService
  -> IPlatformService
  -> electronAPI / Electron main
  -> macOS
```

This should become the pattern for future plugin and script work.

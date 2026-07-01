# Galois Architecture Layers

Galois follows the same architectural idea as VS Code: Electron is an
implementation detail, not the architecture itself.

The current codebase includes a simplified VS Code-style instantiation kernel in
`CORE/instantiation.ts`. It is inspired by VS Code's
`src/vs/platform/instantiation/common/*`, but Galois does not vendor the full VS
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

Responsibility: host first-party APP organs and route plugin-owned services.

Current implementation:

- `CORE/extensionHost.ts` is legacy infrastructure and should not define the
  primary development workflow.
- Built-in first-party organs live under `APP/` in the current source
  repository during source development, and in the external runtime workbench
  during packaged app execution.
- Plugin-owned service scripts live under `APP/[plugin]/services/`.
- `plugin.json` declares interpreter and package needs for APP services.
- VS Code-style manifest concepts may inspire future APIs, but current renderer
  registration still comes from root `index.tsx` importing `APP/*/index.ts`.

Current scope:

- Register APP organs at startup.
- Resolve and run APP service scripts through Platform.
- Keep plugin business logic inside APP organs rather than CORE.
- Sync the external runtime workbench into `system.agentWorkspace` for the
  packaged app command-line assistant.

Migration target:

- Provide a stable `galois.*` plugin API rather than raw Electron IPC.
- Add trust and permission checks for plugin-owned services.

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
Extension development UI / command surface
  -> IExtensionHostService
  -> IPlatformService
  -> electronAPI / Electron main
  -> macOS
```

This should become the pattern for future plugin and script work.

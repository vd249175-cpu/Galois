# Complete APP Plugin Walkthrough

## Contents

1. Generate the reference organ
2. Understand the generated files
3. Adapt it safely
4. Acceptance matrix
5. Frequent failure modes

## 1. Generate the reference organ

Run from the active Galois source repository or external workbench:

```bash
npm run scaffold:plugin -- project-inspector \
  --display-name "项目检查器" --short-name "检查"
```

The command refuses to overwrite an existing `APP/[plugin]` directory. It
creates a complete organ that is discovered automatically by `index.tsx`:

```text
APP/project-inspector/
├── index.ts
├── ProjectInspectorView.tsx
├── actions/
│   ├── RefreshAction.ts
│   └── index.ts
├── services/project_summary.py
├── plugin.json
└── README.md
```

Use `--dry-run` to inspect target paths without writing.

## 2. Understand the generated files

- `index.ts` is the renderer discovery entry. It exports an object with
  `typeId` and `component`; no central registration edit is required.
- `ProjectInspectorView.tsx` contains the component contract, Blood reads,
  action handling, latest-request guard, error signal, and manifest.
- `actions/RefreshAction.ts` declares a right-toolbar action. The registry turns
  clicks into timestamp signals; the view consumes `lastAction`.
- `services/project_summary.py` is plugin-owned. The view resolves it with
  `getServiceScriptPath` and invokes it with `runScript`.
- `plugin.json` declares interpreter and service ownership. It is not the
  renderer registration entry.

## 3. Adapt it safely

Keep these boundaries while replacing the demo calculation:

1. Read/write only declared `system.*`, `layout.*`, `actions.*`, or `events.*`
   Blood channels. Add a missing shared channel to `CORE/BloodChannels.ts`.
2. Keep business state and service lifecycle in the plugin, not in CORE.
3. Keep project scripts out of `APP`; plugin service scripts must not borrow the
   notebook project's `.venv`.
4. Keep action ids stable as `[typeId].[action]` and action values as timestamp
   signals.
5. Check `.dnote_runtime.json.shortcutRegistry` before adding a shortcut. A
   reference/demo action should normally have no default shortcut.
6. Guard async service results so an older request cannot overwrite newer UI.

## 4. Acceptance matrix

| Surface | Required check |
| --- | --- |
| Discovery | New type appears without editing root `index.tsx` |
| Blood | `bloodChannels`, manifest reads/writes, and actual calls agree |
| Toolbar | Repeated clicks trigger repeated timestamp actions |
| Service | Valid JSON, stderr, missing runtime, and stale response are handled |
| Project switch | Old project result cannot overwrite the new project |
| HMR | Existing renderer session updates without `location.reload()` |
| Build | `npx tsc --noEmit` and `npm run build` pass |
| Packaged workbench | Use `npm run sync:workbench`; target-only plugins survive |

## 5. Frequent failure modes

- Creating a component but forgetting to export its registration object.
- Adding a toolbar icon without adding the action to the component actions.
- Treating `plugin.json` as renderer registration.
- Hardcoding a new Blood namespace or using booleans for action signals.
- Calling another plugin's private function instead of a Blood/platform boundary.
- Running a service with `execCommand` or the selected project's `.venv`.
- Adding a default shortcut without consulting the runtime registry.
- Testing only the happy-path final response and missing streaming/stale results.

---
name: dnote-graph-view
description: "Use for Galois APP/graph-view tag topology work: lattice.py, tag grid/topology graph rendering, virtual-tag merging, node-count/granularity sliders, graph/search linking, and graph service script dependencies."
---

# Galois Graph View

Use this skill for `APP/graph-view` only. This graph is the tag grid/topology
view, not a backlink graph.

## Mode Boundary

- **Source Development Mode**: edit `APP/graph-view` in the current source repo.
- **Build Mode**: edit `APP/graph-view` in
  `~/Documents/Galois/workbench/Galois-vscode-core/`.
- **Assist Mode**: do not change graph code; use note tags and search skills
  unless the user explicitly asks to change graph behavior.

## Current Architecture

The renderer reads project tags from Blood and calls a plugin-owned Python
service:

```typescript
const scriptPath = await electronAPI.getServiceScriptPath('graph-view', 'lattice.py');
const result = await electronAPI.runScript(scriptPath, JSON.stringify(payload), projectPath);
```

`getServiceScriptPath(pluginFolder, scriptName)` resolves
`APP/[pluginFolder]/services/[scriptName]`, checking the external workbench first
in packaged mode and then the classic seed.

`runScript(scriptPath, stdin, cwd, envExtra?)` runs the script with:

- `scriptPath`: absolute service script path.
- `stdin`: JSON payload string.
- `cwd`: usually the selected notebook project path.
- `envExtra`: optional explicit environment additions.

## Algorithm Intent

- Entity tags are never removed by the node-count slider.
- The node-count/granularity slider only controls virtual-tag merging and
  abstract-layer display.
- Granularity `0` is a hard boundary with no virtual nodes. Clear the visible
  virtual layer immediately and ignore stale async service results from older
  slider values.
- Repeated virtual tags that have no unique referents should merge, including
  repeated tag sets, not just single tag labels.
- The most abstract layer should show the fewest meaningful nodes, not many
  singleton virtual tags.
- Avoid dense NxN explosion; prefer support sets, bitmasks, equivalence classes,
  candidate caps, and transitive reduction.

## Dependency Rules

`lattice.py` is an APP plugin service script. Its Python dependencies must come
from `APP/graph-view/plugin.json` and/or PEP 723 inline metadata in the service
script. It must not depend on the selected notebook project's `.venv`.

If a graph service needs packages, declare them in `APP/graph-view/plugin.json`:

```json
{
  "id": "graphView",
  "interpreters": { "python": "uv run" },
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

Prefer standard library plus PEP 723 when possible. Do not require users to
manually install `numpy` for graph-view.

## Editor Navigation and Search Highlighting

File-tree search may drive graph highlighting through
`system.fileSearchQuery`, but the direction is one-way. Clicking a graph node
must never rewrite the file browser query.

- Single-click a real note node to write `events.openFile.{editorId}` and open
  its backing Markdown in the last-focused editor.
- Select a virtual concept only inside the graph. It has no backing file; show
  its supporting real notes and let those links open the editor. Never invent a
  `#tag.md` path for a virtual concept.
- Click graph canvas whitespace to clear the selected/hovered graph focus and
  close its detail drawer. Do not clear an independently entered file search.

## Implementation Checklist

- Keep graph-specific code inside `APP/graph-view`.
- Keep CORE free of graph business logic.
- Keep service execution on `electronAPI.runScript`.
- Use Blood channels declared in `CORE/BloodChannels.ts`.
- Verify a real-node click changes the editor and leaves the file browser query
  unchanged; verify virtual support links open real notes.
- Verify a whitespace click clears graph selection without treating a drag as
  a click.
- Validate large graphs for candidate caps and non-explosive runtime before
  changing abstraction or merge heuristics.

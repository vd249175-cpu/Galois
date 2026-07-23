# Galois Agent Capability Overview

This is the first navigation document for an agent implementing or validating
Galois work. It maps current capabilities to their source owner, detailed
reference, executable example, and acceptance path.

`docs/CURRENT_ARCHITECTURE_AND_RELEASE.md` remains the factual authority. If
this overview, a skill, a historical README, and source disagree, inspect source
and update this overview in the same change.

## 1. Choose the working layer

| User goal | Mode and owner | Do not write into |
| --- | --- | --- |
| Write/edit/tag/search a note | Assist Mode; selected notebook project | APP, CORE |
| Add commands, reactive values, lifecycle hooks | Assist Mode; `command/`, `script/`, `.dnote/` | APP plugin services |
| Add a page, panel, toolbar action, shortcut | Source/Build Mode; `APP/[plugin]/` | Notebook project |
| Add shared file/process/window/config IPC | Source/Build Mode; CORE | Plugin-specific CORE watcher/state |
| Theme, layout, shortcuts settings | Source/Build Mode; Settings/config owners | Notebook project |
| DMG/package/release | Release workflow only when explicitly requested | Normal feature workflow |

Source Development Mode edits the current source repository. Packaged Build
Mode edits `~/Documents/Galois/workbench/Galois-vscode-core/`. Never edit the
installed `.app` bundle.

## 2. Current capability map

### Application platform

- Electron + Vite + React renderer with HMR.
- Blood state/event bus using only `system.*`, `layout.*`, `actions.*`, and
  `events.*` namespaces.
- `ComponentRegistry` auto-discovers `APP/*/index.ts` and registers actions.
- `ActionRegistry` publishes timestamp action signals and owns shortcuts.
- External editable packaged workbench with Git rollback checkpoints and
  target-only user-plugin preservation.
- Shared file, script, project-script, terminal, configuration, layout, window,
  and media bridges exposed through preload.

### Built-in organs

| Organ | Current responsibility | Detailed material |
| --- | --- | --- |
| Editor | Live Preview, Reading mode, Markdown editing/rendering, commands, tags, media, reactive JSON | `APP/editor/README.md`, `dnote-command-scripts` |
| File Tree | Files, search, tag resolution, icons, project state | `APP/file-tree/README.md`, `dnote-search`, `dnote-tags` |
| Graph View | Tag topology, deep descendant focus paths, temporary editable concept notes, file-search highlighting, editor navigation | `APP/graph-view/README.md`, `dnote-graph-view` |
| Video Timeline | Timeline assets and clip references | `APP/video-timeline/`, architecture media contract |
| Terminal | Embedded PTY and native assistant launch | `APP/terminal/README.md` |
| Settings | Themes, shortcuts, environment and configuration | `APP/settings/README.md`, `dnote-configs` |

### Notebook Markdown

Current renderer capabilities include headings, emphasis, inline/fenced code,
lists, nested tasks, editable tables, table checkboxes, block/inline KaTeX,
WikiLinks, Markdown links, images, audio, full video, timeline clips, Mermaid,
safe `<kbd>`/styled-span HTML, and reactive/generated Markdown.

Generated Markdown is not a static HTML preview. Where applicable it must share
ordinary-note editing, checkbox write-back, table editing, navigation, slash
commands, media resolution, and save-back into the source JSON value.

Read:

- `.agents/skills/dnote-command-scripts/references/markdown-rendering-contract.md`
- `template-project/08_完整Markdown与程序生成验收.md`
- `template-project/script/render_showcase.py`

### Notebook automation

- `command/commands.json` `script` entries: background actions, hidden from `/`.
- `command/commands.json` `content` entries: editor/slash insertions.
- Reactive expressions: project JSON plus optional `run`, `interval`, and
  isolation options.
- Lifecycle hooks: `on_project_open`, `on_project_run`, `on_project_close`.
- Dynamic `run:` tags: project scripts whose authoritative result is a JSON tag
  array on stdout.
- Project dependency ownership through `.venv`, `.dnote`, `pyproject.toml`,
  `uv.lock`, or PEP 723.

## 3. What to read next

| Task signal | Required skill/reference |
| --- | --- |
| Complete project, full feature, no omissions | `dnote-complete-project` then its acceptance matrix |
| New APP plugin/page/action/service | `dnote-app-plugins` + `complete-plugin-walkthrough.md` |
| Current note/file/cursor/selection | `dnote-runtime`, then one `dnote-project-overview` |
| Commands/reactive/lifecycle/dependencies | `dnote-command-scripts` |
| Frontmatter/body/regex/script tags | `dnote-tags` |
| Search expression or file filtering | `dnote-search` |
| Graph topology or virtual concepts | `dnote-graph-view` |
| Theme/shortcut/layout/config | `dnote-configs` |

For a complex request, first create the matrix from
`.agents/skills/dnote-complete-project/references/end-to-end-acceptance.md`.

## 4. Write and accept a note

Before writing:

1. Read `{projectPath}/.dnote_runtime.json`.
2. Run the bounded project overview once.
3. Create every discoverable note directly as `{projectPath}/name.md`. The
   current file tree, tag resolver, and graph scan only root-level Markdown;
   Markdown placed in a subdirectory does not become a notebook note.
4. Preserve the existing project layout, commands, scripts, tags, and media.
5. Use Frontmatter for manual tags and body `#hashtags` for derived tags; do not
   copy one source into the other.

Acceptance:

- Open the note in Live Preview and Reading mode.
- Confirm the note is a direct child of `projectPath` and appears in the file
  tree, tag resolution, and graph when tagged.
- Edit ordinary text, nested tasks, and table cells; reload and confirm disk
  persistence.
- Toggle ordinary, nested, and table checkboxes.
- Exercise WikiLink/file/external navigation.
- Confirm referenced image/audio/video/timeline files actually exist.
- Check math, Mermaid failure containment, and safe inline HTML.
- If content is generated, edit it and confirm its JSON key changes; confirm
  interval output pauses until manual rerun.
- Confirm tags appear from the correct source and closing a manual tag does not
  rewrite body prose.

Canonical acceptance note:
`template-project/08_完整Markdown与程序生成验收.md`.

## 5. Write and accept an APP plugin

Start from a real compiling organ:

```bash
npm run scaffold:plugin -- project-inspector \
  --display-name "项目检查器" --short-name "检查"
```

Then replace the example calculation while preserving registration, action,
Blood, service, error, and stale-response boundaries.

Acceptance:

- `index.ts` exports the object discovered by the APP scanner.
- Manifest reads/writes match subscriptions and actual calls.
- Toolbar actions work repeatedly; signals are timestamps.
- Check `shortcutRegistry` before assigning any default shortcut.
- Service scripts resolve with `getServiceScriptPath` and run with `runScript`.
- Missing runtime, stderr, invalid JSON, empty data, rapid clicks, and project
  switching have defined behavior.
- Existing components update through HMR without renderer reload.
- Typecheck and production build pass.

Detailed reference:
`.agents/skills/dnote-app-plugins/references/complete-plugin-walkthrough.md`.

## 6. Write and accept a notebook script

Choose the correct contract first:

| Script kind | Input/context | Required output |
| --- | --- | --- |
| Background command | `DNOTE_PROJECT_PATH`, active file/cursor/selection | JSON at `DNOTE_OUTPUT_FILE` |
| Reactive producer | note/thread/output context | Valid JSON at `DNOTE_OUTPUT_FILE` |
| Dynamic tag | note path + resolved-tag map | JSON tag array on stdout |
| Lifecycle hook | project/thread/output context | Fast/idempotent JSON; daemon shutdown contract when needed |
| APP plugin service | stdin + explicit env | JSON stdout through `runScript` |

Acceptance:

- Run the script directly with a temporary output path and representative env.
- Validate stdout/stderr and parse the output JSON, not only process exit code.
- Test empty input, missing env, invalid source data, Unicode, and large output.
- Confirm a background command stays out of `/`; confirm a `content` command is
  visible in an already-open slash menu.
- Confirm new action ids/scopes/bindings in `.dnote_runtime.json.shortcutRegistry`.
- For reactive Markdown, run the entire note acceptance checklist.
- For long-running hooks, test repeated open/run and graceful close markers.

## 7. Standard validation and evidence

Run from the active Galois root:

```bash
npm run validate:examples
npm run validate:interactions
npx tsc --noEmit
npm run build
```

Use `npm run rebuild:reopen` only for CORE/preload/IPC/kernel changes. Use
`npm run package:mac` only when the user explicitly asks for packaging or DMG.

When a validated separate source checkout must replace the packaged workbench:

```bash
npm run sync:workbench
```

Stream and poll build, package, script-probe, and real-model commands until they
exit. Handoff evidence should name the probes, exit status, source commit,
external-workbench rollback commit, and conditional behavior still requiring
manual verification.

## 8. Conditional capabilities

- Mermaid currently loads from a CDN and needs network access.
- Video container recognition does not imply Chromium codec support; local
  media may expose the original-format mpv fallback.
- Timeline clips and full Markdown video use different storage/path contracts.
- Raw HTML is not generally enabled; only the explicit safe subset is rendered.
- A screenshot proves appearance, not write-back, persistence, navigation, or
  stale-result safety.

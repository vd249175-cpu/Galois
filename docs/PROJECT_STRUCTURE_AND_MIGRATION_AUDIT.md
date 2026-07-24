# Current Project Structure and Migration Audit

This document is the source-tree map and migration audit for the current
Galois source repository. It complements `CURRENT_ARCHITECTURE_AND_RELEASE.md`:
that document describes the runtime/release baseline; this document describes
where responsibilities live after the large-file migration and how to audit a
future extraction without losing behavior.

## Runtime Boundaries

```text
index.tsx
  -> APP/*/index.ts plugin registration
  -> CORE/App.tsx workbench, layout and focus routing
  -> APP/<organ> UI and business lifecycle
  -> Blood channels + typed Electron preload bridge
  -> CORE/main.ts / platform services / macOS
```

- `CORE/` is the generic shell: Electron, IPC, layout, Blood, action routing,
  configuration and workbench composition.
- `APP/` contains first-party organs. An organ owns its UI, actions, scripts,
  state lifecycle and domain behavior. Organs communicate through Blood; they
  do not call each other's business logic directly.
- `template-project/` is the first-run notebook seed. It is not an app plugin.
- `scripts/` contains build, external-workbench sync and packaging support.
- `docs/` is the authoritative operational documentation. For architectural or
  release contradictions, `CURRENT_ARCHITECTURE_AND_RELEASE.md` wins.

## APP Organ Map

| Organ | Primary responsibility | Main entry points |
| --- | --- | --- |
| `APP/editor/` | Markdown editing, Reading/Live views, tags, inline media, slash commands, editor actions | `index.ts`, `EditorCanvas.tsx`, `MarkdownPreview.tsx` |
| `APP/file-tree/` | project/file navigation and project lifecycle | `index.ts`, `FileTreeCanvas.tsx` |
| `APP/video-timeline/` | non-destructive timeline assets, playback, clips and thumbnail UI | `index.ts`, `VideoTimelineCanvas.tsx` |
| `APP/graph-view/` | tag topology graph and related controls | `index.ts`, `GraphViewCanvas.tsx` |
| `APP/terminal/` | embedded terminal and external assistant launch surface | `index.ts`, `Terminal.tsx` |
| `APP/settings/` | user-facing configuration | `index.ts`, `Settings.tsx` |

## Editor Ownership After Migration

`EditorCanvas.tsx` is intentionally a small composition controller. It owns
the editor instance's React state and connects these units; it must not regain
rendering or independent business lifecycles.

| Concern | Owner |
| --- | --- |
| top-level editor UI, modals and preview/editor hand-off | `EditorSurface.tsx` |
| saved UI state, prompts, shortcuts and custom commands | `useEditorUiState.ts` |
| Slash command list, filtering and recency | `useSlashCommands.tsx` |
| slash/project command execution and editor formatting | `useEditorCommands.ts` |
| keyboard editing, undo/redo and smart Enter/Tab | `useEditorKeyboard.ts` |
| file read/draft load, external-sync cursor restore and tag resolution | `useEditorFileLoader.ts`, `useEditorCursorRestore.ts`, `useEditorTagResolution.ts` |
| save lifecycle, active editor registration, focused editor, shortcut capture and action dispatch | `useEditorLifecycle.ts` |
| audio recording and Markdown insertion | `useAudioRecording.ts` |
| media/paste content insertion and file actions | `useEditorContentActions.ts`, `useEditorFileActions.ts` |
| tag mutations, cursor state and shortcut action list | `useEditorTags.ts`, `useEditorCursorState.ts`, `useEditorShortcutActions.ts` |
| Reading/Live mode persistence and preview drop routing | `useEditorSurfaceControls.ts` |

## Markdown Preview Ownership After Migration

`MarkdownPreview.tsx` is a contract adapter only: it receives the existing
editor props, creates the editing lifecycle and passes the stable contract to
the rendering surface.

| Concern | Owner |
| --- | --- |
| Reading-mode state, editable block textarea, IME, smart Enter/Tab/Backspace, table-cell editing, task toggles, preview slash command state and reading scroll | `useMarkdownPreviewEditing.tsx` |
| Markdown block dispatch, code/math/table/text components, media block drag/delete, reading buffer rows and SlashMenu presentation | `MarkdownPreviewSurface.tsx` |
| parsing, inline media/math/link rendering and focused specialized blocks | `markdownBlockParser.ts`, `markdownInlineRenderer.tsx`, `MarkdownCodeMathBlock.tsx`, `MarkdownTableBlock.tsx`, `MarkdownTextBlock.tsx` |

## Last Unified-File Audit

The audit baseline is deliberately the last Git revision before each final
controller split, rather than an earlier historical version:

| Area | Last unified baseline | Current split commit | Result |
| --- | --- | --- | --- |
| editor controller | `adaf9b1` | `8f85e5e` | responsibilities moved to the files listed above |
| Markdown preview controller | `8f85e5e` | `4b4416a` | editing behavior and rendering surface separated |

The following behavior sentinels were checked against those baseline blobs and
the current `APP/editor` source. All are still present: editor mode and shortcut
storage, custom commands, global editor actions, project/script commands,
audio recording, inline-tag normalization, external-file sync, runtime sync,
media drop/link navigation, focused-editor Blood keys, slash-command recency,
nested task checkboxes, smart Enter/Tab, clip/block drag payloads, reading-scroll
persistence, image paste, table mutations, code/math/table/text block rendering,
inline renderer, IME protection and preview slash state.

This is a structural and static-equivalence audit. It does not replace manual
interaction testing of browser/media decoding or OS permission dialogs; those
depend on the local Electron runtime and real files.

## Required Verification After Any Future Extraction

1. Identify the exact pre-extraction commit and record it in the pull request
   or commit message.
2. Map every state owner, effect, callback, action id, local-storage key,
   Blood key and external bridge call to one destination file.
3. Confirm the source controller has only composition responsibilities after
   the move; avoid changing behavior while moving code.
4. Run `npx tsc --noEmit`, `git diff --check`, and `npm run build`.
5. When the external runtime workbench is the target, run
   `npm run sync:workbench`; it must preserve target-only user plugins.
6. Verify source and external workbench managed `APP/` and `CORE/` files match
   before asking for UI validation.

## File-Size Boundary

The practical boundary is approximately 400 lines. Files around that size may
remain cohesive when they own one focused concern. Files substantially above
that boundary must be split by lifecycle/renderer/service responsibility, not
by arbitrary line ranges. At the time of this audit there are no TypeScript or
TSX files above 500 lines in `APP/` or `CORE/`.

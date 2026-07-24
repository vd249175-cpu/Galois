---
name: dnote-complete-project
description: "Use for complete or end-to-end Galois projects and complex multi-file capabilities that cross APP plugins, Blood/actions, service scripts, notebook commands, generated Markdown, tags, media, or acceptance testing. Trigger when the user asks for a complete project, full feature, comprehensive demo, production-ready implementation, migration without omissions, or a capability whose UI, script, persistence, and rendered interactions must work together."
---

# Galois Complete Project Workflow

Use this skill as the coordinator. Keep detailed domain rules in their owning
skills instead of duplicating them here.

## Required references

Read `references/end-to-end-acceptance.md` before editing. Then route each slice:

- APP organ, page, action, shortcut, or plugin service: use
  `dnote-app-plugins` and read
  `../dnote-app-plugins/references/complete-plugin-walkthrough.md`.
- Notebook command, lifecycle script, or reactive expression: use
  `dnote-command-scripts` and read
  `../dnote-command-scripts/references/markdown-rendering-contract.md` when
  Markdown is produced.
- Frontmatter, body hashtags, `re:`, or `run:` tags: use `dnote-tags`.
- Current note project context: use `dnote-runtime`, followed once by
  `dnote-project-overview` in Assist Mode.
- Search, graph, or configuration behavior: use the corresponding domain skill.

Always read `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md`, followed by
`docs/AGENT_CAPABILITY_OVERVIEW.md`. Source code wins over an example if the
example has become stale; update the overview/example in the same change.

## Workflow

1. **Define the vertical slices.** Write a capability matrix containing entry
   point, UI, action, state channel, persistence, script/runtime, error state,
   and acceptance evidence. Do this before implementation.
2. **Choose ownership.** Put generic bridges in CORE, business behavior in its
   APP organ, and notebook-specific automation in the notebook project.
3. **Start from executable references.** Scaffold a new organ with
   `dnote-app-plugins/scripts/scaffold_plugin.py`. Use
   `template-project/08_完整Markdown与程序生成验收.md` for Markdown
   parity instead of inventing syntax from memory.
4. **Complete one owned file/module at a time.** Do not stop after each small
   feature. Finish a coherent vertical slice, including error and stale-result
   behavior, before moving to the next slice.
5. **Test interactions, not screenshots alone.** Verify write-back, navigation,
   repeated actions, project/file switching, missing files, and generated
   Markdown parity.
6. **Audit against the matrix.** Mark a row complete only when its evidence
   exists. Run the deterministic example validator, typecheck, and build.
7. **Synchronize safely.** From a separate source checkout use
   `npm run sync:workbench`; never overwrite target-only user plugins.

## Validation commands

```bash
npm run validate:examples
npx tsc --noEmit
npm run build
```

Stream and poll long-running build, package, script-probe, and real-model output
until the process exits. Do not infer success from the final UI alone.

## Definition of done

A complete project is not done merely because it compiles. It is done when:

- Every matrix row has implementation and runtime evidence.
- Source Markdown and program-generated Markdown share required interactions.
- Actions are registered, discoverable in the shortcut registry, repeatable,
  and scoped correctly.
- Async work rejects stale results after file, project, or slider changes.
- User-owned plugins and notebook files are preserved.
- Skills, canonical examples, architecture docs, and source describe the same
  current behavior.

# End-to-End Acceptance Matrix

## Contents

1. Plan before editing
2. APP plugin slice
3. Notebook project slice
4. Markdown/rendering slice
5. State and concurrency slice
6. Evidence and handoff

## 1. Plan before editing

Create a task-local table with one row per user-visible capability:

| Capability | Entry | Owner | State/data | Persistence | Failure state | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Example refresh | toolbar action | APP organ | Blood + service JSON | none | visible error + event | repeated-click probe |

Do not collapse several independent behaviors into “UI works.” A complex page
usually needs separate rows for registration, action dispatch, script execution,
rendering, editing, persistence, navigation, and recovery.

## 2. APP plugin slice

Minimum complete slice:

- `APP/[plugin]/index.ts` exports the registration object.
- The registration object declares stable `typeId`, component, actions,
  subscriptions, and accurate manifest.
- Toolbar actions are owned by the component and consumed through `lastAction`.
- Default shortcuts are omitted unless requested and checked against
  `.dnote_runtime.json.shortcutRegistry`.
- Plugin service paths resolve through `getServiceScriptPath`; execution uses
  `runScript` and the plugin's interpreter metadata.
- Loading, empty, error, repeated action, stale response, and project switch
  states are represented.
- No plugin business watcher or state is moved into CORE merely for convenience.

Use the generated reference organ as runnable structure, not as prose:

```bash
npm run scaffold:plugin -- capability-name --dry-run
```

## 3. Notebook project slice

Minimum complete slice:

- Read `.dnote_runtime.json`, then obtain one bounded project overview.
- Preserve existing `commands.json`; add unique project-scoped ids.
- Distinguish `script` background commands from `content` slash insertions.
- Use `runProjectScript` and write valid JSON to `DNOTE_OUTPUT_FILE`.
- Keep lifecycle hooks idempotent and give long-running work a shutdown path.
- Declare dependencies through the project environment, not an APP plugin.
- Confirm new actions appear in `shortcutRegistry` and new content commands in
  an already-open slash menu without inserting a stray `/`.

## 4. Markdown/rendering slice

Use the canonical note and producer:

```text
template-project/08_完整Markdown与程序生成验收.md
template-project/script/render_showcase.py
```

Required parity checks when a program emits Markdown:

- Headings, lists, nested tasks, tables, code, math, Mermaid, WikiLinks, media,
  and safe inline HTML render through the shared path where applicable.
- Ordinary tasks, nested tasks, and table tasks can be toggled and persist.
- Table cells and generated blocks can be edited and saved to their true source.
- Full-video paths resolve from the project root; timeline clips resolve from
  `.dnote_assets/videos/` and are not silently converted.
- Manual Frontmatter tags remain distinct from body hashtags.

## 5. State and concurrency slice

Explicitly test:

- Two rapid action clicks.
- Moving a slider away and back before the first result returns.
- Switching files/projects during a script call.
- External file modification while local edits exist.
- HMR replacement of an existing component.
- Empty, very long, invalid JSON, missing media, missing runtime, and stderr.

Use request generations, cleanup flags, or equivalent cancellation semantics.
Never let an older async result overwrite newer coordinates.

## 6. Evidence and handoff

Collect concise evidence:

- Deterministic scripts/probes and their exit status.
- `npx tsc --noEmit` and `npm run build` completion.
- Real-model or external script logs monitored while streaming when used.
- Source commit and external-workbench rollback commit.
- Remaining conditional behavior, such as CDN or codec requirements.

Do not report a screenshot-only check as proof of editing, persistence, or
concurrency behavior.

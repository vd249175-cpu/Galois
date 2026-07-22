---
name: dnote-command-scripts
description: "Use for Galois notebook project capabilities: commands.json, slash content commands, background script commands, reactive expressions, lifecycle hooks, project-level Python/uv dependencies, and script environment variables."
---

# Galois Notebook Project Commands and Scripts

This guide covers notebook project scripts. These are different from
application dependencies and plugin service scripts.

Read `docs/CURRENT_ARCHITECTURE_AND_RELEASE.md` before changing script
execution behavior.
For APP page/button/shortcut development, also read
`docs/APP_DEVELOPMENT_SCENARIOS.md`.

When a script emits Markdown, when building a complete notebook demo, or when
renderer parity matters, read `references/markdown-rendering-contract.md` and
use `template-project/08_完整Markdown与程序生成验收.md` plus
`template-project/script/render_showcase.py` as the executable baseline.

## 0. Mode Routing

Most Galois users are in **Assist Mode** inside a notebook project. This skill
belongs to Assist Mode because it changes project-owned notes, commands,
scripts, lifecycle hooks, and dependencies rather than Galois APP/CORE code.

Treat the session as Assist Mode when the assistant starts under
`~/Documents/` and the current directory or one of its parents has notebook
project markers such as `.dnote_runtime.json`, `command/commands.json`,
`.dnote/`, `script/`, `media/`, or Markdown note files.

Use this skill in **Assist Mode** when the user wants help writing or inserting
note content that uses existing command/script syntax:

- Explain or insert a slash `content` command.
- Write a reactive expression into the current note.
- Explain why a project command failed.
- Use `.dnote_runtime.json` to locate the active file and selection before
  editing note content.

Use this skill in **Assist Mode / notebook project scripting** when the user
wants to create or change reusable project behavior:

- Add or edit `{projectPath}/command/commands.json`.
- Add or edit scripts under `{projectPath}/script/`.
- Add lifecycle hooks `on_project_open.py`, `on_project_run.py`,
  `on_project_close.py`.
- Add `pyproject.toml`, `uv.lock`, PEP 723 metadata, or `.dnote/config.json` for
  project-owned dependencies.

Do not use this skill for APP pages, right sidebar buttons, renderer shortcuts,
themes, Settings UI, plugin manifests, or plugin-owned services. Those belong
to Build Mode or Source Development Mode with `dnote-app-plugins` and
`dnote-configs`.

## 1. Ownership

Use this skill only for notebook project commands, scripts, dynamic tags,
reactive expressions, lifecycle hooks, and slash menu content snippets. If the
user asks for APP plugins, renderer pages, toolbar buttons, shortcuts, plugin
manifests, or plugin-owned services, use the APP/plugin workflow instead.

Notebook project scripts belong to the selected notebook project. They live
inside that project, usually under:

```text
command/commands.json
script/
.dnote/config.json
pyproject.toml
uv.lock
.venv/
```

The application layer is packaged by Electron and should not require end users
to manage Node dependencies. Plugin service scripts belong to their plugin. A
notebook project's lifecycle hooks and commands own their own dependencies.

Do not place APP plugin code in a notebook project. APP plugin work belongs to
the current source repository in Source Development Mode, or to the full
external workbench in Build Mode:

```text
~/Documents/Galois/workbench/Galois-vscode-core/APP/[plugin]/
```

## 2. commands.json

Notebook commands are declared in `command/commands.json`.

Naming rules:

- Notebook command ids should be project-scoped, for example
  `project.noteStats` or `custom.insertStatus`.
- Do not reuse APP action ids such as `editor.save` or `graphView.recenter` for
  notebook project commands.
- Commands with `script` are automation actions; commands with `content` are
  editor insertion snippets.

```json
{
  "commands": [
    {
      "id": "project.runStats",
      "label": "统计项目字数",
      "shortcut": "meta+shift+t",
      "scope": "editor",
      "script": "uv run script/note_stats.py"
    },
    {
      "id": "project.sysMonitorWidget",
      "label": "插入系统实时监控小部件",
      "content": "系统状态：{{script/sys_monitor.json:status | run=\"sys_monitor.py\" & interval=3}}"
    }
  ]
}
```

Commands with `script` are background commands. They should not insert text into
the note. They run silently, write JSON to `.dnote_cache/{command_id}.json`, and
broadcast `events.commandExecuted.{command_id}`.

Commands with `content` are insertion commands. They appear in the editor slash
menu and insert text or reactive expressions at the cursor. The same slash
command execution path is used by Live Preview and Reading mode block editors,
so new insertion commands should be written once and tested in both modes.

The editor reloads `{projectPath}/command/commands.json` after an app save event,
on window focus, and through a lightweight one-second APP-level check so files
written by an external agent become available without restarting Galois. A
partially written or temporarily invalid JSON document keeps the last valid
command set until the next successful read. After adding a command, confirm it
appears in `.dnote_runtime.json.shortcutRegistry` and, for `content` commands, in
the already-open `/` menu; do not insert a literal `/` into the note as a test
artifact.

For a reusable content demo, prefer the existing `project.renderShowcase`
command in `template-project/command/commands.json`. It inserts a reactive
Markdown block without consuming a default shortcut.

## 3. Scope Rules

`scope` controls where a shortcut can run:

```text
global / all / true  => any focused panel or no focused panel
editor               => editor panels only
fileTree             => file tree panels only
graphView            => graph view panels only
```

If `scope` is omitted, script commands default to global and content commands
default to editor.

Before assigning `shortcut`, read `.dnote_runtime.json.shortcutRegistry.actions`.
It is the authoritative runtime list of registered APP actions and dynamic
project commands, including unbound actions and user overrides. A global action
conflicts with every scope; actions in the same `sourceType` conflict with one
another. Do not infer availability from `commands.json` alone.

## 4. Environment Variables

Project command scripts receive editor and project context:

| Variable | Meaning |
| --- | --- |
| `DNOTE_PROJECT_PATH` | Absolute notebook project path |
| `DNOTE_ACTIVE_FILE` | Current focused note path |
| `DNOTE_OUTPUT_FILE` | JSON output file path |
| `DNOTE_CURSOR_LINE` | Cursor line, 0-indexed |
| `DNOTE_CURSOR_COL` | Cursor column, 0-indexed |
| `DNOTE_SELECTED_TEXT` | Current selection |
| `DNOTE_THREAD_ID` | Execution instance identifier |

Reactive expression scripts also receive:

| Variable | Meaning |
| --- | --- |
| `DNOTE_NOTE_PATH` | Note path containing the expression |
| `DNOTE_NOTE_LINE` | Expression line index |

Dynamic tag scripts receive:

| Variable | Meaning |
| --- | --- |
| `DNOTE_NOTE_PATH` | Note being resolved |
| `DNOTE_RESOLVED_TAGS` | JSON map of current resolved tags |

## 5. JSON Output Contract

Project scripts should write JSON to `DNOTE_OUTPUT_FILE`.

```python
import json
import os
import time

output_file = os.environ["DNOTE_OUTPUT_FILE"]

result = {
    "status": "success",
    "message": "计算完成",
    "data": {
        "file_count": 42
    },
    "timestamp": int(time.time())
}

os.makedirs(os.path.dirname(output_file), exist_ok=True)
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)
```

Dynamic tag scripts may also print JSON to stdout because the current
`tagResolver` reads stdout for tag lists.

## 6. Project Dependency Management

Notebook projects should be self-describing.

Supported project-level options:

- `.venv/` for a project-local Python interpreter.
- `.dnote/environment.json` for declaration-driven package repair.
- `.dnote/config.json` to override interpreters.
- `pyproject.toml` and `uv.lock` for project-managed Python dependencies.
- PEP 723 metadata inside individual Python scripts for single-file dependency
  declarations.

Package declarations are discovered from:

- `.dnote/environment.json`: `python.packages`, `packages.python`, or objects
  like `{ "name": "pandas>=2", "import": "pandas" }`.
- `pyproject.toml`: `[project] dependencies = [...]`.
- PEP 723 metadata in `script/*.py`.

`inspectProjectEnvironment(projectPath)` reports `usesUv`, `hasPyproject`,
`manifestPath`, `pyprojectPath`, and package install status.
`repairProjectEnvironment(projectPath)` runs `uv sync` when `pyproject.toml`
exists; otherwise it creates `.venv` and installs missing declared packages with
`uv pip install`.

Prefer `uv` for portable project scripts. A packaged DMG should guide users
through installing or configuring `uv`; project scripts should still fail
clearly when their runtime is missing.

Do not assume plugin service scripts and notebook project scripts share the same
environment. Plugin scripts are plugin-owned; notebook scripts are
project-owned.

## 7. Lifecycle Hooks

Lifecycle hooks live under the notebook project's `script/` directory:

```text
script/on_project_open.py
script/on_project_run.py
script/on_project_close.py
```

`on_project_open` runs when the project is opened. It should verify or bootstrap
project state and create needed cache directories.

`on_project_run` may run as a background process. It must write a PID file or
another shutdown signal if `on_project_close` needs to stop it.

`on_project_close` runs when the project is switched or the window closes. It
should cleanly stop background processes and write final project state.

Lifecycle hooks should use project-level dependency declarations. They should
not depend on application source directories or plugin service directories.

Lifecycle hooks receive `DNOTE_PROJECT_PATH`, `DNOTE_THREAD_ID`, and
`DNOTE_OUTPUT_FILE`. `on_project_run` must be idempotent enough to tolerate app
reloads, and long-running daemons should write a PID or shutdown marker that
`on_project_close` can consume.

## 8. Implementation Status

Project commands, reactive expression scripts, and dynamic tag scripts should
use `electronAPI.runProjectScript`. New work should keep project script
execution on that bridge so interpreter setup, environment construction,
stdout/stderr, and Blood event updates remain centralized.

Bridge signature:

```typescript
runProjectScript(projectPath: string, request: {
  command?: string;
  scriptName?: string;
  cwd?: string;
  stdin?: string;
  envExtra?: Record<string, string>;
  useUv?: boolean;
}): Promise<{ stdout: string; stderr: string }>
```

Parameter rules:

- `projectPath` must be the notebook project root and must be writable.
- `scriptName` runs inside `{projectPath}/script/` by default.
- `cwd` is optional but must stay inside `projectPath`.
- If `command` is omitted and `scriptName` is provided, CORE builds
  `uv run <scriptPath>` by default.
- Set `useUv: false` only for a script that should be executed directly.
- `stdin` is passed to the child process stdin.
- `envExtra` is merged after the secure base env and after
  `DNOTE_PROJECT_PATH`; use it for `DNOTE_ACTIVE_FILE`,
  `DNOTE_OUTPUT_FILE`, `DNOTE_CURSOR_LINE`, `DNOTE_CURSOR_COL`,
  `DNOTE_SELECTED_TEXT`, `DNOTE_THREAD_ID`, or note-specific values.

If a command needs broader shell behavior, declare it as a project-owned
`command` and treat it as trusted project automation. Do not use APP plugin
service scripts for notebook project automation.

Some non-script shell operations may still use `execCommand`, for example
opening a folder or running a media helper. Do not copy those patterns for
notebook project scripts.

## 9. Editor Mode Notes

Galois now exposes Live Preview and Reading as the two user-facing editor modes.
Source editing is kept as an internal fallback, not the primary UX.

When testing command insertion:

- Live Preview uses the CodeMirror-backed editor handle for cursor ranges.
- Reading mode uses the block editor's absolute Markdown range and passes the
  current draft text into the same command executor before replacing `/query`.
- Commands with `script` must stay hidden from `/` in both modes.
- Commands with `content` should work from `/` in both modes.

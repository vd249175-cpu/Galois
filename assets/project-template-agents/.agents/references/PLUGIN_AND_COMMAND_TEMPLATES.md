# Plugin and Command Templates

Use this file as the quick template reference before creating plugin or notebook
command files. `plugin.json` and `commands.json` belong to different layers.

## Which File To Use

- Use `plugin.json` for side-loaded APP extensions, plugin-owned services,
  plugin dependency declarations, and extension command declarations.
- Use `command/commands.json` for notebook project commands, slash menu content
  snippets, reactive expressions, and project-owned background scripts.
- Do not put notebook project scripts into `plugin.json`.
- Do not put extension services into `commands.json`.
- Side-loaded plugin services may read context and return JSON, but they should
  not directly replace the active editor selection until Galois exposes a formal
  extension editor patch API.

## plugin.json Template

Location:

```text
~/Documents/Galois/extensions/[extension-id]/plugin.json
```

Directory shape:

```text
~/Documents/Galois/extensions/[extension-id]/
├── plugin.json
└── services/
    └── [service].py
```

Minimal template:

```json
{
  "id": "env-check",
  "name": "Environment Check",
  "version": "0.1.0",
  "description": "Side-loaded script extension example.",
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
      "label": "Python dependency probe",
      "runtime": "python",
      "entry": "services/env_probe.py",
      "dependencies": ["numpy"]
    }
  ]
}
```

Service script notes:

- The service process receives `DNOTE_PROJECT_PATH`.
- The service `cwd` is the extension root.
- Use PEP 723 metadata or `plugin.json` package declarations for Python
  dependencies.
- Return JSON on stdout when possible.
- Contributed extension commands are refreshed at runtime, registered as global
  Galois actions, and can be bound from `~/Documents/Galois/config/shortcuts.json`
  after the command id exists.
- The Settings → Environment & Extensions panel lists discovered extension
  commands and can run them manually.

## commands.json Template

Location:

```text
[notebook-project]/command/commands.json
```

Directory shape:

```text
[notebook-project]/
├── command/
│   └── commands.json
└── script/
    └── [project-script].py
```

Minimal template:

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
      "id": "project.insertWidget",
      "label": "插入状态组件",
      "scope": "editor",
      "content": "状态：{{script/sys_monitor.json:status | run=\"sys_monitor.py\" & interval=3}}"
    }
  ]
}
```

Command rules:

- Commands with `script` are background automation commands. They should stay
  hidden from the slash menu and write JSON to `DNOTE_OUTPUT_FILE`.
- Commands with `content` are editor insertion commands. They appear in `/` and
  can insert text or reactive expressions at the cursor.
- Notebook command ids should be project-scoped, such as `project.runStats`.
- Do not reuse extension command ids such as `env-check.runProbe`.

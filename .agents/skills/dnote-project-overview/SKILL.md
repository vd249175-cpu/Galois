---
name: dnote-project-overview
description: "Use at the beginning of Galois Assist Mode, after reading .dnote_runtime.json, to inspect the opened notebook project without loading unbounded context. Produces a capped map of existing Markdown files, command definitions, script/config structure, dependencies, and media counts. Also use after the selected project changes or before creating files when the existing project layout is unknown."
---

# Galois Notebook Project Overview

Build a small project map before changing a notebook. Do not recursively paste
the project tree or read every Markdown file.

## Initialization

1. Read `{projectPath}/.dnote_runtime.json` with `dnote-runtime` first.
2. Run the bundled inspector once for the opened project:

```bash
python3 scripts/project_overview.py --runtime "{projectPath}/.dnote_runtime.json"
```

When invoking it from outside this skill directory, use the absolute path to
`scripts/project_overview.py`. A direct project path is also accepted:

```bash
python3 scripts/project_overview.py "{projectPath}"
```

3. Use the result to reuse existing note locations, script conventions,
command ids, media directories, and dependency files.
4. Read only the files needed for the user's task. The overview lists paths and
metadata; it intentionally does not load Markdown bodies or command content.

Keep the first overview in the task context. Do not run it again for every
message. Refresh it only when the project changes, the user asks for a refresh,
or the task materially changes the project structure.

## Context Budget

The inspector enforces hard limits even when larger flags are supplied:

- bounded filesystem visits and traversal depth;
- at most 80 Markdown paths and 120 structure entries by default;
- summarized command metadata without slash-command bodies;
- media counts without listing every asset;
- at most 10,000 output characters by default and 16,000 maximum.

If the result says it was truncated, do not compensate with an unbounded
recursive listing. Query the relevant directory or filename pattern narrowly.

## Safety

- Treat the reported project root as the Assist Mode write boundary.
- Do not modify `.dnote_runtime.json`, `.dnote_cache/`, `.git/`, `.venv/`, or
  generated caches while building context.
- Before creating a note or script, check the overview and then inspect the
  specific neighboring files needed to preserve local conventions.
- Do not infer that omitted paths do not exist when a section is marked
  truncated.

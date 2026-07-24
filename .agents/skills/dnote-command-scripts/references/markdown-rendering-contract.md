# Markdown Rendering Contract

## Contents

1. Canonical executable example
2. Source and generated Markdown parity
3. Supported syntax matrix
4. Tags and Frontmatter
5. Reactive expressions
6. Interaction acceptance
7. Unsupported or conditional behavior

## 1. Canonical executable example

Use `template-project/08_完整Markdown与程序生成验收.md` as the
canonical note and `template-project/script/render_showcase.py` as its generated
Markdown producer. Do not reconstruct a large rendering demo from memory.

The example is deliberately executable:

- It references media already present in `template-project/media/`.
- It invokes a standard-library-only project script.
- Its generated Markdown includes the interactions most often lost in partial
  renderer implementations.
- `template-project/command/commands.json` exposes it as a slash `content`
  command without claiming a shortcut.

## 2. Source and generated Markdown parity

A string read through a reactive expression is considered block Markdown only
when it contains a newline and at least one block marker such as a heading,
list, quote, fence, or table row. Once classified as Markdown it must use the
same `MarkdownPreview` path as an ordinary note.

Parity means more than visual HTML. Generated Markdown must preserve:

- Editable text blocks and table cells.
- Checkbox write-back, including nested tasks and table checkboxes.
- WikiLink and Markdown-link navigation.
- Slash command execution through the shared editor path.
- Media resolution from the notebook project root.
- Save-back into the source JSON key.

After a user edits generated Markdown, write the new string back to the JSON
file and pause interval-driven replacement. Resume script output only after an
explicit manual rerun.

## 3. Supported syntax matrix

| Capability | Canonical syntax | Runtime notes |
| --- | --- | --- |
| Headings | `#` through `######` | Block parser |
| Emphasis | `*`, `**`, `***` | Shared inline renderer |
| Inline code | `` `literal` `` | Protected before math/tags |
| Fenced code | triple backticks | Editable block; language label preserved |
| Mermaid | fenced `mermaid` | Uses CDN; failure must be contained |
| Inline math | `$...$`, `\(...\)` | KaTeX |
| Display math | `$$...$$`, `\[...\]` | KaTeX block |
| WikiLink | `[[Note]]`, `[[Note|Label]]` | Opens a note through Blood |
| File link | `[Label](Note.md)` | Opens a note |
| External link | `[Label](https://...)` | Opens externally |
| Image | `![alt](media/file.png)` | Notebook-root relative |
| Audio | `![audio](media/file.mp3)` | Native controls |
| Full video | `![video](media/file.mp4)` | Notebook-root relative |
| Timeline clip | `@video[label](file.mp4?t=1,4)` | Resolves under `.dnote_assets/videos/` |
| Task | `- [ ]`, `- [x]` | Writes back on toggle |
| Nested task | indented task | Must remain toggleable |
| Table | GFM pipe table | Cells, rows, columns are editable |
| Table task | `[ ]` in a cell | Writes back to that cell |
| Keyboard key | `<kbd>...</kbd>` | Safe inline HTML allowlist |
| Styled span | `<span style="...">...</span>` | Explicit inline allowlist only |
| Reactive value | `{{path.json:key}}` | Reads project `script/` JSON |
| Reactive runner | `{{out.json:key | run="job.py"}}` | Uses `runProjectScript` |

Do not enable unrestricted raw HTML to add a missing inline feature. Extend the
explicit safe allowlist and test ordinary notes, tables, and generated Markdown.

## 4. Tags and Frontmatter

Use YAML Frontmatter only at the beginning of the note:

```yaml
---
icon: 🧪
tags:
  - manual-tag
  - re:\[\[([^\]]+)\]\]
  - run:tag_calculator.py
---
```

Keep tag sources distinct:

- Frontmatter list items are manually managed tags.
- Body `#hashtags` are derived and must not be copied into Frontmatter.
- Hashtags inside fenced code, inline code, or escaped as `\#literal` are not
  body tags.
- `run:` tag scripts print a JSON tag array to stdout; they are not ordinary
  reactive-expression output scripts.

## 5. Reactive expressions

Canonical form:

```text
{{script/output.json:data.value | run="producer.py" & interval=5 & isolate=window}}
```

Rules:

- `script/` in the JSON path is accepted but normalized away; the file lives
  under `{projectPath}/script/`.
- `run` names a script inside `{projectPath}/script/`.
- `interval` is seconds and must be positive.
- `isolate=window` creates area-specific JSON; `isolate=execution` creates a
  temporary execution-specific JSON file.
- Scripts write valid JSON to `DNOTE_OUTPUT_FILE`.
- Large Markdown must be a JSON string, not Markdown printed around JSON.

## 6. Interaction acceptance

Test every new or changed renderer capability in all applicable cells:

| Surface | Render | Edit/save | Navigation/actions |
| --- | --- | --- | --- |
| Ordinary Reading note | required | required | required |
| Live Preview | required | required | required |
| Reactive/generated block | required | JSON write-back required | required |
| Table cell | required for inline syntax | cell write-back required | required |
| Nested list/task | required | checkbox write-back required | n/a |

Do not call a feature complete after checking only the static appearance.

## 7. Unsupported or conditional behavior

- Callout insertion currently creates a blockquote containing `[!note]`; do not
  claim a separate callout component unless one is implemented.
- Mermaid currently loads from a CDN and is conditional on network access.
- A recognized MOV/container extension does not guarantee Chromium codec
  support; the player may offer the mpv fallback.
- Audio/video/timeline examples pass only when their referenced files exist.
- Raw HTML outside the explicit `kbd` and styled-span subset remains literal.

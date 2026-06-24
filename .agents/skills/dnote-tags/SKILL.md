---
name: dnote-tags
description: Development guide for DNOTE tag indexing syntax, covering static inline tags, regular expression matches, and python script-based dynamic tags resolver covenants.
---

# DNOTE Tags Specification & Indexing Rules (`dnote-tags`)

This document defines how tags are written, indexed, and resolved in DNOTE note projects.

---

## 1. Inline Static Tags

Static tags are declared directly inside the Markdown text body:
* **Format**: Prefixed by `#` (e.g., `#ideas`, `#todo`, `#Canine`).
* **Delimiters**: Characters like spaces, brackets, parentheses, or punctuation terminate a tag.
* **Extraction**: Indexed on file change by parsing the note content using static text scanner matching.

---

## 2. Regex-Based Tags

DNOTE supports matching complex pattern signatures to extract tags dynamically.
* **Regex Declaration**: Configured under the workspace commands or indexer parameters.
* **Format**: `re:<regular-expression-pattern>`
  * E.g., `re:#(\w+)`: Standard word character extraction.
  * E.g., `re:#([\w\u4e00-\u9fa5]+)`: Extraction covering both alphanumeric and Chinese characters.

---

## 3. Script-Based Dynamic Tags

For advanced dynamic indexing (e.g. inheritance tag calculations, external taxonomy API mappings), notes can invoke a python script directly:
* **Trigger Attribute**: Prefixing note metadata properties or file attributes with `run:<script_name>.py`.
* **Execution Sequence**:
  1. The DNOTE `tagResolver` detects the script trigger attribute.
  2. The resolver invokes the Python script asynchronously using `uv run script/<script_name>.py` under the note project root directory.
  3. The resolver injects runtime parameters via standard DNOTE environment variables.
  4. The script computes the tags (e.g. parsing note structures, calling external models or databases) and writes a JSON array list containing the resolved tags back to `DNOTE_OUTPUT_FILE`.
  5. The tag indexer loads the output tags list and updates the global `system.resolvedTags` Blood state.

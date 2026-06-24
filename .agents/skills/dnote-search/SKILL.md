---
name: dnote-search
description: Search specifications for DNOTE workspaces, covering tag query tokenization, infix-to-postfix boolean logic evaluation, and note filtering patterns.
---

# DNOTE Search Specifications & Logic Evaluation (`dnote-search`)

This document defines the search syntax, query tokenization rules, and boolean matching algorithms used inside DNOTE's note panels.

---

## 1. Search Query Syntax

The search box in DNOTE supports simultaneous text matching and boolean tag expression evaluation:
* **Text Search**: Filename substring queries (e.g. `Movie` matches `MovieNote.md`).
* **Tag Queries**: Search criteria starting with `#` (e.g., `#todo`).
* **Boolean Operators**: Logical operators to combine constraints:
  * AND: `and`, `&&`, `add`, or whitespace separation.
  * OR: `or`, `||`.
  * NOT: `not`, `!`.
  * Grouping: Parentheses `(`, `)` to declare custom evaluation precedence.
  * E.g., `拉布拉多 #dog && !#温顺` matches dogs that are not labeled gentle.

---

## 2. Query Tokenization (`tokenizeQuery`)

DNOTE splits query string commands using the following regex structure:
`/(#re:\S+|re:\S+|\(|\)|#\/[^\/]+\/[a-z]*|#[^\s()#]+|and|add|or|not|&&|\|\||!|\S+)/gi`

This tokenizer categories matches into three standard token types:
* **`tag`**: E.g., `#ideas`, `#re:Canine`, `#/[a-zA-Z]/i`.
* **`operator`**: Logical operations normalized to `&`, `|`, `!`, `(`, or `)`.
* **`filename`**: Arbitrary text mapped as target filename search tokens.

---

## 3. Boolean Logical Evaluation (`evaluateBoolean`)

To support complex priority groupings, DNOTE compiles search queries using a **Shunting-Yard Infix-to-Postfix algorithm** before evaluation:

1. **Infix-to-Postfix queue conversion**:
   * Output Queue and Operator Stack partition tokens based on precedence: `!` (3), `&` (2), `|` (1).
2. **Postfix Stack Evaluation**:
   * Boolean states (`true` / `false` derived from tag matches) are popped from the stack and evaluated against operators (`!`, `&`, `|`).
   * Returns a final boolean result determining whether a file satisfies the query constraints.

---

## 4. Tag Match Resolution

* **Single Match**: Matches exact tag strings (e.g. `#dog` matches `dog`).
* **Regex Match**: If tag search query starts with `#re:` or matching format (e.g. `#re:^Can.*$`), the resolver compiles it to a RegExp object and tests it against all registered note tags.

---

## 5. Offline Query Helper Script

A Python implementation of this exact query parser is provided within this skill's `scripts/` directory:
* **Path**: `scripts/query_engine.py` (relative to this skill directory)
* **Usage**:
  You can run this script to quickly search files matching complex boolean tag queries directly from the workspace terminal or using `run_command` tools:
  ```bash
  python3 scripts/query_engine.py --dir <project_dir> --query "#dog && !#温顺"
  ```

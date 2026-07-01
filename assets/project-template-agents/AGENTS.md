# Galois Notebook Project Agent Instructions

This document defines the rules and guidelines for AI agents operating inside Galois notebook projects.

## Project Scope & Boundaries

1. **Notebook Project Focus**: You are operating inside a specific user notebook project. All modifications must be restricted to the notebook project directory (`DNOTE_PROJECT_PATH`) or the user extensions directory.
2. **Read-Only App Code**: The Galois application core code (`CORE/`, packaged `APP/`, packaging scripts, etc.) is read-only. The terminal environment inside the packaged Galois app does not have write access to the application bundle, and you must not attempt to modify Galois application layers or add external directory targets.
3. **Plugin Development Workspace**: Plugin/extension development is a core capability. You can create, inspect, and modify user extensions inside the dedicated user extensions workspace.
4. **Automated Skills**: The project's `.agents/skills/` directory contains guidelines for interacting with Galois notebook and plugin components. Always read these skills when performing relevant tasks.

## Key Files & Directories

- `command/commands.json`: Defines notebook command declarations (both content insertion and background scripts).
- `script/`: Contains python or shell scripts executed as notebook command implementations.
- `pyproject.toml` / `uv.lock` / `.venv`: Python package definitions and virtual environments owned specifically by the notebook project.
- `.dnote/`: Project-specific workspace layouts, theme choices, and local metadata.
- `media/`: User-visible images, audio, video, and dropped Markdown media owned by this notebook project.
- `.dnote_assets/`: Project-owned generated media assets, such as video timeline metadata and clip files.
- `~/Documents/Galois/extensions/`: The default writable directory for user extensions/plugins.

## Document References

Refer to the following bundled documentation for deeper context on Galois's runtime architecture:
- `.agents/references/CURRENT_ARCHITECTURE_AND_RELEASE.md`: The baseline facts regarding application layers, environment separation, and scripts execution contracts.
- `.agents/references/EXTENSION_WORKSPACE.md`: Explains the differences between source-code development workspace and packaged app workspace boundaries.
- `.agents/references/PLUGIN_ENVIRONMENT.md`: Outlines the plugin manifest schema, interpreters contract, and service registration protocol.
- `.agents/references/PLUGIN_AND_COMMAND_TEMPLATES.md`: Provides copy-ready `plugin.json` and `command/commands.json` templates and explains when to use each one.

## Rules for Scripts & Commands
- **First Decide the Layer**: If the user asks for notebook commands, dynamic tags, lifecycle hooks, reactive expressions, or `/` insertion snippets, work in the notebook project (`command/`, `script/`, `.dnote/`, `pyproject.toml`). Do not create or edit an APP/user extension for those tasks.
- **PEP 723 / UV**: Prefer using `uv run script.py` with PEP 723 inline script metadata for portable dependencies.
- **DNOTE_OUTPUT_FILE**: Notebook command scripts intended to output data back to the UI must write JSON responses directly to the path specified in `DNOTE_OUTPUT_FILE`.
- **Command Scopes**: Ensure the `scope` property is configured correctly in `commands.json` (e.g. `editor`, `fileTree`, `graphView` or `global`).

## Rules for Plugin Development
- **First Decide the Layer**: If the user asks for APP plugins, side-loaded extensions, extension commands, plugin services, or plugin manifests, work in `~/Documents/Galois/extensions/[plugin-name]/` unless the user explicitly opened a source checkout for core APP development.
- **Target Path**: Create or modify plugins ONLY in the user extensions directory (`~/Documents/Galois/extensions/[plugin-name]/`).
- **Plugin Manifest**: Ensure every plugin has a `plugin.json` conforming to `.agents/references/PLUGIN_ENVIRONMENT.md`.
- **Service Isolation**: Plugin service scripts (under `services/`) should rely on the plugin's own virtual environment or interpreters configuration, not the notebook project's `.venv`.
- **Runtime Refresh**: Side-loaded extension manifests and command declarations are refreshed by Galois at runtime, and service script edits are picked up on the next command run. Do not promise dynamic React UI panel loading for external extensions unless the app has explicitly implemented a UI bundle loader.
- **Editor Boundary**: Side-loaded extension services may read project context such as `DNOTE_PROJECT_PATH` and `.dnote_runtime.json`, but they do not own a stable editor mutation API yet. Do not directly rewrite the active Markdown file to replace the current selection unless the user explicitly asks for unsafe file-level automation. Text insertion, selection replacement, and slash interactions belong to editor actions or project `commands.json` content commands until a formal editor patch API exists.

#!/usr/bin/env python3
"""Emit a bounded, content-free overview of a Galois notebook project."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EXCLUDED_DIRS = {
    ".dnote_cache",
    ".git",
    ".idea",
    ".venv",
    ".vscode",
    "__pycache__",
    "dist",
    "node_modules",
}
PROJECT_MARKERS = (
    ".dnote_runtime.json",
    "command/commands.json",
    ".dnote",
    "script",
    "media",
)
DEPENDENCY_FILES = (
    "pyproject.toml",
    "uv.lock",
    "requirements.txt",
    "package.json",
    ".dnote/config.json",
)
MEDIA_KINDS = {
    "image": {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"},
    "audio": {".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"},
    "video": {".mp4", ".webm", ".mov", ".mkv", ".avi"},
}


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


def find_runtime(start: Path) -> Path | None:
    current = start.resolve()
    if current.is_file():
        current = current.parent
    for candidate_dir in (current, *current.parents):
        candidate = candidate_dir / ".dnote_runtime.json"
        if candidate.is_file():
            return candidate
    return None


def read_runtime(runtime_path: Path | None) -> dict[str, Any]:
    if runtime_path is None:
        return {}
    try:
        value = json.loads(runtime_path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read runtime file {runtime_path}: {exc}") from exc


def resolve_inputs(args: argparse.Namespace) -> tuple[Path, Path | None, dict[str, Any]]:
    runtime_path = Path(args.runtime).expanduser().resolve() if args.runtime else None
    if runtime_path is None and args.project is None:
        runtime_path = find_runtime(Path.cwd())
    runtime = read_runtime(runtime_path)

    raw_project = args.project or runtime.get("projectPath") or os.environ.get("DNOTE_PROJECT_PATH")
    if not raw_project:
        candidate = Path.cwd().resolve()
        if any((candidate / marker).exists() for marker in PROJECT_MARKERS) or any(candidate.glob("*.md")):
            raw_project = str(candidate)
    if not raw_project:
        raise ValueError("No notebook project found; pass a project path or --runtime file")

    project = Path(str(raw_project)).expanduser().resolve()
    if not project.is_dir():
        raise ValueError(f"Project directory does not exist: {project}")
    return project, runtime_path, runtime


def relative(project: Path, path: Path) -> str:
    try:
        return path.relative_to(project).as_posix()
    except ValueError:
        return str(path)


def scan_project(project: Path, max_visits: int, max_depth: int, max_markdown: int) -> dict[str, Any]:
    markdown: list[str] = []
    visits = 0
    truncated = False
    root_dir_names: set[str] = set()

    for root, dirs, files in os.walk(project, followlinks=False):
        root_path = Path(root)
        depth = len(root_path.relative_to(project).parts)
        visits += 1
        if visits > max_visits:
            truncated = True
            break
        dirs[:] = sorted(
            name for name in dirs
            if name not in EXCLUDED_DIRS and not (root_path / name).is_symlink()
        )
        if depth == 0:
            root_dir_names.update(dirs[:80])
            if len(dirs) > 80:
                truncated = True
        if depth >= max_depth:
            if dirs:
                truncated = True
            dirs[:] = []

        for name in sorted(files):
            visits += 1
            if visits > max_visits:
                truncated = True
                dirs[:] = []
                break
            path = root_path / name
            if path.is_symlink():
                continue
            if path.suffix.lower() in {".md", ".markdown"}:
                if len(markdown) < max_markdown:
                    markdown.append(relative(project, path))
                else:
                    truncated = True
        if visits > max_visits:
            break

    return {
        "markdown": markdown,
        "visits": min(visits, max_visits),
        "truncated": truncated,
        "rootDirectories": sorted(root_dir_names),
    }


def important_structure(project: Path, max_entries: int, max_depth: int) -> tuple[list[str], bool]:
    entries: list[str] = []
    truncated = False
    roots = [name for name in ("command", "script", ".dnote") if (project / name).exists()]

    for root_name in roots:
        root = project / root_name
        entries.append(f"{root_name}/")
        if len(entries) >= max_entries:
            return entries, True
        if not root.is_dir():
            continue
        for walk_root, dirs, files in os.walk(root, followlinks=False):
            walk_path = Path(walk_root)
            depth = len(walk_path.relative_to(root).parts)
            dirs[:] = sorted(
                name for name in dirs
                if name not in EXCLUDED_DIRS and not (walk_path / name).is_symlink()
            )
            if depth >= max_depth:
                if dirs:
                    truncated = True
                dirs[:] = []
            for name in dirs:
                entries.append(relative(project, walk_path / name) + "/")
                if len(entries) >= max_entries:
                    return entries, True
            for name in sorted(files):
                path = walk_path / name
                if not path.is_symlink():
                    entries.append(relative(project, path))
                    if len(entries) >= max_entries:
                        return entries, True
    return entries, truncated


def summarize_commands(project: Path, maximum: int = 30) -> tuple[list[dict[str, str]], str | None, bool]:
    path = project / "command" / "commands.json"
    if not path.is_file():
        return [], None, False
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [], str(exc), False

    raw_commands = value.get("commands", []) if isinstance(value, dict) else value
    if not isinstance(raw_commands, list):
        return [], "commands.json does not contain a command list", False
    result: list[dict[str, str]] = []
    for command in raw_commands[:maximum]:
        if not isinstance(command, dict):
            continue
        kind = "script" if command.get("script") else "content" if "content" in command else "unknown"
        item = {
            "id": str(command.get("id", "<missing-id>")),
            "kind": kind,
        }
        if command.get("script"):
            item["target"] = str(command["script"])
        if command.get("scope"):
            item["scope"] = str(command["scope"])
        result.append(item)
    return result, None, len(raw_commands) > maximum


def summarize_media(project: Path, max_visits: int = 4000) -> tuple[dict[str, int], bool]:
    media = project / "media"
    counts: Counter[str] = Counter()
    if not media.is_dir():
        return {}, False
    visits = 0
    for root, dirs, files in os.walk(media, followlinks=False):
        root_path = Path(root)
        visits += 1
        if visits > max_visits:
            return dict(sorted(counts.items())), True
        dirs[:] = sorted(name for name in dirs if name not in EXCLUDED_DIRS and not (root_path / name).is_symlink())
        for name in files:
            visits += 1
            if visits > max_visits:
                return dict(sorted(counts.items())), True
            suffix = Path(name).suffix.lower()
            kind = next((label for label, suffixes in MEDIA_KINDS.items() if suffix in suffixes), "other")
            counts[kind] += 1
    return dict(sorted(counts.items())), False


def build_overview(project: Path, runtime_path: Path | None, runtime: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    scan = scan_project(project, args.max_visits, args.max_depth, args.max_markdown)
    structure, structure_truncated = important_structure(project, args.max_structure, 4)
    commands, command_error, commands_truncated = summarize_commands(project)
    media, media_truncated = summarize_media(project)
    active_file = runtime.get("activeFile")
    active_display = relative(project, Path(active_file).resolve()) if active_file else None

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "project": {"name": project.name, "path": str(project)},
        "runtime": {
            "path": str(runtime_path) if runtime_path else None,
            "activeFile": active_display,
            "openFileCount": len(runtime.get("openFiles", {})) if isinstance(runtime.get("openFiles"), dict) else 0,
        },
        "markers": [marker for marker in PROJECT_MARKERS if (project / marker).exists()],
        "rootDirectories": scan["rootDirectories"],
        "dependencies": [name for name in DEPENDENCY_FILES if (project / name).is_file()],
        "markdownFiles": scan["markdown"],
        "importantStructure": structure,
        "commands": commands,
        "commandError": command_error,
        "mediaCounts": media,
        "truncated": {
            "projectScan": scan["truncated"],
            "importantStructure": structure_truncated,
            "commands": commands_truncated,
            "mediaCounts": media_truncated,
        },
    }


def render_markdown(data: dict[str, Any]) -> str:
    project = data["project"]
    runtime = data["runtime"]
    lines = [
        "# Galois project overview",
        f"- Project: {project['name']} (`{project['path']}`)",
        f"- Active file: `{runtime['activeFile'] or 'none'}`",
        f"- Open editor files: {runtime['openFileCount']}",
        f"- Project markers: {', '.join(data['markers']) or 'none'}",
        f"- Root directories: {', '.join(data['rootDirectories']) or 'none'}",
        f"- Dependency/config files: {', '.join(data['dependencies']) or 'none'}",
        "",
        f"## Markdown files ({len(data['markdownFiles'])} shown)",
    ]
    lines.extend(f"- `{path}`" for path in data["markdownFiles"])
    if not data["markdownFiles"]:
        lines.append("- none")

    lines.extend(["", "## Command and script structure"])
    lines.extend(f"- `{path}`" for path in data["importantStructure"])
    if not data["importantStructure"]:
        lines.append("- none")

    lines.extend(["", f"## Commands ({len(data['commands'])} shown)"])
    for command in data["commands"]:
        details = [command["kind"]]
        if command.get("target"):
            details.append(command["target"])
        if command.get("scope"):
            details.append(f"scope={command['scope']}")
        lines.append(f"- `{command['id']}` — {'; '.join(details)}")
    if data["commandError"]:
        lines.append(f"- parse warning: {data['commandError']}")
    elif not data["commands"]:
        lines.append("- none")

    counts = data["mediaCounts"]
    lines.extend(["", "## Media summary", "- " + (", ".join(f"{kind}: {count}" for kind, count in counts.items()) or "none")])
    truncated = [name for name, value in data["truncated"].items() if value]
    lines.extend(["", f"- Truncated sections: {', '.join(truncated) or 'none'}"])
    lines.append("- Markdown bodies and slash-command content were not loaded.")
    return "\n".join(lines) + "\n"


def cap_output(output: str, max_chars: int) -> str:
    if len(output) <= max_chars:
        return output
    suffix = "\n\n[Output truncated at the enforced context budget. Query a relevant path narrowly.]\n"
    cutoff = max_chars - len(suffix)
    clipped = output[:cutoff]
    if "\n" in clipped:
        clipped = clipped.rsplit("\n", 1)[0]
    return clipped + suffix


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", nargs="?", help="Notebook project root")
    parser.add_argument("--runtime", help="Path to .dnote_runtime.json")
    parser.add_argument("--max-markdown", type=int, default=80)
    parser.add_argument("--max-structure", type=int, default=120)
    parser.add_argument("--max-visits", type=int, default=5000)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--max-chars", type=int, default=10000)
    args = parser.parse_args()
    args.max_markdown = clamp(args.max_markdown, 10, 120)
    args.max_structure = clamp(args.max_structure, 20, 180)
    args.max_visits = clamp(args.max_visits, 500, 10000)
    args.max_depth = clamp(args.max_depth, 2, 8)
    args.max_chars = clamp(args.max_chars, 2000, 16000)
    return args


def main() -> int:
    args = parse_args()
    try:
        project, runtime_path, runtime = resolve_inputs(args)
        overview = build_overview(project, runtime_path, runtime, args)
    except ValueError as exc:
        print(f"project_overview: {exc}", file=sys.stderr)
        return 2
    output = render_markdown(overview)
    sys.stdout.write(cap_output(output, args.max_chars))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

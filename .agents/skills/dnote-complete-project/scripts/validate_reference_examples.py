#!/usr/bin/env python3
"""Validate the canonical plugin and Markdown examples without app mutation."""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[4]
PLUGIN_SKILL = ROOT / ".agents" / "skills" / "dnote-app-plugins"
SCAFFOLD_PATH = PLUGIN_SKILL / "scripts" / "scaffold_plugin.py"
NOTE_PATH = ROOT / "template-project" / "08_完整Markdown与程序生成验收.md"
SCRIPT_PATH = ROOT / "template-project" / "script" / "render_showcase.py"
TAG_SCRIPT_PATH = ROOT / "template-project" / "script" / "tag_calculator.py"
COMMANDS_PATH = ROOT / "template-project" / "command" / "commands.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_scaffold_module():
    spec = importlib.util.spec_from_file_location("galois_scaffold_plugin", SCAFFOLD_PATH)
    require(spec is not None and spec.loader is not None, "could not load scaffold module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_plugin_asset() -> None:
    scaffold_module = load_scaffold_module()
    with tempfile.TemporaryDirectory(prefix="galois-reference-plugin-") as temp_value:
        temp_root = Path(temp_value)
        (temp_root / "APP").mkdir()
        (temp_root / "CORE").mkdir()
        (temp_root / "package.json").write_text("{}\n", encoding="utf-8")
        (temp_root / "AGENTS.md").write_text("reference validation\n", encoding="utf-8")
        target = scaffold_module.scaffold(
            temp_root,
            "project-inspector",
            "项目检查器",
            "检查",
            False,
        )
        expected = {
            "index.ts",
            "ProjectInspectorView.tsx",
            "actions/RefreshAction.ts",
            "actions/index.ts",
            "services/project_summary.py",
            "plugin.json",
            "README.md",
        }
        actual = {str(path.relative_to(target)) for path in target.rglob("*") if path.is_file()}
        require(actual == expected, f"plugin scaffold mismatch: {sorted(actual ^ expected)}")
        for path in target.rglob("*"):
            if path.is_file():
                unresolved = re.findall(r"__[A-Z][A-Z_]+__", path.read_text(encoding="utf-8"))
                require(not unresolved, f"unresolved template token in {path}: {unresolved}")

        service = subprocess.run(
            [sys.executable, str(target / "services" / "project_summary.py")],
            input=json.dumps({"resolvedTags": {"a.md": ["x", "y"], "b.md": ["y"]}}),
            text=True,
            capture_output=True,
            check=True,
        )
        summary = json.loads(service.stdout)
        require(summary == {"noteCount": 2, "tagCount": 2, "topTags": ["x", "y"]}, "service output contract changed")


def validate_markdown_example() -> None:
    commands = json.loads(COMMANDS_PATH.read_text(encoding="utf-8"))["commands"]
    ids = [command["id"] for command in commands]
    require(len(ids) == len(set(ids)), "commands.json contains duplicate ids")
    showcase_command = next((command for command in commands if command["id"] == "project.renderShowcase"), None)
    require(showcase_command is not None and "content" in showcase_command, "render showcase content command is missing")
    require("shortcut" not in showcase_command, "reference content command must not claim a shortcut")

    note = NOTE_PATH.read_text(encoding="utf-8")
    required_note_markers = [
        "{{script/render_showcase.json:markdown",
        "<kbd>",
        "- [ ]",
        "| :--- |",
        "```mermaid",
        "$$",
        "![完整视频](media/2026-06-14 07-16-30.mp4)",
        "[[00_新手指引|",
    ]
    for marker in required_note_markers:
        require(marker in note, f"canonical note lost marker: {marker}")

    require((ROOT / "template-project" / "media" / "logo.jpg").is_file(), "canonical image is missing")
    require((ROOT / "template-project" / "media" / "2026-06-14 07-16-30.mp4").is_file(), "canonical video is missing")

    with tempfile.TemporaryDirectory(prefix="galois-render-showcase-") as temp_value:
        output_path = Path(temp_value) / "render_showcase.json"
        env = os.environ.copy()
        env["DNOTE_OUTPUT_FILE"] = str(output_path)
        completed = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            env=env,
            text=True,
            capture_output=True,
            check=True,
        )
        stdout_payload = json.loads(completed.stdout)
        file_payload = json.loads(output_path.read_text(encoding="utf-8"))
        require(stdout_payload == file_payload, "render script stdout and output file differ")
        generated = file_payload.get("markdown", "")
        for marker in ("### ", "- [ ]", "  - [ ]", "| :--- |", "<kbd>", "```mermaid", "$$", "![完整视频]"):
            require(marker in generated, f"generated Markdown lost marker: {marker}")

    with tempfile.TemporaryDirectory(prefix="galois-tag-showcase-") as temp_value:
        env = os.environ.copy()
        env.pop("DNOTE_OUTPUT_FILE", None)
        env["DNOTE_NOTE_PATH"] = str(NOTE_PATH)
        env["DNOTE_RESOLVED_TAGS"] = "{}"
        completed = subprocess.run(
            [sys.executable, str(TAG_SCRIPT_PATH)],
            cwd=temp_value,
            env=env,
            text=True,
            capture_output=True,
            check=True,
        )
        tags = json.loads(completed.stdout)
        require(tags == ["Galois", "标签", "脚本计算", "推荐"], "dynamic tag stdout contract changed")
        require(not (Path(temp_value) / "output.json").exists(), "tag script created a stray output.json")


def main() -> int:
    validate_plugin_asset()
    validate_markdown_example()
    print("reference examples validated: plugin scaffold + Markdown project + dynamic tags")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

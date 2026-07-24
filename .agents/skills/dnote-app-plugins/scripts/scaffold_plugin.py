#!/usr/bin/env python3
"""Generate a complete Galois APP organ from the canonical reference asset."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_ROOT = SKILL_ROOT / "assets" / "reference-organ"


def kebab_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    if not normalized or not re.fullmatch(r"[a-z][a-z0-9-]*", normalized):
        raise ValueError("plugin name must normalize to kebab-case beginning with a letter")
    return normalized


def lower_camel(value: str) -> str:
    parts = value.split("-")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def pascal_case(value: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in value.split("-"))


def replacements(folder: str, display_name: str, short_name: str) -> dict[str, str]:
    type_id = lower_camel(folder)
    return {
        "__FOLDER_NAME__": folder,
        "__TYPE_ID__": type_id,
        "__PASCAL_NAME__": pascal_case(folder),
        "__DISPLAY_NAME__": display_name,
        "__SHORT_NAME__": short_name,
    }


def render_text(value: str, mapping: dict[str, str]) -> str:
    for token, replacement in mapping.items():
        value = value.replace(token, replacement)
    return value


def rendered_relative_path(source: Path, mapping: dict[str, str]) -> Path:
    relative = source.relative_to(TEMPLATE_ROOT)
    parts = [render_text(part, mapping) for part in relative.parts]
    rendered = Path(*parts)
    if rendered.suffix == ".tmpl":
        rendered = rendered.with_suffix("")
    return rendered


def validate_root(root: Path) -> None:
    missing = [marker for marker in ("APP", "CORE", "package.json", "AGENTS.md") if not (root / marker).exists()]
    if missing:
        raise ValueError(f"not a Galois source/workbench root; missing: {', '.join(missing)}")


def scaffold(root: Path, folder: str, display_name: str, short_name: str, dry_run: bool) -> Path:
    validate_root(root)
    target = root / "APP" / folder
    if target.exists():
        raise FileExistsError(f"refusing to overwrite existing plugin: {target}")

    mapping = replacements(folder, display_name, short_name)
    sources = sorted(path for path in TEMPLATE_ROOT.rglob("*") if path.is_file())
    if dry_run:
        for source in sources:
            print(target / rendered_relative_path(source, mapping))
        return target

    target.mkdir(parents=True)
    try:
        for source in sources:
            destination = target / rendered_relative_path(source, mapping)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(render_text(source.read_text(encoding="utf-8"), mapping), encoding="utf-8")
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name", help="plugin folder name, for example project-inspector")
    parser.add_argument("--display-name", help="user-facing display name")
    parser.add_argument("--short-name", help="short activity-bar name")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Galois source/workbench root")
    parser.add_argument("--dry-run", action="store_true", help="list generated paths without writing")
    args = parser.parse_args()

    try:
        folder = kebab_name(args.name)
        display_name = args.display_name or pascal_case(folder)
        short_name = args.short_name or display_name[:8]
        target = scaffold(args.root.resolve(), folder, display_name, short_name, args.dry_run)
    except (ValueError, FileExistsError) as error:
        print(f"[scaffold_plugin] {error}", file=sys.stderr)
        return 2

    if not args.dry_run:
        print(f"[scaffold_plugin] created {target}")
        print("[scaffold_plugin] next: inspect plugin.json, then run npx tsc --noEmit && npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

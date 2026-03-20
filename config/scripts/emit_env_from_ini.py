#!/usr/bin/env python3
"""
Emit environment lines from a Sajtmaskin AI profile INI.

Reads config/profiles/*.ini (flat key=value per section), prints KEY=value lines
for pasting into .env.local. No secrets — only what you put in the INI.

Usage:
  python config/scripts/emit_env_from_ini.py
  python config/scripts/emit_env_from_ini.py --ini config/profiles/ai.local.ini
  python config/scripts/emit_env_from_ini.py --only tokens_engine_and_autofix --export
"""
from __future__ import annotations

import argparse
import configparser
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_INI = REPO_ROOT / "config" / "profiles" / "ai.defaults.ini"


def load_ini(path: Path) -> configparser.ConfigParser:
    cp = configparser.ConfigParser()
    cp.optionxform = str
    if not path.is_file():
        print(f"emit_env_from_ini: file not found: {path}", file=sys.stderr)
        sys.exit(1)
    cp.read(path, encoding="utf-8")
    return cp


def emit(cp: configparser.ConfigParser, only: set[str] | None, export: bool) -> None:
    for section in cp.sections():
        if only is not None and section not in only:
            continue
        for key in cp.options(section):
            raw = cp.get(section, key, fallback="").strip()
            if raw == "":
                continue
            line = f"{key}={raw}"
            print(f"export {line}" if export else line)


def main() -> None:
    p = argparse.ArgumentParser(description="Print env lines from AI profile INI.")
    p.add_argument(
        "--ini",
        type=Path,
        default=DEFAULT_INI,
        help=f"path to profile (default: {DEFAULT_INI})",
    )
    p.add_argument(
        "--only",
        action="append",
        dest="only_sections",
        metavar="SECTION",
        help="restrict to section(s); repeatable",
    )
    p.add_argument(
        "--export",
        action="store_true",
        help="prefix each line with export for POSIX shells",
    )
    args = p.parse_args()
    ini_path = args.ini if args.ini.is_absolute() else REPO_ROOT / args.ini
    only = set(args.only_sections) if args.only_sections else None
    cp = load_ini(ini_path)
    emit(cp, only, args.export)


if __name__ == "__main__":
    main()

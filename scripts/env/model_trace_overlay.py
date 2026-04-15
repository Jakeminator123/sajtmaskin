#!/usr/bin/env python3
"""
Sync builder model env vars to the current GUI defaults and optionally open the
builder model-trace overlay.

Examples:
  python model_trace_overlay.py status
  python model_trace_overlay.py apply
  python model_trace_overlay.py launch
  python model_trace_overlay.py apply --max-model claude-sonnet-4.6 --open
"""

from __future__ import annotations

import argparse
import os
import webbrowser
from collections import OrderedDict
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DEFAULT_ENV_FILE = REPO_ROOT / ".env.local"
DEFAULT_OVERLAY_URL = "http://localhost:3000/builder?modelTrace=1"


def parse_env_file(path: Path) -> OrderedDict[str, str]:
    values: OrderedDict[str, str] = OrderedDict()
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def write_env_value(path: Path, key: str, value: str) -> None:
    lines: list[str] = []
    found = False

    if path.exists():
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            candidate = raw_line.strip()
            if candidate.lower().startswith("export "):
                candidate = candidate[7:].strip()
            if "=" in candidate and candidate.split("=", 1)[0].strip() == key:
                lines.append(f"{key}={quote_if_needed(value)}")
                found = True
            else:
                lines.append(raw_line)

    if not found:
        lines.append(f"{key}={quote_if_needed(value)}")

    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def quote_if_needed(value: str) -> str:
    if not value:
        return '""'
    if any(char.isspace() for char in value) or '"' in value or "'" in value:
        return f'"{value}"'
    return value


def build_target_env(args: argparse.Namespace) -> OrderedDict[str, str]:
    return OrderedDict(
        [
            ("SAJTMASKIN_MODEL_FAST", args.fast_model),
            ("SAJTMASKIN_MODEL_PRO", args.pro_model),
            ("SAJTMASKIN_MODEL_MAX", args.max_model),
            ("SAJTMASKIN_MODEL_CODEX", args.codex_model),
            ("SAJTMASKIN_MODEL_ANTHROPIC", args.anthropic_model),
            ("SAJTMASKIN_ASSIST_MODEL", args.assist_model),
            ("SAJTMASKIN_POLISH_MODEL", args.polish_model),
        ]
    )


def print_status(env_path: Path, target_env: OrderedDict[str, str]) -> None:
    current = parse_env_file(env_path)

    print(f"Env file: {env_path}")
    print("")
    print(f"{'KEY':<28} {'CURRENT':<34} {'TARGET':<34} STATE")
    print("-" * 112)

    for key, target_value in target_env.items():
        current_value = current.get(key, "<missing>")
        state = "OK" if current_value == target_value else "DIFF"
        print(f"{key:<28} {truncate(current_value):<34} {truncate(target_value):<34} {state}")

    print("")
    print("Overlay URL:")
    print(f"  {DEFAULT_OVERLAY_URL}")
    print("")
    print("Note: Next.js must be restarted after changing .env.local if you want")
    print("new defaults to be picked up reliably by the builder.")


def apply_target_env(env_path: Path, target_env: OrderedDict[str, str]) -> list[tuple[str, str, str]]:
    before = parse_env_file(env_path)
    changes: list[tuple[str, str, str]] = []

    for key, target_value in target_env.items():
        old_value = before.get(key, "<missing>")
        if old_value != target_value:
            write_env_value(env_path, key, target_value)
            changes.append((key, old_value, target_value))

    return changes


def open_overlay(url: str) -> None:
    try:
        webbrowser.open(url, new=2)
    except Exception as exc:  # pragma: no cover - best effort only
        print(f"Could not open browser automatically: {exc}")


def truncate(value: str, max_len: int = 33) -> str:
    if len(value) <= max_len:
        return value
    return value[: max_len - 1] + "…"


def cmd_status(args: argparse.Namespace) -> int:
    target_env = build_target_env(args)
    print_status(args.env_file, target_env)
    return 0


def cmd_apply(args: argparse.Namespace, *, open_browser: bool) -> int:
    target_env = build_target_env(args)
    changes = apply_target_env(args.env_file, target_env)

    if not changes:
        print(f"No changes needed in {args.env_file}.")
    else:
        print(f"Updated {args.env_file}:")
        for key, old_value, new_value in changes:
            print(f"  {key}: {old_value} -> {new_value}")

    print("")
    print("Overlay URL:")
    print(f"  {args.overlay_url}")
    print("")
    print("Reminder: restart Next.js after env changes so the builder picks up the new values.")

    if open_browser or args.open:
        open_overlay(args.overlay_url)
        print("Browser open requested.")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync Sajtmaskin builder model env vars and open the model-trace overlay.",
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=("status", "apply", "launch"),
        default="status",
        help="status = read-only diff, apply = write .env.local, launch = write and open overlay",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help="Env file to update (default: .env.local)",
    )
    parser.add_argument(
        "--overlay-url",
        default=DEFAULT_OVERLAY_URL,
        help="Builder URL that enables the overlay (default: localhost builder)",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open the overlay URL after apply",
    )

    parser.add_argument("--fast-model", default="gpt-4.1")
    parser.add_argument("--pro-model", default="gpt-5.3-codex")
    parser.add_argument("--max-model", default="gpt-5.4")
    parser.add_argument("--codex-model", default="gpt-5.3-codex")
    parser.add_argument("--anthropic-model", default="claude-sonnet-4.6")
    parser.add_argument("--assist-model", default="openai/gpt-5.4")
    parser.add_argument("--polish-model", default="openai/gpt-5.3-codex")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    args.env_file = Path(args.env_file).resolve()
    args.env_file.parent.mkdir(parents=True, exist_ok=True)

    if args.command == "status":
        return cmd_status(args)
    if args.command == "apply":
        return cmd_apply(args, open_browser=False)
    if args.command == "launch":
        return cmd_apply(args, open_browser=True)

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

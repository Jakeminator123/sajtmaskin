#!/usr/bin/env python3
"""
Simple interactive bootstrap for the Cursor GPT automation kit.

Goals:
- one file entry point
- avoid npm/node_modules in target repos by default
- prepare dashboard defaults for zero-touch runs
"""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
DASHBOARD_PATH = ROOT / "automation" / "kit_dashboard.py"
MANAGER_PATH = ROOT / "automation" / "kit_manager.py"
UI_SETTINGS_PATH = ROOT / "automation" / "state" / "ui-dashboard" / "ui-settings.json"


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default is not None else ""
    value = input(f"{prompt}{suffix}: ").strip()
    if not value and default is not None:
        return default
    return value


def ask_yes_no(prompt: str, default_yes: bool = True) -> bool:
    default = "Y/n" if default_yes else "y/N"
    value = input(f"{prompt} ({default}): ").strip().lower()
    if not value:
        return default_yes
    return value in {"y", "yes"}


def run_cmd(cmd: list[str], cwd: Path = ROOT) -> int:
    print(f"\n$ {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=str(cwd), check=False)
    return result.returncode


def node_exists() -> bool:
    result = subprocess.run(
        ["node", "-v"],
        cwd=str(ROOT),
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.returncode == 0


def playwright_installed_in_toolkit() -> bool:
    result = subprocess.run(
        ["node", "-e", "require.resolve('playwright')"],
        cwd=str(ROOT),
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.returncode == 0


def load_ui_settings() -> dict:
    if not UI_SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(UI_SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_ui_settings(data: dict) -> None:
    UI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    UI_SETTINGS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def choose_repo_path(default_repo: str) -> str:
    while True:
        candidate = ask("Target repo path", default_repo).strip()
        path = Path(candidate).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        if not path.exists():
            print(f"Path not found: {path}")
            continue
        if not (path / ".git").exists():
            print(f"Not a git repo (.git missing): {path}")
            continue
        return str(path)


def configure_defaults(repo_path: str, runtime_mode: str, run_agent_flow: bool) -> None:
    data = load_ui_settings()
    data["repo_path"] = repo_path
    data["repo_name"] = Path(repo_path).name
    data["runtime_mode"] = runtime_mode
    data["iteration_start"] = "1"
    data["iteration_count"] = "1"
    data["generate_prompt"] = True
    data["recover_flags"] = True
    data["run_agent_flow"] = run_agent_flow
    data["agent_skip_quality"] = False
    data["agent_skip_release"] = False
    data["create_snapshots"] = False
    data["snapshot_branch_prefix"] = "automation-iteration"
    data["snapshot_commit_prefix"] = "commit-iteration"
    data["archive_baseline"] = True
    save_ui_settings(data)


def maybe_install_playwright(runtime_mode: str) -> None:
    if runtime_mode != "playwright":
        print("Playwright install skipped (cursor-manual mode selected).")
        return

    if not node_exists():
        print("Node.js not found. Install Node.js first, then run INSTALLERA.py again.")
        return

    if playwright_installed_in_toolkit():
        print("Playwright is already installed in toolkit root.")
        return

    if not ask_yes_no("Install Playwright now in THIS toolkit repo (not in target repo)?", default_yes=True):
        print("Skipped Playwright install. Playwright runtime will fail until installed.")
        return

    code = run_cmd(["npm", "install", "--save-dev", "playwright"], cwd=ROOT)
    if code != 0:
        print("Playwright install failed. You can retry later from dashboard or terminal.")
    else:
        print("Playwright installed in toolkit root.")


def maybe_install_into_target(repo_path: str) -> None:
    if not ask_yes_no("Install kit files into target repo as well? (optional)", default_yes=False):
        return

    cmd = [
        sys.executable,
        str(MANAGER_PATH),
        "install",
        "--target",
        repo_path,
    ]
    if ask_yes_no("Allow overwrite of existing files in target repo?", default_yes=False):
        cmd.append("--force-overwrite")

    code = run_cmd(cmd, cwd=ROOT)
    if code != 0:
        print("Target install failed.")
    else:
        print("Target install completed.")


def launch_dashboard() -> int:
    if not DASHBOARD_PATH.exists():
        print(f"Missing dashboard script: {DASHBOARD_PATH}")
        return 1
    return run_cmd([sys.executable, str(DASHBOARD_PATH)], cwd=ROOT)


def main() -> int:
    print("=== Cursor GPT Install Wizard ===")
    print("Recommended mode: zero-touch + cursor-manual (no npm in target repo).")
    print("")

    defaults = load_ui_settings()
    default_repo = str(defaults.get("repo_path", "")).strip()
    if not default_repo:
        default_repo = str((ROOT.parent / "sajtmaskin").resolve())

    repo_path = choose_repo_path(default_repo)

    print("")
    print("Choose runtime mode:")
    print("1) cursor-manual (safer, works inside Cursor browser, no Playwright needed)")
    print("2) playwright (full external browser automation, needs Playwright in toolkit)")
    mode_choice = ask("Choose", "1").strip()
    runtime_mode = "cursor-manual" if mode_choice != "2" else "playwright"

    run_agent_flow = ask_yes_no(
        "Enable full pipeline by default (browser capture + automatic run-iterations build flow)",
        default_yes=True,
    )

    configure_defaults(repo_path, runtime_mode, run_agent_flow)
    maybe_install_playwright(runtime_mode)
    maybe_install_into_target(repo_path)

    print("")
    print("Saved defaults.")
    print(f"- repo_path: {repo_path}")
    print(f"- runtime_mode: {runtime_mode}")
    print(f"- run_agent_flow: {run_agent_flow}")
    print("")
    print("Next:")
    print("1) Open dashboard")
    print("2) Exit")
    next_choice = ask("Choose", "1").strip()
    if next_choice == "1":
        return launch_dashboard()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

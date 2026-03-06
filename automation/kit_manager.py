#!/usr/bin/env python3
"""
Interactive manager for installing/uninstalling the automation kit.

Key goals:
- path-based workflow (target repo path only)
- optional zero-touch run (recommended)
- fully reversible install via manifest + backups
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from typing import Iterable


MANIFEST_VERSION = 1
MANAGER_DIR = Path(".cursor-gpt-kit")
MANIFEST_REL = MANAGER_DIR / "manifest.json"
BACKUP_DIR_REL = MANAGER_DIR / "backups"
LOCAL_RUN_FLAG_REL = Path("automation/state/automation-running.json")
GLOBAL_RUN_FLAG_REL = Path(".cursor-gpt-automation/automation-running.json")


KIT_PATHS = [
    Path("automation/README.md"),
    Path("automation/run-iterations.ps1"),
    Path("automation/run-browser-automation.mjs"),
    Path("automation/run-browser-automation.ps1"),
    Path("automation/generate-browser-input.ps1"),
    Path("automation/install-to-repo.ps1"),
    Path("automation/kit_manager.py"),
    Path("automation/kit_dashboard.py"),
    Path("automation/browser-io-notes.md"),
    Path("automation/templates"),
    Path("automation/inbox/.gitkeep"),
    Path("automation/packets/.gitkeep"),
    Path("automation/reports/.gitkeep"),
    Path("automation/runtime/.gitkeep"),
    Path(".cursor/agents"),
    Path(".cursor/rules"),
    Path("INSTALLERA.py"),
    Path("INSTALERA.py"),
    Path("config.txt"),
    Path("config.example.txt"),
    Path("config.browser.txt"),
]


@dataclasses.dataclass
class FileCopyPlan:
    source: Path
    relative_target: Path
    absolute_target: Path
    existed_before: bool


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_git_repo(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"Target repo path does not exist: {path}")
    if not (path / ".git").exists():
        raise RuntimeError(f"Target path is not a git repo (.git missing): {path}")


def iter_files_recursive(path: Path) -> Iterable[Path]:
    return sorted([p for p in path.rglob("*") if p.is_file()])


def collect_file_copy_plan(toolkit_root: Path, target_repo: Path) -> list[FileCopyPlan]:
    plans: list[FileCopyPlan] = []
    for rel in KIT_PATHS:
        source = toolkit_root / rel
        if not source.exists():
            raise RuntimeError(f"Toolkit source is missing: {source}")

        if source.is_dir():
            for source_file in iter_files_recursive(source):
                nested_rel = rel / source_file.relative_to(source)
                absolute_target = target_repo / nested_rel
                plans.append(
                    FileCopyPlan(
                        source=source_file,
                        relative_target=nested_rel,
                        absolute_target=absolute_target,
                        existed_before=absolute_target.exists(),
                    )
                )
        else:
            absolute_target = target_repo / rel
            plans.append(
                FileCopyPlan(
                    source=source,
                    relative_target=rel,
                    absolute_target=absolute_target,
                    existed_before=absolute_target.exists(),
                )
            )

    # Stable order makes output and uninstall behavior predictable.
    plans.sort(key=lambda p: str(p.relative_target).lower())
    return plans


def print_plan_summary(plans: list[FileCopyPlan]) -> None:
    total = len(plans)
    existing = sum(1 for p in plans if p.existed_before)
    new_files = total - existing
    print(f"Planned files: {total} (new: {new_files}, existing: {existing})")


def set_or_add_key(content: str, key: str, value: str) -> str:
    pattern = re.compile(rf"(?m)^{re.escape(key)}=.*$")
    replacement = f"{key}={value}"
    if pattern.search(content):
        return pattern.sub(replacement, content)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + replacement + "\n"


def parse_config_text(content: str) -> dict[str, str]:
    data: dict[str, str] = {}
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip()
    return data


def read_config_file(path: Path) -> tuple[str, dict[str, str]]:
    if not path.exists():
        return "", {}
    content = path.read_text(encoding="utf-8")
    return content, parse_config_text(content)


def write_config_key(path: Path, key: str, value: str) -> None:
    content, _ = read_config_file(path)
    updated = set_or_add_key(content, key, value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(updated, encoding="utf-8")


def delete_config_key(path: Path, key: str) -> None:
    content, current = read_config_file(path)
    if key not in current:
        return
    pattern = re.compile(rf"(?m)^{re.escape(key)}=.*\n?")
    updated = pattern.sub("", content)
    path.write_text(updated, encoding="utf-8")


def expected_report_file_name(
    config_values: dict[str, str],
    iteration: int,
) -> str:
    prefix = config_values.get("OUTPUT_FILE_PREFIX", "deep-research-report")
    ext = config_values.get("REPORT_SAVE_EXTENSION", ".md")
    if iteration <= 1:
        return f"{prefix}{ext}"
    return f"{prefix} ({iteration}){ext}"


def config_output_dir(toolkit_root: Path, config_values: dict[str, str]) -> Path:
    out_dir = config_values.get("REPORT_OUTPUT_DIR") or config_values.get("OUTPUT_DIR") or "automation/inbox"
    return toolkit_root / out_dir


def run_flag_paths(toolkit_root: Path) -> list[Path]:
    local_flag = toolkit_root / LOCAL_RUN_FLAG_REL
    global_flag = Path.home() / GLOBAL_RUN_FLAG_REL
    return [local_flag, global_flag]


def read_flag_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # pylint: disable=broad-except
        return None


def print_run_flags(toolkit_root: Path) -> None:
    print("Automation run flags:")
    for flag_path in run_flag_paths(toolkit_root):
        if not flag_path.exists():
            print(f"- {flag_path}: not present")
            continue
        data = read_flag_json(flag_path) or {}
        started = data.get("started_at_utc", "unknown")
        mode = data.get("mode", "unknown")
        target = data.get("target_repo", "unknown")
        print(f"- {flag_path}: ACTIVE")
        print(f"  started_at_utc={started}")
        print(f"  mode={mode}")
        print(f"  target_repo={target}")


def clear_run_flags(toolkit_root: Path) -> None:
    removed = 0
    for flag_path in run_flag_paths(toolkit_root):
        if flag_path.exists():
            flag_path.unlink()
            removed += 1
            print(f"Removed: {flag_path}")
    if removed == 0:
        print("No run flags to clear.")


def acquire_run_flags(
    toolkit_root: Path,
    target_repo: Path,
    *,
    mode: str,
    allow_recover_stale_flags: bool,
) -> list[Path]:
    paths = run_flag_paths(toolkit_root)
    existing = [p for p in paths if p.exists()]
    if existing and not allow_recover_stale_flags:
        print("Another automation run appears to be active (flag file exists):")
        for p in existing:
            data = read_flag_json(p) or {}
            started = data.get("started_at_utc", "unknown")
            print(f"- {p} (started_at_utc={started})")
        raise RuntimeError(
            "Run blocked by existing flag file. Clear stale flags first in interactive menu."
        )

    if existing and allow_recover_stale_flags:
        for p in existing:
            p.unlink()
            print(f"Recovered stale flag: {p}")

    payload = {
        "started_at_utc": now_iso(),
        "pid": os.getpid(),
        "mode": mode,
        "toolkit_root": str(toolkit_root),
        "target_repo": str(target_repo),
    }
    for p in paths:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return paths


def release_run_flags(paths: list[Path]) -> None:
    for p in paths:
        try:
            if p.exists():
                p.unlink()
        except Exception:  # pylint: disable=broad-except
            pass


def update_target_browser_config(target_repo: Path, repo_name: str) -> None:
    config_path = target_repo / "config.browser.txt"
    if not config_path.exists():
        return
    content = config_path.read_text(encoding="utf-8")
    content = set_or_add_key(content, "REPOSITORY_QUERY", repo_name)
    content = set_or_add_key(content, "REPOSITORY_REPO_NAME", repo_name)
    content = set_or_add_key(content, "ALLOW_ANY_REPOSITORY_OWNER", "true")
    config_path.write_text(content, encoding="utf-8")


def manifest_path(target_repo: Path) -> Path:
    return target_repo / MANIFEST_REL


def write_manifest(target_repo: Path, data: dict) -> None:
    path = manifest_path(target_repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def read_manifest(target_repo: Path) -> dict:
    path = manifest_path(target_repo)
    if not path.exists():
        raise RuntimeError(f"No installation manifest found in repo: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Manifest is corrupted: {path}") from exc


def install_kit(
    toolkit_root: Path,
    target_repo: Path,
    *,
    force_overwrite: bool,
    dry_run: bool,
    install_playwright: bool,
) -> None:
    ensure_git_repo(target_repo)

    m_path = manifest_path(target_repo)
    if m_path.exists():
        raise RuntimeError(
            "This repo already has a kit manifest. Run uninstall first, then install again."
        )

    plans = collect_file_copy_plan(toolkit_root, target_repo)
    print_plan_summary(plans)

    conflicts = [p for p in plans if p.existed_before]
    if conflicts and not force_overwrite:
        print("Install blocked: target files already exist.")
        for plan in conflicts[:20]:
            print(f"- {plan.relative_target}")
        if len(conflicts) > 20:
            print(f"... and {len(conflicts) - 20} more")
        raise RuntimeError("Use --force-overwrite to allow replacement with backup.")

    if dry_run:
        print("Dry-run: no files were copied.")
        return

    backup_root = target_repo / BACKUP_DIR_REL
    created_dirs: set[str] = set()
    manifest_entries: list[dict] = []

    for plan in plans:
        parent = plan.absolute_target.parent
        if not parent.exists():
            parent.mkdir(parents=True, exist_ok=True)
            created_dirs.add(str(parent.relative_to(target_repo)).replace("\\", "/"))

        backup_rel = None
        if plan.existed_before:
            backup_path = backup_root / plan.relative_target
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(plan.absolute_target, backup_path)
            backup_rel = str(backup_path.relative_to(target_repo)).replace("\\", "/")

        shutil.copy2(plan.source, plan.absolute_target)
        installed_hash = sha256_file(plan.absolute_target)
        manifest_entries.append(
            {
                "path": str(plan.relative_target).replace("\\", "/"),
                "existed_before": plan.existed_before,
                "backup_path": backup_rel,
                "installed_sha256": installed_hash,
            }
        )

    repo_name = target_repo.name
    update_target_browser_config(target_repo, repo_name)

    # Re-hash config.browser if it exists in the copied set and we mutated it.
    config_rel = "config.browser.txt"
    config_abs = target_repo / config_rel
    if config_abs.exists():
        for entry in manifest_entries:
            if entry["path"] == config_rel:
                entry["installed_sha256"] = sha256_file(config_abs)
                break

    manifest_data = {
        "manifest_version": MANIFEST_VERSION,
        "installed_at_utc": now_iso(),
        "toolkit_root": str(toolkit_root),
        "target_repo": str(target_repo),
        "created_dirs": sorted(created_dirs),
        "entries": manifest_entries,
        "options": {
            "force_overwrite": force_overwrite,
            "install_playwright": install_playwright,
        },
    }
    write_manifest(target_repo, manifest_data)

    if install_playwright:
        print("Installing playwright in target repo...")
        cmd = ["npm", "install", "--save-dev", "playwright"]
        result = subprocess.run(cmd, cwd=target_repo, check=False)
        if result.returncode != 0:
            raise RuntimeError("npm install --save-dev playwright failed.")

    print(f"Install complete for repo: {target_repo}")
    print("Tip: zero-touch mode avoids changing target repo files.")


def uninstall_kit(
    target_repo: Path,
    *,
    dry_run: bool,
    force_remove_modified: bool,
) -> None:
    ensure_git_repo(target_repo)
    manifest = read_manifest(target_repo)

    entries: list[dict] = manifest.get("entries", [])
    created_dirs: list[str] = manifest.get("created_dirs", [])

    # Process deeper paths first for reliable cleanup.
    entries_sorted = sorted(entries, key=lambda e: len(e["path"]), reverse=True)

    kept_modified: list[str] = []
    removed_files = 0
    restored_files = 0

    for entry in entries_sorted:
        rel = Path(entry["path"])
        target = target_repo / rel
        existed_before = bool(entry.get("existed_before"))
        backup_rel = entry.get("backup_path")
        installed_sha = entry.get("installed_sha256")

        if existed_before:
            if not backup_rel:
                print(f"Skip restore (missing backup path): {rel}")
                continue
            backup_abs = target_repo / Path(backup_rel)
            if not backup_abs.exists():
                print(f"Skip restore (backup missing): {rel}")
                continue
            if dry_run:
                print(f"[dry-run] restore: {rel}")
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup_abs, target)
            restored_files += 1
            continue

        if not target.exists():
            continue

        if target.is_file():
            current_sha = sha256_file(target)
            modified = bool(installed_sha and current_sha != installed_sha)
            if modified and not force_remove_modified:
                kept_modified.append(str(rel).replace("\\", "/"))
                continue

            if dry_run:
                print(f"[dry-run] delete file: {rel}")
            else:
                target.unlink()
            removed_files += 1

    # Remove directories created during install, deepest first.
    dirs_sorted = sorted(created_dirs, key=len, reverse=True)
    for rel_dir in dirs_sorted:
        dir_abs = target_repo / Path(rel_dir)
        if not dir_abs.exists() or not dir_abs.is_dir():
            continue
        if any(dir_abs.iterdir()):
            continue
        if dry_run:
            print(f"[dry-run] remove dir: {rel_dir}")
        else:
            dir_abs.rmdir()

    manager_root = target_repo / MANAGER_DIR
    if dry_run:
        print(f"[dry-run] remove manager dir: {manager_root}")
    else:
        if manager_root.exists():
            shutil.rmtree(manager_root, ignore_errors=True)

    print("Uninstall completed.")
    print(f"- Restored files: {restored_files}")
    print(f"- Removed files: {removed_files}")
    if kept_modified:
        print("- Kept modified files (changed after install):")
        for rel in kept_modified:
            print(f"  - {rel}")
        print("Re-run with --force-remove-modified to remove those as well.")


def status_kit(target_repo: Path) -> None:
    ensure_git_repo(target_repo)
    m_path = manifest_path(target_repo)
    if not m_path.exists():
        print("No kit manifest found in target repo.")
        return
    manifest = read_manifest(target_repo)
    entries = manifest.get("entries", [])
    print(f"Kit is installed in: {target_repo}")
    print(f"- Installed at: {manifest.get('installed_at_utc', 'unknown')}")
    print(f"- Managed files: {len(entries)}")
    print(f"- Manifest: {m_path}")


def run_git(target_repo: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = ["git", "-C", str(target_repo), *args]
    result = subprocess.run(cmd, check=False, text=True, capture_output=True)
    if check and result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or "unknown git error"
        raise RuntimeError(f"git {' '.join(args)} failed: {detail}")
    return result


def ensure_clean_worktree(target_repo: Path) -> None:
    status = run_git(target_repo, ["status", "--porcelain"], check=True)
    if status.stdout.strip():
        raise RuntimeError(
            "Target repo has uncommitted changes. Commit/stash first to allow safe iteration snapshots."
        )


def branch_exists(target_repo: Path, branch_name: str) -> bool:
    result = run_git(target_repo, ["rev-parse", "--verify", f"refs/heads/{branch_name}"], check=False)
    return result.returncode == 0


def current_branch(target_repo: Path) -> str:
    result = run_git(target_repo, ["rev-parse", "--abbrev-ref", "HEAD"], check=True)
    return result.stdout.strip()


def create_iteration_snapshot(
    target_repo: Path,
    toolkit_root: Path,
    *,
    iteration: int,
    branch_prefix: str,
    commit_prefix: str,
    config_values: dict[str, str],
    base_branch: str,
) -> tuple[str, str | None]:
    ensure_clean_worktree(target_repo)

    report_name = expected_report_file_name(config_values, iteration)
    source_report = config_output_dir(toolkit_root, config_values) / report_name
    if not source_report.exists():
        raise RuntimeError(f"Expected report file not found for iteration {iteration}: {source_report}")

    target_inbox = target_repo / "automation" / "inbox"
    target_inbox.mkdir(parents=True, exist_ok=True)
    target_report = target_inbox / report_name
    target_report_rel = target_report.relative_to(target_repo).as_posix()

    branch_name = f"{branch_prefix}-{iteration:02d}"
    commit_message = f"{commit_prefix}-{iteration}"

    # Always branch from a stable base to avoid accidental chain dependencies.
    run_git(target_repo, ["switch", base_branch], check=True)
    if branch_exists(target_repo, branch_name):
        run_git(target_repo, ["switch", branch_name], check=True)
    else:
        run_git(target_repo, ["switch", "-c", branch_name], check=True)

    shutil.copy2(source_report, target_report)
    run_git(target_repo, ["add", target_report_rel], check=True)

    diff = run_git(target_repo, ["diff", "--cached", "--name-only"], check=True)
    if not diff.stdout.strip():
        return branch_name, None

    run_git(target_repo, ["commit", "-m", commit_message], check=True)
    return branch_name, commit_message


def ensure_run_iterations_script_available(target_repo: Path) -> Path:
    script_path = target_repo / "automation" / "run-iterations.ps1"
    if not script_path.exists():
        raise RuntimeError(
            "Full pipeline requires automation/run-iterations.ps1 in target repo. "
            "Install the kit in target repo first."
        )
    return script_path


def run_agent_flow_for_report(
    target_repo: Path,
    *,
    report_path: Path,
    skip_quality_gates: bool,
    skip_release: bool,
) -> None:
    script_path = ensure_run_iterations_script_available(target_repo)
    cmd = [
        "powershell",
        "-NoProfile",
        "-File",
        str(script_path),
        "-DeepResearchPath",
        str(report_path),
        "-MaxIterations",
        "1",
        "-AllowDirty",
    ]
    if skip_quality_gates:
        cmd.append("-SkipQualityGates")
    if skip_release:
        cmd.append("-SkipRelease")

    print("Running agent implementation flow...")
    result = subprocess.run(cmd, cwd=target_repo, check=False)
    if result.returncode != 0:
        raise RuntimeError("run-iterations.ps1 failed during full pipeline.")


def choose_config_path(toolkit_root: Path) -> Path:
    print("Choose config file target:")
    print("1) Toolkit config.browser.txt")
    print("2) Toolkit config.txt")
    print("3) Custom path")
    choice = ask("Choose", "1")
    if choice == "1":
        return toolkit_root / "config.browser.txt"
    if choice == "2":
        return toolkit_root / "config.txt"
    custom = ask("Absolute or relative config path")
    path_value = Path(custom).expanduser()
    if not path_value.is_absolute():
        path_value = (Path.cwd() / path_value).resolve()
    return path_value


def settings_dashboard(toolkit_root: Path) -> None:
    config_path = choose_config_path(toolkit_root)
    print(f"Editing: {config_path}")
    while True:
        _, values = read_config_file(config_path)
        keys = sorted(values.keys(), key=str.lower)
        print("")
        print("Settings dashboard")
        print("1) List settings")
        print("2) Edit setting")
        print("3) Add setting")
        print("4) Delete setting")
        print("5) Back")
        choice = ask("Choose", "1")

        if choice == "1":
            if not keys:
                print("No settings found.")
            else:
                for k in keys:
                    print(f"- {k}={values[k]}")
            continue

        if choice == "2":
            if not keys:
                print("No settings to edit.")
                continue
            key = ask("Key to edit")
            if key not in values:
                print("Key not found.")
                continue
            value = ask("New value", values[key])
            write_config_key(config_path, key, value)
            print("Saved.")
            continue

        if choice == "3":
            key = ask("New key")
            if not key:
                print("Key cannot be empty.")
                continue
            value = ask("Value", "")
            write_config_key(config_path, key, value)
            print("Saved.")
            continue

        if choice == "4":
            key = ask("Key to delete")
            if not key:
                print("Key cannot be empty.")
                continue
            delete_config_key(config_path, key)
            print("Deleted (if it existed).")
            continue

        if choice == "5":
            return

        print("Unknown choice.")


def run_zero_touch(
    toolkit_root: Path,
    target_repo: Path,
    *,
    iteration_start: int,
    iteration_count: int,
    repo_name: str | None,
    generate_prompt: bool,
    prompt_file: str | None,
    runtime_mode: str,
    run_agent_flow: bool,
    agent_skip_quality_gates: bool,
    agent_skip_release: bool,
    create_git_snapshots: bool,
    snapshot_branch_prefix: str,
    snapshot_commit_prefix: str,
    allow_recover_stale_flags: bool,
) -> None:
    ensure_git_repo(target_repo)
    repo_name_value = repo_name or target_repo.name
    if iteration_start < 1:
        raise RuntimeError("Iteration start must be >= 1.")
    if iteration_count < 1:
        raise RuntimeError("Iteration count must be >= 1.")
    if runtime_mode not in {"playwright", "cursor-manual"}:
        raise RuntimeError(f"Unsupported runtime mode: {runtime_mode}")
    if run_agent_flow and create_git_snapshots:
        raise RuntimeError("Choose either agent flow or git snapshots. Running both together is not supported.")

    browser_config_path = toolkit_root / "config.browser.txt"
    _, browser_config_values = read_config_file(browser_config_path)
    base_branch = current_branch(target_repo) if create_git_snapshots else ""
    if run_agent_flow:
        ensure_run_iterations_script_available(target_repo)
        ensure_clean_worktree(target_repo)

    flags = acquire_run_flags(
        toolkit_root=toolkit_root,
        target_repo=target_repo,
        mode="zero-touch-browser-run",
        allow_recover_stale_flags=allow_recover_stale_flags,
    )
    try:
        run_script = toolkit_root / "automation" / "run-browser-automation.ps1"
        generate_script = toolkit_root / "automation" / "generate-browser-input.ps1"

        for offset in range(iteration_count):
            iteration = iteration_start + offset
            print("")
            print(f"========== Iteration {iteration} ==========")

            if generate_prompt:
                cmd = [
                    "powershell",
                    "-NoProfile",
                    "-File",
                    str(generate_script),
                    "-Iteration",
                    str(iteration),
                ]
                print("Generating browser input...")
                result = subprocess.run(cmd, cwd=toolkit_root, check=False)
                if result.returncode != 0:
                    raise RuntimeError(f"generate-browser-input.ps1 failed for iteration {iteration}.")

            print("")
            if runtime_mode == "playwright":
                print("Manual login checkpoint:")
                print("- A browser will open.")
                print("- Log in to ChatGPT and open the chat page.")
                print("- In terminal, type OK when ready.")
            else:
                print("Cursor manual mode:")
                print("- Use Cursor embedded browser for this iteration.")
                print("- Complete model + Deep research + Web search + Apps/Sites manually.")
                print("- Copy final markdown result.")
                print("- Paste it into terminal when prompted.")
            print("")

            cmd = [
                "powershell",
                "-NoProfile",
                "-File",
                str(run_script),
                "-Iteration",
                str(iteration),
                "-RootPath",
                str(toolkit_root),
                "-RepoPath",
                str(target_repo),
                "-RepoName",
                repo_name_value,
                "-Runtime",
                runtime_mode,
            ]
            if prompt_file:
                cmd.extend(["-PromptFile", prompt_file])

            print("Running browser automation in zero-touch mode...")
            result = subprocess.run(cmd, cwd=toolkit_root, check=False)
            if result.returncode != 0:
                raise RuntimeError(f"Browser automation run failed for iteration {iteration}.")

            report_name = expected_report_file_name(browser_config_values, iteration)
            report_path = config_output_dir(toolkit_root, browser_config_values) / report_name
            if not report_path.exists():
                raise RuntimeError(f"Expected browser report was not found: {report_path}")

            if run_agent_flow:
                run_agent_flow_for_report(
                    target_repo=target_repo,
                    report_path=report_path,
                    skip_quality_gates=agent_skip_quality_gates,
                    skip_release=agent_skip_release,
                )

            if create_git_snapshots:
                branch_name, commit_message = create_iteration_snapshot(
                    target_repo=target_repo,
                    toolkit_root=toolkit_root,
                    iteration=iteration,
                    branch_prefix=snapshot_branch_prefix,
                    commit_prefix=snapshot_commit_prefix,
                    config_values=browser_config_values,
                    base_branch=base_branch,
                )
                if commit_message:
                    print(f"Snapshot committed on branch '{branch_name}': {commit_message}")
                else:
                    print(f"No changes detected for iteration {iteration}; no commit created.")
    finally:
        release_run_flags(flags)


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default is not None else ""
    try:
        value = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        if default is not None:
            return default
        raise RuntimeError("Input stream closed unexpectedly.")
    if not value and default is not None:
        return default
    return value


def ask_yes_no(prompt: str, default_yes: bool = True) -> bool:
    default = "Y/n" if default_yes else "y/N"
    try:
        value = input(f"{prompt} ({default}): ").strip().lower()
    except EOFError:
        return default_yes
    if not value:
        return default_yes
    return value in {"y", "yes"}


def interactive_menu(toolkit_root: Path) -> int:
    print("Cursor GPT Kit Manager")
    print(f"Toolkit root: {toolkit_root}")
    print("")
    while True:
        print("1) Zero-touch browser run (recommended)")
        print("2) Install kit into target repo")
        print("3) Uninstall kit from target repo")
        print("4) Status")
        print("5) Run-flag status")
        print("6) Clear stale run-flags")
        print("7) Settings dashboard")
        print("8) Exit")
        choice = ask("Choose", "1")
        print("")

        try:
            if choice == "1":
                repo_path = Path(ask("Target repo path"))
                iteration_start = int(ask("Iteration start", "1"))
                iteration_count = int(ask("How many iterations", "1"))
                repo_name = ask("Repo name (blank = folder name)", "")
                generate = ask_yes_no("Generate prompt file first", default_yes=True)
                prompt_file = ask("Prompt file override (optional)", "")
                runtime_choice = ask("Browser mode: 1=External Playwright, 2=Cursor manual", "1")
                runtime_mode = "playwright" if runtime_choice != "2" else "cursor-manual"
                run_agent_flow = ask_yes_no(
                    "Run full agent implementation flow after each browser iteration",
                    default_yes=False,
                )
                agent_skip_quality_gates = False
                agent_skip_release = False
                if run_agent_flow:
                    agent_skip_quality_gates = ask_yes_no("Skip lint/build/test quality gates", default_yes=False)
                    agent_skip_release = ask_yes_no("Skip release (branch/commit/push) in run-iterations", default_yes=False)

                git_snapshots = False
                if run_agent_flow:
                    print("Git snapshots are disabled when full agent flow is enabled.")
                else:
                    git_snapshots = ask_yes_no(
                        "Create git snapshot per iteration in target repo (branch + commit)",
                        default_yes=False,
                    )
                branch_prefix = "automation-iteration"
                commit_prefix = "commit-iteration"
                if git_snapshots:
                    branch_prefix = ask("Snapshot branch prefix", "automation-iteration")
                    commit_prefix = ask("Snapshot commit prefix", "commit-iteration")
                recover_flags = ask_yes_no("Auto-clear stale run-flags if found", default_yes=True)
                run_zero_touch(
                    toolkit_root=toolkit_root,
                    target_repo=repo_path,
                    iteration_start=iteration_start,
                    iteration_count=iteration_count,
                    repo_name=repo_name or None,
                    generate_prompt=generate,
                    prompt_file=prompt_file or None,
                    runtime_mode=runtime_mode,
                    run_agent_flow=run_agent_flow,
                    agent_skip_quality_gates=agent_skip_quality_gates,
                    agent_skip_release=agent_skip_release,
                    create_git_snapshots=git_snapshots,
                    snapshot_branch_prefix=branch_prefix,
                    snapshot_commit_prefix=commit_prefix,
                    allow_recover_stale_flags=recover_flags,
                )
                print("")
                continue

            if choice == "2":
                repo_path = Path(ask("Target repo path"))
                force = ask_yes_no("Allow overwrite of existing files", default_yes=False)
                install_playwright = ask_yes_no(
                    "Install playwright in target repo (changes package.json/lock)",
                    default_yes=False,
                )
                install_kit(
                    toolkit_root=toolkit_root,
                    target_repo=repo_path,
                    force_overwrite=force,
                    dry_run=False,
                    install_playwright=install_playwright,
                )
                print("")
                continue

            if choice == "3":
                repo_path = Path(ask("Target repo path"))
                force_remove = ask_yes_no("Force-remove files modified after install", default_yes=False)
                uninstall_kit(
                    target_repo=repo_path,
                    dry_run=False,
                    force_remove_modified=force_remove,
                )
                print("")
                continue

            if choice == "4":
                repo_path = Path(ask("Target repo path"))
                status_kit(repo_path)
                print("")
                continue

            if choice == "5":
                print_run_flags(toolkit_root)
                print("")
                continue

            if choice == "6":
                if ask_yes_no("Clear local and global run-flag files now", default_yes=False):
                    clear_run_flags(toolkit_root)
                else:
                    print("No changes made.")
                print("")
                continue

            if choice == "7":
                settings_dashboard(toolkit_root)
                print("")
                continue

            if choice == "8":
                print("Bye.")
                return 0

            print("Unknown choice.")
            print("")
        except Exception as exc:  # pylint: disable=broad-except
            print(f"Error: {exc}")
            print("")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Install/uninstall/manage Cursor GPT automation kit.")
    sub = parser.add_subparsers(dest="command")

    install_parser = sub.add_parser("install", help="Install kit into target repo")
    install_parser.add_argument("--target", required=True, help="Path to target git repo")
    install_parser.add_argument("--force-overwrite", action="store_true", help="Overwrite existing target files")
    install_parser.add_argument("--dry-run", action="store_true", help="Show plan only")
    install_parser.add_argument(
        "--install-playwright",
        action="store_true",
        help="Run npm install --save-dev playwright in target repo",
    )

    uninstall_parser = sub.add_parser("uninstall", help="Uninstall kit from target repo")
    uninstall_parser.add_argument("--target", required=True, help="Path to target git repo")
    uninstall_parser.add_argument("--dry-run", action="store_true", help="Show uninstall actions only")
    uninstall_parser.add_argument(
        "--force-remove-modified",
        action="store_true",
        help="Delete files even if modified after install",
    )

    status_parser = sub.add_parser("status", help="Show install status in target repo")
    status_parser.add_argument("--target", required=True, help="Path to target git repo")

    sub.add_parser("flags-status", help="Show local/global automation run-flags")
    sub.add_parser("flags-clear", help="Clear local/global automation run-flags")

    zero_touch_parser = sub.add_parser("zero-touch", help="Run browser flow without installing into target repo")
    zero_touch_parser.add_argument("--target", required=True, help="Path to target git repo")
    zero_touch_parser.add_argument("--iteration-start", type=int, default=1, help="Iteration start number")
    zero_touch_parser.add_argument("--iteration-count", type=int, default=1, help="How many iterations to run")
    zero_touch_parser.add_argument("--repo-name", default="", help="Repository display name override")
    zero_touch_parser.add_argument(
        "--skip-generate-prompt",
        action="store_true",
        help="Skip generate-browser-input step",
    )
    zero_touch_parser.add_argument("--prompt-file", default="", help="Prompt file override")
    zero_touch_parser.add_argument(
        "--runtime",
        choices=["playwright", "cursor-manual"],
        default="playwright",
        help="Browser runtime mode",
    )
    zero_touch_parser.add_argument(
        "--run-agent-flow",
        action="store_true",
        help="After browser capture, run run-iterations.ps1 for each iteration report",
    )
    zero_touch_parser.add_argument(
        "--agent-skip-quality-gates",
        action="store_true",
        help="Skip lint/build/test gates when running run-iterations.ps1",
    )
    zero_touch_parser.add_argument(
        "--agent-skip-release",
        action="store_true",
        help="Skip release publishing when running run-iterations.ps1",
    )
    zero_touch_parser.add_argument(
        "--create-git-snapshots",
        action="store_true",
        help="Create branch + commit in target repo for each iteration",
    )
    zero_touch_parser.add_argument(
        "--snapshot-branch-prefix",
        default="automation-iteration",
        help="Prefix for snapshot branches (suffix is iteration number)",
    )
    zero_touch_parser.add_argument(
        "--snapshot-commit-prefix",
        default="commit-iteration",
        help="Prefix for snapshot commit messages (suffix is iteration number)",
    )
    zero_touch_parser.add_argument(
        "--recover-stale-flags",
        action="store_true",
        help="Auto-clear existing run-flag files before running",
    )

    return parser.parse_args()


def main() -> int:
    toolkit_root = Path(__file__).resolve().parent.parent
    args = parse_args()

    if not args.command:
        return interactive_menu(toolkit_root)

    try:
        if args.command == "install":
            install_kit(
                toolkit_root=toolkit_root,
                target_repo=Path(args.target).resolve(),
                force_overwrite=args.force_overwrite,
                dry_run=args.dry_run,
                install_playwright=args.install_playwright,
            )
            return 0

        if args.command == "uninstall":
            uninstall_kit(
                target_repo=Path(args.target).resolve(),
                dry_run=args.dry_run,
                force_remove_modified=args.force_remove_modified,
            )
            return 0

        if args.command == "status":
            status_kit(Path(args.target).resolve())
            return 0

        if args.command == "flags-status":
            print_run_flags(toolkit_root)
            return 0

        if args.command == "flags-clear":
            clear_run_flags(toolkit_root)
            return 0

        if args.command == "zero-touch":
            run_zero_touch(
                toolkit_root=toolkit_root,
                target_repo=Path(args.target).resolve(),
                iteration_start=args.iteration_start,
                iteration_count=args.iteration_count,
                repo_name=(args.repo_name or None),
                generate_prompt=not args.skip_generate_prompt,
                prompt_file=(args.prompt_file or None),
                runtime_mode=args.runtime,
                run_agent_flow=args.run_agent_flow,
                agent_skip_quality_gates=args.agent_skip_quality_gates,
                agent_skip_release=args.agent_skip_release,
                create_git_snapshots=args.create_git_snapshots,
                snapshot_branch_prefix=args.snapshot_branch_prefix,
                snapshot_commit_prefix=args.snapshot_commit_prefix,
                allow_recover_stale_flags=args.recover_stale_flags,
            )
            return 0

        raise RuntimeError(f"Unknown command: {args.command}")
    except Exception as exc:  # pylint: disable=broad-except
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

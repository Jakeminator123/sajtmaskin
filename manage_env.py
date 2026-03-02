#!/usr/bin/env python3
"""
manage_env.py - Interactive env manager for Sajtmaskin.

Compares local .env files with Vercel, then lets you fix issues interactively.
Supports add/edit/delete on both local files and Vercel project env vars.

Usage:
    python manage_env.py                    # interactive menu
    python manage_env.py --dry-run          # show what would change, touch nothing
    python manage_env.py --fix-report       # JSON report for AI agent consumption

Requires: pip install requests
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("Missing dependency: pip install requests")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
ENV_LOCAL = SCRIPT_DIR / ".env.local"
ENV_PROD = SCRIPT_DIR / ".env.production"

VERCEL_API_BASE = "https://api.vercel.com"
ALL_TARGETS = ["development", "preview", "production"]

BOLD = "\033[1m"
RED = "\033[31m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# .env parser + writer
# ---------------------------------------------------------------------------

class EnvEntry:
    __slots__ = ("key", "value", "line_number", "raw_line")

    def __init__(self, key: str, value: str, line_number: int, raw_line: str):
        self.key = key
        self.value = value
        self.line_number = line_number
        self.raw_line = raw_line


def parse_env_file(path: Path) -> list[EnvEntry]:
    if not path.exists():
        return []
    entries: list[EnvEntry] = []
    for i, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
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
            entries.append(EnvEntry(key, value, i, raw))
    return entries


def entries_to_dict(entries: list[EnvEntry]) -> dict[str, str]:
    d: dict[str, str] = {}
    for e in entries:
        d[e.key] = e.value
    return d


def write_env_key(path: Path, key: str, value: str) -> str:
    """Add or update a single key in a .env file. Returns description of action."""
    needs_quotes = " " in value or '"' in value or "'" in value or "!" in value
    formatted_value = f'"{value}"' if needs_quotes else value
    new_line = f'{key}={formatted_value}'

    if not path.exists():
        path.write_text(new_line + "\n", encoding="utf-8")
        return f"created {path.name} with {key}"

    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    found_idx = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        if "=" in stripped:
            lk = stripped.split("=", 1)[0].strip()
            if lk.lower().startswith("export "):
                lk = lk[7:].strip()
            if lk == key:
                if found_idx is not None:
                    # duplicate -- replace this one with empty (remove duplicate)
                    lines[i] = ""
                    continue
                found_idx = i

    if found_idx is not None:
        lines[found_idx] = new_line + "\n"
        action = f"updated {key} in {path.name}"
    else:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(new_line + "\n")
        action = f"added {key} to {path.name}"

    path.write_text("".join(lines), encoding="utf-8")
    return action


def remove_env_key(path: Path, key: str) -> str:
    """Remove all occurrences of a key from a .env file."""
    if not path.exists():
        return f"{path.name} does not exist"

    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    new_lines = []
    removed = 0
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            lk = stripped.split("=", 1)[0].strip()
            if lk.lower().startswith("export "):
                lk = lk[7:].strip()
            if lk == key:
                removed += 1
                continue
        new_lines.append(line)

    if removed == 0:
        return f"{key} not found in {path.name}"

    path.write_text("".join(new_lines), encoding="utf-8")
    return f"removed {key} from {path.name} ({removed} occurrence(s))"


# ---------------------------------------------------------------------------
# Vercel API (read + write)
# ---------------------------------------------------------------------------

def _vercel_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _vercel_params(team_id: str | None) -> dict[str, str]:
    return {"teamId": team_id} if team_id else {}


def vercel_list_env(token: str, project_id: str, team_id: str | None) -> list[dict[str, Any]] | None:
    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}/env"
    try:
        resp = requests.get(url, headers=_vercel_headers(token), params=_vercel_params(team_id), timeout=15)
    except requests.RequestException as e:
        print(f"  {RED}Vercel API error: {e}{RESET}")
        return None
    if resp.status_code != 200:
        print(f"  {RED}Vercel API {resp.status_code}: {resp.text[:200]}{RESET}")
        return None
    return resp.json().get("envs", [])


def vercel_create_env(token: str, project_id: str, team_id: str | None,
                      key: str, value: str, targets: list[str], env_type: str = "encrypted") -> dict | None:
    url = f"{VERCEL_API_BASE}/v10/projects/{project_id}/env"
    params = _vercel_params(team_id)
    params["upsert"] = "true"
    body = {"key": key, "value": value, "type": env_type, "target": targets}
    try:
        resp = requests.post(url, headers=_vercel_headers(token), params=params, json=body, timeout=15)
    except requests.RequestException as e:
        print(f"  {RED}Vercel create error: {e}{RESET}")
        return None
    if resp.status_code not in (200, 201):
        print(f"  {RED}Vercel create {resp.status_code}: {resp.text[:300]}{RESET}")
        return None
    return resp.json()


def vercel_edit_env(token: str, project_id: str, team_id: str | None,
                    env_id: str, key: str, value: str, targets: list[str], env_type: str = "encrypted") -> dict | None:
    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}/env/{env_id}"
    body = {"key": key, "value": value, "type": env_type, "target": targets}
    try:
        resp = requests.patch(url, headers=_vercel_headers(token), params=_vercel_params(team_id), json=body, timeout=15)
    except requests.RequestException as e:
        print(f"  {RED}Vercel edit error: {e}{RESET}")
        return None
    if resp.status_code != 200:
        print(f"  {RED}Vercel edit {resp.status_code}: {resp.text[:300]}{RESET}")
        return None
    return resp.json()


def vercel_delete_env(token: str, project_id: str, team_id: str | None, env_id: str) -> bool:
    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}/env/{env_id}"
    try:
        resp = requests.delete(url, headers=_vercel_headers(token), params=_vercel_params(team_id), timeout=15)
    except requests.RequestException as e:
        print(f"  {RED}Vercel delete error: {e}{RESET}")
        return False
    if resp.status_code != 200:
        print(f"  {RED}Vercel delete {resp.status_code}: {resp.text[:300]}{RESET}")
        return False
    return True


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def find_duplicates_local(entries: list[EnvEntry]) -> dict[str, list[int]]:
    counts: dict[str, list[int]] = {}
    for e in entries:
        counts.setdefault(e.key, []).append(e.line_number)
    return {k: lines for k, lines in counts.items() if len(lines) > 1}


def find_duplicates_vercel(envs: list[dict[str, Any]]) -> dict[str, list[dict]]:
    by_key: dict[str, list[dict]] = {}
    for e in envs:
        by_key.setdefault(e["key"], []).append(e)
    return {k: entries for k, entries in by_key.items() if len(entries) > 1}


def find_target_gaps(envs: list[dict[str, Any]]) -> dict[str, list[str]]:
    expected = set(ALL_TARGETS)
    gaps: dict[str, list[str]] = {}
    for e in envs:
        targets = set(t.lower() for t in (e.get("target") or []))
        missing = sorted(expected - targets)
        if missing:
            gaps[e["key"]] = missing
    return gaps


# ---------------------------------------------------------------------------
# Interactive helpers
# ---------------------------------------------------------------------------

def confirm(prompt: str) -> bool:
    try:
        answer = input(f"\n  {BOLD}{prompt} [y/N]{RESET} ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print()
        return False
    return answer in ("y", "yes", "ja", "j")


def pick_targets() -> list[str]:
    print(f"  {DIM}Targets: 1=development  2=preview  3=production  a=all{RESET}")
    try:
        choice = input("  > ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        return ALL_TARGETS
    if choice in ("a", "all", ""):
        return ALL_TARGETS
    mapping = {"1": "development", "2": "preview", "3": "production"}
    return [mapping[c] for c in choice.replace(",", " ").split() if c in mapping] or ALL_TARGETS


def input_value(prompt: str, default: str = "") -> str:
    suffix = f" [{default[:40]}...]" if len(default) > 40 else (f" [{default}]" if default else "")
    try:
        val = input(f"  {prompt}{suffix}: ").strip()
    except (KeyboardInterrupt, EOFError):
        return default
    return val if val else default


# ---------------------------------------------------------------------------
# Menu actions
# ---------------------------------------------------------------------------

def action_show_status(local_entries: dict[str, list[EnvEntry]], vercel_envs: list[dict] | None):
    print(f"\n{BOLD}=== Status ==={RESET}\n")

    for label, entries in local_entries.items():
        dupes = find_duplicates_local(entries)
        print(f"  {CYAN}{label}{RESET}: {len(entries)} keys, {len(dupes)} duplicate(s)")
        for k, lines in sorted(dupes.items()):
            print(f"    {RED}DUPLICATE{RESET} {k} on lines {', '.join(str(l) for l in lines)}")

    if vercel_envs is not None:
        vdupes = find_duplicates_vercel(vercel_envs)
        gaps = find_target_gaps(vercel_envs)
        unique_keys = set(e["key"] for e in vercel_envs)
        print(f"\n  {CYAN}Vercel{RESET}: {len(vercel_envs)} entries, {len(unique_keys)} unique keys, {len(vdupes)} duplicate key(s)")
        for k, entries in sorted(vdupes.items()):
            ids = [e.get("id", "?")[:8] for e in entries]
            print(f"    {RED}DUPLICATE{RESET} {k} ({len(entries)}x, ids: {', '.join(ids)})")
        if gaps:
            print(f"  {YELLOW}Target gaps:{RESET}")
            for k, missing in sorted(gaps.items())[:15]:
                print(f"    {k}: missing {', '.join(missing)}")
            if len(gaps) > 15:
                print(f"    ... and {len(gaps) - 15} more")

    all_local_keys: set[str] = set()
    for entries in local_entries.values():
        all_local_keys.update(entries_to_dict(entries).keys())
    if vercel_envs is not None:
        vercel_keys = set(e["key"] for e in vercel_envs)
        only_local = sorted(all_local_keys - vercel_keys)
        only_vercel = sorted(vercel_keys - all_local_keys)
        if only_local:
            print(f"\n  {YELLOW}Only in local ({len(only_local)}):{RESET}")
            for k in only_local[:20]:
                print(f"    {k}")
        if only_vercel:
            print(f"\n  {YELLOW}Only on Vercel ({len(only_vercel)}):{RESET}")
            for k in only_vercel[:20]:
                print(f"    {k}")


def action_fix_local_duplicates(local_entries: dict[str, list[EnvEntry]], dry_run: bool):
    for label, entries in local_entries.items():
        dupes = find_duplicates_local(entries)
        if not dupes:
            continue
        path = ENV_LOCAL if label == ".env.local" else ENV_PROD
        print(f"\n  {BOLD}Fixing duplicates in {label}:{RESET}")
        for key, lines in sorted(dupes.items()):
            last_entry = [e for e in entries if e.key == key][-1]
            print(f"    {key}: keeping line {last_entry.line_number} value, removing {len(lines)-1} earlier occurrence(s)")
            if not dry_run:
                result = write_env_key(path, key, last_entry.value)
                print(f"    {GREEN}{result}{RESET}")
            else:
                print(f"    {DIM}(dry-run, no changes){RESET}")


def action_fix_vercel_duplicates(vercel_envs: list[dict], token: str, project_id: str, team_id: str | None, dry_run: bool):
    vdupes = find_duplicates_vercel(vercel_envs)
    if not vdupes:
        print(f"  {GREEN}No Vercel duplicates found.{RESET}")
        return

    print(f"\n  {BOLD}Vercel duplicate keys:{RESET}")
    for key, entries in sorted(vdupes.items()):
        best = max(entries, key=lambda e: len(e.get("target") or []))
        to_remove = [e for e in entries if e.get("id") != best.get("id")]
        best_targets = ", ".join(best.get("target") or [])
        print(f"    {key}: keeping id={best.get('id', '?')[:8]} (targets: {best_targets}), removing {len(to_remove)} duplicate(s)")

        for dup in to_remove:
            dup_id = dup.get("id", "")
            dup_targets = ", ".join(dup.get("target") or [])
            if dry_run:
                print(f"      {DIM}would delete id={dup_id[:8]} (targets: {dup_targets}){RESET}")
            else:
                if confirm(f"Delete duplicate {key} id={dup_id[:8]} (targets: {dup_targets})?"):
                    if vercel_delete_env(token, project_id, team_id, dup_id):
                        print(f"      {GREEN}Deleted{RESET}")
                    else:
                        print(f"      {RED}Failed{RESET}")


def action_fix_target_gaps(vercel_envs: list[dict], token: str, project_id: str, team_id: str | None, dry_run: bool):
    gaps = find_target_gaps(vercel_envs)
    if not gaps:
        print(f"  {GREEN}No target gaps found.{RESET}")
        return

    print(f"\n  {BOLD}Fix target gaps on Vercel ({len(gaps)} keys):{RESET}")
    for key, missing in sorted(gaps.items()):
        env_entry = next((e for e in vercel_envs if e["key"] == key), None)
        if not env_entry:
            continue
        current_targets = list(env_entry.get("target") or [])
        new_targets = sorted(set(current_targets + missing))
        env_id = env_entry.get("id", "")
        print(f"    {key}: {', '.join(current_targets)} -> {', '.join(new_targets)}")

        if dry_run:
            print(f"      {DIM}(dry-run){RESET}")
        else:
            if confirm(f"Update targets for {key}?"):
                result = vercel_edit_env(token, project_id, team_id, env_id, key,
                                         env_entry.get("value", ""), new_targets,
                                         env_entry.get("type", "encrypted"))
                if result:
                    print(f"      {GREEN}Updated{RESET}")
                else:
                    print(f"      {RED}Failed{RESET}")


def action_push_missing_to_vercel(local_entries: dict[str, list[EnvEntry]], vercel_envs: list[dict],
                                   token: str, project_id: str, team_id: str | None, dry_run: bool):
    all_local: dict[str, str] = {}
    for entries in local_entries.values():
        all_local.update(entries_to_dict(entries))
    vercel_keys = set(e["key"] for e in vercel_envs)

    missing = sorted(set(all_local.keys()) - vercel_keys)
    if not missing:
        print(f"  {GREEN}All local keys exist on Vercel.{RESET}")
        return

    print(f"\n  {BOLD}Keys in local but missing on Vercel ({len(missing)}):{RESET}")
    for i, key in enumerate(missing, 1):
        val = all_local[key]
        val_preview = val[:30] + "..." if len(val) > 30 else val
        print(f"    {i}. {key} = {val_preview}")

    if dry_run:
        print(f"\n  {DIM}(dry-run, no changes){RESET}")
        return

    choice = input_value("Push which? (a=all, comma-separated numbers, s=skip)", "s")
    if choice.lower() in ("s", "skip", ""):
        return

    if choice.lower() in ("a", "all"):
        indices = list(range(len(missing)))
    else:
        indices = []
        for part in choice.replace(" ", "").split(","):
            try:
                idx = int(part) - 1
                if 0 <= idx < len(missing):
                    indices.append(idx)
            except ValueError:
                pass

    targets = pick_targets()

    for idx in indices:
        key = missing[idx]
        value = all_local[key]
        print(f"\n  Pushing {key} to Vercel (targets: {', '.join(targets)})...")
        if confirm(f"Confirm push {key}?"):
            result = vercel_create_env(token, project_id, team_id, key, value, targets)
            if result:
                print(f"    {GREEN}Created/upserted on Vercel{RESET}")
            else:
                print(f"    {RED}Failed{RESET}")


def action_add_or_edit_key(local_entries: dict[str, list[EnvEntry]], vercel_envs: list[dict] | None,
                            token: str, project_id: str, team_id: str | None, dry_run: bool):
    key = input_value("Key name (UPPER_SNAKE_CASE)").strip()
    if not key:
        return

    current_local = ""
    for entries in local_entries.values():
        d = entries_to_dict(entries)
        if key in d:
            current_local = d[key]
            break

    current_vercel = ""
    vercel_entry = None
    if vercel_envs:
        for e in vercel_envs:
            if e["key"] == key:
                vercel_entry = e
                current_vercel = e.get("value", "")
                break

    if current_local:
        print(f"  Current local value: {current_local[:50]}{'...' if len(current_local) > 50 else ''}")
    if vercel_entry:
        targets = ", ".join(vercel_entry.get("target") or [])
        print(f"  Current Vercel targets: {targets}")

    value = input_value("New value", current_local or current_vercel)
    if not value and not confirm("Set empty value?"):
        return

    where = input_value("Where? (1=local-only  2=vercel-only  3=both)", "3")

    if dry_run:
        print(f"  {DIM}(dry-run) Would set {key} in {'local' if where in ('1','3') else ''} {'vercel' if where in ('2','3') else ''}{RESET}")
        return

    if where in ("1", "3"):
        r1 = write_env_key(ENV_LOCAL, key, value)
        print(f"    {GREEN}{r1}{RESET}")
        r2 = write_env_key(ENV_PROD, key, value)
        print(f"    {GREEN}{r2}{RESET}")

    if where in ("2", "3") and token and project_id:
        targets = pick_targets() if not vercel_entry else list(vercel_entry.get("target") or ALL_TARGETS)
        if vercel_entry and vercel_entry.get("id"):
            if confirm(f"Update {key} on Vercel (targets: {', '.join(targets)})?"):
                result = vercel_edit_env(token, project_id, team_id, vercel_entry["id"], key, value, targets)
                print(f"    {GREEN if result else RED}{'Updated' if result else 'Failed'}{RESET}")
        else:
            if confirm(f"Create {key} on Vercel (targets: {', '.join(targets)})?"):
                result = vercel_create_env(token, project_id, team_id, key, value, targets)
                print(f"    {GREEN if result else RED}{'Created' if result else 'Failed'}{RESET}")


def action_delete_key(local_entries: dict[str, list[EnvEntry]], vercel_envs: list[dict] | None,
                       token: str, project_id: str, team_id: str | None, dry_run: bool):
    key = input_value("Key to delete").strip()
    if not key:
        return

    found_local = any(key in entries_to_dict(entries) for entries in local_entries.values())
    found_vercel = None
    if vercel_envs:
        found_vercel = [e for e in vercel_envs if e["key"] == key]

    if not found_local and not found_vercel:
        print(f"  {YELLOW}{key} not found anywhere.{RESET}")
        return

    if found_local:
        print(f"  Found in local files")
    if found_vercel:
        print(f"  Found on Vercel ({len(found_vercel)} entry/entries)")

    if dry_run:
        print(f"  {DIM}(dry-run){RESET}")
        return

    if found_local and confirm(f"Remove {key} from local files?"):
        r1 = remove_env_key(ENV_LOCAL, key)
        print(f"    {GREEN}{r1}{RESET}")
        r2 = remove_env_key(ENV_PROD, key)
        print(f"    {GREEN}{r2}{RESET}")

    if found_vercel and confirm(f"Delete {key} from Vercel ({len(found_vercel)} entries)?"):
        for entry in found_vercel:
            eid = entry.get("id", "")
            if vercel_delete_env(token, project_id, team_id, eid):
                print(f"    {GREEN}Deleted id={eid[:8]}{RESET}")
            else:
                print(f"    {RED}Failed id={eid[:8]}{RESET}")


def generate_fix_report(local_entries: dict[str, list[EnvEntry]], vercel_envs: list[dict] | None) -> dict:
    """Generate machine-readable JSON report of all issues and suggested fixes."""
    report: dict[str, Any] = {"issues": [], "suggested_actions": []}

    for label, entries in local_entries.items():
        for k, lines in find_duplicates_local(entries).items():
            report["issues"].append({
                "type": "local_duplicate",
                "source": label,
                "key": k,
                "lines": lines,
            })
            report["suggested_actions"].append({
                "action": "deduplicate_local",
                "file": label,
                "key": k,
                "keep_line": lines[-1],
            })

    if vercel_envs:
        for k, entries in find_duplicates_vercel(vercel_envs).items():
            report["issues"].append({
                "type": "vercel_duplicate",
                "key": k,
                "count": len(entries),
                "ids": [e.get("id") for e in entries],
            })

        for k, missing in find_target_gaps(vercel_envs).items():
            report["issues"].append({
                "type": "vercel_target_gap",
                "key": k,
                "missing_targets": missing,
            })

        all_local_keys: set[str] = set()
        for entries in local_entries.values():
            all_local_keys.update(entries_to_dict(entries).keys())
        vercel_keys = set(e["key"] for e in vercel_envs)

        for k in sorted(all_local_keys - vercel_keys):
            report["issues"].append({"type": "missing_on_vercel", "key": k})
        for k in sorted(vercel_keys - all_local_keys):
            report["issues"].append({"type": "missing_locally", "key": k})

    return report


# ---------------------------------------------------------------------------
# Auto-fix (non-interactive)
# ---------------------------------------------------------------------------

def _auto_fix_all(
    local_data: dict[str, list[EnvEntry]],
    vercel_envs: list[dict] | None,
    token: str, project_id: str, team_id: str | None,
    path_local: Path, path_prod: Path,
) -> int:
    ok = 0
    fail = 0

    print(f"\n{BOLD}Auto-fix: local duplicates{RESET}")
    for label, entries in local_data.items():
        path = path_local if label == ".env.local" else path_prod
        for key, lines in find_duplicates_local(entries).items():
            last = [e for e in entries if e.key == key][-1]
            result = write_env_key(path, key, last.value)
            print(f"  {GREEN}{result}{RESET}")
            ok += 1

    print(f"\n{BOLD}Auto-fix: sync missing keys between local files{RESET}")
    dict_local = entries_to_dict(local_data.get(".env.local", []))
    dict_prod = entries_to_dict(local_data.get(".env.production", []))
    prod_should_have = [
        "SUPERADMIN_EMAIL", "SUPERADMIN_PASSWORD", "SUPERADMIN_DIAMONDS",
        "TEST_USER_EMAIL", "TEST_USER_PASSWORD", "ADMIN_CREDENTIALS",
        "RESEND_API_KEY",
    ]
    for key in prod_should_have:
        val = dict_local.get(key, "")
        if key not in dict_prod or (not dict_prod[key] and val):
            result = write_env_key(path_prod, key, val)
            print(f"  {GREEN}{result}{RESET}")
            ok += 1

    if not vercel_envs or not token or not project_id:
        print(f"\n{YELLOW}Vercel not connected, skipping remote fixes{RESET}")
        print(f"\n{BOLD}Done: {ok} fixed, {fail} failed{RESET}")
        return 1 if fail else 0

    print(f"\n{BOLD}Auto-fix: Vercel duplicates{RESET}")
    vdupes = find_duplicates_vercel(vercel_envs)
    for key, entries in sorted(vdupes.items()):
        best = max(entries, key=lambda e: len(e.get("target") or []))
        for dup in [e for e in entries if e.get("id") != best.get("id")]:
            dup_id = dup.get("id", "")
            if vercel_delete_env(token, project_id, team_id, dup_id):
                print(f"  {GREEN}Deleted duplicate {key} (id={dup_id[:8]}){RESET}")
                ok += 1
            else:
                print(f"  {RED}Failed to delete {key} (id={dup_id[:8]}){RESET}")
                fail += 1
            time.sleep(0.2)

    print(f"\n{BOLD}Auto-fix: Vercel target gaps -> all environments{RESET}")
    vercel_envs = vercel_list_env(token, project_id, team_id) or []
    for key, missing in sorted(find_target_gaps(vercel_envs).items()):
        entry = next((e for e in vercel_envs if e["key"] == key), None)
        if not entry:
            continue
        result = vercel_create_env(token, project_id, team_id, key,
                                    entry.get("value", ""), ALL_TARGETS,
                                    entry.get("type", "encrypted"))
        if result:
            print(f"  {GREEN}{key} -> all environments{RESET}")
            ok += 1
        else:
            print(f"  {RED}{key} failed{RESET}")
            fail += 1
        time.sleep(0.2)

    print(f"\n{BOLD}Done: {ok} fixed, {fail} failed{RESET}")
    return 1 if fail else 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    os.system("")

    parser = argparse.ArgumentParser(description="Interactive env manager for Sajtmaskin")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without modifying anything")
    parser.add_argument("--fix-report", action="store_true", help="Output JSON fix report (for AI agent)")
    parser.add_argument("--auto-fix", action="store_true", help="Fix all issues automatically (no prompts)")
    parser.add_argument("--env-local", default=str(ENV_LOCAL))
    parser.add_argument("--env-prod", default=str(ENV_PROD))
    args = parser.parse_args()

    path_local = Path(args.env_local)
    path_prod = Path(args.env_prod)

    entries_local = parse_env_file(path_local)
    entries_prod = parse_env_file(path_prod)
    local_data: dict[str, list[EnvEntry]] = {}
    if entries_local:
        local_data[".env.local"] = entries_local
    if entries_prod:
        local_data[".env.production"] = entries_prod

    env_dict = entries_to_dict(entries_local) if entries_local else entries_to_dict(entries_prod)
    vercel_token = env_dict.get("VERCEL_TOKEN", "").strip()
    vercel_project_id = env_dict.get("VERCEL_PROJECT_ID", "").strip()
    vercel_team_id = env_dict.get("VERCEL_TEAM_ID", "").strip() or None

    vercel_envs: list[dict] | None = None
    if vercel_token and vercel_project_id:
        vercel_envs = vercel_list_env(vercel_token, vercel_project_id, vercel_team_id)

    if args.fix_report:
        report = generate_fix_report(local_data, vercel_envs)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 1 if report["issues"] else 0

    if args.auto_fix:
        return _auto_fix_all(local_data, vercel_envs, vercel_token, vercel_project_id, vercel_team_id,
                             path_local, path_prod)

    dry = args.dry_run
    if dry:
        print(f"\n{BOLD}{YELLOW}DRY-RUN MODE -- no changes will be made{RESET}\n")

    print(f"\n{BOLD}Sajtmaskin Env Manager{RESET}")
    print(f"{DIM}Local: {path_local.name} ({len(entries_local)} keys), {path_prod.name} ({len(entries_prod)} keys){RESET}")
    print(f"{DIM}Vercel: {'connected' if vercel_envs is not None else 'not connected'}{RESET}")

    while True:
        print(f"\n{BOLD}{'=' * 50}")
        print(f"  Menu")
        print(f"{'=' * 50}{RESET}")
        print(f"  {CYAN}1{RESET}  Show status & issues")
        print(f"  {CYAN}2{RESET}  Fix local duplicates")
        print(f"  {CYAN}3{RESET}  Fix Vercel duplicates")
        print(f"  {CYAN}4{RESET}  Fix Vercel target gaps")
        print(f"  {CYAN}5{RESET}  Push missing keys to Vercel")
        print(f"  {CYAN}6{RESET}  Add/edit a key (local + Vercel)")
        print(f"  {CYAN}7{RESET}  Delete a key (local + Vercel)")
        print(f"  {CYAN}r{RESET}  Reload all data")
        print(f"  {CYAN}q{RESET}  Quit")

        try:
            choice = input(f"\n  {BOLD}>{RESET} ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print()
            break

        if choice == "q":
            break
        elif choice == "1":
            action_show_status(local_data, vercel_envs)
        elif choice == "2":
            action_fix_local_duplicates(local_data, dry)
        elif choice == "3":
            if vercel_envs is None:
                print(f"  {YELLOW}Vercel not connected{RESET}")
            else:
                action_fix_vercel_duplicates(vercel_envs, vercel_token, vercel_project_id, vercel_team_id, dry)
        elif choice == "4":
            if vercel_envs is None:
                print(f"  {YELLOW}Vercel not connected{RESET}")
            else:
                action_fix_target_gaps(vercel_envs, vercel_token, vercel_project_id, vercel_team_id, dry)
        elif choice == "5":
            if vercel_envs is None:
                print(f"  {YELLOW}Vercel not connected{RESET}")
            else:
                action_push_missing_to_vercel(local_data, vercel_envs, vercel_token, vercel_project_id, vercel_team_id, dry)
        elif choice == "6":
            action_add_or_edit_key(local_data, vercel_envs, vercel_token, vercel_project_id, vercel_team_id, dry)
        elif choice == "7":
            action_delete_key(local_data, vercel_envs, vercel_token, vercel_project_id, vercel_team_id, dry)
        elif choice == "r":
            entries_local = parse_env_file(path_local)
            entries_prod = parse_env_file(path_prod)
            local_data = {}
            if entries_local:
                local_data[".env.local"] = entries_local
            if entries_prod:
                local_data[".env.production"] = entries_prod
            if vercel_token and vercel_project_id:
                vercel_envs = vercel_list_env(vercel_token, vercel_project_id, vercel_team_id)
            print(f"  {GREEN}Reloaded.{RESET}")
        else:
            print(f"  {DIM}Unknown option{RESET}")

    return 0


if __name__ == "__main__":
    sys.exit(main())

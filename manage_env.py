#!/usr/bin/env python3
"""
manage_env.py -- Env control panel for Sajtmaskin.

Single entry point to view, add, update, and sync env vars across:
  - config/env-policy.json  (committed policy)
  - .env.local              (local dev secrets)
  - .env.production         (reference prod values)
  - Vercel project          (live env vars)

Usage:
    python manage_env.py                   # interactive dashboard
    python manage_env.py status            # show full status table
    python manage_env.py add KEY           # guided add to all sources
    python manage_env.py set KEY VALUE     # set in local files
    python manage_env.py push KEY          # push local value to Vercel
    python manage_env.py push --all        # push all missing to Vercel
    python manage_env.py pull              # pull Vercel env to .env.local
    python manage_env.py audit             # read-only env comparison
    python manage_env.py audit --strict    # include over-target/local-only drift checks

Requires: pip install requests
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, OrderedDict
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
ENV_POLICY_FILE = SCRIPT_DIR / "config" / "env-policy.json"
ENV_TS_FILE = SCRIPT_DIR / "src" / "lib" / "env.ts"

VERCEL_API_BASE = "https://api.vercel.com"
V0_API_BASE = "https://api.v0.dev/v1"

BOLD = "\033[1m"
RED = "\033[31m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"

ALL_TARGETS = ["development", "preview", "production"]
DEPLOY_TARGETS = ["preview", "production"]

# ---------------------------------------------------------------------------
# Policy loader
# ---------------------------------------------------------------------------

def load_policy() -> dict[str, Any]:
    if not ENV_POLICY_FILE.exists():
        return {"knownEmptyOk": [], "runtimeOnlyKeys": [], "extraKnownKeys": [], "rules": []}
    return json.loads(ENV_POLICY_FILE.read_text(encoding="utf-8"))


def save_policy(policy: dict[str, Any]) -> None:
    ENV_POLICY_FILE.write_text(
        json.dumps(policy, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def get_rule(policy: dict[str, Any], key: str) -> dict[str, Any]:
    by_key = {r["key"]: r for r in policy.get("rules", [])}
    if key in by_key:
        return by_key[key]
    if key in {"VERCEL", "VERCEL_ENV", "VERCEL_URL"}:
        return {"key": key, "classification": "vercel_managed", "recommendedVercelTargets": []}
    if key.startswith("NEXT_PUBLIC_") or key.endswith("_REDIRECT_URI"):
        return {"key": key, "classification": "environment_specific", "recommendedVercelTargets": DEPLOY_TARGETS}
    if key.startswith("SAJTMASKIN_"):
        return {"key": key, "classification": "environment_specific", "recommendedVercelTargets": DEPLOY_TARGETS}
    if any(t in key for t in ("TOKEN", "SECRET", "PASSWORD", "KEY", "URL")):
        return {"key": key, "classification": "optional_runtime", "recommendedVercelTargets": ALL_TARGETS}
    return {"key": key, "classification": "optional_runtime", "recommendedVercelTargets": ALL_TARGETS}


# ---------------------------------------------------------------------------
# .env file helpers
# ---------------------------------------------------------------------------

def parse_env_file(path: Path) -> OrderedDict[str, str]:
    if not path.exists():
        return OrderedDict()
    result: OrderedDict[str, str] = OrderedDict()
    for raw in path.read_text(encoding="utf-8").splitlines():
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
            result[key] = value
    return result


def set_in_env_file(path: Path, key: str, value: str) -> None:
    lines: list[str] = []
    found = False
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            stripped = raw.strip()
            check = stripped
            if check.lower().startswith("export "):
                check = check[7:].strip()
            if "=" in check and check.split("=", 1)[0].strip() == key:
                needs_quote = " " in value or '"' in value or "'" in value or not value
                quoted = f'"{value}"' if needs_quote else value
                lines.append(f"{key}={quoted}")
                found = True
            else:
                lines.append(raw)
    if not found:
        needs_quote = " " in value or '"' in value or "'" in value or not value
        quoted = f'"{value}"' if needs_quote else value
        lines.append(f"{key}={quoted}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def remove_from_env_file(path: Path, key: str) -> bool:
    if not path.exists():
        return False
    original = path.read_text(encoding="utf-8").splitlines()
    filtered = []
    removed = False
    for raw in original:
        stripped = raw.strip()
        check = stripped
        if check.lower().startswith("export "):
            check = check[7:].strip()
        if "=" in check and check.split("=", 1)[0].strip() == key:
            removed = True
            continue
        filtered.append(raw)
    if removed:
        path.write_text("\n".join(filtered) + "\n", encoding="utf-8")
    return removed


# ---------------------------------------------------------------------------
# Vercel API helpers
# ---------------------------------------------------------------------------

def vercel_creds() -> tuple[str, str, str | None]:
    env = parse_env_file(ENV_LOCAL)
    token = env.get("VERCEL_TOKEN", "").strip()
    project_id = env.get("VERCEL_PROJECT_ID", "").strip()
    team_id = env.get("VERCEL_TEAM_ID", "").strip() or None
    return token, project_id, team_id


def fetch_vercel_envs(token: str, project_id: str, team_id: str | None) -> list[dict[str, Any]] | None:
    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}/env"
    params: dict[str, str] = {"limit": "100"}
    if team_id:
        params["teamId"] = team_id
    all_envs: list[dict[str, Any]] = []
    while url:
        try:
            resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=15)
        except requests.RequestException as e:
            print(f"  {RED}Vercel API error: {e}{RESET}")
            return None
        if resp.status_code != 200:
            print(f"  {RED}Vercel API {resp.status_code}: {resp.text[:200]}{RESET}")
            return None
        data = resp.json()
        all_envs.extend(data.get("envs", []))
        nxt = data.get("pagination", {}).get("next")
        if nxt:
            params["until"] = str(nxt)
        else:
            url = ""
    return all_envs


def delete_vercel_env_by_id(token: str, project_id: str, team_id: str | None, env_id: str) -> bool:
    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}/env/{env_id}"
    params: dict[str, str] = {}
    if team_id:
        params["teamId"] = team_id
    try:
        resp = requests.delete(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            params=params,
            timeout=15,
        )
    except requests.RequestException as e:
        print(f"  {RED}Vercel API error: {e}{RESET}")
        return False
    if resp.status_code in (200, 204):
        return True
    print(f"  {RED}Vercel API {resp.status_code}: {resp.text[:200]}{RESET}")
    return False


def fetch_v0_envs(api_key: str, project_id: str) -> list[dict[str, Any]] | None:
    url = f"{V0_API_BASE}/projects/{project_id}/env-vars"
    try:
        resp = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
    except requests.RequestException as e:
        print(f"  {RED}v0 API error: {e}{RESET}")
        return None

    if resp.status_code != 200:
        print(f"  {RED}v0 API {resp.status_code}: {resp.text[:200]}{RESET}")
        return None

    data = resp.json()
    if isinstance(data, list):
        return data
    return data.get("envVars", data.get("data", []))


def push_to_vercel(token: str, project_id: str, team_id: str | None,
                   key: str, value: str, targets: list[str], var_type: str = "encrypted") -> bool:
    url = f"{VERCEL_API_BASE}/v10/projects/{project_id}/env"
    params: dict[str, str] = {}
    if team_id:
        params["teamId"] = team_id
    payload = {"key": key, "value": value, "target": targets, "type": var_type}
    try:
        resp = requests.post(url, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, params=params, json=payload, timeout=15)
    except requests.RequestException as e:
        print(f"  {RED}Vercel API error: {e}{RESET}")
        return False
    if resp.status_code in (200, 201):
        return True
    if resp.status_code == 409:
        print(f"  {YELLOW}{key} already exists on target(s); skipping (use Vercel UI to update).{RESET}")
        return False
    print(f"  {RED}Vercel API {resp.status_code}: {resp.text[:200]}{RESET}")
    return False


# ---------------------------------------------------------------------------
# Zod schema checker
# ---------------------------------------------------------------------------

def env_ts_keys() -> set[str]:
    if not ENV_TS_FILE.exists():
        return set()
    content = ENV_TS_FILE.read_text(encoding="utf-8")
    return set(re.findall(r"^\s+(\w+):\s*z\.", content, re.MULTILINE))


# ---------------------------------------------------------------------------
# Status command
# ---------------------------------------------------------------------------

def build_status_table(policy: dict[str, Any]) -> list[dict[str, Any]]:
    local = parse_env_file(ENV_LOCAL)
    prod = parse_env_file(ENV_PROD)
    schema_keys = env_ts_keys()
    known_empty = set(policy.get("knownEmptyOk", []))
    runtime_only = set(policy.get("runtimeOnlyKeys", []))
    policy_keys = set(r["key"] for r in policy.get("rules", []))
    extra_keys = set(policy.get("extraKnownKeys", []))

    all_keys = sorted(set(local.keys()) | set(prod.keys()) | schema_keys | policy_keys | extra_keys)

    token, project_id, team_id = vercel_creds()
    vercel_map: dict[str, list[str]] = {}
    if token and project_id:
        envs = fetch_vercel_envs(token, project_id, team_id)
        if envs:
            for e in envs:
                k = e["key"]
                targets = e.get("target", [])
                if isinstance(targets, str):
                    targets = [targets]
                vercel_map.setdefault(k, []).extend(targets)

    rows: list[dict[str, Any]] = []
    for key in all_keys:
        rule = get_rule(policy, key)
        cls = rule.get("classification", "?")
        rec_targets = rule.get("recommendedVercelTargets", [])

        in_local = key in local and bool(local[key])
        in_prod = key in prod and bool(prod[key])
        in_schema = key in schema_keys
        in_vercel = key in vercel_map
        vercel_targets = sorted(set(vercel_map.get(key, [])))
        target_ok = not rec_targets or set(rec_targets).issubset(set(vercel_targets))

        is_empty_ok = key in known_empty
        is_runtime_only = key in runtime_only

        status = "ok"
        if cls == "local_only" and in_vercel:
            status = "LOCAL_ONLY_ON_VERCEL"
        elif cls == "shared_runtime" and not in_vercel:
            status = "MISSING_VERCEL"
        elif cls == "shared_runtime" and not target_ok:
            status = "TARGET_GAP"
        elif cls == "environment_specific" and in_vercel and rec_targets and not target_ok:
            status = "TARGET_GAP"
        elif in_vercel and rec_targets and (set(vercel_targets) - set(rec_targets)):
            status = "TARGET_OVERREACH"
        elif cls == "shared_runtime" and not in_local and not is_empty_ok:
            status = "MISSING_LOCAL"

        rows.append({
            "key": key,
            "classification": cls,
            "in_schema": in_schema,
            "in_local": in_local,
            "in_prod": in_prod,
            "in_vercel": in_vercel,
            "vercel_targets": ",".join(vercel_targets) if vercel_targets else "-",
            "recommended_targets": ",".join(rec_targets) if rec_targets else "-",
            "status": status,
        })

    return rows


def cmd_status(_args: argparse.Namespace) -> int:
    policy = load_policy()
    rows = build_status_table(policy)

    col_w = {"key": 42, "cls": 22, "schema": 6, "local": 6, "prod": 6, "vercel": 6, "targets": 28, "status": 16}
    header = (
        f"{'KEY':<{col_w['key']}} "
        f"{'CLASS':<{col_w['cls']}} "
        f"{'SCHEMA':<{col_w['schema']}} "
        f"{'LOCAL':<{col_w['local']}} "
        f"{'PROD':<{col_w['prod']}} "
        f"{'VRCL':<{col_w['vercel']}} "
        f"{'VERCEL TARGETS':<{col_w['targets']}} "
        f"{'STATUS':<{col_w['status']}}"
    )
    print(f"\n{BOLD}{header}{RESET}")
    print("-" * len(header))

    for r in rows:
        s_color = GREEN if r["status"] == "ok" else (RED if ("MISSING" in r["status"] or "GAP" in r["status"] or "OVERREACH" in r["status"] or "LOCAL_ONLY" in r["status"]) else YELLOW)
        check = lambda b: f"{GREEN}Y{RESET}" if b else f"{DIM}-{RESET}"
        print(
            f"{r['key']:<{col_w['key']}} "
            f"{r['classification']:<{col_w['cls']}} "
            f"{check(r['in_schema']):<{col_w['schema']+9}} "
            f"{check(r['in_local']):<{col_w['local']+9}} "
            f"{check(r['in_prod']):<{col_w['prod']+9}} "
            f"{check(r['in_vercel']):<{col_w['vercel']+9}} "
            f"{r['vercel_targets']:<{col_w['targets']}} "
            f"{s_color}{r['status']}{RESET}"
        )

    problems = [r for r in rows if r["status"] != "ok"]
    print(f"\n{BOLD}Total: {len(rows)} vars, {GREEN}{len(rows)-len(problems)} ok{RESET}{BOLD}, ", end="")
    if problems:
        print(f"{YELLOW}{len(problems)} need attention{RESET}")
    else:
        print(f"{GREEN}all clean{RESET}")
    return 0


# ---------------------------------------------------------------------------
# Add command
# ---------------------------------------------------------------------------

CLASSIFICATIONS = ["shared_runtime", "optional_runtime", "environment_specific", "local_only"]

def cmd_add(args: argparse.Namespace) -> int:
    key = args.key.strip().upper()
    policy = load_policy()
    existing_keys = {r["key"] for r in policy.get("rules", [])}

    print(f"\n{BOLD}Adding: {key}{RESET}\n")

    if key in existing_keys:
        print(f"  {YELLOW}{key} already has a policy rule.{RESET}")
    else:
        print(f"  Classification options:")
        for i, c in enumerate(CLASSIFICATIONS):
            print(f"    {i+1}. {c}")
        choice = input(f"  Pick classification [1-{len(CLASSIFICATIONS)}] (default 2): ").strip()
        idx = int(choice) - 1 if choice.isdigit() and 1 <= int(choice) <= len(CLASSIFICATIONS) else 1
        cls = CLASSIFICATIONS[idx]

        if cls == "local_only":
            targets: list[str] = []
        elif cls == "environment_specific":
            targets = DEPLOY_TARGETS[:]
        else:
            targets = ALL_TARGETS[:]

        notes = input(f"  Notes (optional): ").strip() or f"Added via manage_env.py"

        new_rule: dict[str, Any] = {
            "key": key,
            "classification": cls,
            "recommendedVercelTargets": targets,
            "notes": notes,
        }
        policy.setdefault("rules", []).append(new_rule)
        policy["rules"].sort(key=lambda r: r["key"])
        if key not in set(policy.get("extraKnownKeys", [])):
            policy.setdefault("extraKnownKeys", []).append(key)
            policy["extraKnownKeys"].sort()
        save_policy(policy)
        print(f"  {GREEN}Policy updated.{RESET}")

    value = input(f"  Value for .env.local (leave empty to skip): ").strip()
    if value:
        set_in_env_file(ENV_LOCAL, key, value)
        print(f"  {GREEN}Set in .env.local{RESET}")

    prod_value = input(f"  Value for .env.production (Enter = same, 's' = skip): ").strip()
    if prod_value == "s":
        pass
    elif prod_value:
        set_in_env_file(ENV_PROD, key, prod_value)
        print(f"  {GREEN}Set in .env.production{RESET}")
    elif value:
        set_in_env_file(ENV_PROD, key, value)
        print(f"  {GREEN}Set in .env.production (same as local){RESET}")

    push_q = input(f"  Push to Vercel? [y/N]: ").strip().lower()
    if push_q == "y" and value:
        token, project_id, team_id = vercel_creds()
        if token and project_id:
            rule = get_rule(policy, key)
            vercel_targets = rule.get("recommendedVercelTargets", ALL_TARGETS)
            if push_to_vercel(token, project_id, team_id, key, value, vercel_targets):
                print(f"  {GREEN}Pushed to Vercel ({', '.join(vercel_targets)}){RESET}")
        else:
            print(f"  {YELLOW}Missing VERCEL_TOKEN or VERCEL_PROJECT_ID in .env.local{RESET}")

    print(f"\n  {DIM}Remember to add {key} to src/lib/env.ts if the app reads it at runtime.{RESET}")
    return 0


# ---------------------------------------------------------------------------
# Set command
# ---------------------------------------------------------------------------

def cmd_set(args: argparse.Namespace) -> int:
    key = args.key.strip()
    value = args.value
    targets = []
    if args.local:
        targets.append("local")
    if args.prod:
        targets.append("prod")
    if not targets:
        targets = ["local", "prod"]

    for t in targets:
        path = ENV_LOCAL if t == "local" else ENV_PROD
        set_in_env_file(path, key, value)
        print(f"  {GREEN}{key} set in {path.name}{RESET}")
    return 0


# ---------------------------------------------------------------------------
# Push command
# ---------------------------------------------------------------------------

def cmd_push(args: argparse.Namespace) -> int:
    token, project_id, team_id = vercel_creds()
    if not token or not project_id:
        print(f"{RED}Missing VERCEL_TOKEN or VERCEL_PROJECT_ID in .env.local{RESET}")
        return 1

    policy = load_policy()
    local = parse_env_file(ENV_LOCAL)

    envs = fetch_vercel_envs(token, project_id, team_id)
    if envs is None:
        return 1
    vercel_keys = {e["key"] for e in envs}

    if args.all:
        candidates = []
        for key, value in local.items():
            if not value:
                continue
            rule = get_rule(policy, key)
            if rule.get("classification") in ("local_only", "vercel_managed"):
                continue
            if key not in vercel_keys:
                candidates.append((key, value, rule))

        if not candidates:
            print(f"  {GREEN}Nothing to push -- Vercel is up to date.{RESET}")
            return 0

        print(f"\n{BOLD}Keys to push:{RESET}")
        for key, _, rule in candidates:
            targets = rule.get("recommendedVercelTargets", ALL_TARGETS)
            print(f"  {key} -> {', '.join(targets)}")

        confirm = input(f"\nPush {len(candidates)} key(s)? [y/N]: ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return 0

        pushed = 0
        for key, value, rule in candidates:
            targets = rule.get("recommendedVercelTargets", ALL_TARGETS)
            if push_to_vercel(token, project_id, team_id, key, value, targets):
                pushed += 1
                print(f"  {GREEN}{key} pushed{RESET}")
        print(f"\n{pushed}/{len(candidates)} pushed.")
    else:
        key = args.key
        if not key:
            print(f"{RED}Specify a KEY or use --all{RESET}")
            return 1
        value = local.get(key, "")
        if not value:
            print(f"{RED}{key} has no value in .env.local{RESET}")
            return 1
        rule = get_rule(policy, key)
        targets = rule.get("recommendedVercelTargets", ALL_TARGETS)
        if push_to_vercel(token, project_id, team_id, key, value, targets):
            print(f"  {GREEN}{key} pushed to Vercel ({', '.join(targets)}){RESET}")
    return 0


# ---------------------------------------------------------------------------
# Pull command
# ---------------------------------------------------------------------------

def cmd_pull(_args: argparse.Namespace) -> int:
    token, project_id, team_id = vercel_creds()
    if not token or not project_id:
        print(f"{RED}Missing VERCEL_TOKEN or VERCEL_PROJECT_ID in .env.local{RESET}")
        return 1

    envs = fetch_vercel_envs(token, project_id, team_id)
    if envs is None:
        return 1

    local = parse_env_file(ENV_LOCAL)
    new_keys: list[str] = []
    for e in envs:
        key = e["key"]
        if key not in local:
            new_keys.append(key)

    if not new_keys:
        print(f"  {GREEN}Local file already has all Vercel keys.{RESET}")
        return 0

    print(f"\n{BOLD}Keys on Vercel but not in .env.local:{RESET}")
    for k in sorted(new_keys):
        print(f"  {k}")

    print(f"\n  {DIM}Values are encrypted on Vercel and cannot be pulled automatically.")
    print(f"  Use 'vercel env pull' or set them manually.{RESET}")
    return 0


# ---------------------------------------------------------------------------
# Audit command (read-only comparison in this script)
# ---------------------------------------------------------------------------

class AuditEnvEntry:
    __slots__ = ("key", "value", "line_number", "raw_line")

    def __init__(self, key: str, value: str, line_number: int, raw_line: str):
        self.key = key
        self.value = value
        self.line_number = line_number
        self.raw_line = raw_line


def parse_env_entries(path: Path) -> list[AuditEnvEntry]:
    if not path.exists():
        return []

    entries: list[AuditEnvEntry] = []
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
            entries.append(AuditEnvEntry(key, value, i, raw))
    return entries


def audit_entries_to_dict(entries: list[AuditEnvEntry]) -> dict[str, str]:
    data: dict[str, str] = {}
    for e in entries:
        data[e.key] = e.value
    return data


def expects_target(policy: dict[str, Any], key: str, target: str) -> bool:
    rule = get_rule(policy, key)
    return target in set(rule.get("recommendedVercelTargets", []))


def expected_target_gap(policy: dict[str, Any], key: str, actual_targets: list[str]) -> list[str]:
    rule = get_rule(policy, key)
    expected = set(rule.get("recommendedVercelTargets", []))
    actual = set(t.lower() for t in actual_targets)
    return sorted(expected - actual)


def expected_target_overreach(policy: dict[str, Any], key: str, actual_targets: list[str]) -> list[str]:
    rule = get_rule(policy, key)
    expected = set(rule.get("recommendedVercelTargets", []))
    if not expected:
        return []
    actual = set(t.lower() for t in actual_targets)
    return sorted(actual - expected)


def should_compare_between_local_files(policy: dict[str, Any], key: str) -> bool:
    return get_rule(policy, key).get("classification") == "shared_runtime"


def should_track_remote(policy: dict[str, Any], key: str) -> bool:
    return get_rule(policy, key).get("classification") == "shared_runtime"


def should_track_target_coverage(policy: dict[str, Any], key: str) -> bool:
    rule = get_rule(policy, key)
    if rule.get("classification") == "shared_runtime":
        return True
    if rule.get("classification") != "environment_specific":
        return False
    return any(target in {"preview", "production"} for target in rule.get("recommendedVercelTargets", []))


def audit_local_health(label: str, entries: list[AuditEnvEntry], known_empty_ok: set[str]) -> list[str]:
    issues: list[str] = []
    counts = Counter(e.key for e in entries)
    for key, count in counts.items():
        if count > 1:
            lines = [str(e.line_number) for e in entries if e.key == key]
            issues.append(f"DUPLICATE  {label}:{key} appears {count}x (lines {', '.join(lines)})")

    for e in entries:
        if not e.value and e.key not in known_empty_ok:
            issues.append(f"EMPTY      {label}:{e.key} (line {e.line_number}) has no value")
        if e.raw_line != e.raw_line.rstrip():
            issues.append(f"TRAILING   {label}:{e.key} (line {e.line_number}) has trailing whitespace")
        if "\n" in e.value or "\r" in e.value:
            issues.append(f"NEWLINE    {label}:{e.key} (line {e.line_number}) value contains embedded newline")
        if e.value and re.match(r"^\$\{?[A-Z_]+\}?$", e.value):
            issues.append(f"UNRESOLVED {label}:{e.key} (line {e.line_number}) looks like uninterpolated variable: {e.value}")

    return issues


def audit_local_vs_local(
    policy: dict[str, Any],
    runtime_only: set[str],
    entries_a: list[AuditEnvEntry],
    entries_b: list[AuditEnvEntry],
    label_a: str,
    label_b: str,
    verbose: bool,
) -> list[str]:
    issues: list[str] = []
    keys_a = set(audit_entries_to_dict(entries_a).keys())
    keys_b = set(audit_entries_to_dict(entries_b).keys())
    dict_a = audit_entries_to_dict(entries_a)
    dict_b = audit_entries_to_dict(entries_b)

    only_a = sorted(keys_a - keys_b - runtime_only)
    only_b = sorted(keys_b - keys_a - runtime_only)
    target_a = "development" if label_a == ".env.local" else "production"
    target_b = "development" if label_b == ".env.local" else "production"

    for key in only_a:
        if expects_target(policy, key, target_b) and should_compare_between_local_files(policy, key):
            issues.append(f"ONLY_IN    {label_a}: {key}")
    for key in only_b:
        if expects_target(policy, key, target_a) and should_compare_between_local_files(policy, key):
            issues.append(f"ONLY_IN    {label_b}: {key}")

    if verbose:
        for key in sorted(keys_a & keys_b):
            va = dict_a[key]
            vb = dict_b[key]
            if va != vb:
                va_short = va[:40] + "..." if len(va) > 40 else va
                vb_short = vb[:40] + "..." if len(vb) > 40 else vb
                issues.append(f"MISMATCH   {key}: {label_a}={va_short} vs {label_b}={vb_short}")

    return issues


def audit_local_vs_remote(
    policy: dict[str, Any],
    runtime_only: set[str],
    local_keys: set[str],
    remote_keys: set[str],
    remote_label: str,
    remote_targets: dict[str, list[str]] | None = None,
    strict: bool = False,
) -> list[str]:
    issues: list[str] = []
    missing_remote = sorted(
        key
        for key in local_keys
        if key not in remote_keys and key not in runtime_only and should_track_remote(policy, key)
    )
    missing_local = sorted(
        key for key in remote_keys - local_keys if get_rule(policy, key).get("classification") == "shared_runtime"
    )

    for key in missing_remote:
        issues.append(f"MISSING_REMOTE  {key} is in local files but NOT on {remote_label}")
    for key in missing_local:
        issues.append(f"MISSING_LOCAL   {key} is on {remote_label} but NOT in local files")

    if remote_targets:
        for key, targets in sorted(remote_targets.items()):
            missing_targets = expected_target_gap(policy, key, targets or [])
            if missing_targets and should_track_target_coverage(policy, key):
                issues.append(
                    f"TARGET_GAP      {key} on {remote_label} missing targets: {', '.join(sorted(missing_targets))}"
                )
            if strict:
                extra_targets = expected_target_overreach(policy, key, targets or [])
                if extra_targets:
                    issues.append(
                        f"TARGET_OVERREACH {key} on {remote_label} has extra targets: {', '.join(extra_targets)}"
                    )
                if get_rule(policy, key).get("classification") == "local_only":
                    issues.append(f"LOCAL_ONLY_ON_REMOTE {key} should not exist on {remote_label}")

    return issues


def print_audit_section(title: str) -> None:
    print(f"\n{BOLD}{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}{RESET}\n")


def print_audit_issues(issues: list[str], indent: str = "  ") -> int:
    if not issues:
        print(f"{indent}{GREEN}No issues found.{RESET}")
        return 0

    for issue in issues:
        if issue.startswith(("DUPLICATE", "NEWLINE", "UNRESOLVED")):
            color = RED
        elif issue.startswith(("EMPTY", "TRAILING", "MISSING_LOCAL", "ONLY_IN")):
            color = YELLOW
        elif issue.startswith(("MISSING_REMOTE", "TARGET_GAP", "TARGET_OVERREACH", "LOCAL_ONLY_ON_REMOTE")):
            color = RED
        elif issue.startswith("MISMATCH"):
            color = CYAN
        else:
            color = ""
        print(f"{indent}{color}{issue}{RESET}")
    return len(issues)


def build_vercel_cleanup_plan(policy: dict[str, Any], remote_targets: dict[str, list[str]]) -> list[str]:
    commands: list[str] = []
    for key, targets in sorted(remote_targets.items()):
        cls = get_rule(policy, key).get("classification")
        if cls == "local_only":
            for target in sorted(set(targets)):
                commands.append(f"vercel env rm {key} {target}")
            continue

        extra_targets = expected_target_overreach(policy, key, targets)
        for target in extra_targets:
            commands.append(f"vercel env rm {key} {target}")

    # Keep stable order and remove duplicates.
    seen: set[str] = set()
    unique: list[str] = []
    for cmd in commands:
        if cmd in seen:
            continue
        seen.add(cmd)
        unique.append(cmd)
    return unique


def build_vercel_cleanup_actions(
    policy: dict[str, Any],
    vercel_envs: list[dict[str, Any]],
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []

    for item in vercel_envs:
        key = str(item.get("key", "")).strip()
        env_id = str(item.get("id", "")).strip()
        raw_targets = item.get("target")
        if not key or not env_id:
            continue
        targets: list[str]
        if isinstance(raw_targets, list):
            targets = [str(t).lower() for t in raw_targets]
        elif isinstance(raw_targets, str):
            targets = [raw_targets.lower()]
        else:
            targets = []

        rule = get_rule(policy, key)
        cls = str(rule.get("classification", ""))
        recommended = set(str(t).lower() for t in rule.get("recommendedVercelTargets", []))

        remove = False
        reason = ""
        if cls == "local_only":
            remove = True
            reason = "local_only"
            note = "safe_delete"
        elif recommended and any(t not in recommended for t in targets):
            actual = set(targets)
            overlap = actual & recommended
            remove = True
            reason = "target_overreach"
            # Deleting an entry with mixed targets removes both valid+invalid targets.
            note = "unsafe_mixed_targets" if overlap else "safe_delete"
        else:
            note = "safe_delete"

        if remove:
            actions.append(
                {
                    "id": env_id,
                    "key": key,
                    "targets": ",".join(sorted(set(targets))) if targets else "-",
                    "reason": reason,
                    "note": note,
                }
            )

    # stable unique by env id
    by_id: dict[str, dict[str, str]] = {}
    for action in actions:
        by_id[action["id"]] = action
    return sorted(by_id.values(), key=lambda a: (a["key"], a["targets"], a["id"]))


def cmd_audit(args: argparse.Namespace) -> int:
    policy = load_policy()
    known_empty_ok = set(policy.get("knownEmptyOk", []))
    runtime_only = set(policy.get("runtimeOnlyKeys", []))

    path_local = Path(args.env_local)
    path_prod = Path(args.env_prod)

    print(f"\n{BOLD}Sajtmaskin Env Audit (read-only){RESET}")
    print(f"{DIM}Local:  {path_local}{RESET}")
    print(f"{DIM}Prod:   {path_prod}{RESET}")

    entries_local = parse_env_entries(path_local)
    entries_prod = parse_env_entries(path_prod)

    if not entries_local and not entries_prod:
        print(f"\n{RED}No env files found. Nothing to check.{RESET}")
        return 1

    total_issues = 0

    print_audit_section("1. Local file health")
    if entries_local:
        print(f"  {BOLD}.env.local ({len(entries_local)} entries){RESET}")
        total_issues += print_audit_issues(audit_local_health(".env.local", entries_local, known_empty_ok), "    ")
    else:
        print(f"  {YELLOW}.env.local not found{RESET}")

    if entries_prod:
        print(f"\n  {BOLD}.env.production ({len(entries_prod)} entries){RESET}")
        total_issues += print_audit_issues(
            audit_local_health(".env.production", entries_prod, known_empty_ok),
            "    ",
        )
    else:
        print(f"\n  {YELLOW}.env.production not found{RESET}")

    if entries_local and entries_prod:
        print_audit_section("2. Local vs Local (.env.local vs .env.production)")
        issues = audit_local_vs_local(
            policy,
            runtime_only,
            entries_local,
            entries_prod,
            ".env.local",
            ".env.production",
            args.verbose,
        )
        total_issues += print_audit_issues(issues)

    env_dict = audit_entries_to_dict(entries_local) if entries_local else audit_entries_to_dict(entries_prod)
    vercel_token = env_dict.get("VERCEL_TOKEN", "").strip()
    vercel_project_id = env_dict.get("VERCEL_PROJECT_ID", "").strip()
    vercel_team_id = env_dict.get("VERCEL_TEAM_ID", "").strip() or None
    v0_api_key = env_dict.get("V0_API_KEY", "").strip()

    all_local_keys = set(audit_entries_to_dict(entries_local).keys()) | set(audit_entries_to_dict(entries_prod).keys())

    if not args.local_only:
        print_audit_section("3. Local vs Vercel")
        if not vercel_token:
            print(f"  {YELLOW}Skipped: VERCEL_TOKEN not found in local env files{RESET}")
        elif not vercel_project_id:
            print(f"  {YELLOW}Skipped: VERCEL_PROJECT_ID not found in local env files{RESET}")
        else:
            print(f"  {DIM}Fetching env vars from Vercel project {vercel_project_id}...{RESET}")
            vercel_envs = fetch_vercel_envs(vercel_token, vercel_project_id, vercel_team_id)
            if vercel_envs is not None:
                remote_keys = set(item["key"] for item in vercel_envs)
                remote_targets: dict[str, list[str]] = {}
                for item in vercel_envs:
                    key = item["key"]
                    seen = set(remote_targets.get(key, []))
                    raw_targets = item.get("target")
                    if isinstance(raw_targets, list):
                        seen.update(str(t).lower() for t in raw_targets)
                    elif isinstance(raw_targets, str):
                        seen.add(raw_targets.lower())
                    remote_targets[key] = sorted(seen)

                print(f"  {DIM}Found {len(vercel_envs)} env vars on Vercel{RESET}\n")
                issues = audit_local_vs_remote(
                    policy,
                    runtime_only,
                    all_local_keys,
                    remote_keys,
                    "Vercel",
                    remote_targets,
                    strict=args.strict,
                )
                total_issues += print_audit_issues(issues)
                if args.strict:
                    cleanup_plan = build_vercel_cleanup_plan(policy, remote_targets)
                    if cleanup_plan:
                        print(f"\n  {BOLD}Suggested Vercel cleanup commands (manual review first):{RESET}")
                        for cmd in cleanup_plan:
                            print(f"    {cmd}")
            else:
                print(f"  {RED}Failed to fetch Vercel env vars (see error above){RESET}")
                total_issues += 1

        if args.v0_project_id:
            print_audit_section("4. Local vs v0")
            if not v0_api_key:
                print(f"  {YELLOW}Skipped: V0_API_KEY not found in local env files{RESET}")
            else:
                print(f"  {DIM}Fetching env vars from v0 project {args.v0_project_id}...{RESET}")
                v0_envs = fetch_v0_envs(v0_api_key, args.v0_project_id)
                if v0_envs is not None:
                    remote_keys = set()
                    for item in v0_envs:
                        key = item.get("key") or item.get("name", "")
                        if key:
                            remote_keys.add(key)
                    print(f"  {DIM}Found {len(v0_envs)} env vars on v0{RESET}\n")
                    issues = audit_local_vs_remote(
                        policy,
                        runtime_only,
                        all_local_keys,
                        remote_keys,
                        "v0",
                        strict=False,
                    )
                    total_issues += print_audit_issues(issues)
                else:
                    print(f"  {RED}Failed to fetch v0 env vars (see error above){RESET}")
                    total_issues += 1
    else:
        print(f"\n{DIM}  (API checks skipped: --local-only){RESET}")

    print_audit_section("Summary")
    if total_issues == 0:
        print(f"  {GREEN}All clean! No issues detected.{RESET}\n")
    else:
        print(f"  {YELLOW}{total_issues} issue(s) found.{RESET}")
        if args.strict:
            print(f"  {DIM}Strict mode includes over-target and local-only remote drift checks.{RESET}")
        print(f"  {DIM}This command is read-only and made no changes.{RESET}\n")

    return 1 if total_issues > 0 else 0


# ---------------------------------------------------------------------------
# Reconcile command (apply drift cleanup on Vercel)
# ---------------------------------------------------------------------------

def cmd_reconcile(args: argparse.Namespace) -> int:
    token, project_id, team_id = vercel_creds()
    if not token or not project_id:
        print(f"{RED}Missing VERCEL_TOKEN or VERCEL_PROJECT_ID in .env.local{RESET}")
        return 1

    policy = load_policy()
    vercel_envs = fetch_vercel_envs(token, project_id, team_id)
    if vercel_envs is None:
        return 1

    actions = build_vercel_cleanup_actions(policy, vercel_envs)
    if not actions:
        print(f"{GREEN}No cleanup actions required. Vercel env targets align with policy.{RESET}")
        return 0

    print(f"\n{BOLD}Vercel cleanup plan ({len(actions)} entries){RESET}")
    for action in actions:
        print(f"  {action['key']:<42} {action['targets']:<30} {action['reason']} [{action['note']}]")

    if not args.apply:
        print(f"\n{DIM}Dry-run only. Re-run with --apply to perform deletes.{RESET}")
        return 0

    safe_actions = [a for a in actions if a.get("note") == "safe_delete"]
    unsafe_actions = [a for a in actions if a.get("note") != "safe_delete"]

    if unsafe_actions:
        print(f"\n{YELLOW}Skipping {len(unsafe_actions)} unsafe mixed-target entries in apply mode.{RESET}")
        print(f"{DIM}These need rewrite (recreate with allowed targets) instead of direct delete.{RESET}")
        for action in unsafe_actions:
            print(f"  {action['key']} ({action['targets']})")

    if not safe_actions:
        print(f"{YELLOW}No safe delete actions to apply.{RESET}")
        return 0

    if not args.yes:
        confirm = input(f"\nApply cleanup and delete {len(safe_actions)} env entries from Vercel? [y/N]: ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            return 0

    deleted = 0
    failed = 0
    for action in safe_actions:
        ok = delete_vercel_env_by_id(token, project_id, team_id, action["id"])
        if ok:
            deleted += 1
            print(f"  {GREEN}deleted{RESET} {action['key']} ({action['targets']})")
        else:
            failed += 1
            print(f"  {RED}failed{RESET}   {action['key']} ({action['targets']})")

    print(f"\n{BOLD}Done:{RESET} deleted={deleted}, failed={failed}, skipped_unsafe={len(unsafe_actions)}")
    return 1 if failed > 0 else 0


# ---------------------------------------------------------------------------
# Interactive dashboard
# ---------------------------------------------------------------------------

def cmd_interactive(_args: argparse.Namespace) -> int:
    os.system("")
    while True:
        print(f"\n{BOLD}{'=' * 50}")
        print(f"  Sajtmaskin Env Control Panel")
        print(f"{'=' * 50}{RESET}\n")
        print(f"  {BOLD}1{RESET}  Status     -- full table of all env vars")
        print(f"  {BOLD}2{RESET}  Add        -- add a new env var everywhere")
        print(f"  {BOLD}3{RESET}  Set        -- update value in local files")
        print(f"  {BOLD}4{RESET}  Push       -- push local value to Vercel")
        print(f"  {BOLD}5{RESET}  Push all   -- push all missing to Vercel")
        print(f"  {BOLD}6{RESET}  Pull       -- check what Vercel has that local doesn't")
        print(f"  {BOLD}7{RESET}  Audit      -- run full read-only audit")
        print(f"  {BOLD}8{RESET}  Audit+     -- run strict read-only audit")
        print(f"  {BOLD}9{RESET}  Reconcile  -- cleanup target drift on Vercel")
        print(f"  {BOLD}q{RESET}  Quit")

        choice = input(f"\n  Choose [1-9/q]: ").strip().lower()

        if choice == "q":
            break
        elif choice == "1":
            cmd_status(argparse.Namespace())
        elif choice == "2":
            key = input("  Key name: ").strip()
            if key:
                cmd_add(argparse.Namespace(key=key))
        elif choice == "3":
            key = input("  Key name: ").strip()
            value = input("  Value: ").strip()
            if key:
                cmd_set(argparse.Namespace(key=key, value=value, local=True, prod=True))
        elif choice == "4":
            key = input("  Key name: ").strip()
            if key:
                cmd_push(argparse.Namespace(key=key, all=False))
        elif choice == "5":
            cmd_push(argparse.Namespace(key=None, all=True))
        elif choice == "6":
            cmd_pull(argparse.Namespace())
        elif choice == "7":
            cmd_audit(
                argparse.Namespace(
                    local_only=False,
                    v0_project_id=None,
                    verbose=False,
                    strict=False,
                    env_local=str(ENV_LOCAL),
                    env_prod=str(ENV_PROD),
                )
            )
        elif choice == "8":
            cmd_audit(
                argparse.Namespace(
                    local_only=False,
                    v0_project_id=None,
                    verbose=False,
                    strict=True,
                    env_local=str(ENV_LOCAL),
                    env_prod=str(ENV_PROD),
                )
            )
        elif choice == "9":
            cmd_reconcile(argparse.Namespace(apply=False, yes=False))
        else:
            print(f"  {YELLOW}Unknown option.{RESET}")

    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    os.system("")

    parser = argparse.ArgumentParser(description="Sajtmaskin env control panel")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status", help="Show full status table")

    p_add = sub.add_parser("add", help="Add a new env var")
    p_add.add_argument("key", help="Env var name")

    p_set = sub.add_parser("set", help="Set value in local files")
    p_set.add_argument("key", help="Env var name")
    p_set.add_argument("value", help="Value to set")
    p_set.add_argument("--local", action="store_true", help="Only .env.local")
    p_set.add_argument("--prod", action="store_true", help="Only .env.production")

    p_push = sub.add_parser("push", help="Push to Vercel")
    p_push.add_argument("key", nargs="?", help="Env var name (or --all)")
    p_push.add_argument("--all", action="store_true", help="Push all missing")

    sub.add_parser("pull", help="Check what Vercel has that local doesn't")
    p_audit = sub.add_parser("audit", help="Run read-only audit")
    p_audit.add_argument("--local-only", action="store_true", help="Skip API calls")
    p_audit.add_argument("--v0-project-id", help="v0 project ID to compare against")
    p_audit.add_argument("--verbose", action="store_true", help="Show local value mismatches")
    p_audit.add_argument("--strict", action="store_true", help="Also flag over-target and local-only remote drift")
    p_audit.add_argument("--env-local", default=str(ENV_LOCAL), help="Path to .env.local")
    p_audit.add_argument("--env-prod", default=str(ENV_PROD), help="Path to .env.production")

    p_reconcile = sub.add_parser("reconcile", help="Cleanup Vercel env drift based on policy")
    p_reconcile.add_argument("--apply", action="store_true", help="Perform deletes on Vercel (default is dry-run)")
    p_reconcile.add_argument("--yes", action="store_true", help="Skip confirmation prompt when used with --apply")

    args = parser.parse_args()

    if args.command == "status":
        return cmd_status(args)
    elif args.command == "add":
        return cmd_add(args)
    elif args.command == "set":
        return cmd_set(args)
    elif args.command == "push":
        return cmd_push(args)
    elif args.command == "pull":
        return cmd_pull(args)
    elif args.command == "audit":
        return cmd_audit(args)
    elif args.command == "reconcile":
        return cmd_reconcile(args)
    else:
        return cmd_interactive(args)


if __name__ == "__main__":
    sys.exit(main())

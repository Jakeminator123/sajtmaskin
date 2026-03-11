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
    python manage_env.py audit             # same as check_env.py

Requires: pip install requests
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import OrderedDict
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
        if cls == "shared_runtime" and not in_vercel:
            status = "MISSING_VERCEL"
        elif cls == "shared_runtime" and not target_ok:
            status = "TARGET_GAP"
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
        s_color = GREEN if r["status"] == "ok" else (RED if "MISSING" in r["status"] or "GAP" in r["status"] else YELLOW)
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
# Audit command (delegate to check_env.py)
# ---------------------------------------------------------------------------

def cmd_audit(_args: argparse.Namespace) -> int:
    check_env = SCRIPT_DIR / "check_env.py"
    if check_env.exists():
        os.execv(sys.executable, [sys.executable, str(check_env)])
    else:
        print(f"{RED}check_env.py not found{RESET}")
        return 1
    return 0


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
        print(f"  {BOLD}q{RESET}  Quit")

        choice = input(f"\n  Choose [1-7/q]: ").strip().lower()

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
            cmd_audit(argparse.Namespace())
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
    sub.add_parser("audit", help="Run read-only audit")

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
    else:
        return cmd_interactive(args)


if __name__ == "__main__":
    sys.exit(main())

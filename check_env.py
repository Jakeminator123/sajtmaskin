#!/usr/bin/env python3
"""
check_env.py - Read-only env comparison tool for Sajtmaskin.

Compares local .env files against each other, against Vercel project env vars,
and optionally against v0 project env vars. Never writes or modifies anything.

Usage:
    python check_env.py                          # local + Vercel comparison
    python check_env.py --v0-project-id prj_xxx  # also compare v0
    python check_env.py --local-only             # skip all API calls
    python check_env.py --verbose                # show value diffs (local only)

Requires: pip install requests
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter
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
V0_API_BASE = "https://api.v0.dev/v1"

BOLD = "\033[1m"
RED = "\033[31m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"

KNOWN_EMPTY_OK = {
    "FIGMA_ACCESS_TOKEN",
    "PEXELS_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "NEXT_PUBLIC_REGISTRY_BASE_URL",
    "NEXT_PUBLIC_REGISTRY_STYLE",
    "GOOGLE_CLIENT_ID_DEV",
    "GOOGLE_CLIENT_SECRET_DEV",
    "GITHUB_CLIENT_ID_DEV",
    "GITHUB_CLIENT_SECRET_DEV",
    "GOOGLE_REDIRECT_URI",
    "DATA_DIR",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "REGISTRY_BASE_URL",
    "REGISTRY_AUTH_TOKEN",
    "CRON_SECRET",
    "BACKOFFICE_PASSWORD",
    "SUPERADMIN_PASSWORD",
    "TEST_USER_EMAIL",
    "TEST_USER_PASSWORD",
    "V0_STREAM_DEBUG",
    "AUTH_DEBUG",
    "DEBUG",
    "LOOPIA_API_USER",
    "LOOPIA_API_PASSWORD",
    "INSPECTOR_CAPTURE_WORKER_TOKEN",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "SENTRY_DSN",
    "NOTION_TOKEN",
    "LINEAR_API_KEY",
    "SANITY_API_TOKEN",
    "NEXT_PUBLIC_SANITY_PROJECT_ID",
    "ZAPIER_WEBHOOK_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPERADMIN_EMAIL",
}

RUNTIME_ONLY_KEYS = {
    "NODE_ENV",
    "SAJTMASKIN_LOG",
    "SAJTMASKIN_DEV_LOG",
    "SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS",
    "AI_BRIEF_MAX_TOKENS",
    "AI_CHAT_MAX_TOKENS",
    "V0_MAX_PROMPT_LENGTH",
    "V0_WARN_PROMPT_LENGTH",
    "ENABLE_PEXELS",
    "SAJTMASKIN_ENABLE_EXPERIMENTAL_MODEL_ID",
    "NEXT_PUBLIC_ENABLE_EXPERIMENTAL_MODEL_ID",
    "LEGACY_EMAIL_AUTO_VERIFY_BEFORE",
    "EMAIL_FROM",
}


# ---------------------------------------------------------------------------
# .env parser
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


# ---------------------------------------------------------------------------
# API fetchers (GET only)
# ---------------------------------------------------------------------------

def fetch_vercel_env(token: str, project_id: str, team_id: str | None) -> list[dict[str, Any]] | None:
    url = f"{VERCEL_API_BASE}/v9/projects/{project_id}/env"
    params: dict[str, str] = {}
    if team_id:
        params["teamId"] = team_id
    try:
        resp = requests.get(url, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, params=params, timeout=15)
    except requests.RequestException as e:
        print(f"  {RED}Vercel API error: {e}{RESET}")
        return None

    if resp.status_code != 200:
        print(f"  {RED}Vercel API {resp.status_code}: {resp.text[:200]}{RESET}")
        return None

    data = resp.json()
    return data.get("envs", [])


def fetch_v0_env(api_key: str, project_id: str) -> list[dict[str, Any]] | None:
    url = f"{V0_API_BASE}/projects/{project_id}/env-vars"
    try:
        resp = requests.get(url, headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }, timeout=15)
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


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def check_local_health(label: str, entries: list[EnvEntry]) -> list[str]:
    issues: list[str] = []
    counts = Counter(e.key for e in entries)
    for key, count in counts.items():
        if count > 1:
            lines = [str(e.line_number) for e in entries if e.key == key]
            issues.append(f"DUPLICATE  {label}:{key} appears {count}x (lines {', '.join(lines)})")

    for e in entries:
        if not e.value and e.key not in KNOWN_EMPTY_OK:
            issues.append(f"EMPTY      {label}:{e.key} (line {e.line_number}) has no value")
        if e.raw_line != e.raw_line.rstrip():
            issues.append(f"TRAILING   {label}:{e.key} (line {e.line_number}) has trailing whitespace")
        if "\n" in e.value or "\r" in e.value:
            issues.append(f"NEWLINE    {label}:{e.key} (line {e.line_number}) value contains embedded newline")
        if e.value and re.match(r'^\$\{?[A-Z_]+\}?$', e.value):
            issues.append(f"UNRESOLVED {label}:{e.key} (line {e.line_number}) looks like uninterpolated variable: {e.value}")

    return issues


def check_local_vs_local(
    entries_a: list[EnvEntry],
    entries_b: list[EnvEntry],
    label_a: str,
    label_b: str,
    verbose: bool,
) -> list[str]:
    issues: list[str] = []
    keys_a = set(entries_to_dict(entries_a).keys())
    keys_b = set(entries_to_dict(entries_b).keys())
    dict_a = entries_to_dict(entries_a)
    dict_b = entries_to_dict(entries_b)

    only_a = sorted(keys_a - keys_b - RUNTIME_ONLY_KEYS)
    only_b = sorted(keys_b - keys_a - RUNTIME_ONLY_KEYS)

    for key in only_a:
        issues.append(f"ONLY_IN    {label_a}: {key}")
    for key in only_b:
        issues.append(f"ONLY_IN    {label_b}: {key}")

    if verbose:
        shared = sorted(keys_a & keys_b)
        for key in shared:
            va, vb = dict_a[key], dict_b[key]
            if va != vb:
                va_short = va[:40] + "..." if len(va) > 40 else va
                vb_short = vb[:40] + "..." if len(vb) > 40 else vb
                issues.append(f"MISMATCH   {key}: {label_a}={va_short} vs {label_b}={vb_short}")

    return issues


def check_local_vs_remote(
    local_keys: set[str],
    remote_keys: set[str],
    remote_label: str,
    remote_targets: dict[str, list[str]] | None = None,
) -> list[str]:
    issues: list[str] = []
    missing_remote = sorted(local_keys - remote_keys - RUNTIME_ONLY_KEYS - KNOWN_EMPTY_OK)
    missing_local = sorted(remote_keys - local_keys)

    for key in missing_remote:
        issues.append(f"MISSING_REMOTE  {key} is in local files but NOT on {remote_label}")
    for key in missing_local:
        issues.append(f"MISSING_LOCAL   {key} is on {remote_label} but NOT in local files")

    if remote_targets:
        expected = {"development", "preview", "production"}
        for key, targets in sorted(remote_targets.items()):
            target_set = set(t.lower() for t in targets) if targets else set()
            missing_targets = expected - target_set
            if missing_targets and key in local_keys:
                issues.append(f"TARGET_GAP      {key} on {remote_label} missing targets: {', '.join(sorted(missing_targets))}")

    return issues


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def print_section(title: str) -> None:
    print(f"\n{BOLD}{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}{RESET}\n")


def print_issues(issues: list[str], indent: str = "  ") -> int:
    if not issues:
        print(f"{indent}{GREEN}No issues found.{RESET}")
        return 0

    for issue in issues:
        if issue.startswith("DUPLICATE") or issue.startswith("NEWLINE") or issue.startswith("UNRESOLVED"):
            color = RED
        elif issue.startswith("EMPTY") or issue.startswith("TRAILING"):
            color = YELLOW
        elif issue.startswith("MISSING_REMOTE") or issue.startswith("TARGET_GAP"):
            color = RED
        elif issue.startswith("MISSING_LOCAL"):
            color = YELLOW
        elif issue.startswith("ONLY_IN"):
            color = YELLOW
        elif issue.startswith("MISMATCH"):
            color = CYAN
        else:
            color = ""
        print(f"{indent}{color}{issue}{RESET}")
    return len(issues)


def main() -> int:
    os.system("")  # enable ANSI on Windows

    parser = argparse.ArgumentParser(description="Read-only env comparison for Sajtmaskin")
    parser.add_argument("--local-only", action="store_true", help="Skip all API calls")
    parser.add_argument("--v0-project-id", help="v0 project ID to check env vars against")
    parser.add_argument("--verbose", action="store_true", help="Show value differences for local-vs-local")
    parser.add_argument("--env-local", default=str(ENV_LOCAL), help="Path to .env.local")
    parser.add_argument("--env-prod", default=str(ENV_PROD), help="Path to .env.production")
    args = parser.parse_args()

    path_local = Path(args.env_local)
    path_prod = Path(args.env_prod)

    print(f"\n{BOLD}Sajtmaskin Env Check (read-only){RESET}")
    print(f"{DIM}Local:  {path_local}{RESET}")
    print(f"{DIM}Prod:   {path_prod}{RESET}")

    entries_local = parse_env_file(path_local)
    entries_prod = parse_env_file(path_prod)

    if not entries_local and not entries_prod:
        print(f"\n{RED}No env files found. Nothing to check.{RESET}")
        return 1

    total_issues = 0

    # --- Section 1: Local file health ---
    print_section("1. Local file health")

    if entries_local:
        print(f"  {BOLD}.env.local ({len(entries_local)} entries){RESET}")
        total_issues += print_issues(check_local_health(".env.local", entries_local), "    ")
    else:
        print(f"  {YELLOW}.env.local not found{RESET}")

    if entries_prod:
        print(f"\n  {BOLD}.env.production ({len(entries_prod)} entries){RESET}")
        total_issues += print_issues(check_local_health(".env.production", entries_prod), "    ")
    else:
        print(f"\n  {YELLOW}.env.production not found{RESET}")

    # --- Section 2: Local vs Local ---
    if entries_local and entries_prod:
        print_section("2. Local vs Local (.env.local vs .env.production)")
        issues = check_local_vs_local(entries_local, entries_prod, ".env.local", ".env.production", args.verbose)
        total_issues += print_issues(issues)

    # --- Resolve credentials for API calls ---
    env_dict = entries_to_dict(entries_local) if entries_local else entries_to_dict(entries_prod)
    vercel_token = env_dict.get("VERCEL_TOKEN", "").strip()
    vercel_project_id = env_dict.get("VERCEL_PROJECT_ID", "").strip()
    vercel_team_id = env_dict.get("VERCEL_TEAM_ID", "").strip() or None
    v0_api_key = env_dict.get("V0_API_KEY", "").strip()

    all_local_keys = set(entries_to_dict(entries_local).keys()) | set(entries_to_dict(entries_prod).keys())

    # --- Section 3: Local vs Vercel ---
    if not args.local_only:
        print_section("3. Local vs Vercel")

        if not vercel_token:
            print(f"  {YELLOW}Skipped: VERCEL_TOKEN not found in local env files{RESET}")
        elif not vercel_project_id:
            print(f"  {YELLOW}Skipped: VERCEL_PROJECT_ID not found in local env files{RESET}")
        else:
            print(f"  {DIM}Fetching env vars from Vercel project {vercel_project_id}...{RESET}")
            vercel_envs = fetch_vercel_env(vercel_token, vercel_project_id, vercel_team_id)
            if vercel_envs is not None:
                remote_keys = set(e["key"] for e in vercel_envs)
                remote_targets: dict[str, list[str]] = {}
                for e in vercel_envs:
                    targets = e.get("target")
                    if isinstance(targets, list):
                        remote_targets[e["key"]] = targets
                    elif isinstance(targets, str):
                        remote_targets[e["key"]] = [targets]
                    else:
                        remote_targets[e["key"]] = []

                print(f"  {DIM}Found {len(vercel_envs)} env vars on Vercel{RESET}\n")
                issues = check_local_vs_remote(all_local_keys, remote_keys, "Vercel", remote_targets)
                total_issues += print_issues(issues)
            else:
                print(f"  {RED}Failed to fetch Vercel env vars (see error above){RESET}")
                total_issues += 1

        # --- Section 4: Local vs v0 ---
        if args.v0_project_id:
            print_section("4. Local vs v0")

            if not v0_api_key:
                print(f"  {YELLOW}Skipped: V0_API_KEY not found in local env files{RESET}")
            else:
                print(f"  {DIM}Fetching env vars from v0 project {args.v0_project_id}...{RESET}")
                v0_envs = fetch_v0_env(v0_api_key, args.v0_project_id)
                if v0_envs is not None:
                    remote_keys = set()
                    for e in v0_envs:
                        k = e.get("key") or e.get("name", "")
                        if k:
                            remote_keys.add(k)

                    print(f"  {DIM}Found {len(v0_envs)} env vars on v0{RESET}\n")
                    issues = check_local_vs_remote(all_local_keys, remote_keys, "v0")
                    total_issues += print_issues(issues)
                else:
                    print(f"  {RED}Failed to fetch v0 env vars (see error above){RESET}")
                    total_issues += 1
    else:
        print(f"\n{DIM}  (API checks skipped: --local-only){RESET}")

    # --- Summary ---
    print_section("Summary")
    if total_issues == 0:
        print(f"  {GREEN}All clean! No issues detected.{RESET}\n")
    else:
        print(f"  {YELLOW}{total_issues} issue(s) found.{RESET}")
        print(f"  {DIM}This script is read-only and made no changes.{RESET}\n")

    return 1 if total_issues > 0 else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""pydatabastest.py - ordnings-/regressionstest for Sajtmaskins databaser + Blob.

WHAT THIS IS (kort svensk forklaring)
-------------------------------------
Det har ar ett ordningstest (regression-/sanity-test) som verifierar att de tva
Supabase-Postgres-databaserna (dev + prod) och den enda Vercel Blob-storen ar i
det forvantade, "ny-omstartade" lage som projektet aterstalldes till. Det laser
BARA (inga skrivningar mot databasen som standard) och flaggar varje avvikelse.
Det kan koras manuellt (med fa, valfria atgardsfragor) eller helt icke-interaktivt
som en CI-grind (gate) pa varje push / PR-merge.

THE "IN SYNC" DIRECTIVES IT ENFORCES
------------------------------------
Two Supabase Postgres databases are treated identically:
  - dev  -> Vercel env target `development` (host like aws-1-eu-north-1.pooler.supabase.com)
  - prod -> Vercel env target `production`  (us-east-1)

Table classification (post-restart expectation in BOTH dev and prod):
  - EMPTY     : generated user sites + byproducts -> must have 0 rows.
  - PRESERVED : credentials / business / analytics -> must exist (rows allowed).
  - CACHE     : regeneratable -> must exist, row count is informational.

Blob: ONE Vercel Blob store `sajtmaskin-blob` (store id fragment NHrq4GU42kcujMOV),
token in BLOB_READ_WRITE_TOKEN. Expected top-level content is ONLY `v0-templates/`
(the template reference library). Generated sites are NOT in blob (they live in
Postgres engine_versions.files_json). User media, if any, lands under `{userId}/...`.

CHECKS (all read-only)
----------------------
  1. Connectivity   - both dev + prod Postgres reachable; blob store reachable;
                      token store id == NHrq4GU42kcujMOV.
  2. Schema present - all expected tables exist in both DBs.
  3. Restart state  - EMPTY-group tables have 0 rows in both DBs; PRESERVED exist.
  4. Dev/prod parity- same tables; empty-group both zero.
  5. Blob sync      - only the `v0-templates/` top-level prefix exists.

EXIT CODE
---------
  0  = no FAIL (all PASS / WARN / SKIP)
  1  = at least one FAIL (regression gate trips)
WARN and SKIP never fail the gate, so the CI job still passes meaningfully in
environments without prod creds (those DBs SKIP with a clear warning).

USAGE / FLAGS
-------------
  python pydatabastest.py            Interactive: run all checks, print report.
                                     May ask at most 1 safe, optional remediation
                                     prompt (e.g. run `npm run db:init` for dev).
  python pydatabastest.py --ci       CI/non-interactive gate. Never prompts, never
                                     pulls creds via the Vercel CLI, read-only only,
                                     exits non-zero on any FAIL.
  --no-input / --yes                 Aliases for non-interactive (same as --ci's
                                     no-prompt behaviour).
  --no-pull                          Do not use `vercel env pull` even interactively
                                     (rely on env vars / .env.local only).
  --json                             Also print a machine-readable JSON summary.

CI auto-detection: if CI=true or GITHUB_ACTIONS=true is set, the script runs
non-interactively automatically (no need to pass --ci).

CREDENTIALS RESOLUTION (per database)
-------------------------------------
  dev  : POSTGRES_URL_DEV  -> (interactive) `vercel env pull --environment=development`
         -> .env.local (POSTGRES_URL / POSTGRES_URL_NON_POOLING)
  prod : POSTGRES_URL_PROD -> (interactive) `vercel env pull --environment=production`
  blob : BLOB_READ_WRITE_TOKEN
If creds for a DB are absent, that DB is SKIPPED with a WARN (never a hard crash),
so the gate still runs meaningfully. When pulled/read from a file, the pooled URL
(pooler.supabase.com) is tried first because the direct `db.<ref>.supabase.co` host
is often unreachable over IPv4; the non-pooling URL is tried as a fallback. For the
CI secrets, prefer the pooled connection string. Supabase presents a self-signed
cert chain, so TLS verification is disabled by default (matching the repo's
DB_SSL_REJECT_UNAUTHORIZED=false behaviour); `sslmode=disable` is honored too.

Connection strings / tokens are NEVER printed - only host:port/db and the masked
token store id.

DEPENDENCY
----------
Pure-Python Postgres driver `pg8000` (see requirements.dbtest.txt). Blob is checked
via the Vercel Blob REST list API using only the Python standard library, so the CI
job needs no Node toolchain.
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

# --------------------------------------------------------------------------- #
# Expected state (the directives the project was reset to)
# --------------------------------------------------------------------------- #

EMPTY_TABLES: Tuple[str, ...] = (
    "app_projects",
    "project_data",
    "project_files",
    "images",
    "company_profiles",
    "engine_chats",
    "engine_messages",
    "engine_versions",
    "engine_generation_logs",
    "engine_version_error_logs",
    "generation_telemetry",
    "version_comments",
    "version_approvals",
    "oc_debug_findings",
    "projects",
    "chats",
    "versions",
    "version_error_logs",
    "deployments",
    "prompt_handoffs",
    "user_audits",
)

PRESERVED_TABLES: Tuple[str, ...] = (
    "users",
    "transactions",
    "domain_orders",
    "kostnadsfri_pages",
    "user_integrations",
    "media_library",
    "prompt_logs",
)

CACHE_TABLES: Tuple[str, ...] = (
    "template_cache",
    "registry_cache",
    "guest_usage",
    "page_views",
    # Transient distributed-lease/jobs table (#256). Rows are legitimately
    # RETAINED: releaseVersionLease sets status=done/failed, it does NOT delete
    # (src/lib/db/chat-repository-pg.ts). So it must NOT be EMPTY (0-row)
    # classified — that would false-fail the prod-sync gate after any verify/
    # repair run. Classified here for existence-only verification, row count
    # informational (Codex P1 on #267).
    "engine_version_jobs",
)

EXPECTED_TABLES: Tuple[str, ...] = EMPTY_TABLES + PRESERVED_TABLES + CACHE_TABLES

# Tables created by db:init migrations that are not part of the post-restart
# classification but are legitimate (acknowledged so they do not raise a WARN).
KNOWN_EXTRA_TABLES: Tuple[str, ...] = ("error_log_events",)

GROUP_OF: Dict[str, str] = {
    **{t: "EMPTY" for t in EMPTY_TABLES},
    **{t: "PRESERVED" for t in PRESERVED_TABLES},
    **{t: "CACHE" for t in CACHE_TABLES},
}

# Blob expectations
EXPECTED_BLOB_STORE_ID = "NHrq4GU42kcujMOV"
EXPECTED_BLOB_PREFIX = "v0-templates/"
# Top-level prefixes the app legitimately writes at runtime (besides the template
# library). User media lands under "{userId}/..." (see buildBlobPath in
# src/lib/vercel/blob-service.ts), AI/materialized images under "images/", and zip
# exports under "exports/". These are expected once the app has been used, so they
# must NOT be reported as sync drift.
SYSTEM_BLOB_PREFIXES: Tuple[str, ...] = ("images/", "exports/")
BLOB_API_URL = "https://vercel.com/api/blob"
BLOB_API_VERSION = "12"

PG_CONNECT_TIMEOUT_S = 15

# --------------------------------------------------------------------------- #
# Result model + reporting
# --------------------------------------------------------------------------- #

PASS, FAIL, WARN, SKIP = "PASS", "FAIL", "WARN", "SKIP"

_COLORS = {PASS: "\033[32m", FAIL: "\033[31m", WARN: "\033[33m", SKIP: "\033[90m"}
_RESET = "\033[0m"


class Report:
    def __init__(self, use_color: bool) -> None:
        self.use_color = use_color
        self.results: List[Tuple[str, str, str]] = []

    def add(self, status: str, name: str, details: str = "") -> None:
        self.results.append((status, name, details))
        tag = status
        if self.use_color:
            tag = f"{_COLORS.get(status, '')}{status}{_RESET}"
        line = f"  [{tag}] {name}"
        if details:
            line += f" - {details}"
        print(line, flush=True)

    def counts(self) -> Dict[str, int]:
        out = {PASS: 0, FAIL: 0, WARN: 0, SKIP: 0}
        for status, _, _ in self.results:
            out[status] = out.get(status, 0) + 1
        return out

    def has_fail(self) -> bool:
        return any(status == FAIL for status, _, _ in self.results)


def header(title: str) -> None:
    print(f"\n=== {title} ===", flush=True)


# --------------------------------------------------------------------------- #
# Small dotenv parser (no dependency)
# --------------------------------------------------------------------------- #

# Pooled URL first (the Supabase pooler host is the externally reachable one),
# then the direct/non-pooling URL as a fallback. The script tries each candidate
# until one connects, so it is robust whether run from CI, a laptop, or IPv6.
DB_KEYS = ("POSTGRES_URL", "POSTGRES_URL_NON_POOLING")


def parse_env_file(path: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[len("export "):]
                eq = line.find("=")
                if eq == -1:
                    continue
                key = line[:eq].strip()
                val = line[eq + 1:].strip()
                if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                    val = val[1:-1]
                out[key] = val
    except OSError:
        return {}
    return out


def db_url_candidates(mapping: Dict[str, str]) -> List[str]:
    out: List[str] = []
    for key in DB_KEYS:
        val = mapping.get(key)
        if val and val.strip() and val.strip() not in out:
            out.append(val.strip())
    return out


# --------------------------------------------------------------------------- #
# Credential resolution
# --------------------------------------------------------------------------- #


def vercel_executable() -> Optional[str]:
    import shutil

    for name in ("vercel", "vercel.cmd", "vc"):
        found = shutil.which(name)
        if found:
            return found
    return None


def pull_env(target: str) -> Dict[str, str]:
    """Read-only `vercel env pull` for the given target; returns the parsed env mapping.

    The temp env file is deleted immediately after reading (security hygiene)."""
    exe = vercel_executable()
    if not exe:
        return {}
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".env", prefix="pydbtest-")
    os.close(tmp_fd)
    try:
        proc = subprocess.run(
            [exe, "env", "pull", tmp_path, f"--environment={target}", "--yes"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            return {}
        return parse_env_file(tmp_path)
    except (OSError, subprocess.SubprocessError):
        return {}
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def resolve_pg_candidates(
    target: str, *, allow_pull: bool, source_note: List[str]
) -> List[str]:
    """Resolve ordered Postgres URL candidates for target in {'dev','prod'}.

    Order: explicit env var -> (interactive) vercel env pull -> .env.local (dev only).
    The caller tries each candidate until one connects.
    """
    env_var = "POSTGRES_URL_DEV" if target == "dev" else "POSTGRES_URL_PROD"
    explicit = os.environ.get(env_var)
    if explicit and explicit.strip():
        source_note.append(f"env:{env_var}")
        return [explicit.strip()]

    if allow_pull:
        vercel_target = "development" if target == "dev" else "production"
        candidates = db_url_candidates(pull_env(vercel_target))
        if candidates:
            source_note.append(f"vercel env pull ({vercel_target})")
            return candidates

    if target == "dev":
        candidates = db_url_candidates(parse_env_file(".env.local"))
        if candidates:
            source_note.append(".env.local")
            return candidates

    return []


def resolve_blob_token(*, allow_pull: bool, source_note: List[str]) -> Optional[str]:
    """Resolve the Vercel Blob token from the same sources as the Postgres URLs.

    Order: BLOB_READ_WRITE_TOKEN env -> (interactive) vercel env pull -> .env.local.
    Without this, a local token in .env.local would be ignored and all blob checks
    would silently SKIP even though credentials are present."""
    explicit = os.environ.get("BLOB_READ_WRITE_TOKEN")
    if explicit and explicit.strip():
        source_note.append("env:BLOB_READ_WRITE_TOKEN")
        return explicit.strip()

    if allow_pull:
        for vercel_target in ("development", "production"):
            tok = pull_env(vercel_target).get("BLOB_READ_WRITE_TOKEN")
            if tok and tok.strip():
                source_note.append(f"vercel env pull ({vercel_target})")
                return tok.strip()

    local = parse_env_file(".env.local").get("BLOB_READ_WRITE_TOKEN")
    if local and local.strip():
        source_note.append(".env.local")
        return local.strip()

    return None


# --------------------------------------------------------------------------- #
# Postgres connection (pg8000) + read-only queries
# --------------------------------------------------------------------------- #


def build_ssl_context(sslmode: Optional[str]) -> Optional[ssl.SSLContext]:
    if sslmode == "disable":
        return None
    reject = os.environ.get("DB_SSL_REJECT_UNAUTHORIZED", "").strip().lower()
    ctx = ssl.create_default_context()
    # Supabase presents a self-signed cert chain. Verify only when explicitly asked.
    if reject in ("1", "true", "yes", "on"):
        return ctx
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def connect_pg(url: str):
    import pg8000.native  # imported lazily so --help works without the dep

    parsed = urlparse(url)
    if not parsed.hostname:
        raise ValueError("connection string has no host")
    query = parse_qs(parsed.query)
    sslmode = (query.get("sslmode", [None])[0] or "").strip().lower() or None
    ssl_ctx = build_ssl_context(sslmode)

    kwargs = dict(
        user=unquote(parsed.username or ""),
        host=parsed.hostname,
        port=parsed.port or 5432,
        database=(parsed.path or "/postgres").lstrip("/") or "postgres",
        timeout=PG_CONNECT_TIMEOUT_S,
        application_name="pydatabastest",
    )
    if parsed.password:
        kwargs["password"] = unquote(parsed.password)
    if ssl_ctx is not None:
        kwargs["ssl_context"] = ssl_ctx
    return pg8000.native.Connection(**kwargs)


def existing_tables(conn) -> set:
    rows = conn.run(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )
    return {r[0] for r in rows}


def row_count(conn, table: str) -> int:
    # table comes from a fixed allowlist; quote defensively anyway.
    rows = conn.run('SELECT count(*) FROM "' + table.replace('"', '') + '"')
    return int(rows[0][0])


def target_label(url: str) -> str:
    try:
        p = urlparse(url)
        return f"{p.hostname}:{p.port or 5432}/{(p.path or '/postgres').lstrip('/') or 'postgres'}"
    except ValueError:
        return "unknown"


# --------------------------------------------------------------------------- #
# Per-database inspection
# --------------------------------------------------------------------------- #


class DbState:
    def __init__(self, name: str) -> None:
        self.name = name
        self.url: Optional[str] = None
        self.reachable = False
        self.tables: set = set()
        self.counts: Dict[str, int] = {}
        self.missing: List[str] = []
        self.error: Optional[str] = None


def inspect_db(name: str, urls: List[str], report: Report) -> DbState:
    state = DbState(name)
    label = name.upper()

    if not urls:
        report.add(
            SKIP,
            f"{label} connectivity",
            "no credentials found (set POSTGRES_URL_%s or pull via Vercel) - skipping this DB"
            % name.upper(),
        )
        return state

    conn = None
    for candidate in urls:
        try:
            conn = connect_pg(candidate)
            state.url = candidate
            break
        except Exception as exc:  # noqa: BLE001 - try the next candidate
            state.error = str(exc).splitlines()[0] if str(exc) else type(exc).__name__

    if conn is None:
        report.add(
            FAIL,
            f"{label} connectivity",
            f"{target_label(urls[-1])} - {state.error} (tried {len(urls)} candidate URL(s))",
        )
        return state
    url = state.url or urls[0]

    try:
        report.add(PASS, f"{label} connectivity", target_label(url))
        state.reachable = True

        state.tables = existing_tables(conn)
        state.missing = [t for t in EXPECTED_TABLES if t not in state.tables]
        if state.missing:
            report.add(
                FAIL,
                f"{label} schema present",
                f"{len(state.missing)} expected table(s) missing: {', '.join(state.missing)}",
            )
        else:
            report.add(PASS, f"{label} schema present", f"all {len(EXPECTED_TABLES)} expected tables exist")

        extra = sorted(state.tables - set(EXPECTED_TABLES) - set(KNOWN_EXTRA_TABLES))
        if extra:
            report.add(
                FAIL,
                f"{label} extra tables",
                f"unclassified table(s) - schema drift unless added to EXPECTED/KNOWN_EXTRA: {', '.join(extra)}",
            )

        # Known extras are created by db:init migrations and must exist in both DBs;
        # a missing one means the migration did not run (schema drift), not a clean extra.
        missing_known_extra = [t for t in KNOWN_EXTRA_TABLES if t not in state.tables]
        if missing_known_extra:
            report.add(
                FAIL,
                f"{label} known-extra tables",
                f"required migration table(s) missing: {', '.join(missing_known_extra)}",
            )

        # Row counts (read-only). Only count tables that exist.
        for table in EXPECTED_TABLES:
            if table in state.tables:
                try:
                    state.counts[table] = row_count(conn, table)
                except Exception as exc:  # noqa: BLE001
                    state.counts[table] = -1
                    report.add(WARN, f"{label} count {table}", f"count failed: {exc}")

        present_empty = [t for t in EMPTY_TABLES if t in state.counts]
        non_empty = {t: state.counts[t] for t in present_empty if state.counts[t] > 0}
        # A failed count is stored as -1; it must NOT be treated as "0 rows" or the
        # gate could pass without ever confirming the post-restart EMPTY state.
        unverified = [t for t in present_empty if state.counts[t] < 0]
        if non_empty or unverified:
            parts = []
            if non_empty:
                parts.append("non-zero rows: " + ", ".join(f"{t}={c}" for t, c in non_empty.items()))
            if unverified:
                parts.append("unverified (count failed): " + ", ".join(unverified))
            report.add(FAIL, f"{label} restart state (EMPTY group)", "; ".join(parts))
        else:
            report.add(PASS, f"{label} restart state (EMPTY group)", f"{len(present_empty)} table(s) at 0 rows")

        preserved_present = [t for t in PRESERVED_TABLES if t in state.tables]
        report.add(
            PASS if len(preserved_present) == len(PRESERVED_TABLES) else WARN,
            f"{label} preserved tables",
            f"{len(preserved_present)}/{len(PRESERVED_TABLES)} present",
        )
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass

    return state


# --------------------------------------------------------------------------- #
# Blob inspection (Vercel Blob REST list API, stdlib only)
# --------------------------------------------------------------------------- #


def blob_store_id_from_token(token: str) -> Optional[str]:
    # Token format: vercel_blob_rw_<STOREID>_<SECRET>
    parts = token.split("_")
    if len(parts) >= 5 and parts[0] == "vercel" and parts[1] == "blob":
        return parts[3]
    return None


def blob_list_folded(token: str) -> dict:
    url = f"{BLOB_API_URL}?mode=folded&limit=1000"
    req = urllib.request.Request(url, method="GET")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("x-api-version", BLOB_API_VERSION)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def inspect_blob(token: Optional[str], report: Report) -> Dict[str, object]:
    info: Dict[str, object] = {"reachable": False, "folders": [], "root_blobs": 0}

    if not token:
        report.add(SKIP, "BLOB credentials", "BLOB_READ_WRITE_TOKEN not set - skipping blob checks")
        return info

    store_id = blob_store_id_from_token(token)
    masked = f"vercel_blob_rw_{store_id}_***" if store_id else "(unparseable token)"
    if store_id == EXPECTED_BLOB_STORE_ID:
        report.add(PASS, "BLOB store id", f"token store id matches sajtmaskin-blob ({masked})")
    else:
        report.add(
            FAIL,
            "BLOB store id",
            f"token store id {store_id!r} != expected {EXPECTED_BLOB_STORE_ID!r}",
        )

    try:
        data = blob_list_folded(token)
    except urllib.error.HTTPError as exc:
        report.add(FAIL, "BLOB connectivity", f"HTTP {exc.code} listing store")
        return info
    except (urllib.error.URLError, OSError, ValueError) as exc:
        report.add(FAIL, "BLOB connectivity", f"list failed: {exc}")
        return info

    info["reachable"] = True
    folders = list(data.get("folders") or [])
    blobs = list(data.get("blobs") or [])
    info["folders"] = folders
    info["root_blobs"] = len(blobs)
    report.add(PASS, "BLOB connectivity", f"store reachable ({len(folders)} top-level folder(s))")

    # The template library must always exist (it is never deleted at runtime).
    if EXPECTED_BLOB_PREFIX not in folders:
        report.add(
            FAIL,
            "BLOB sync (v0-templates)",
            f"expected prefix {EXPECTED_BLOB_PREFIX!r} not found (template library missing); folders: {folders or '[]'}",
        )
    else:
        report.add(PASS, "BLOB sync (v0-templates)", "template library present")

    # Everything else is runtime-written: system buckets (images/, exports/) and
    # per-user media ("{userId}/..."). These are expected, not drift - report only.
    other = [f for f in folders if f != EXPECTED_BLOB_PREFIX]
    system = [f for f in other if f in SYSTEM_BLOB_PREFIXES]
    user_data = [f for f in other if f not in SYSTEM_BLOB_PREFIXES]
    report.add(
        PASS,
        "BLOB runtime prefixes",
        f"system: {', '.join(system) or 'none'}; user-data prefixes: {len(user_data)}",
    )

    # Nothing the app writes lands at the store root (every write is prefixed), so a
    # loose root file is unexpected - surface it as a warning without failing the gate.
    if blobs:
        report.add(
            WARN,
            "BLOB root files",
            f"{len(blobs)} loose file(s) at store root (expected none at root)",
        )

    return info


# --------------------------------------------------------------------------- #
# Parity + cross-check
# --------------------------------------------------------------------------- #


def check_parity(dev: DbState, prod: DbState, report: Report) -> None:
    if not (dev.reachable and prod.reachable):
        report.add(SKIP, "dev/prod parity", "one or both DBs not reachable - cannot compare")
        return

    only_dev = sorted((dev.tables - prod.tables) & set(EXPECTED_TABLES))
    only_prod = sorted((prod.tables - dev.tables) & set(EXPECTED_TABLES))
    diffs = []
    if only_dev:
        diffs.append(f"only in dev: {', '.join(only_dev)}")
    if only_prod:
        diffs.append(f"only in prod: {', '.join(only_prod)}")

    empty_div = []
    for t in EMPTY_TABLES:
        dc = dev.counts.get(t)
        pc = prod.counts.get(t)
        if dc is not None and pc is not None and (dc > 0) != (pc > 0):
            empty_div.append(f"{t} (dev={dc}, prod={pc})")

    if diffs or empty_div:
        report.add(
            WARN,
            "dev/prod parity",
            "; ".join(diffs + ([f"empty-group divergence: {', '.join(empty_div)}"] if empty_div else [])),
        )
    else:
        report.add(PASS, "dev/prod parity", "same expected tables; empty-group state matches")


def cross_check_media(dev: DbState, prod: DbState, blob: Dict[str, object], report: Report) -> None:
    media_rows = []
    for state in (dev, prod):
        if state.reachable and "media_library" in state.counts:
            media_rows.append(f"{state.name}={state.counts['media_library']}")
    if not media_rows:
        return
    user_prefixes = [
        f
        for f in (blob.get("folders") or [])
        if f != EXPECTED_BLOB_PREFIX and f not in SYSTEM_BLOB_PREFIXES
    ]
    report.add(
        WARN if user_prefixes else PASS,
        "media_library <-> blob (informational)",
        f"media_library rows: {', '.join(media_rows)}; blob user prefixes: {user_prefixes or 'none'}",
    )


# --------------------------------------------------------------------------- #
# Row-count table
# --------------------------------------------------------------------------- #


def print_count_table(dev: DbState, prod: DbState) -> None:
    header("Row counts per table per DB")

    def cell(state: DbState, table: str) -> str:
        if not state.reachable:
            return "skip"
        if table not in state.tables:
            return "MISSING"
        val = state.counts.get(table)
        if val is None:
            return "-"
        if val < 0:
            return "err"
        return str(val)

    name_w = max(len(t) for t in EXPECTED_TABLES)
    name_w = max(name_w, len("table"))
    fmt = f"  {{:<{name_w}}}  {{:<9}}  {{:>8}}  {{:>8}}  {{}}"
    print(fmt.format("table", "group", "dev", "prod", "expect"), flush=True)
    print("  " + "-" * (name_w + 38), flush=True)
    for table in EXPECTED_TABLES:
        expect = "0 rows" if GROUP_OF[table] == "EMPTY" else "exists"
        print(
            fmt.format(table, GROUP_OF[table], cell(dev, table), cell(prod, table), expect),
            flush=True,
        )


# --------------------------------------------------------------------------- #
# Optional remediation (interactive only, dev only, non-destructive)
# --------------------------------------------------------------------------- #


def maybe_remediate(dev: DbState, interactive: bool) -> None:
    if not interactive or not dev.reachable or not dev.missing:
        return
    print(
        f"\nDev DB is missing {len(dev.missing)} expected table(s): {', '.join(dev.missing)}",
        flush=True,
    )
    try:
        answer = input("Run `npm run db:init` against the dev DB now? (idempotent, non-destructive) [y/N] ")
    except (EOFError, KeyboardInterrupt):
        print("\nSkipping remediation.", flush=True)
        return
    if answer.strip().lower() not in ("y", "yes"):
        print("Skipping remediation. To fix manually: npm run db:init (with dev POSTGRES_URL).", flush=True)
        return

    env = dict(os.environ)
    if dev.url:
        env["POSTGRES_URL"] = dev.url
        env.setdefault("DB_SSL_REJECT_UNAUTHORIZED", "false")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    print("Running `npm run db:init` ...", flush=True)
    try:
        subprocess.run([npm, "run", "db:init"], env=env, timeout=300)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"db:init could not be run automatically: {exc}", flush=True)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="pydatabastest.py",
        description="Order/regression test: verify dev+prod Postgres and the Vercel Blob "
        "store are in the expected post-restart state (read-only).",
    )
    parser.add_argument("--ci", action="store_true", help="non-interactive CI gate (no prompts, no Vercel pull)")
    parser.add_argument("--no-input", action="store_true", help="non-interactive (alias of --ci's no-prompt behaviour)")
    parser.add_argument("--yes", action="store_true", help="non-interactive (assume defaults, no prompts)")
    parser.add_argument("--no-pull", action="store_true", help="do not use `vercel env pull`")
    parser.add_argument("--json", action="store_true", help="also print a JSON summary")
    return parser.parse_args(argv)


def is_ci_env() -> bool:
    return (
        os.environ.get("CI", "").lower() in ("1", "true", "yes")
        or os.environ.get("GITHUB_ACTIONS", "").lower() == "true"
    )


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    ci_mode = args.ci or is_ci_env()
    interactive = not (ci_mode or args.no_input or args.yes)
    allow_pull = interactive and not args.no_pull
    use_color = sys.stdout.isatty() and not ci_mode and os.environ.get("NO_COLOR") is None

    print(__doc__.strip().split("USAGE / FLAGS")[0].strip(), flush=True)
    print(
        f"\nMode: {'INTERACTIVE' if interactive else 'NON-INTERACTIVE (CI gate)'} | "
        f"vercel pull: {'on' if allow_pull else 'off'}",
        flush=True,
    )

    report = Report(use_color)

    dev_src: List[str] = []
    prod_src: List[str] = []
    dev_urls = resolve_pg_candidates("dev", allow_pull=allow_pull, source_note=dev_src)
    prod_urls = resolve_pg_candidates("prod", allow_pull=allow_pull, source_note=prod_src)
    blob_src: List[str] = []
    blob_token = resolve_blob_token(allow_pull=allow_pull, source_note=blob_src)

    header("1-3. Postgres: connectivity, schema, restart state")
    if dev_src:
        print(f"  (dev creds via {dev_src[0]})", flush=True)
    if prod_src:
        print(f"  (prod creds via {prod_src[0]})", flush=True)
    dev = inspect_db("dev", dev_urls, report)
    prod = inspect_db("prod", prod_urls, report)

    header("4. Dev/prod parity")
    check_parity(dev, prod, report)

    header("5. Blob store sync")
    if blob_src:
        print(f"  (blob token via {blob_src[0]})", flush=True)
    blob = inspect_blob(blob_token, report)
    cross_check_media(dev, prod, blob, report)

    print_count_table(dev, prod)

    if interactive:
        maybe_remediate(dev, interactive)

    # Summary
    counts = report.counts()
    header("Summary")
    print(
        f"  PASS={counts[PASS]}  FAIL={counts[FAIL]}  WARN={counts[WARN]}  SKIP={counts[SKIP]}",
        flush=True,
    )
    exit_code = 1 if report.has_fail() else 0
    verdict = "FAIL - at least one mismatch" if exit_code else "OK - no mismatches (FAIL=0)"
    print(f"  Verdict: {verdict} (exit {exit_code})", flush=True)

    if args.json:
        summary = {
            "exit_code": exit_code,
            "counts": counts,
            "checks": [
                {"status": s, "name": n, "details": d} for s, n, d in report.results
            ],
            "dev_reachable": dev.reachable,
            "prod_reachable": prod.reachable,
            "blob_reachable": blob.get("reachable"),
        }
        print("\nJSON_SUMMARY " + json.dumps(summary), flush=True)

    return exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

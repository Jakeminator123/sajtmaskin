# -*- coding: utf-8 -*-
"""Reservväg: läs DB-loggarna via `scripts/db/dump-logs.mjs`.

Används när Python-drivrutinen `pg8000` inte är installerad. Samma mönster som
backoffice (`backoffice/pages/log_export.py`) — node-skriptet äger SQL:en.

Läget är medvetet **reducerat**: dump-logs har fasta kolumnlistor och känner inte
till `app_projects`-ägaren eller per-användare-rollupen. Det räcker för att se hur
körningen gick och vad den kostade, men inte vem som förbrukade det.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

DUMP_SCRIPT_REL = "scripts/db/dump-logs.mjs"
TIMEOUT_S = 120

#: dump-logs-kinds som motsvarar `db.LOG_TABLES`. `llmusage` finns i dump-logs och
#: tas med här — utan den skulle reservläget tappa all per-anrops-förbrukning.
FALLBACK_KINDS = (
    "chats",
    "versions",
    "prompts",
    "generations",
    "telemetry",
    "llmusage",
    "errors",
    "oc",
    "ragevents",
    "deploys",
)


class DumpLogsUnavailable(RuntimeError):
    pass


def available(repo_root: Path) -> bool:
    return shutil.which("node") is not None and (repo_root / DUMP_SCRIPT_REL).is_file()


def run_dump_logs(
    repo_root: Path,
    *,
    env_path: str,
    kinds: tuple[str, ...] = FALLBACK_KINDS,
    limit: int = 200,
    chat_id: str | None = None,
    allow_insecure_ssl: bool = True,
) -> dict[str, Any]:
    node = shutil.which("node")
    script = repo_root / DUMP_SCRIPT_REL
    if node is None:
        raise DumpLogsUnavailable("`node` finns inte på PATH.")
    if not script.is_file():
        raise DumpLogsUnavailable(f"Saknar {DUMP_SCRIPT_REL}.")

    args = [
        node,
        str(script),
        "--json",
        f"--env={env_path}",
        f"--kinds={','.join(kinds)}",
        f"--limit={int(limit)}",
    ]
    if allow_insecure_ssl:
        args.append("--allow-insecure-ssl")
    if chat_id:
        args.append(f"--chat={chat_id}")

    try:
        proc = subprocess.run(  # noqa: S603 - fast argumentlista, ingen shell
            args,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise DumpLogsUnavailable(f"dump-logs.mjs timade ut efter {TIMEOUT_S}s.") from exc

    stdout = (proc.stdout or "").strip()
    if not stdout:
        raise DumpLogsUnavailable((proc.stderr or "Tomt svar från dump-logs.mjs").strip()[:2000])
    payload = _parse_json_tail(stdout)
    if payload is None:
        raise DumpLogsUnavailable(f"Kunde inte tolka JSON från dump-logs.mjs: {stdout[-500:]}")
    if payload.get("error"):
        raise DumpLogsUnavailable(str(payload["error"]))
    return payload


def _parse_json_tail(stdout: str) -> dict[str, Any] | None:
    """dotenv m.fl. kan skriva en rad före JSON:en — börja vid första `{`."""
    brace = stdout.find("{")
    candidate = stdout[brace:] if brace != -1 else stdout
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def latest_version_from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Nyaste `engine_versions`-raden ur en dump utan chat-filter."""
    versions = ((payload.get("data") or {}).get("versions")) or []
    if not versions:
        return None
    row = versions[0]
    return {
        "version_id": row.get("id"),
        "chat_id": row.get("chat_id"),
        "version_number": row.get("version_number"),
        "release_state": row.get("release_state"),
        "verification_state": row.get("verification_state"),
        "verification_summary": row.get("verification_summary"),
        "lifecycle_stage": row.get("lifecycle_stage"),
        "edit_kind": row.get("edit_kind"),
        "preview_url": row.get("preview_url"),
        "created_at": row.get("created_at"),
    }


def enrich_from_chats(version: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    chats = ((payload.get("data") or {}).get("chats")) or []
    if not chats:
        return version
    chat = chats[0]
    merged = dict(version)
    merged.setdefault("title", chat.get("title"))
    merged.setdefault("project_id", chat.get("project_id"))
    merged.setdefault("model", chat.get("model"))
    merged.setdefault("scaffold_id", chat.get("scaffold_id"))
    return merged

# -*- coding: utf-8 -*-
"""Fly preview-host: sessionslista + runtime-loggar för sajtens preview.

`chatId` är preview-lanens pathnyckel; loggarna nycklas på `previewSessionId`.
Kontraktet ägs av `preview-host/src/server.js`.
"""

from __future__ import annotations

import shutil
import subprocess
from typing import Any
from urllib.parse import urlsplit

from ..httpjson import HttpClient
from . import STATUS_OK, STATUS_PARTIAL, STATUS_UNAVAILABLE

FLY_CLI_TIMEOUT_S = 45


def derive_fly_app(base_url: str | None) -> str | None:
    """`https://vm-fly-jakem.fly.dev` → `vm-fly-jakem`."""
    if not base_url:
        return None
    host = urlsplit(base_url).hostname or ""
    if host.endswith(".fly.dev"):
        return host[: -len(".fly.dev")] or None
    return None


def collect(
    *,
    base_url: str | None,
    api_key: str | None,
    chat_id: str | None,
    version_id: str | None = None,
    include_fly_cli: bool = False,
    timeout_s: float = 20.0,
) -> dict[str, Any]:
    if not base_url:
        return {
            "status": STATUS_UNAVAILABLE,
            "reason": "SAJTMASKIN_PREVIEW_HOST_BASE_URL saknas.",
        }

    base = base_url.rstrip("/")
    headers = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["X-Preview-Host-Key"] = api_key
    client = HttpClient(headers=headers, timeout_s=timeout_s)

    warnings: list[str] = []
    if not api_key:
        warnings.append(
            "SAJTMASKIN_PREVIEW_HOST_API_KEY saknas — icke-lokala /preview- och "
            "/admin-endpoints kräver nyckeln."
        )

    out: dict[str, Any] = {
        "status": STATUS_OK,
        "baseUrl": base,
        "health": client.get(f"{base}/health").as_dict(),
    }

    sessions = client.get(f"{base}/admin/sessions")
    out["sessions"] = sessions.as_dict()
    if not sessions.ok:
        warnings.append(f"/admin/sessions: {sessions.error or sessions.status}")

    match = find_session(sessions.payload, chat_id=chat_id, version_id=version_id)
    out["matchedSession"] = match
    mismatch = session_version_mismatch(match, version_id)
    if mismatch:
        # Loggen kan höra till en annan version — säg det i stället för att låta
        # rapporten se ut som om den beskriver den bedömda körningen.
        out["sessionVersionMismatch"] = mismatch
        warnings.append(
            f"Preview-sessionen tillhör version {mismatch['sessionVersionId']}, inte "
            f"{mismatch['expectedVersionId']} — logg-utdraget kan gälla en annan körning."
        )
    preview_session_id = (match or {}).get("previewSessionId")
    if preview_session_id:
        logs = client.get(f"{base}/preview/logs/{preview_session_id}")
        status = client.get(f"{base}/preview/session/{preview_session_id}/status")
        out["previewLogs"] = logs.as_dict()
        out["sessionStatus"] = status.as_dict()
        out["logTail"] = log_tail(logs.payload)
        if not logs.ok:
            warnings.append(f"/preview/logs: {logs.error or logs.status}")
    else:
        warnings.append(
            "Ingen preview-session matchade chatten — sessionen kan vara städad "
            "(hibernate/cleanup) sedan körningen."
        )

    if include_fly_cli:
        out["flyCli"] = _fly_logs(derive_fly_app(base))

    if warnings:
        out["warnings"] = warnings
        out["status"] = STATUS_PARTIAL
    return out


def find_session(
    payload: Any, *, chat_id: str | None, version_id: str | None = None
) -> dict[str, Any] | None:
    """Exakt träff (chat + version) först.

    En chat kan ha flera sessioner (ny session per version/omboot), så bara
    `chatId` kan peka på en annan versions preview-logg.
    """
    sessions = payload.get("sessions") if isinstance(payload, dict) else None
    if not isinstance(sessions, list):
        return None
    rows = [row for row in sessions if isinstance(row, dict)]
    if chat_id and version_id:
        for row in rows:
            if row.get("chatId") == chat_id and row.get("versionId") == version_id:
                return row
    if version_id:
        for row in rows:
            if row.get("versionId") == version_id:
                return row
    if chat_id:
        for row in rows:
            if row.get("chatId") == chat_id:
                return row
    return None


def session_version_mismatch(
    session: dict[str, Any] | None, version_id: str | None
) -> dict[str, Any] | None:
    """Sessionen matchade chatten men bär en annan version.

    En chat kan ha flera sessioner (ny version, omboot, städad session), så
    chat-fallbacken i `find_session` kan peka på en annan körnings logg.
    """
    if not session or not version_id:
        return None
    session_version = session.get("versionId")
    if not session_version or session_version == version_id:
        return None
    return {
        "previewSessionId": session.get("previewSessionId"),
        "sessionVersionId": session_version,
        "expectedVersionId": version_id,
    }


def log_tail(payload: Any, *, max_lines: int = 80) -> list[str]:
    lines = payload.get("lines") if isinstance(payload, dict) else None
    if not isinstance(lines, list):
        return []
    out: list[str] = []
    for row in lines[-max_lines:]:
        if isinstance(row, dict):
            stamp = str(row.get("ts") or "")
            message = str(row.get("message") or "")
            out.append(f"{stamp} {message}".strip())
        elif isinstance(row, str):
            out.append(row)
    return out


def _fly_logs(app: str | None) -> dict[str, Any]:
    if not app:
        return {"status": "skipped", "reason": "Kunde inte härleda Fly-appnamn ur bas-URL:en."}
    binary = shutil.which("fly") or shutil.which("flyctl")
    if not binary:
        return {"status": "skipped", "reason": "fly/flyctl finns inte på PATH."}
    try:
        proc = subprocess.run(  # noqa: S603 - fast argumentlista, ingen shell
            [binary, "logs", "-a", app, "--no-tail"],
            capture_output=True,
            text=True,
            timeout=FLY_CLI_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "app": app, "reason": f"fly logs timade ut efter {FLY_CLI_TIMEOUT_S}s."}
    except OSError as exc:
        return {"status": "error", "app": app, "reason": str(exc)}
    return {
        "status": "ok" if proc.returncode == 0 else "error",
        "app": app,
        "exitCode": proc.returncode,
        "stdout": (proc.stdout or "")[-60_000:],
        "stderrTail": (proc.stderr or "")[-4_000:],
    }

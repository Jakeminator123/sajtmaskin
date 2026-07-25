# -*- coding: utf-8 -*-
"""D-ID: credits-saldo + eventuella videogenereringar i tidsfönstret.

D-ID mäter **credits/sekunder**, inte tokens — avataren är presentatör medan
Sajtagenten (OpenClaw) är hjärnan. Saldot är därför en punktmätning ("så här
mycket finns kvar nu"), inte en kostnad för just den här körningen. En riktig
per-körning-siffra kräver att appen läser saldot före och efter, vilket är steg 2
i planen.

Auth: nyckeln från Studio har formen `API_USER:API_PASSWORD` och skickas enligt
D-ID:s dokumentation rått efter `Basic `. Vissa konton kräver base64 — därför
görs ett andra försök vid 401.
"""

from __future__ import annotations

import base64
import binascii
import datetime as dt
from typing import Any

from ..httpjson import HttpClient
from . import STATUS_OK, STATUS_PARTIAL, STATUS_UNAVAILABLE

DEFAULT_API_BASE = "https://api.d-id.com"
API_KEY_ENV = ("DID_API_KEY",)


def _looks_base64(value: str) -> bool:
    if ":" in value:
        return False
    try:
        base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return False
    return True


def auth_variants(api_key: str) -> list[str]:
    """Rå nyckel först (D-ID:s dokumenterade form), base64 som fallback."""
    key = api_key.strip()
    if _looks_base64(key):
        return [f"Basic {key}"]
    encoded = base64.b64encode(key.encode("utf-8")).decode("ascii")
    return [f"Basic {key}", f"Basic {encoded}"]


def collect(
    *,
    api_key: str | None,
    window_start: dt.datetime | None = None,
    window_end: dt.datetime | None = None,
    api_base: str = DEFAULT_API_BASE,
    timeout_s: float = 20.0,
) -> dict[str, Any]:
    if not api_key:
        return {
            "status": STATUS_UNAVAILABLE,
            "reason": (
                "Ingen D-ID-nyckel. Sätt "
                + " eller ".join(API_KEY_ENV)
                + " (Studio → Account settings → Generate API key). De publika "
                "NEXT_PUBLIC_AVATAR_*-värdena är client-nycklar och duger inte."
            ),
        }

    base = api_base.rstrip("/")
    warnings: list[str] = []
    credits = _get_with_auth(base + "/credits", api_key, timeout_s)
    if not credits.get("ok"):
        warnings.append(f"/credits: {credits.get('error') or credits.get('status')}")

    talks = _get_with_auth(base + "/talks?limit=20", api_key, timeout_s)
    talks_in_window: list[dict[str, Any]] | None = None
    if talks.get("ok"):
        talks_in_window = filter_talks(talks.get("payload"), window_start, window_end)
    else:
        warnings.append(f"/talks: {talks.get('error') or talks.get('status')}")

    out: dict[str, Any] = {
        "status": STATUS_OK,
        "credits": credits,
        "creditsSummary": summarize_credits(credits.get("payload")),
        "talks": talks,
        "talksInWindow": talks_in_window,
        "unitNote": "D-ID mäter credits/sekunder, inte tokens. Saldot är ett nuläge, inte körningens kostnad.",
    }
    if warnings:
        out["warnings"] = warnings
        out["status"] = STATUS_PARTIAL
    return out


def _get_with_auth(url: str, api_key: str, timeout_s: float) -> dict[str, Any]:
    last: dict[str, Any] = {}
    for header in auth_variants(api_key):
        client = HttpClient(headers={"Authorization": header, "Accept": "application/json"}, timeout_s=timeout_s)
        result = client.get(url)
        last = result.as_dict()
        if result.ok or result.status not in {401, 403}:
            return last
    return last


def summarize_credits(payload: Any) -> dict[str, Any] | None:
    """D-ID returnerar antingen `{credits: {...}}` eller en lista med poster."""
    if not isinstance(payload, dict):
        return None
    node = payload.get("credits")
    items: list[dict[str, Any]] = []
    if isinstance(node, dict):
        items = [node]
    elif isinstance(node, list):
        items = [row for row in node if isinstance(row, dict)]
    elif isinstance(payload.get("items"), list):
        items = [row for row in payload["items"] if isinstance(row, dict)]
    if not items:
        return None
    remaining = sum(_num(row.get("remaining")) for row in items)
    total = sum(_num(row.get("total")) for row in items)
    return {"remaining": remaining, "total": total, "items": len(items)}


def _num(value: Any) -> float:
    return float(value) if isinstance(value, (int, float)) else 0.0


def filter_talks(
    payload: Any, window_start: dt.datetime | None, window_end: dt.datetime | None
) -> list[dict[str, Any]]:
    rows = payload.get("talks") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    if window_start is None or window_end is None:
        return [row for row in rows if isinstance(row, dict)]
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        created = _parse_iso(row.get("created_at") or row.get("createdAt"))
        if created is not None and window_start <= created <= window_end:
            out.append(row)
    return out


def _parse_iso(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed

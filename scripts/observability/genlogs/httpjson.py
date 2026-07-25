# -*- coding: utf-8 -*-
"""Minimal HTTP-GET-klient (stdlib) för de externa loggkällorna.

Alla anrop är read-only och får aldrig avbryta insamlingen: fel returneras som
data i `HttpResult` i stället för att kastas.
"""

from __future__ import annotations

import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any

DEFAULT_TIMEOUT_S = 20.0
MAX_BODY_CHARS = 400_000


@dataclass
class HttpResult:
    url: str
    status: int | None = None
    payload: Any = None
    text: str | None = None
    error: str | None = None
    elapsed_ms: int | None = None

    @property
    def ok(self) -> bool:
        return self.status is not None and 200 <= self.status < 300 and self.error is None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"url": self.url, "status": self.status, "ok": self.ok}
        if self.error:
            out["error"] = self.error
        if self.elapsed_ms is not None:
            out["elapsedMs"] = self.elapsed_ms
        if self.payload is not None:
            out["payload"] = self.payload
        elif self.text is not None:
            out["text"] = self.text
        return out


@dataclass
class HttpClient:
    headers: dict[str, str] = field(default_factory=dict)
    timeout_s: float = DEFAULT_TIMEOUT_S
    verify_tls: bool = True

    def get(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        parse_json: bool = True,
    ) -> HttpResult:
        full_url = _with_params(url, params)
        request = urllib.request.Request(full_url, method="GET")
        for key, value in {**self.headers, **(headers or {})}.items():
            request.add_header(key, value)

        context: ssl.SSLContext | None = None
        if not self.verify_tls and full_url.lower().startswith("https"):
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

        started = _now_ms()
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s, context=context) as resp:
                raw = resp.read().decode("utf-8", errors="replace")[:MAX_BODY_CHARS]
                return _finish(full_url, resp.status, raw, parse_json, started)
        except urllib.error.HTTPError as exc:
            raw = ""
            try:
                raw = exc.read().decode("utf-8", errors="replace")[:MAX_BODY_CHARS]
            except Exception:  # noqa: BLE001 - felkroppen är best-effort
                pass
            result = _finish(full_url, exc.code, raw, parse_json, started)
            result.error = f"HTTP {exc.code} {exc.reason}"
            return result
        except (urllib.error.URLError, socket.timeout, ssl.SSLError, TimeoutError) as exc:
            return HttpResult(
                url=full_url,
                error=f"{type(exc).__name__}: {exc}",
                elapsed_ms=_now_ms() - started,
            )
        except Exception as exc:  # noqa: BLE001 - insamlingen får aldrig krascha
            return HttpResult(
                url=full_url,
                error=f"{type(exc).__name__}: {exc}",
                elapsed_ms=_now_ms() - started,
            )


def _finish(url: str, status: int, raw: str, parse_json: bool, started: int) -> HttpResult:
    result = HttpResult(url=url, status=status, elapsed_ms=_now_ms() - started)
    if parse_json:
        try:
            result.payload = json.loads(raw) if raw.strip() else None
            return result
        except json.JSONDecodeError:
            # NDJSON (Vercel event-strömmar) eller ren text.
            rows = _parse_ndjson(raw)
            if rows is not None:
                result.payload = rows
                return result
    result.text = raw
    return result


def _parse_ndjson(raw: str) -> list[Any] | None:
    rows: list[Any] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            rows.append(json.loads(stripped))
        except json.JSONDecodeError:
            return None
    return rows or None


def _with_params(url: str, params: dict[str, Any] | None) -> str:
    if not params:
        return url
    pairs: list[tuple[str, str]] = []
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            # Repeterad nyckel (OpenAI: group_by=model&group_by=project_id).
            pairs.extend((key, str(item)) for item in value)
        elif isinstance(value, bool):
            pairs.append((key, "true" if value else "false"))
        else:
            pairs.append((key, str(value)))
    if not pairs:
        return url
    separator = "&" if urllib.parse.urlsplit(url).query else "?"
    return f"{url}{separator}{urllib.parse.urlencode(pairs)}"


def _now_ms() -> int:
    import time

    return int(time.monotonic() * 1000)

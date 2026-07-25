# -*- coding: utf-8 -*-
"""Maskering av secrets innan något skrivs till disk.

Insamlade loggar innehåller ofta connection strings, Bearer-tokens och
signerade URL:er. Körningsmappen är gitignorerad, men den ska ändå kunna zippas
och skickas vidare utan att läcka nycklar.
"""

from __future__ import annotations

import re
from typing import Any

MASK = "***REDACTED***"

#: Mönster som maskeras oavsett om värdet finns i env eller inte.
_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Leverantörsnycklar: OpenAI (sk-, sk-admin-, sk-proj-), Anthropic, Vercel, Fly.
    re.compile(r"sk-(?:admin-|proj-|ant-)?[A-Za-z0-9_\-]{16,}"),
    re.compile(r"vcp_[A-Za-z0-9]{12,}"),
    re.compile(r"Fly[A-Za-z0-9]*Token\s+[A-Za-z0-9_\-\.]{12,}", re.IGNORECASE),
    re.compile(r"fo1_[A-Za-z0-9_\-]{12,}"),
    # JWT (Vercel OIDC, Supabase service role m.fl.).
    re.compile(r"eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"),
    # Lösenord i connection strings: postgres://user:pass@host
    re.compile(r"(?P<scheme>\b[a-z][a-z0-9+.\-]*://)(?P<user>[^:/@\s]+):(?P<pw>[^@/\s]+)@"),
    # Auth-headers och token-query-parametrar.
    re.compile(r"(?P<prefix>\b(?:Bearer|Basic)\s+)(?P<token>[A-Za-z0-9_\-\.:+/=]{12,})"),
    re.compile(
        r"(?P<prefix>[?&](?:token|key|api[_-]?key|access[_-]?token|secret)=)(?P<token>[^&\s\"']{8,})",
        re.IGNORECASE,
    ),
)


class Redactor:
    """Maskerar kända secret-värden plus mönstermatchningar."""

    def __init__(self, secret_values: list[str] | None = None) -> None:
        # Längsta först: annars kan ett kort delvärde maskera en del av ett
        # längre secret och lämna resten i klartext.
        self._literals = sorted(
            {value for value in (secret_values or []) if value and len(value) >= 8},
            key=len,
            reverse=True,
        )

    def text(self, value: str) -> str:
        out = value
        for literal in self._literals:
            if literal in out:
                out = out.replace(literal, MASK)
        for pattern in _PATTERNS:
            out = pattern.sub(_replace_match, out)
        return out

    def value(self, value: Any) -> Any:
        """Rekursiv maskering av JSON-liknande strukturer."""
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, dict):
            return {key: self.value(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [self.value(item) for item in value]
        return value


def _replace_match(match: re.Match[str]) -> str:
    groups = match.groupdict()
    if "scheme" in groups and groups.get("scheme"):
        return f"{groups['scheme']}{groups.get('user') or ''}:{MASK}@"
    if "prefix" in groups and groups.get("prefix"):
        return f"{groups['prefix']}{MASK}"
    return MASK

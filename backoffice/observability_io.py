# -*- coding: utf-8 -*-
"""Observability I/O helpers — separat från `backoffice/shared.py` så det
inte krockar med pågående städ-arbete där.

`load_tail_ndjson()` läser de sista N raderna från en NDJSON-fil utan att
ladda hela filen. Robust mot tre vanliga edge-cases:

  1. Filen finns inte → returnerar [].
  2. Filen är < tail-fönstret → läser hela filen.
  3. Tail-fönstret börjar mitt i en rad → första (potentiellt brutna) raden
     skippas så inkomplett JSON inte tystnar i `json.loads`-except.

Ändras: håll signaturen stabil — `database_health.py`, `redis_health.py`
och eventuella framtida observability-sidor anropar denna.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# 256 KB räcker för flera tusen NDJSON-rader och håller backoffice snabb.
_DEFAULT_TAIL_BYTES = 256_000


def load_tail_ndjson(
    path: Path,
    *,
    max_rows: int = 200,
    tail_bytes: int = _DEFAULT_TAIL_BYTES,
) -> list[dict[str, Any]]:
    """Läs de sista `max_rows` icke-tomma raderna från en NDJSON-fil.

    Säker mot:
      - Saknad fil (returnerar []).
      - Tom fil (returnerar []).
      - Fil < `tail_bytes` (läser hela filen).
      - Tail som börjar mitt i en rad (skippar första raden om vi inte läste
        hela filen).
      - Rader som inte är JSON-objekt (skippas tyst).
      - JSON som parser:as till icke-dict (t.ex. listor av misstag — skippas).
    """
    if not path.is_file():
        return []
    try:
        with path.open("rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            if size == 0:
                return []
            chunk = min(size, tail_bytes)
            fh.seek(size - chunk)
            raw = fh.read()
    except OSError:
        return []

    decoded = raw.decode("utf-8", errors="replace")
    raw_lines = [ln for ln in decoded.splitlines() if ln.strip()]
    if not raw_lines:
        return []

    # BUG-FIX 2026-04-24 (test-agent #5/#7): om vi inte läste hela filen
    # kan första raden vara halv. Skippa den för att inte få tyst
    # data-förlust eller överraskande JSONDecodeError-loggning.
    truncated_from_middle = chunk < size
    candidate_lines = raw_lines[1:] if truncated_from_middle else raw_lines

    results: list[dict[str, Any]] = []
    for ln in candidate_lines[-max_rows:]:
        try:
            obj = json.loads(ln)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            results.append(obj)
        # Annars: NDJSON-konventionen bryts — skippa istället för krascha.
    return results

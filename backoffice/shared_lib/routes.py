from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .io import read_text

ROUTE_TIMEOUT_DISPLAY: tuple[tuple[str, str], ...] = (
    ("src/app/api/engine/chats/stream/route.ts", "engineRouteMaxDurationSeconds"),
    ("src/app/api/engine/chats/[chatId]/stream/route.ts", "engineRouteMaxDurationSeconds"),
    ("src/app/api/ai/brief/route.ts", "assistRouteMaxDurationSeconds"),
    ("src/app/api/engine/chats/[chatId]/repair/route.ts", "verifyRepairRouteMaxDurationSeconds"),
    (
        "src/app/api/engine/chats/[chatId]/quality-gate/route.ts",
        "verifyRepairRouteMaxDurationSeconds",
    ),
)


def read_route_maxduration_literals(repo_root: Path) -> list[dict[str, Any]]:
    """Read-only drift status for the route ``maxDuration`` literals.

    Returns one row per target in :data:`ROUTE_TIMEOUT_DISPLAY` with the route's
    on-disk literal and the manifest field it maps to. Read-only by design: the
    backoffice never patches route files anymore — the codegen
    (``npm run route-timeouts:sync``) owns the literals and CI gates drift.

    ``literal`` is the integer found in the single ``export const maxDuration = N;``
    statement, or ``None`` when the file is missing or does not contain exactly
    one such literal (matching the codegen's exactly-one-match contract), so the
    UI can surface "saknas" / format-drift instead of silently showing a value.
    """
    rows: list[dict[str, Any]] = []
    for rel, manifest_field in ROUTE_TIMEOUT_DISPLAY:
        fp = repo_root / rel
        literal: int | None = None
        if fp.is_file():
            matches = re.findall(r"export const maxDuration = (\d+);", read_text(fp))
            if len(matches) == 1:
                literal = int(matches[0])
        rows.append({"rel": rel, "manifestField": manifest_field, "literal": literal})
    return rows

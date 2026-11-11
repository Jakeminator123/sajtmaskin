from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .io import read_text

# Kanonisk lista: `scripts/ai-models/route-timeout-targets.mjs` (codegen + CI-paritet).
# Panelen läser den filen; den här tuplen är bara fallback om filen saknas och
# hålls i paritet av `backoffice/test_route_timeout_targets.py`.
ROUTE_TIMEOUT_TARGETS_REL = "scripts/ai-models/route-timeout-targets.mjs"
ROUTE_TIMEOUT_DISPLAY: tuple[tuple[str, str], ...] = (
    ("src/app/api/engine/postchecks/route.ts", "engineRouteMaxDurationSeconds"),
    ("src/app/api/engine/chats/stream/route.ts", "engineRouteMaxDurationSeconds"),
    ("src/app/api/engine/chats/[chatId]/stream/route.ts", "engineRouteMaxDurationSeconds"),
    ("src/app/api/ai/brief/route.ts", "assistRouteMaxDurationSeconds"),
    ("src/app/api/engine/chats/[chatId]/repair/route.ts", "verifyRepairRouteMaxDurationSeconds"),
    (
        "src/app/api/engine/chats/[chatId]/quality-gate/route.ts",
        "verifyRepairRouteMaxDurationSeconds",
    ),
    ("src/app/api/v0/deployments/repair/route.ts", "verifyRepairRouteMaxDurationSeconds"),
)

_TARGET_RE = re.compile(r'rel:\s*"([^"]+)"\s*,\s*manifestField:\s*"([^"]+)"')


def read_route_timeout_targets(repo_root: Path) -> tuple[tuple[str, str], ...] | None:
    """``(rel, manifestField)`` per target from the canonical ``.mjs`` list.

    ``None`` when the file is missing or yields no target, so the caller can
    fall back to :data:`ROUTE_TIMEOUT_DISPLAY`.
    """
    fp = repo_root / ROUTE_TIMEOUT_TARGETS_REL
    if not fp.is_file():
        return None
    found = tuple((rel, field) for rel, field in _TARGET_RE.findall(read_text(fp)))
    return found or None


def read_route_maxduration_literals(repo_root: Path) -> list[dict[str, Any]]:
    """Read-only drift status for the route ``maxDuration`` literals.

    Returns one row per target in ``scripts/ai-models/route-timeout-targets.mjs``
    (fallback :data:`ROUTE_TIMEOUT_DISPLAY`) with the route's on-disk literal and
    the manifest field it maps to. Read-only by design: the backoffice never
    patches route files anymore — the codegen (``npm run route-timeouts:sync``)
    owns the literals and CI gates drift.

    ``literal`` is the integer found in the single ``export const maxDuration = N;``
    statement, or ``None`` when the file is missing or does not contain exactly
    one such literal (matching the codegen's exactly-one-match contract), so the
    UI can surface "saknas" / format-drift instead of silently showing a value.
    """
    targets = read_route_timeout_targets(repo_root) or ROUTE_TIMEOUT_DISPLAY
    rows: list[dict[str, Any]] = []
    for rel, manifest_field in targets:
        fp = repo_root / rel
        literal: int | None = None
        if fp.is_file():
            matches = re.findall(r"export const maxDuration = (\d+);", read_text(fp))
            if len(matches) == 1:
                literal = int(matches[0])
        rows.append({"rel": rel, "manifestField": manifest_field, "literal": literal})
    return rows

"""Read-only helpers for the generated dossier capability projection.

This module owns projection loading, source fingerprinting and drift-preview
logic. It deliberately has no Streamlit, subprocess, repository-lock or write
dependencies; regeneration and every mutation remain in ``io.py``.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _load_group_view(capability_map_path: Path) -> dict[str, Any]:
    """Read the generated dossier-group view from a capability map.

    The canonical capability-to-group mapping lives in TypeScript and is
    projected into ``capability-map.json``. Missing or malformed projections
    therefore yield an empty view instead of a second Python-owned mapping.
    """
    if not capability_map_path.exists():
        return {}
    try:
        data = json.loads(capability_map_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    groups = data.get("groups")
    return groups if isinstance(groups, dict) else {}


_MANIFEST_SOURCE_RE = re.compile(
    r"^data/dossiers/(?:hard|soft)/[^/]+/manifest\.json$"
)


def _is_repo_relative_key(key: str) -> bool:
    """Return whether a projection source key is safely repo-relative."""
    if (
        not key
        or key.startswith("/")
        or key.startswith("\\")
        or "\\" in key
        or ":" in key
    ):
        return False
    return ".." not in key.split("/")


def _capability_map_source_paths(
    current: dict[str, Any],
    *,
    repo_root: Path,
    dossier_root: Path,
) -> list[tuple[str, Path]] | None:
    """Resolve the sources declared by the projection plus live manifests.

    Fixed source paths come from the projection itself, avoiding a Python copy
    of the TypeScript generator's list. Manifests are globbed so additions and
    removals that are absent from stored keys still register as drift.
    """
    stored = current.get("sourceFiles")
    if not isinstance(stored, dict):
        return None
    fixed = sorted(
        key
        for key in stored
        if isinstance(key, str)
        and not _MANIFEST_SOURCE_RE.match(key)
        and _is_repo_relative_key(key)
    )
    if not fixed:
        return None
    entries = [(key, repo_root / key) for key in fixed]
    for klass in ("hard", "soft"):
        for path in sorted((dossier_root / klass).glob("*/manifest.json")):
            entries.append((path.relative_to(repo_root).as_posix(), path))
    return sorted(entries, key=lambda entry: entry[0])


def _capability_map_source_fingerprints(
    current: dict[str, Any],
    *,
    repo_root: Path,
    dossier_root: Path,
) -> dict[str, str] | None:
    entries = _capability_map_source_paths(
        current,
        repo_root=repo_root,
        dossier_root=dossier_root,
    )
    if entries is None:
        return None
    fingerprints: dict[str, str] = {}
    try:
        for relative, path in entries:
            # Match the TypeScript generator: CRLF and LF hash identically.
            fingerprints[relative] = hashlib.sha256(
                path.read_bytes().replace(b"\r\n", b"\n")
            ).hexdigest()
    except OSError:
        return None
    return dict(sorted(fingerprints.items()))


def _capability_map_is_stale(
    current: dict[str, Any],
    *,
    repo_root: Path,
    dossier_root: Path,
) -> bool:
    """Compare exact source hashes, not mtimes or counts."""
    expected = _capability_map_source_fingerprints(
        current,
        repo_root=repo_root,
        dossier_root=dossier_root,
    )
    stored = current.get("sourceFiles")
    return expected is None or not isinstance(stored, dict) or stored != expected


def _group_label_for_capability(
    capability: str | None,
    groups: dict[str, Any],
) -> str:
    """Resolve a capability's projected Swedish group label."""
    key = (capability or "").strip().lower()
    if key:
        for info in groups.values():
            listed = [str(c).strip().lower() for c in (info.get("capabilities") or [])]
            if key in listed:
                return info.get("label") or "Övrigt"
    return "Övrigt"


def _groups_view_is_stale(
    groups: dict[str, Any],
    dossiers: list[dict[str, Any]],
) -> bool:
    """Return whether the projected groups omit a live capability."""
    if not groups:
        return True
    covered: set[str] = set()
    for info in groups.values():
        for capability in info.get("capabilities") or []:
            covered.add(str(capability).strip().lower())
    live = {
        str(dossier.get("capability") or "").strip().lower()
        for dossier in dossiers
        if dossier.get("capability")
    }
    return not live.issubset(covered)


def _rebuild_capability_map(dossiers: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the capabilities field used only for read-only drift preview."""
    by_capability: dict[str, list[str]] = {}
    for dossier in dossiers:
        capability = str(dossier.get("capability") or "").strip() or "uncategorized"
        directory_name = (
            str(dossier.get("_path") or "")
            .replace("\\", "/")
            .rstrip("/")
            .rsplit("/", 1)[-1]
        )
        by_capability.setdefault(capability, []).append(
            directory_name or str(dossier.get("id") or "")
        )
    for capability in by_capability:
        by_capability[capability].sort()
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "capabilities": dict(sorted(by_capability.items())),
    }


def _extract_ts_union_values(path: Path, type_name: str) -> list[str]:
    """Extract quoted literal values from a simple TypeScript union."""
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    pattern = rf"type\s+{re.escape(type_name)}\s*=\s*([^;]+);"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return []
    values: list[str] = []
    for token in match.group(1).split("|"):
        value = token.strip().strip('"').strip("'")
        if value:
            values.append(value)
    return values

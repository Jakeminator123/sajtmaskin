from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def load_latest_prompt_size_metrics(repo_root: Path) -> dict[str, Any] | None:
    """Read `data/prompt-dumps/orchestration-dynamic/generation-input-package.json`
    and return its `promptSize` payload along with light context (lineageHash,
    scaffoldId, variantId, mtime).

    Returns ``None`` when the dump file does not exist or is unreadable.
    The dump only exists when ``SAJTMASKIN_PROMPT_DUMP=true`` was set during
    the most recent generation; backoffice pages should fall back gracefully.

    Schema is intentionally narrow — we only surface the bytes/tokens
    summary, not the entire generation-input-package, because the latter
    can be very large and is already inspectable via the file system.
    """
    dump_path = (
        repo_root
        / "data"
        / "prompt-dumps"
        / "orchestration-dynamic"
        / "generation-input-package.json"
    )
    if not dump_path.is_file():
        return None
    payload = _load_json_file(dump_path)
    if not isinstance(payload, dict):
        return None
    prompt_size = payload.get("promptSize")
    if not isinstance(prompt_size, dict):
        return None
    try:
        mtime = datetime.fromtimestamp(dump_path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        mtime = None
    return {
        "promptSize": prompt_size,
        "lineageHash": payload.get("lineageHash"),
        "scaffoldId": payload.get("scaffoldId"),
        "variantId": payload.get("variantId"),
        "dumpPath": dump_path.relative_to(repo_root).as_posix(),
        "dumpedAtUtc": mtime.isoformat() if mtime else None,
    }


PROMPT_DUMP_SPECS: dict[str, dict[str, Any]] = {
    "orchestration-dynamic": {
        "label": "Orchestration dynamic",
        "expected_files": ("latest.md", "generation-input-package.json", "meta.json"),
    },
    "own-engine-codegen": {
        "label": "Own-engine codegen",
        "expected_files": ("full-system.md", "dynamic-context.md", "meta.json"),
    },
    "plan-mode-planner": {
        "label": "Plan mode planner",
        "expected_files": (
            "planner-preamble.md",
            "dynamic-context.md",
            "full-system.md",
            "meta.json",
        ),
    },
}


def _load_json_file(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _normalize_bool_env(raw: str | None) -> bool:
    value = (raw or "").strip().lower()
    return value in {"1", "true", "yes"}
def _parse_iso8601(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def collect_prompt_dump_statuses(
    repo_root: Path,
    env_value: str | None = None,
    fresh_hours: int = 6,
) -> list[dict[str, Any]]:
    base_dir = repo_root / "data" / "prompt-dumps"
    env_enabled = _normalize_bool_env(
        env_value if env_value is not None else os.environ.get("SAJTMASKIN_PROMPT_DUMP")
    )

    statuses: list[dict[str, Any]] = []
    for category, spec in PROMPT_DUMP_SPECS.items():
        dump_dir = base_dir / category
        meta_path = dump_dir / "meta.json"
        meta = _load_json_file(meta_path) or {}

        expected_files = list(spec["expected_files"])
        present_files = [name for name in expected_files if (dump_dir / name).is_file()]
        missing_files = [name for name in expected_files if name not in present_files]
        payload_files_present = [name for name in present_files if name != "meta.json"]

        dumped_at = str(meta.get("dumpedAt", "")).strip() or None
        status_updated_at = str(meta.get("statusUpdatedAt", "")).strip() or None
        meta_enabled = meta.get("dumpingEnabled")
        dumping_enabled = meta_enabled if isinstance(meta_enabled, bool) else env_enabled

        dumped_at_dt = _parse_iso8601(dumped_at)
        age_hours = (
            None
            if dumped_at_dt is None
            else (datetime.now(timezone.utc) - dumped_at_dt).total_seconds() / 3600
        )

        if not dumping_enabled:
            status = "disabled"
            note = (
                "Dumpning är avstängd; befintliga payloadfiler kan vara stale."
                if payload_files_present
                else "Dumpning är avstängd; inga aktuella payloadfiler hittades."
            )
        elif dumped_at is None:
            status = "missing-meta"
            note = "Dumpning verkar aktiv, men dumpedAt saknas."
        elif dumped_at_dt is None:
            status = "invalid-meta"
            note = "dumpedAt kunde inte tolkas."
        elif age_hours is not None and age_hours <= fresh_hours:
            status = "fresh"
            note = "Senaste dump är färsk nog för felsökning."
        else:
            status = "stale-risk"
            note = (
                "Senaste dump ser gammal ut; kontrollera tidsstämpeln innan du litar på latest-filerna."
            )

        statuses.append(
            {
                "category": category,
                "label": spec["label"],
                "status": status,
                "dumpingEnabled": dumping_enabled,
                "dumpedAt": dumped_at,
                "statusUpdatedAt": status_updated_at,
                "ageHours": age_hours,
                "presentFiles": present_files,
                "missingFiles": missing_files,
                "note": note,
                "metaPath": str(meta_path),
            }
        )

    return statuses

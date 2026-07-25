# -*- coding: utf-8 -*-
"""Körningsmappar under `data/gen-logs/` + rotation (`MAX_GEN_LOGS`)."""

from __future__ import annotations

import base64
import datetime as dt
import json
import re
import shutil
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

DEFAULT_OUT_DIR = "data/gen-logs"
DEFAULT_MAX_GEN_LOGS = 10
MAX_GEN_LOGS_ENV = "MAX_GEN_LOGS"

#: `2026-07-24_231205Z_86c4bb41` — sorterbar och laglig på Windows (inga `:`).
RUN_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{6}Z_[A-Za-z0-9._\-]+$")


def build_run_dir_name(collected_at: dt.datetime, chat_id: str | None) -> str:
    stamp = collected_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%d_%H%M%SZ")
    suffix = _slug(chat_id) if chat_id else "okand-chat"
    return f"{stamp}_{suffix}"


def unique_run_dir_name(root: Path, name: str, *, max_attempts: int = 50) -> str:
    """Undvik krock när två körningar startar samma sekund."""
    if not (root / name).exists():
        return name
    for index in range(2, max_attempts + 1):
        candidate = f"{name}-{index}"
        if not (root / candidate).exists():
            return candidate
    return f"{name}-{max_attempts + 1}"


def _slug(value: str, *, limit: int = 20) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-")
    return (cleaned[:limit] or "okand").lower()


def resolve_max_gen_logs(env_value: str | None, cli_value: int | None) -> tuple[int, str | None]:
    """CLI vinner över env. Returnerar `(värde, varning)`."""
    if cli_value is not None:
        if cli_value < 1:
            return DEFAULT_MAX_GEN_LOGS, f"--max-logs={cli_value} är < 1; använder {DEFAULT_MAX_GEN_LOGS}."
        return cli_value, None
    if env_value is None or env_value.strip() == "":
        return DEFAULT_MAX_GEN_LOGS, None
    try:
        parsed = int(env_value.strip())
    except ValueError:
        return DEFAULT_MAX_GEN_LOGS, f"{MAX_GEN_LOGS_ENV}={env_value!r} är inte ett tal; använder {DEFAULT_MAX_GEN_LOGS}."
    if parsed < 1:
        return DEFAULT_MAX_GEN_LOGS, f"{MAX_GEN_LOGS_ENV}={parsed} är < 1; använder {DEFAULT_MAX_GEN_LOGS}."
    return parsed, None


def list_run_dirs(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(
        (child for child in root.iterdir() if child.is_dir() and RUN_DIR_RE.match(child.name)),
        key=lambda path: path.name,
    )


def rotate_run_dirs(root: Path, max_logs: int, *, keep: Path | None = None) -> list[str]:
    """Behåll de `max_logs` nyaste körningsmapparna. Returnerar raderade namn.

    Raderar bara mappar som matchar `RUN_DIR_RE` direkt under `root` — aldrig
    något användaren råkat lägga där, och aldrig utanför `root`.
    """
    dirs = list_run_dirs(root)
    if len(dirs) <= max_logs:
        return []
    doomed = dirs[: len(dirs) - max_logs]
    removed: list[str] = []
    for path in doomed:
        if keep is not None and path.resolve() == keep.resolve():
            continue
        try:
            shutil.rmtree(path)
            removed.append(path.name)
        except OSError:
            continue
    return removed


class JsonSafeEncoder(json.JSONEncoder):
    """Gör DB-rader JSON-skrivbara utan att tappa information."""

    def default(self, o: Any) -> Any:
        if isinstance(o, (dt.datetime, dt.date, dt.time)):
            return o.isoformat()
        if isinstance(o, dt.timedelta):
            return o.total_seconds()
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, uuid.UUID):
            return str(o)
        if isinstance(o, (bytes, bytearray, memoryview)):
            return base64.b64encode(bytes(o)).decode("ascii")
        if isinstance(o, set):
            return sorted(str(item) for item in o)
        return str(o)


@dataclass
class RunStore:
    """Skriver filer i en körningsmapp och håller reda på vad som skrevs."""

    run_dir: Path
    redactor: Any = None
    files: dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.run_dir.mkdir(parents=True, exist_ok=True)

    def write_json(self, rel_path: str, payload: Any) -> Path:
        data = self.redactor.value(payload) if self.redactor is not None else payload
        text = json.dumps(data, ensure_ascii=False, indent=2, cls=JsonSafeEncoder)
        return self.write_text(rel_path, text)

    def write_text(self, rel_path: str, text: str) -> Path:
        safe = self.redactor.text(text) if self.redactor is not None else text
        target = self._resolve(rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(safe, encoding="utf-8")
        self.files[rel_path] = len(safe.encode("utf-8"))
        return target

    def _resolve(self, rel_path: str) -> Path:
        target = (self.run_dir / rel_path).resolve()
        root = self.run_dir.resolve()
        if root != target and root not in target.parents:
            raise ValueError(f"Sökvägen lämnar körningsmappen: {rel_path}")
        return target

    @property
    def total_bytes(self) -> int:
        return sum(self.files.values())

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pandas as pd

def find_workload(manifest: dict[str, Any], workload_id: str) -> dict[str, Any] | None:
    for workload in manifest.get("workloads") or []:
        if isinstance(workload, dict) and workload.get("id") == workload_id:
            return workload
    return None


def load_fault_fix_csv(path: Path) -> tuple[pd.DataFrame, str | None]:
    if not path.is_file():
        return pd.DataFrame(), f"Filen `{path.as_posix()}` saknas."
    try:
        return pd.read_csv(path, encoding="utf-8"), None
    except Exception as exc:  # pragma: no cover - defensive UI helper
        return pd.DataFrame(), f"Kunde inte läsa error-log.csv: {exc}"


def read_autofix_runtime_config(path: Path) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "maxAttemptsPerReason": None,
        "maxAutofixPerChat": None,
        "softOnlyReasons": [],
    }
    if not path.exists():
        return payload
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return payload

    # The constants are declared as `readClientNumberEnv("ENV_NAME", <default>)`
    # (the env override is a build-time NEXT_PUBLIC_* value the backoffice can't
    # see, so we read the source default). Older revisions used a plain
    # `const X = <n>;`; accept both forms so this panel keeps working across
    # branches instead of silently showing `None`.
    def _read_const_int(name: str) -> int | None:
        call_match = re.search(
            rf"const {name}\s*=\s*readClientNumberEnv\([^)]*?,\s*(\d+)\s*,?\s*\)\s*;",
            text,
        )
        if call_match:
            return int(call_match.group(1))
        literal_match = re.search(rf"const {name}\s*=\s*(\d+)\s*;", text)
        if literal_match:
            return int(literal_match.group(1))
        return None

    payload["maxAttemptsPerReason"] = _read_const_int("MAX_ATTEMPTS_PER_REASON")
    payload["maxAutofixPerChat"] = _read_const_int("MAX_AUTOFIX_PER_CHAT")

    m_soft = re.search(
        r"const SOFT_ONLY_AUTOFIX_REASONS = new Set\(\[(.*?)\]\);",
        text,
        re.DOTALL,
    )
    if m_soft:
        payload["softOnlyReasons"] = re.findall(r'"([^"]+)"', m_soft.group(1))

    return payload

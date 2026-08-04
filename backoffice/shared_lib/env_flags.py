from __future__ import annotations

import importlib.util
import os
from pathlib import Path

from .context import BackofficeContext

def resolve_metrics_endpoint() -> tuple[str, str | None]:
    """Returns ``(base_url, token)`` for the ``/api/metrics`` endpoint.

    Base URL preference order:
      1. ``SAJTMASKIN_METRICS_BASE_URL``
      2. ``SAJTMASKIN_BASE_URL``
      3. ``http://localhost:3000`` (dev fallback)

    Token comes from ``SAJTMASKIN_METRICS_TOKEN``. Returns ``token=None`` when
    the env var is unset or empty so the caller can render its own UX.
    """

    base_url = (
        os.environ.get("SAJTMASKIN_METRICS_BASE_URL", "").strip()
        or os.environ.get("SAJTMASKIN_BASE_URL", "").strip()
        or "http://localhost:3000"
    )
    base_url = base_url.rstrip("/")
    token = os.environ.get("SAJTMASKIN_METRICS_TOKEN", "").strip() or None
    return base_url, token
def _load_manage_env_helpers(manage_env_script: Path):
    spec = importlib.util.spec_from_file_location("manage_env", str(manage_env_script))
    if spec is None or spec.loader is None:
        return None, None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception:
        return None, None
    return getattr(mod, "parse_env_file", None), getattr(mod, "set_in_env_file", None)


def read_env_flag(ctx: BackofficeContext, key: str) -> bool:
    parse_env_file, _ = _load_manage_env_helpers(ctx.manage_env_script)
    if parse_env_file is None:
        return False
    env_data = parse_env_file(ctx.env_local)
    val = env_data.get(key, "").strip().lower()
    return val in ("true", "1")


def write_env_flag(ctx: BackofficeContext, key: str, enabled: bool) -> bool:
    _, set_in_env_file = _load_manage_env_helpers(ctx.manage_env_script)
    if set_in_env_file is None:
        return False
    try:
        set_in_env_file(ctx.env_local, key, "true" if enabled else "false")
        return True
    except Exception:
        return False

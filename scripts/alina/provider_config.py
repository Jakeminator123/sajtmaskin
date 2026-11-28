"""The hosted worker receives provider secrets from its runtime."""

import os
from pathlib import Path


def provider_key(name):
    value = os.environ.get(name, "").strip()
    if value:
        return value
    local = Path(__file__).resolve().parents[2] / ".env.local"
    if os.environ.get("ALINA_HOSTED") != "1" and local.is_file():
        for line in local.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith(name + "="):
                return line.partition("=")[2].strip().strip('"').strip("'")
    raise RuntimeError(f"{name} saknas.")

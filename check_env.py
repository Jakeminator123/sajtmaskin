#!/usr/bin/env python3
"""
Compatibility wrapper for legacy `check_env.py` usage.

Canonical env tooling now lives in `manage_env.py`.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    manage_env = script_dir / "manage_env.py"
    if not manage_env.exists():
        print("manage_env.py not found")
        return 1

    print("check_env.py is deprecated; forwarding to manage_env.py audit")
    result = subprocess.run([sys.executable, str(manage_env), "audit", *sys.argv[1:]])
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())

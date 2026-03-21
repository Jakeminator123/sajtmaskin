"""
Bakåtkompatibilitet: skriptet ligger nu i repo-roten under scripts/hamta_sidor.py
Kör från projektroten:  python scripts/hamta_sidor.py
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

_TARGET = Path(__file__).resolve().parents[2] / "scripts" / "hamta_sidor.py"
if not _TARGET.is_file():
    print(f"[FEL] Hittar inte {_TARGET}", file=sys.stderr)
    sys.exit(1)

runpy.run_path(str(_TARGET), run_name="__main__")

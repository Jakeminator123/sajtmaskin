"""
Backward-compatible entrypoint for the old `scripts/hamta_sidor.py` scraper.

Implementation lives in `hamta_sidor_branch_emil.py` (canonical). This wrapper
forwards argv and injects `--legacy-wide-use-cases` when missing so the category
list matches the historical script unless you override explicitly.

Prefer calling the canonical script directly:

  python scripts/hamta_sidor_branch_emil.py
  python scripts/hamta_sidor_branch_emil.py --legacy-wide-use-cases
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    here = Path(__file__).resolve().parent
    target = here / "hamta_sidor_branch_emil.py"
    if not target.is_file():
        print(f"error: missing {target}", file=sys.stderr)
        return 2

    print(
        "note: scripts/hamta_sidor.py forwards to hamta_sidor_branch_emil.py "
        "(see scripts/README.md).\n",
        file=sys.stderr,
    )
    forward = list(sys.argv[1:])
    if "--legacy-wide-use-cases" not in forward:
        forward.insert(0, "--legacy-wide-use-cases")
    return subprocess.call([sys.executable, str(target), *forward])


if __name__ == "__main__":
    raise SystemExit(main())

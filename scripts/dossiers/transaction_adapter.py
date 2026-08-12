from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backoffice.pages.dossiers_lib.io import (
    _allocate_curated_dossier_stage,
    _cleanup_curated_dossier_stage,
    _commit_curated_dossier_stage,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Thin owner for dossier live-tree transactions."
    )
    subparsers = parser.add_subparsers(dest="operation", required=True)
    allocate = subparsers.add_parser("allocate")
    allocate.add_argument("--id", dest="target_id", required=True)
    cleanup = subparsers.add_parser("cleanup")
    cleanup.add_argument("--stage", type=Path, required=True)
    curate = subparsers.add_parser("curate")
    curate.add_argument("--stage", type=Path, required=True)
    curate.add_argument("--class", dest="target_class", required=True)
    curate.add_argument("--id", dest="target_id", required=True)
    curate.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.operation == "allocate":
        ok, message = _allocate_curated_dossier_stage(args.target_id)
    elif args.operation == "cleanup":
        ok, message = _cleanup_curated_dossier_stage(args.stage)
    else:
        ok, message = _commit_curated_dossier_stage(
            args.stage, args.target_class, args.target_id, force=args.force
        )
    print(message, file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

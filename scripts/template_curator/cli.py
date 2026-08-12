"""Command-line entrypoint for the Template (v0-mall) curator."""

from __future__ import annotations

import argparse
import dataclasses
import json
from pathlib import Path
from typing import Any

from scripts.template_curator import catalog
from scripts.template_curator.runner import curate_templates, write_report

MAX_ANALYZE_TEMPLATES = 100


def _enum_values() -> list[str]:
    return [str(item.value) for item in catalog.CatalogScope]


def _parse_csv(values: list[str] | None) -> list[str]:
    return list(dict.fromkeys(part.strip() for value in values or [] for part in value.split(",") if part.strip()))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="List or statically analyze selected Template (v0-mall) Blob archives.",
    )
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--scope", choices=_enum_values(), default="blob")
    parser.add_argument("--ids", action="append", help="Comma-separated canonical template ids.")
    parser.add_argument("--category", action="append", help="Category filter; repeatable.")
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Explicitly opt into Blob downloads and static ZIP analysis. Default is network-free listing.",
    )
    parser.add_argument("--output", type=Path, help="Optional report JSON path (analysis mode only).")
    return parser


def _selection(snapshot: Any, args: argparse.Namespace) -> list[Any]:
    scope = catalog.CatalogScope(args.scope)
    records = list(catalog.scope_records(snapshot, scope))
    ids = _parse_csv(args.ids)
    categories = _parse_csv(args.category)
    try:
        return list(
            catalog.filter_records(
                records,
                ids=ids or None,
                categories=categories or None,
                limit=args.limit,
            )
        )
    except TypeError:
        # Kept intentionally narrow for early callers if the catalog chooses
        # singular `category` or a snapshot-first signature.
        return list(
            catalog.filter_records(
                snapshot,
                scope=scope,
                ids=ids or None,
                category=categories or None,
                limit=args.limit,
            )
        )


def _row(record: Any) -> dict[str, Any]:
    if dataclasses.is_dataclass(record):
        raw = dataclasses.asdict(record)
    elif hasattr(record, "__dict__"):
        raw = vars(record)
    else:
        raw = dict(record)
    return {
        "id": raw.get("id") or raw.get("template_id"),
        "title": raw.get("title"),
        "category": raw.get("category"),
        "archiveSha256": raw.get("archive_sha256") or raw.get("archiveSha256"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive integer")
    explicit_ids = _parse_csv(args.ids)
    explicit_categories = _parse_csv(args.category)
    if args.analyze and not (
        explicit_ids or explicit_categories or args.limit is not None
    ):
        parser.error(
            "--analyze requires an explicit selector: --ids, --category, "
            "or a positive --limit"
        )
    if (
        args.analyze
        and args.limit is not None
        and args.limit > MAX_ANALYZE_TEMPLATES
    ):
        parser.error(
            f"--limit may not exceed {MAX_ANALYZE_TEMPLATES} in analysis mode"
        )
    repo_root = args.repo_root.resolve()
    snapshot = catalog.load_catalog(repo_root=repo_root)
    records = _selection(snapshot, args)
    if not args.analyze:
        print(json.dumps({"scope": args.scope, "count": len(records), "templates": [_row(record) for record in records]}, ensure_ascii=False, indent=2))
        return 0
    if len(records) > MAX_ANALYZE_TEMPLATES:
        parser.error(
            f"analysis selected {len(records)} templates; refine the selector "
            f"to at most {MAX_ANALYZE_TEMPLATES}"
        )

    counts = getattr(snapshot, "counts", None)
    if callable(counts):
        counts = counts()
    if counts is None:
        scope_counts = getattr(snapshot, "scope_counts", {})
        counts = {
            getattr(key, "value", str(key)): value
            for key, value in scope_counts.items()
        }
    report = curate_templates(
        records,
        repo_root=repo_root,
        scope=args.scope,
        extractor_sha256=getattr(snapshot, "extractor_sha256", None),
        catalog_counts=counts,
        catalog_error=getattr(snapshot, "error", None),
        addenda_valid=getattr(snapshot, "addenda_valid", None),
    )
    destination = write_report(report, repo_root, output_path=args.output)
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

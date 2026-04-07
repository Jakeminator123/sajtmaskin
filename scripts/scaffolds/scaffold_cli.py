#!/usr/bin/env python3
"""
Canonical scaffold pipeline CLI.

This command is the manual entrypoint for scaffold-oriented operations and
delegates to existing low-level scripts.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PIPELINE_ROOT = REPO_ROOT / "data" / "external-template-pipeline"
SCRAPE_CACHE_CURRENT = PIPELINE_ROOT / "scrape-cache" / "current"
RAW_DISCOVERY_CURRENT = PIPELINE_ROOT / "raw-discovery" / "current"
DOSSIERS_ROOT = PIPELINE_ROOT / "reference-library" / "dossiers"
TEMPLATE_LIBRARY_GENERATED = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
TEMPLATE_LIBRARY_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
SCAFFOLD_RESEARCH = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-research.generated.json"
SCAFFOLD_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"
SCAFFOLD_EVAL_LATEST = REPO_ROOT / "data" / "scaffold-eval" / "reports" / "scaffold-selection-latest.json"


class CliError(RuntimeError):
    """Raised when a subcommand fails."""


def run(cmd: Sequence[str], *, dry_run: bool = False) -> None:
    printable = " ".join(f'"{part}"' if " " in part else part for part in cmd)
    print(f"> {printable}")
    if dry_run:
        return
    completed = subprocess.run(cmd, cwd=str(REPO_ROOT), check=False)
    if completed.returncode != 0:
        raise CliError(f"Command failed with exit code {completed.returncode}: {printable}")


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def summary_path_for_scrape(scrape_root: Path) -> Path | None:
    cleaned = scrape_root / "summary-cleaned.json"
    if cleaned.exists():
        return cleaned
    raw = scrape_root / "summary.json"
    if raw.exists():
        return raw
    return None


def count_dossiers() -> int:
    if not DOSSIERS_ROOT.exists():
        return 0
    return sum(1 for entry in DOSSIERS_ROOT.iterdir() if entry.is_dir())


def build_status_payload(scrape_root: Path) -> dict[str, Any]:
    scrape_summary = summary_path_for_scrape(scrape_root)
    raw_summary = RAW_DISCOVERY_CURRENT / "summary.json"
    template_library = load_json(TEMPLATE_LIBRARY_GENERATED)
    scaffold_research = load_json(SCAFFOLD_RESEARCH)
    scaffold_embeddings = load_json(SCAFFOLD_EMBEDDINGS)
    template_embeddings = load_json(TEMPLATE_LIBRARY_EMBEDDINGS)
    eval_latest = load_json(SCAFFOLD_EVAL_LATEST)

    return {
        "paths": {
            "scrapeRoot": str(scrape_root),
            "rawDiscoveryRoot": str(RAW_DISCOVERY_CURRENT),
        },
        "availability": {
            "scrapeSummary": str(scrape_summary) if scrape_summary else None,
            "rawDiscoverySummary": str(raw_summary) if raw_summary.exists() else None,
            "templateLibraryGenerated": TEMPLATE_LIBRARY_GENERATED.exists(),
            "scaffoldResearchGenerated": SCAFFOLD_RESEARCH.exists(),
            "scaffoldEmbeddingsGenerated": SCAFFOLD_EMBEDDINGS.exists(),
            "templateLibraryEmbeddingsGenerated": TEMPLATE_LIBRARY_EMBEDDINGS.exists(),
            "scaffoldEvalLatest": SCAFFOLD_EVAL_LATEST.exists(),
        },
        "counts": {
            "dossiers": count_dossiers(),
            "templateLibraryCurated": (template_library or {}).get("curatedTemplates"),
            "templateLibraryEntries": len((template_library or {}).get("entries", [])) if template_library else None,
            "scaffoldFamiliesInResearch": len((scaffold_research or {}).get("scaffolds", {})) if scaffold_research else None,
            "scaffoldEmbeddings": len((scaffold_embeddings or {}).get("embeddings", [])) if scaffold_embeddings else None,
            "templateLibraryEmbeddings": len((template_embeddings or {}).get("embeddings", [])) if template_embeddings else None,
            "evalCases": (eval_latest or {}).get("summary", {}).get("total") if eval_latest else None,
        },
    }


def run_import(
    *,
    scrape_source: Path,
    label: str,
    format_name: str | None,
    output_root: Path | None,
    dry_run: bool,
) -> None:
    cmd = [
        "npx",
        "tsx",
        "scripts/template-library/import-template-discovery.ts",
        f"--from={scrape_source}",
        f"--label={label}",
    ]
    if format_name:
        cmd.append(f"--format={format_name}")
    if output_root is not None:
        cmd.append(f"--output={output_root}")
    run(cmd, dry_run=dry_run)


def run_hydrate(*, source_root: Path, max_repos: int | None, dry_run: bool) -> None:
    cmd = [
        "npx",
        "tsx",
        "scripts/template-library/hydrate-template-library-cache.ts",
        f"--source={source_root}",
    ]
    if max_repos is not None:
        cmd.append(f"--max={max_repos}")
    run(cmd, dry_run=dry_run)


def run_build(*, source_root: Path, dry_run: bool) -> None:
    run(
        [
            "npx",
            "tsx",
            "scripts/template-library/build-template-library.ts",
            f"--source={source_root}",
        ],
        dry_run=dry_run,
    )


def run_embeddings(*, include_template_library: bool, dry_run: bool) -> None:
    if include_template_library:
        run(
            [
                "npx",
                "tsx",
                "scripts/embeddings/generate-template-library-embeddings.ts",
            ],
            dry_run=dry_run,
        )
    run(
        [
            "npx",
            "tsx",
            "scripts/embeddings/generate-scaffold-embeddings.ts",
        ],
        dry_run=dry_run,
    )


def run_eval(*, eval_cases_path: Path | None, dry_run: bool) -> None:
    cmd = [
        "npx",
        "tsx",
        "scripts/scaffolds/eval-scaffold-selection.ts",
    ]
    if eval_cases_path is not None:
        cmd.append(str(eval_cases_path))
    run(cmd, dry_run=dry_run)


def run_verify(*, include_typecheck: bool, dry_run: bool) -> None:
    run(["npm", "run", "scaffolds:validate"], dry_run=dry_run)
    run(["npm", "run", "template-library:validate-runtime"], dry_run=dry_run)
    if include_typecheck:
        run(["npm", "run", "typecheck"], dry_run=dry_run)


def resolve_path(value: str | None, fallback: Path) -> Path:
    return Path(value).expanduser().resolve() if value else fallback.resolve()


def command_status(args: argparse.Namespace) -> None:
    scrape_root = resolve_path(args.from_path, SCRAPE_CACHE_CURRENT)
    payload = build_status_payload(scrape_root)
    if args.as_json:
        print(json.dumps(payload, indent=2))
        return

    availability = payload["availability"]
    counts = payload["counts"]
    print("Scaffold pipeline status")
    print(f"- scrape summary: {availability['scrapeSummary'] or 'missing'}")
    print(f"- raw discovery summary: {availability['rawDiscoverySummary'] or 'missing'}")
    print(f"- dossiers: {counts['dossiers']}")
    print(f"- curated template entries: {counts['templateLibraryCurated']}")
    print(f"- scaffold families in research: {counts['scaffoldFamiliesInResearch']}")
    print(f"- scaffold embeddings: {counts['scaffoldEmbeddings']}")
    print(f"- template-library embeddings: {counts['templateLibraryEmbeddings']}")
    print(f"- latest eval cases: {counts['evalCases']}")


def command_import(args: argparse.Namespace) -> None:
    source = resolve_path(args.from_path, SCRAPE_CACHE_CURRENT)
    output_root = resolve_path(args.output, RAW_DISCOVERY_CURRENT) if args.output else None
    run_import(
        scrape_source=source,
        label=args.label,
        format_name=args.format_name,
        output_root=output_root,
        dry_run=args.dry_run,
    )


def command_hydrate(args: argparse.Namespace) -> None:
    source = resolve_path(args.source, RAW_DISCOVERY_CURRENT)
    run_hydrate(source_root=source, max_repos=args.max_repos, dry_run=args.dry_run)


def command_build(args: argparse.Namespace) -> None:
    source = resolve_path(args.source, RAW_DISCOVERY_CURRENT)
    run_build(source_root=source, dry_run=args.dry_run)


def command_embeddings(args: argparse.Namespace) -> None:
    run_embeddings(include_template_library=args.include_template_library, dry_run=args.dry_run)


def command_eval(args: argparse.Namespace) -> None:
    eval_path = resolve_path(args.cases, REPO_ROOT / "data" / "scaffold-eval" / "prompts.json") if args.cases else None
    run_eval(eval_cases_path=eval_path, dry_run=args.dry_run)


def command_verify(args: argparse.Namespace) -> None:
    run_verify(include_typecheck=args.typecheck, dry_run=args.dry_run)


def command_all(args: argparse.Namespace) -> None:
    scrape_source = resolve_path(args.from_path, SCRAPE_CACHE_CURRENT)
    raw_source = resolve_path(args.source, RAW_DISCOVERY_CURRENT)
    eval_path = resolve_path(args.cases, REPO_ROOT / "data" / "scaffold-eval" / "prompts.json") if args.cases else None

    run_import(
        scrape_source=scrape_source,
        label=args.label,
        format_name=args.format_name,
        output_root=None,
        dry_run=args.dry_run,
    )
    run_hydrate(source_root=raw_source, max_repos=args.max_repos, dry_run=args.dry_run)
    run_build(source_root=raw_source, dry_run=args.dry_run)
    run_embeddings(include_template_library=args.include_template_library, dry_run=args.dry_run)
    run_eval(eval_cases_path=eval_path, dry_run=args.dry_run)
    run_verify(include_typecheck=args.typecheck, dry_run=args.dry_run)


def add_common_dry_run(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing them.",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Canonical CLI for scaffold pipeline maintenance.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status_parser = subparsers.add_parser("status", help="Show scaffold pipeline status.")
    status_parser.add_argument("--from", dest="from_path", help="Scrape cache root or summary file path.")
    status_parser.add_argument("--json", dest="as_json", action="store_true", help="Print status as JSON.")
    status_parser.set_defaults(handler=command_status)

    import_parser = subparsers.add_parser("import", help="Import scrape cache into canonical raw discovery.")
    import_parser.add_argument("--from", dest="from_path", help="Scrape cache root or summary file path.")
    import_parser.add_argument(
        "--label",
        default="external-scrape-dataset",
        help="Source label metadata for imported dataset.",
    )
    import_parser.add_argument(
        "--format",
        dest="format_name",
        choices=["auto", "legacy-summary", "playwright-catalog"],
        help="Explicit input format for import step.",
    )
    import_parser.add_argument("--output", help="Optional custom output root.")
    add_common_dry_run(import_parser)
    import_parser.set_defaults(handler=command_import)

    hydrate_parser = subparsers.add_parser("hydrate", help="Hydrate repo-cache from canonical raw discovery.")
    hydrate_parser.add_argument("--source", help="Raw discovery root or summary file path.")
    hydrate_parser.add_argument("--max", dest="max_repos", type=int, help="Optional max number of repos.")
    add_common_dry_run(hydrate_parser)
    hydrate_parser.set_defaults(handler=command_hydrate)

    build_parser_cmd = subparsers.add_parser("build", help="Build template-library and scaffold research artifacts.")
    build_parser_cmd.add_argument("--source", help="Raw discovery root or summary file path.")
    add_common_dry_run(build_parser_cmd)
    build_parser_cmd.set_defaults(handler=command_build)

    embeddings_parser = subparsers.add_parser("embeddings", help="Generate scaffold embeddings (and optionally template embeddings).")
    embeddings_parser.add_argument(
        "--include-template-library",
        action="store_true",
        help="Also regenerate template-library embeddings before scaffold embeddings.",
    )
    add_common_dry_run(embeddings_parser)
    embeddings_parser.set_defaults(handler=command_embeddings)

    eval_parser = subparsers.add_parser("eval", help="Run scaffold selection evaluation.")
    eval_parser.add_argument("--cases", help="Optional path to eval prompts JSON.")
    add_common_dry_run(eval_parser)
    eval_parser.set_defaults(handler=command_eval)

    verify_parser = subparsers.add_parser("verify", help="Run scaffold verification commands.")
    verify_parser.add_argument("--typecheck", action="store_true", help="Also run npm run typecheck.")
    add_common_dry_run(verify_parser)
    verify_parser.set_defaults(handler=command_verify)

    all_parser = subparsers.add_parser("all", help="Run import -> hydrate -> build -> embeddings -> eval -> verify.")
    all_parser.add_argument("--from", dest="from_path", help="Scrape cache root or summary file path.")
    all_parser.add_argument("--source", help="Raw discovery root or summary file path.")
    all_parser.add_argument(
        "--label",
        default="external-scrape-dataset",
        help="Source label metadata for imported dataset.",
    )
    all_parser.add_argument(
        "--format",
        dest="format_name",
        choices=["auto", "legacy-summary", "playwright-catalog"],
        help="Explicit input format for import step.",
    )
    all_parser.add_argument("--max", dest="max_repos", type=int, help="Optional max number of repos for hydrate step.")
    all_parser.add_argument("--cases", help="Optional path to eval prompts JSON.")
    all_parser.add_argument(
        "--include-template-library",
        action="store_true",
        help="Also regenerate template-library embeddings before scaffold embeddings.",
    )
    all_parser.add_argument("--typecheck", action="store_true", help="Also run npm run typecheck in verify.")
    add_common_dry_run(all_parser)
    all_parser.set_defaults(handler=command_all)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 2

    try:
        handler(args)
    except CliError as error:
        print(f"[scaffold-cli] ERROR: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("[scaffold-cli] Interrupted.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

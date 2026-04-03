#!/usr/bin/env python3
"""
Full external-template refresh pipeline for Sajtmaskin.

Purpose:
1. Scrape fresh template research via `scripts/template-library/hamta_sidor_branch_emil.py`
2. Remove previously generated template/scaffold research artifacts
3. Import the fresh scrape into canonical `data/external-template-pipeline/raw-discovery/current/`
4. Rebuild repo cache, dossiers, curated template library, and embeddings
5. Optionally run a DB health check and/or TypeScript typecheck

Default source of truth for the scrape step is the in-repo pipeline cache:
  data/external-template-pipeline/scrape-cache/current

Default scrape behavior is broad research intake:
  --legacy-wide-use-cases
  --per-category=999

If both `summary-cleaned.json` and `summary.json` exist in the scrape output,
the cleaned summary is used as canonical import input.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS_ROOT = REPO_ROOT / "scripts"
TEMPLATE_LIB_SCRIPTS = SCRIPTS_ROOT / "template-library"
SCRAPER_SCRIPT = TEMPLATE_LIB_SCRIPTS / "hamta_sidor_branch_emil.py"

PIPELINE_ROOT = REPO_ROOT / "data" / "external-template-pipeline"
SCRAPE_CACHE_CURRENT = PIPELINE_ROOT / "scrape-cache" / "current"
RAW_DISCOVERY_CURRENT = PIPELINE_ROOT / "raw-discovery" / "current"
REFERENCE_LIBRARY_ROOT = PIPELINE_ROOT / "reference-library"
REFERENCE_LIBRARY_DOSSIERS = REFERENCE_LIBRARY_ROOT / "dossiers"
REPO_CACHE_ROOT = PIPELINE_ROOT / "repo-cache"

GENERATED_TEMPLATE_LIBRARY = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
GENERATED_TEMPLATE_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
GENERATED_SCAFFOLD_RESEARCH = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-research.generated.json"
GENERATED_SCAFFOLD_EMBEDDINGS = REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"
GENERATED_SCAFFOLD_CANDIDATES = PIPELINE_ROOT / "reports" / "scaffold-candidates-curated.json"

REFERENCE_LIBRARY_GENERATED_FILES = [
    REFERENCE_LIBRARY_ROOT / "catalog.json",
    REFERENCE_LIBRARY_ROOT / "catalog.md",
    REFERENCE_LIBRARY_ROOT / "schema.template-manifest.json",
]
SUMMARY_FILE_CANDIDATES = ("summary-cleaned.json", "summary.json")


class PipelineError(RuntimeError):
    """Raised when a pipeline step fails."""


def prompt_text(label: str, default: str) -> str:
    try:
        value = input(f"{label} [{default}]: ").strip()
    except EOFError:
        return default
    return value or default


def prompt_bool(label: str, default: bool) -> bool:
    hint = "Y/n" if default else "y/N"
    try:
        value = input(f"{label} [{hint}]: ").strip().lower()
    except EOFError:
        return default
    if not value:
        return default
    return value in {"y", "yes", "j", "ja"}


def prompt_int(label: str, default: int | None) -> int | None:
    default_text = "" if default is None else str(default)
    try:
        value = input(f"{label} [{default_text}]: ").strip()
    except EOFError:
        return default
    if not value:
        return default
    return int(value)


def prompt_float(label: str, default: float) -> float:
    try:
        value = input(f"{label} [{default}]: ").strip()
    except EOFError:
        return default
    if not value:
        return default
    return float(value)


def parse_args() -> argparse.Namespace:
    default_scrape_root = SCRAPE_CACHE_CURRENT.resolve()
    parser = argparse.ArgumentParser(
        description="Scrape, reset, and rebuild the full external-template pipeline.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Prompt for settings interactively. Also used automatically when no flags are given.",
    )
    parser.add_argument(
        "--scrape-output",
        default=str(default_scrape_root),
        help="Scrape output directory (default: data/external-template-pipeline/scrape-cache/current).",
    )
    parser.add_argument(
        "--skip-scrape",
        action="store_true",
        help="Reuse an existing scrape output instead of running the scraper.",
    )
    parser.add_argument(
        "--keep-scrape-output",
        action="store_true",
        help="Do not delete the scrape output directory before a fresh scrape.",
    )
    parser.add_argument(
        "--keep-repo-cache",
        action="store_true",
        help="Keep data/external-template-pipeline/repo-cache instead of rebuilding it from scratch.",
    )
    parser.add_argument(
        "--skip-template-embeddings",
        action="store_true",
        help="Skip regeneration of template-library embeddings.",
    )
    parser.add_argument(
        "--skip-scaffold-embeddings",
        action="store_true",
        help="Skip regeneration of scaffold embeddings.",
    )
    parser.add_argument(
        "--db-check",
        action="store_true",
        help="Run the repo's dev DB health check at the end (read-only).",
    )
    parser.add_argument(
        "--typecheck",
        action="store_true",
        help="Run `npm run typecheck` at the end.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without deleting files or running commands.",
    )

    # Pass-through options to the Python scraper.
    parser.add_argument(
        "--per-category",
        type=int,
        default=999,
        help="Max templates per category for the scrape step (default: broad research intake).",
    )
    parser.add_argument("--delay", type=float, default=0.4, help="Pause between scraper HTTP requests.")
    parser.add_argument(
        "--skip-download",
        dest="skip_download",
        action="store_true",
        default=True,
        help="Skip git clone during scrape (default: enabled; hydrate repo-cache separately).",
    )
    parser.add_argument(
        "--download-during-scrape",
        dest="skip_download",
        action="store_false",
        help="Allow scrape step to clone repos into scrape-cache. Normally avoid this and rely on repo-cache hydration.",
    )
    parser.add_argument("--extended-scrape", action="store_true", help="Pass --extended-scrape to the scraper.")
    parser.add_argument(
        "--legacy-wide-use-cases",
        action="store_true",
        default=True,
        help="Pass --legacy-wide-use-cases to the scraper (enabled by default for broad research intake).",
    )
    parser.add_argument(
        "--core-use-cases",
        dest="legacy_wide_use_cases",
        action="store_false",
        help="Use the narrower core category list instead of the broad legacy-wide intake.",
    )
    parser.add_argument(
        "--loose-framework-match",
        action="store_true",
        help="Pass --loose-framework-match to the scraper.",
    )
    parser.add_argument("--flat-layout", action="store_true", help="Pass --flat-layout to the scraper.")
    parser.add_argument(
        "--max-repos",
        type=int,
        default=None,
        help="Optional repo limit for hydrate-template-library-cache.ts.",
    )

    return parser.parse_args()


def should_use_interactive_mode(args: argparse.Namespace) -> bool:
    return args.interactive or len(sys.argv) == 1


def configure_interactively(args: argparse.Namespace) -> argparse.Namespace:
    print("\n=== Full Template Refresh ===")
    print("Interactive mode for scrape -> reset -> rebuild -> embeddings.")
    print("This refreshes the external-template research pipeline, not the 10 scaffold source files.")

    args.scrape_output = prompt_text("Scrape output folder", str(args.scrape_output))
    args.skip_scrape = prompt_bool("Reuse existing scrape instead of running scraper", args.skip_scrape)
    if not args.skip_scrape:
        args.keep_scrape_output = prompt_bool("Keep existing scrape folder contents", args.keep_scrape_output)
        args.per_category = prompt_int("Max templates per category", args.per_category) or args.per_category
        args.delay = prompt_float("Delay between HTTP requests", args.delay)
        args.skip_download = prompt_bool("Skip git clone during scrape", args.skip_download)
        args.extended_scrape = prompt_bool("Include extended scrape categories", args.extended_scrape)
        args.legacy_wide_use_cases = prompt_bool(
            "Use legacy wide category list (~25 use cases)",
            args.legacy_wide_use_cases,
        )
        args.loose_framework_match = prompt_bool(
            "Use loose framework matching (broader, noisier)",
            args.loose_framework_match,
        )
        args.flat_layout = prompt_bool("Use flat layout for scraper output", args.flat_layout)

    args.keep_repo_cache = prompt_bool("Keep existing repo-cache", args.keep_repo_cache)
    args.skip_template_embeddings = prompt_bool(
        "Skip template-library embeddings",
        args.skip_template_embeddings,
    )
    args.skip_scaffold_embeddings = prompt_bool(
        "Skip scaffold embeddings",
        args.skip_scaffold_embeddings,
    )
    args.db_check = prompt_bool("Run DB health check at the end", args.db_check)
    args.typecheck = prompt_bool("Run typecheck at the end", args.typecheck)
    args.dry_run = prompt_bool("Dry run only", args.dry_run)
    args.max_repos = prompt_int("Max repos to hydrate (blank = all)", args.max_repos)

    summary = {
        "scrape_output": args.scrape_output,
        "skip_scrape": args.skip_scrape,
        "keep_scrape_output": args.keep_scrape_output,
        "keep_repo_cache": args.keep_repo_cache,
        "skip_template_embeddings": args.skip_template_embeddings,
        "skip_scaffold_embeddings": args.skip_scaffold_embeddings,
        "db_check": args.db_check,
        "typecheck": args.typecheck,
        "dry_run": args.dry_run,
        "per_category": args.per_category,
        "delay": args.delay,
        "skip_download": args.skip_download,
        "extended_scrape": args.extended_scrape,
        "legacy_wide_use_cases": args.legacy_wide_use_cases,
        "loose_framework_match": args.loose_framework_match,
        "flat_layout": args.flat_layout,
        "max_repos": args.max_repos,
    }
    print("\nPlanned run:")
    print(json.dumps(summary, indent=2))
    if not prompt_bool("Proceed with this run", True):
        raise PipelineError("Aborted by user before execution.")
    return args


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def run_command(
    args: Sequence[str],
    *,
    cwd: Path = REPO_ROOT,
    env: dict[str, str] | None = None,
    dry_run: bool = False,
) -> None:
    pretty = " ".join(f'"{part}"' if " " in part else part for part in args)
    print(f"> {pretty}")
    if dry_run:
        return
    result = subprocess.run(args, cwd=str(cwd), env=env, check=False)
    if result.returncode != 0:
        raise PipelineError(f"Command failed with exit code {result.returncode}: {pretty}")


def remove_path(target: Path, *, dry_run: bool = False) -> None:
    if not target.exists():
        return
    print(f"- remove {target}")
    if dry_run:
        return
    def _on_remove_error(func, path_str, _exc_info):
        os.chmod(path_str, 0o666)
        func(path_str)
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=False, onexc=_on_remove_error)
    else:
        target.unlink()


def ensure_directory(path: Path, *, dry_run: bool = False) -> None:
    if path.exists():
        return
    print(f"- mkdir {path}")
    if not dry_run:
        path.mkdir(parents=True, exist_ok=True)


def find_summary_file(scrape_output: Path) -> Path:
    cleaned_candidate = scrape_output / SUMMARY_FILE_CANDIDATES[0]
    if cleaned_candidate.exists():
        return cleaned_candidate

    raw_candidate = scrape_output / SUMMARY_FILE_CANDIDATES[1]
    if raw_candidate.exists():
        print(
            "[full-template-refresh] NOTE: summary-cleaned.json is missing; "
            "falling back to raw summary.json.",
        )
        return raw_candidate
    raise PipelineError(
        f"No summary file found in {scrape_output}. Expected one of: {', '.join(SUMMARY_FILE_CANDIDATES)}",
    )


def scrub_generated_artifacts(*, keep_repo_cache: bool, dry_run: bool) -> None:
    print_step("Clean generated artifacts")

    remove_path(RAW_DISCOVERY_CURRENT, dry_run=dry_run)
    remove_path(REFERENCE_LIBRARY_DOSSIERS, dry_run=dry_run)
    for generated_file in REFERENCE_LIBRARY_GENERATED_FILES:
        remove_path(generated_file, dry_run=dry_run)

    if not keep_repo_cache:
        remove_path(REPO_CACHE_ROOT, dry_run=dry_run)

    for artifact in [
        GENERATED_TEMPLATE_LIBRARY,
        GENERATED_TEMPLATE_EMBEDDINGS,
        GENERATED_SCAFFOLD_RESEARCH,
        GENERATED_SCAFFOLD_EMBEDDINGS,
        GENERATED_SCAFFOLD_CANDIDATES,
    ]:
        remove_path(artifact, dry_run=dry_run)

    ensure_directory(RAW_DISCOVERY_CURRENT.parent, dry_run=dry_run)
    ensure_directory(REFERENCE_LIBRARY_ROOT, dry_run=dry_run)
    ensure_directory(SCRAPE_CACHE_CURRENT.parent, dry_run=dry_run)


def scrape_external_templates(args: argparse.Namespace, scrape_output: Path) -> None:
    print_step("Scrape external templates")
    if not args.keep_scrape_output:
        remove_path(scrape_output, dry_run=args.dry_run)
    ensure_directory(scrape_output, dry_run=args.dry_run)

    cmd = [
        sys.executable,
        str(SCRAPER_SCRIPT),
        f"--output={scrape_output}",
        f"--per-category={args.per_category}",
        f"--delay={args.delay}",
    ]
    if args.skip_download:
        cmd.append("--skip-download")
    if args.extended_scrape:
        cmd.append("--extended-scrape")
    if args.legacy_wide_use_cases:
        cmd.append("--legacy-wide-use-cases")
    if args.loose_framework_match:
        cmd.append("--loose-framework-match")
    if args.flat_layout:
        cmd.append("--flat-layout")
    run_command(cmd, dry_run=args.dry_run)


def import_canonical_summary(summary_file: Path, *, dry_run: bool) -> None:
    print_step("Import canonical raw discovery")
    print(f"Using summary input: {summary_file}")
    run_command(
        [
            "npx",
            "tsx",
            "scripts/template-library/import-template-discovery.ts",
            f"--from={summary_file}",
            "--label=external-scrape-dataset",
        ],
        dry_run=dry_run,
    )


def hydrate_repo_cache(*, max_repos: int | None, dry_run: bool) -> None:
    print_step("Hydrate repo cache")
    cmd = [
        "npx",
        "tsx",
        "scripts/template-library/hydrate-template-library-cache.ts",
        f"--source={RAW_DISCOVERY_CURRENT}",
    ]
    if max_repos is not None:
        cmd.append(f"--max={max_repos}")
    run_command(cmd, dry_run=dry_run)


def rebuild_template_artifacts(*, dry_run: bool) -> None:
    print_step("Build dossiers and curated artifacts")
    run_command(
        [
            "npx",
            "tsx",
            "scripts/template-library/build-template-library.ts",
            f"--source={RAW_DISCOVERY_CURRENT}",
        ],
        dry_run=dry_run,
    )


def regenerate_embeddings(*, skip_template: bool, skip_scaffold: bool, dry_run: bool) -> None:
    if not skip_template:
        print_step("Generate template-library embeddings")
        run_command(
            ["npx", "tsx", "scripts/embeddings/generate-template-library-embeddings.ts"],
            dry_run=dry_run,
        )

    if not skip_scaffold:
        print_step("Generate scaffold embeddings")
        run_command(
            ["npx", "tsx", "scripts/embeddings/generate-scaffold-embeddings.ts"],
            dry_run=dry_run,
        )


def run_optional_checks(*, db_check: bool, typecheck: bool, dry_run: bool) -> None:
    if db_check:
        print_step("Optional DB check")
        run_command(["node", "scripts/db/check-dev-db.mjs"], dry_run=dry_run)

    if typecheck:
        print_step("Optional typecheck")
        run_command(["npm", "run", "typecheck"], dry_run=dry_run)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_outputs(*, dry_run: bool) -> None:
    print_step("Summary")
    if dry_run:
        print("Dry run only. No files were changed.")
        return

    template_catalog = read_json(GENERATED_TEMPLATE_LIBRARY)
    scaffold_research = read_json(GENERATED_SCAFFOLD_RESEARCH)

    print(
        json.dumps(
            {
                "scrapeCacheCurrent": str(SCRAPE_CACHE_CURRENT / "summary.json"),
                "rawDiscoveryCurrent": str(RAW_DISCOVERY_CURRENT / "summary.json"),
                "templateLibrary": {
                    "generatedAt": template_catalog.get("generatedAt"),
                    "totalTemplates": template_catalog.get("totalTemplates"),
                    "curatedTemplates": template_catalog.get("curatedTemplates"),
                    "entries": len(template_catalog.get("entries", [])),
                },
                "scaffoldResearch": {
                    "generatedAt": scaffold_research.get("generatedAt"),
                    "scaffoldCount": len(scaffold_research.get("scaffolds", {})),
                },
            },
            indent=2,
        )
    )

    if GENERATED_TEMPLATE_EMBEDDINGS.exists():
        template_embeddings = read_json(GENERATED_TEMPLATE_EMBEDDINGS)
        print(
            json.dumps(
                {"templateEmbeddings": template_embeddings.get("_meta", {})},
                indent=2,
            )
        )

    if GENERATED_SCAFFOLD_EMBEDDINGS.exists():
        scaffold_embeddings = read_json(GENERATED_SCAFFOLD_EMBEDDINGS)
        print(
            json.dumps(
                {"scaffoldEmbeddings": scaffold_embeddings.get("_meta", {})},
                indent=2,
            )
        )


def main() -> int:
    args = parse_args()
    interactive_mode = should_use_interactive_mode(args)
    if interactive_mode:
        args = configure_interactively(args)
    scrape_output = Path(args.scrape_output).expanduser().resolve()

    try:
        scrub_generated_artifacts(
            keep_repo_cache=args.keep_repo_cache,
            dry_run=args.dry_run,
        )

        if not args.skip_scrape:
            scrape_external_templates(args, scrape_output)
        else:
            print_step("Skip scrape")
            print(f"Reusing existing scrape output: {scrape_output}")

        summary_file = find_summary_file(scrape_output)
        import_canonical_summary(summary_file, dry_run=args.dry_run)
        hydrate_repo_cache(max_repos=args.max_repos, dry_run=args.dry_run)
        rebuild_template_artifacts(dry_run=args.dry_run)
        regenerate_embeddings(
            skip_template=args.skip_template_embeddings,
            skip_scaffold=args.skip_scaffold_embeddings,
            dry_run=args.dry_run,
        )
        run_optional_checks(
            db_check=args.db_check,
            typecheck=args.typecheck,
            dry_run=args.dry_run,
        )
        summarize_outputs(dry_run=args.dry_run)
        return 0
    except PipelineError as error:
        print(f"\n[full-template-refresh] ERROR: {error}", file=sys.stderr)
        return 1
    finally:
        if interactive_mode:
            try:
                input("\nPress Enter to exit...")
            except EOFError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())

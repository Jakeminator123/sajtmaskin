#!/usr/bin/env python3
"""
Smart rebuild of generated artifacts.

Default behavior:
- verifies the existing scrape summary before destructive steps
- purges generated artifacts only
- keeps repo-cache and scrape-cache for a faster, safer rebuild
- rebuilds v0 template artifacts and external template/scaffold artifacts
- validates outputs and optionally runs eval + typecheck
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
PYTHON = sys.executable
NPM = "npm.cmd" if os.name == "nt" else "npm"

PIPELINE_ROOT = REPO_ROOT / "data" / "external-template-pipeline"
SCRAPE_CACHE_CURRENT = PIPELINE_ROOT / "scrape-cache" / "current"
RAW_DISCOVERY_CURRENT = PIPELINE_ROOT / "raw-discovery" / "current"
REFERENCE_LIBRARY_ROOT = PIPELINE_ROOT / "reference-library"
REFERENCE_LIBRARY_DOSSIERS = REFERENCE_LIBRARY_ROOT / "dossiers"
REPO_CACHE_ROOT = PIPELINE_ROOT / "repo-cache"
REPORTS_ROOT = PIPELINE_ROOT / "reports"

V0_ARTIFACTS = [
    REPO_ROOT / "src" / "lib" / "templates" / "templates.json",
    REPO_ROOT / "src" / "lib" / "templates" / "template-categories.json",
    REPO_ROOT / "src" / "lib" / "templates" / "template-embeddings.json",
]

EXTERNAL_ARTIFACTS = [
    RAW_DISCOVERY_CURRENT,
    REFERENCE_LIBRARY_DOSSIERS,
    REFERENCE_LIBRARY_ROOT / "catalog.json",
    REFERENCE_LIBRARY_ROOT / "catalog.md",
    REFERENCE_LIBRARY_ROOT / "schema.template-manifest.json",
    REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json",
    REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json",
    REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-research.generated.json",
    REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json",
    REPORTS_ROOT / "scaffold-candidates-curated.json",
]


class RebuildError(RuntimeError):
    """Raised on rebuild failure."""


def run(cmd: list[str], *, dry_run: bool = False, allow_failure: bool = False) -> int:
    pretty = " ".join(f'"{part}"' if " " in part else part for part in cmd)
    print(f"> {pretty}")
    if dry_run:
        return 0
    result = subprocess.run(cmd, cwd=str(REPO_ROOT), check=False)
    if result.returncode != 0:
        if allow_failure:
            print(f"[rebuild-artifacts] Validation command failed (exit {result.returncode}): {pretty}")
            return result.returncode
        raise RebuildError(f"Command failed with exit code {result.returncode}: {pretty}")
    return 0


def remove_path(path: Path, *, dry_run: bool = False) -> None:
    if not path.exists():
        return
    print(f"- remove {path}")
    if dry_run:
        return

    def _on_remove_error(func, path_str, _exc_info):
        os.chmod(path_str, 0o666)
        func(path_str)

    if path.is_dir():
        shutil.rmtree(path, ignore_errors=False, onexc=_on_remove_error)
    else:
        path.unlink()


def find_scrape_summary() -> Path:
    cleaned = SCRAPE_CACHE_CURRENT / "summary-cleaned.json"
    if cleaned.exists():
        return cleaned
    raw = SCRAPE_CACHE_CURRENT / "summary.json"
    if raw.exists():
        return raw
    raise RebuildError(
        f"No scrape summary found in {SCRAPE_CACHE_CURRENT}. "
        "Run a scrape first or use --refresh-scrape."
    )


def purge_generated_outputs(*, refresh_scrape: bool, reset_repo_cache: bool, dry_run: bool) -> None:
    print("\n=== Purge generated outputs ===")

    for artifact in V0_ARTIFACTS:
        remove_path(artifact, dry_run=dry_run)

    for artifact in EXTERNAL_ARTIFACTS:
        remove_path(artifact, dry_run=dry_run)

    if reset_repo_cache:
        remove_path(REPO_CACHE_ROOT, dry_run=dry_run)

    if refresh_scrape:
        remove_path(SCRAPE_CACHE_CURRENT, dry_run=dry_run)


def rebuild_v0(*, dry_run: bool) -> None:
    print("\n=== Rebuild v0 artifacts ===")
    run([NPM, "run", "templates:local:refresh:embeddings"], dry_run=dry_run)


def rebuild_external(*, refresh_scrape: bool, reset_repo_cache: bool, dry_run: bool) -> None:
    print("\n=== Rebuild external template/scaffold artifacts ===")

    if not refresh_scrape:
        run([NPM, "run", "template-library:verify-summary"], dry_run=dry_run)

    cmd = [PYTHON, "scripts/template-library/full_template_refresh.py"]
    if not refresh_scrape:
        cmd.append("--skip-scrape")
    else:
        cmd.extend(["--legacy-wide-use-cases", "--per-category=999"])

    if not reset_repo_cache:
        cmd.append("--keep-repo-cache")

    run(cmd, dry_run=dry_run)


def validate_outputs(*, with_eval: bool, with_typecheck: bool, dry_run: bool) -> list[tuple[str, int]]:
    print("\n=== Validate outputs ===")
    failures: list[tuple[str, int]] = []

    for label, cmd in [
        ("template-library:validate-runtime", [NPM, "run", "template-library:validate-runtime"]),
        ("scaffolds:verify", [NPM, "run", "scaffolds:verify"]),
    ]:
        exit_code = run(cmd, dry_run=dry_run, allow_failure=True)
        if exit_code != 0:
            failures.append((label, exit_code))

    if with_eval:
        exit_code = run([NPM, "run", "scaffolds:eval"], dry_run=dry_run, allow_failure=True)
        if exit_code != 0:
            failures.append(("scaffolds:eval", exit_code))
        exit_code = run([NPM, "run", "eval"], dry_run=dry_run, allow_failure=True)
        if exit_code != 0:
            failures.append(("eval", exit_code))
    if with_typecheck:
        exit_code = run([NPM, "run", "typecheck"], dry_run=dry_run, allow_failure=True)
        if exit_code != 0:
            failures.append(("typecheck", exit_code))

    return failures


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_outputs(*, dry_run: bool, validation_failures: list[tuple[str, int]]) -> None:
    print("\n=== Artifact summary ===")
    if dry_run:
        print("Dry run only. No files were changed.")
        return

    templates = load_json(V0_ARTIFACTS[0])
    template_categories = load_json(V0_ARTIFACTS[1])
    template_embeddings = load_json(V0_ARTIFACTS[2])
    template_library = load_json(
        REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library.generated.json"
    )
    template_library_embeddings = load_json(
        REPO_ROOT / "src" / "lib" / "gen" / "template-library" / "template-library-embeddings.json"
    )
    scaffold_research = load_json(
        REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-research.generated.json"
    )
    scaffold_embeddings = load_json(
        REPO_ROOT / "src" / "lib" / "gen" / "scaffolds" / "scaffold-embeddings.json"
    )

    summary = {
        "v0Templates": len(templates),
        "v0CategoriesUpdated": template_categories.get("_lastUpdated"),
        "v0TemplateEmbeddings": template_embeddings.get("_meta", {}),
        "templateLibrary": {
            "generatedAt": template_library.get("generatedAt"),
            "curatedTemplates": template_library.get("curatedTemplates"),
            "entries": len(template_library.get("entries", [])),
        },
        "templateLibraryEmbeddings": template_library_embeddings.get("_meta", {}),
        "scaffoldResearch": {
            "generatedAt": scaffold_research.get("generatedAt"),
            "scaffolds": len(scaffold_research.get("scaffolds", {})),
        },
        "scaffoldEmbeddings": scaffold_embeddings.get("_meta", {}),
        "validationFailures": [
            {"command": label, "exitCode": exit_code}
            for label, exit_code in validation_failures
        ],
    }
    print(json.dumps(summary, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smart rebuild of generated artifacts.")
    parser.add_argument(
        "--refresh-scrape",
        action="store_true",
        help="Also refresh scrape-cache/current from the scraper.",
    )
    parser.add_argument(
        "--reset-repo-cache",
        action="store_true",
        help="Also delete and rebuild repo-cache from scratch.",
    )
    parser.add_argument(
        "--with-eval",
        action="store_true",
        help="Run broader eval suite after rebuild.",
    )
    parser.add_argument(
        "--with-typecheck",
        action="store_true",
        help="Run npm run typecheck after rebuild.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned actions without deleting or rebuilding.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    print("Smart artifact rebuild")
    print(json.dumps(
        {
            "refreshScrape": args.refresh_scrape,
            "resetRepoCache": args.reset_repo_cache,
            "withEval": args.with_eval,
            "withTypecheck": args.with_typecheck,
            "dryRun": args.dry_run,
        },
        indent=2,
    ))

    try:
        if not args.refresh_scrape:
            summary_path = find_scrape_summary()
            print(f"Using existing scrape summary: {summary_path}")

        purge_generated_outputs(
            refresh_scrape=args.refresh_scrape,
            reset_repo_cache=args.reset_repo_cache,
            dry_run=args.dry_run,
        )
        rebuild_v0(dry_run=args.dry_run)
        rebuild_external(
            refresh_scrape=args.refresh_scrape,
            reset_repo_cache=args.reset_repo_cache,
            dry_run=args.dry_run,
        )
        validation_failures = validate_outputs(
            with_eval=args.with_eval,
            with_typecheck=args.with_typecheck,
            dry_run=args.dry_run,
        )
        summarize_outputs(dry_run=args.dry_run, validation_failures=validation_failures)
        if validation_failures:
            labels = ", ".join(label for label, _ in validation_failures)
            print(f"[rebuild-artifacts] Completed with validation failures: {labels}", file=sys.stderr)
            return 1
        return 0
    except RebuildError as error:
        print(f"[rebuild-artifacts] ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

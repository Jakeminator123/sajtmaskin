#!/usr/bin/env python3
"""
Move legacy / unused files OUT of the sajtmaskin repo into a sibling
folder (../legacy-stuff/<timestamp>/), so the repo stays focused on
what's actually used at runtime.

Two safety tiers:

  * SAFE_TO_MOVE — verified that no source code, tests, scripts, or
    runtime artifacts import or read these. Default behaviour.

  * RUNTIME_DEPRECATED — gated/deprecated but still imported or read
    somewhere. Requires --include-runtime-deprecated to move. Each
    path has a "blocker" note explaining what would break.

Every move is reversible:
  * The skript writes ../legacy-stuff/<timestamp>/manifest.json with
    the original repo-relative path for every file.
  * It writes a README.md that documents every move, the date, and an
    exact `restore` command (a shell snippet) for putting things back.

Usage
-----
  # Safe inventory (no changes):
  python scripts/maintenance/move-to-legacy-stash.py --dry-run

  # Actually move the safe set:
  python scripts/maintenance/move-to-legacy-stash.py

  # Include the runtime-gated/deprecated set (RISK — read blockers):
  python scripts/maintenance/move-to-legacy-stash.py --include-runtime-deprecated

  # Custom destination (default: ../legacy-stuff):
  python scripts/maintenance/move-to-legacy-stash.py --target=D:/archive/sajt
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class LegacyEntry(NamedTuple):
    repo_path: str
    why: str
    blocker: str | None = None  # if set, requires --include-runtime-deprecated


# =====================================================================
# SAFE — verified by Grep that nothing in src/, tests, or scripts/
# imports/reads these paths. Reports + standalone deprecated scripts.
# =====================================================================
SAFE_TO_MOVE: list[LegacyEntry] = [
    # ----- Historical reports / loose notes -----
    LegacyEntry(
        "RAPPORT-prompt-pipeline-framtidsplan.md",
        "Historical planning report at repo root. Not referenced from code or docs/index.",
    ),
    LegacyEntry(
        "RAPPORT-followup-regeneration-utredning.md",
        "Historical investigation report at repo root. Not referenced from code or docs/index.",
    ),
    LegacyEntry(
        "övrigt/embeddings_keywords.txt",
        "Loose notes file. Not referenced.",
    ),
    LegacyEntry(
        "övrigt/status-konsolidering-2026-04-17.md",
        "Snapshot from session 2026-04-17 — superseded by docs and commit history.",
    ),
    LegacyEntry(
        "övrigt/logg-sammanstallning-2026-04-17.md",
        "Log roll-up from session 2026-04-17 — already consumed by follow-up agents.",
    ),
    LegacyEntry(
        "övrigt/oklara",
        "Unsorted folder. Not referenced.",
    ),
    LegacyEntry(
        "övrigt/troliga_buggar",
        "Old bug-investigation notes. Not referenced.",
    ),
    # ----- Legacy template-library runtime guidance (cleared 2026-04-17, pass 1) -----
    LegacyEntry(
        "src/lib/gen/template-library/runtime-guidance.ts",
        "Legacy generic guidance regelmotor — replaced by dossier pipeline. orchestrate.ts no longer imports it; build-template-library.ts (also moved) was the only other consumer.",
    ),
    LegacyEntry(
        "src/lib/gen/template-library/runtime-guidance.test.ts",
        "Tests for the removed regelmotor.",
    ),
    LegacyEntry(
        "src/lib/gen/template-library/template-library-external-integration.test.ts",
        "Snapshot test for the artifact built by build-template-library.ts (also moved).",
    ),
    LegacyEntry(
        "scripts/scaffolds/derive-variants-from-dossiers.ts",
        "BLUEPRINTS-based variant builder — replaced by signaturePatterns + auto-curate-variant-patterns.ts.",
    ),
    # ----- Full external-template-pipeline retirement (2026-04-17, pass 2) -----
    # Backoffice flikar (artifacts_pipeline + template_pipeline) avregistrerade
    # från backoffice/pages/__init__.py. scaffold_cli.py-knappar borttagna ur
    # scaffold_lifecycle.py + _ops_impl.py. 11 npm scripts borttagna ur
    # package.json. domain-map.json + egna_kommandon.txt uppdaterade.
    LegacyEntry(
        "data/external-template-pipeline",
        "1.7 GB scrape-cache + raw discovery + reference-library — replaced by data/dossiers/ pipe.",
    ),
    LegacyEntry(
        "scripts/template-library",
        "Build scripts (build-template-library.ts, full_template_refresh.py, hydrate-template-library-cache.ts, etc.) for the legacy template-library pipeline.",
    ),
    LegacyEntry(
        "scripts/scaffolds/scaffold_cli.py",
        "Python orchestrator (`scaffold_cli.py status/import/hydrate/build/embeddings/eval/verify/all`) for the legacy pipeline. All npm run scaffolds:* scripts removed.",
    ),
    LegacyEntry(
        "scripts/scaffolds/curate-scaffold-candidates.ts",
        "Imports template-library; legacy scaffold-candidate curation step.",
    ),
    LegacyEntry(
        "scripts/scaffolds/promote-to-scaffold.ts",
        "Imports template-library; legacy scaffold-promotion step.",
    ),
    LegacyEntry(
        "scripts/scaffolds/scaffold-candidate-report.ts",
        "Imports template-library; legacy candidate-report writer.",
    ),
    LegacyEntry(
        "scripts/embeddings/generate-template-library-embeddings.ts",
        "Embeddings for the legacy template-library catalog. Dossier-embeddings replace it.",
    ),
    LegacyEntry(
        "scripts/dossiers/import-from-playwright.ts",
        "Legacy adapter that read playwright-catalog.json from the old pipeline. Replaced by import-from-enriched.ts (data/dossiers/_enriched/).",
    ),
    LegacyEntry(
        "scripts/rebuild_artifacts.py",
        "Smart-rebuild orchestrator for external-template-pipeline + scaffold_cli artifacts.",
    ),
    LegacyEntry(
        "e2e/vercel-templates/scrape-catalog.spec.ts",
        "Legacy scraper that imported template-library helpers. Dossier-pipens scrape-catalog-light.spec.ts (kept) is the new entrypoint.",
    ),
    LegacyEntry(
        "backoffice/pages/artifacts_pipeline.py",
        "Backoffice UI for triggering external-template-pipeline + scaffold_cli commands. Page unregistered from backoffice/pages/__init__.py.",
    ),
    LegacyEntry(
        "backoffice/pages/template_pipeline.py",
        "Backoffice UI for inspecting template-library artifacts. Page unregistered from backoffice/pages/__init__.py.",
    ),
    # ----- Final sweep: template-library runtime + structural-files spår (2026-04-17, pass 3) -----
    # All consumers refactored: orchestrate.ts no longer calls
    # resolveTemplateGuidance / structural-files; system-prompt.ts no longer
    # has templateGuidance / variantStructuralFiles props; FEATURES flags
    # (useRuntimeTemplateGuidance, useVariantStructuralFiles) and env vars
    # (SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE / SAJTMASKIN_VARIANT_STRUCTURAL_FILES)
    # removed; backoffice toggles deleted.
    LegacyEntry(
        "src/lib/gen/template-library",
        "Whole runtime catalog/search/embeddings-core/types module + 4 MB of generated JSON. Replaced by data/dossiers/_index/. No remaining imports.",
    ),
    LegacyEntry(
        "src/lib/gen/scaffold-variants/structural-files.ts",
        "Variant + capability structural-file selectors. Read template-library catalog. No remaining callers (orchestrate.ts no longer imports them).",
    ),
    LegacyEntry(
        "docs/schemas/strict/structural-references.schema.json",
        "Strict JSON schema for the now-removed variantStructuralFiles prompt-dump output.",
    ),
]


# =====================================================================
# RUNTIME-DEPRECATED — gated / scheduled for future cleanup but still
# imported somewhere. Requires --include-runtime-deprecated to move.
# =====================================================================
RUNTIME_DEPRECATED: list[LegacyEntry] = [
    # (Empty — full template-library + structural-files sweep complete.)
]


# =====================================================================
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="Show what would move; do nothing.")
    p.add_argument(
        "--include-runtime-deprecated",
        action="store_true",
        help="Also move runtime-gated entries (read blockers first).",
    )
    p.add_argument(
        "--target",
        default=str((REPO_ROOT.parent / "legacy-stuff").resolve()),
        help="Destination directory (default: ../legacy-stuff next to repo).",
    )
    p.add_argument(
        "--no-timestamp-subdir",
        action="store_true",
        help="Skip the YYYY-MM-DD-HH-MM-SS subdir (use --target as-is).",
    )
    return p.parse_args()


def collect(args: argparse.Namespace) -> list[LegacyEntry]:
    items = list(SAFE_TO_MOVE)
    if args.include_runtime_deprecated:
        items.extend(RUNTIME_DEPRECATED)
    return items


def filter_existing(items: list[LegacyEntry]) -> tuple[list[LegacyEntry], list[LegacyEntry]]:
    existing: list[LegacyEntry] = []
    missing: list[LegacyEntry] = []
    for item in items:
        if (REPO_ROOT / item.repo_path).exists():
            existing.append(item)
        else:
            missing.append(item)
    return existing, missing


def render_readme(items: list[LegacyEntry], target_root: Path, timestamp: str) -> str:
    lines = [
        "# Legacy stash from sajtmaskin",
        "",
        f"**Created:** {timestamp}",
        f"**Source repo:** `{REPO_ROOT}`",
        "",
        "Files in this folder were moved out of the active repo because they ",
        "are unused or deprecated. Source paths and restore instructions below.",
        "",
        "## Files moved",
        "",
        "| Original repo path | Why |",
        "|---|---|",
    ]
    for item in items:
        why = item.why.replace("|", "\\|")
        lines.append(f"| `{item.repo_path}` | {why} |")

    lines.extend(
        [
            "",
            "## Restore everything",
            "",
            "From the parent of the legacy-stuff folder (i.e. one level above sajtmaskin/):",
            "",
            "```powershell",
            f"$src = '{target_root.as_posix()}'",
            f"$dst = '{REPO_ROOT.as_posix()}'",
            "$manifest = Get-Content (Join-Path $src 'manifest.json') | ConvertFrom-Json",
            "foreach ($entry in $manifest.entries) {",
            "  $from = Join-Path $src $entry.repo_path",
            "  $to   = Join-Path $dst $entry.repo_path",
            "  $toDir = Split-Path $to -Parent",
            "  if (-not (Test-Path $toDir)) { New-Item -ItemType Directory -Path $toDir | Out-Null }",
            "  Move-Item -Path $from -Destination $to -Force",
            "}",
            "```",
            "",
            "## Restore one specific entry",
            "",
            "```powershell",
            "# Replace <repo-path> with the value from the table above",
            f"$src = '{target_root.as_posix()}/<repo-path>'",
            f"$dst = '{REPO_ROOT.as_posix()}/<repo-path>'",
            "Move-Item -Path $src -Destination $dst -Force",
            "```",
            "",
            "After restore, in the repo:",
            "",
            "```bash",
            "git status   # confirm files are back",
            "```",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    items = collect(args)
    existing, missing = filter_existing(items)

    target_root = Path(args.target)
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    if not args.no_timestamp_subdir:
        target_root = target_root / timestamp

    print()
    print(f"[legacy-stash] repo:   {REPO_ROOT}")
    print(f"[legacy-stash] target: {target_root}")
    print(f"[legacy-stash] mode:   {'DRY-RUN' if args.dry_run else 'MOVE'}")
    print(f"[legacy-stash] safe:   {len(SAFE_TO_MOVE)} entries")
    if args.include_runtime_deprecated:
        print(f"[legacy-stash] +runtime-deprecated: {len(RUNTIME_DEPRECATED)} entries (--include-runtime-deprecated)")
    print()

    if not existing:
        print("[legacy-stash] Nothing to move (all entries missing in repo).")
        return

    print("Will move:")
    for item in existing:
        print(f"  + {item.repo_path}")
        print(f"      why: {item.why}")
    if missing:
        print()
        print("Skipping (already missing in repo):")
        for item in missing:
            print(f"  - {item.repo_path}")
    print()

    if args.dry_run:
        print("[legacy-stash] Dry-run only. Re-run without --dry-run to perform the move.")
        return

    target_root.mkdir(parents=True, exist_ok=True)

    moved: list[dict[str, str]] = []
    for item in existing:
        src = REPO_ROOT / item.repo_path
        dst = target_root / item.repo_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            print(f"  ! destination exists, skipping: {dst}")
            continue
        shutil.move(str(src), str(dst))
        moved.append({"repo_path": item.repo_path, "why": item.why})
        print(f"  → moved {item.repo_path}")

    manifest = {
        "createdAt": timestamp,
        "sourceRepo": str(REPO_ROOT),
        "totalEntries": len(moved),
        "entries": moved,
    }
    (target_root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (target_root / "README.md").write_text(render_readme(existing, target_root, timestamp), encoding="utf-8")

    print()
    print(f"[legacy-stash] Wrote {len(moved)} entries + README + manifest to:")
    print(f"  {target_root}")
    print()
    print("In the repo, run:")
    print("  git status            # see deletions")
    print('  git add -A; git commit -m "chore: stash unused/deprecated files outside repo"')


if __name__ == "__main__":
    sys.exit(main() or 0)

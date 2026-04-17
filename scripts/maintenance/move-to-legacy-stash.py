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
]


# =====================================================================
# RUNTIME-DEPRECATED — gated / scheduled for Fas 9 of dossier roadmap
# but currently still touches the runtime. Requires explicit opt-in.
# =====================================================================
RUNTIME_DEPRECATED: list[LegacyEntry] = [
    LegacyEntry(
        "scripts/scaffolds/derive-variants-from-dossiers.ts",
        "Marked @deprecated in source. Replaced by signaturePatterns + auto-curate-variant-patterns.ts.",
        blocker=(
            "backoffice/pages/scaffold_lifecycle.py exposes a button that "
            "shells out to this script. Also referenced in "
            "config/dashboard/domain-map.json. Move requires removing the "
            "backoffice button + the dashboard map entry."
        ),
    ),
    LegacyEntry(
        "data/external-template-pipeline",
        "Old template-library pipeline output (deprecated 2026-04-17).",
        blocker=(
            "Runtime still reads two artifacts BUILT from this folder: "
            "src/lib/gen/template-library/template-library.generated.json "
            "and src/lib/gen/scaffolds/scaffold-research.generated.json. "
            "Both are gitignored. Moving this folder = those artifacts "
            "cannot be regenerated locally until the new dossier pipe is "
            "the only source. Avveckla i Fas 9 enligt "
            "docs/architecture/dossier-pipeline-roadmap.md."
        ),
    ),
    LegacyEntry(
        "src/lib/gen/template-library/runtime-guidance.ts",
        "Old guidance resolver — gated out via FEATURES.useDossierPipeline (Pass 9 gate).",
        blocker=(
            "Imported by orchestrate.ts even though the call returns "
            "empty when the dossier flag is on. Removing requires "
            "removing the import + a small refactor in orchestrate.ts."
        ),
    ),
    LegacyEntry(
        "src/lib/gen/template-library/runtime-guidance.test.ts",
        "Tests for the gated guidance resolver above.",
        blocker="Move together with runtime-guidance.ts.",
    ),
    LegacyEntry(
        "scripts/template-library",
        "Build scripts for the old template-library pipeline.",
        blocker=(
            "These build the runtime artifacts mentioned above. Moving = "
            "no way to regenerate them. Wait for Fas 9 of dossier roadmap."
        ),
    ),
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

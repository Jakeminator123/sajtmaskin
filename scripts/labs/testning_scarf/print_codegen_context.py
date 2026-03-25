#!/usr/bin/env python3
"""
Skriver ut de två codegen-texterna (egen motor + v0-dynamik) via trace-CLI.

  python scripts/labs/testning_scarf/print_codegen_context.py
  python scripts/labs/testning_scarf/print_codegen_context.py --build-intent website --offline

Utdata: scripts/labs/testning_scarf/output/codegen_snapshot/dashboard_app_<UTC>/
  - 02_engine_system_prompt.txt  (STATIC_CORE + all dynamik)
  - 03_v0_enrichment_context.txt (endast dynamik)

Kräver: repo-root som cwd, npm install, npx tsx.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent

DEFAULT_PROMPT = """Bygg en webbaserad ekonomisk dashboard för småföretag.
Det ska kännas som en riktig app: sidomeny, tydliga ytor för nyckeltal och grafer, inte en klassisk landningssida.
Fokus: budget, kassaflöde, kostnader och en enkel översikt som CFO-liknande roller skulle vilja öppna dagligen."""


def main() -> None:
    ap = argparse.ArgumentParser(description="Kör trace med --write-codegen-snapshot (två huvudfiler).")
    ap.add_argument(
        "--build-intent",
        default="app",
        choices=["website", "app", "template"],
        help="app = sidebar, tabeller, produktkänsla (se BUILD_INTENT_GUIDANCE i system-prompt.ts)",
    )
    ap.add_argument("--offline", action="store_true", help="Inga embeddings")
    ap.add_argument("--prompt-file", type=Path, help="Egen promptfil")
    args = ap.parse_args()

    text = (
        args.prompt_file.read_text(encoding="utf-8").strip()
        if args.prompt_file
        else DEFAULT_PROMPT.strip()
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_name = f"dashboard_app_{stamp}"
    snap_dir = SCRIPT_DIR / "output" / "codegen_snapshot" / out_name
    snap_dir.mkdir(parents=True, exist_ok=True)

    prompt_path = snap_dir / "_input_prompt.txt"
    prompt_path.write_text(text + "\n", encoding="utf-8")

    rel_script = SCRIPT_DIR.joinpath("trace-generation-context.ts").relative_to(REPO_ROOT).as_posix()
    tsx_cli = REPO_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
    cmd: list[str] = (
        ["node", str(tsx_cli), rel_script]
        if tsx_cli.is_file()
        else ["npx", "--yes", "tsx", rel_script]
    )
    cmd += [
        "--prompt-file",
        str(prompt_path.resolve()),
        "--build-intent",
        args.build_intent,
        "--write-codegen-snapshot",
        str(snap_dir.resolve()),
        "--portable-metadata",
    ]
    if args.offline:
        cmd.append("--offline")

    print(f"Kör trace + snapshot …", file=sys.stderr)
    r = subprocess.run(cmd, cwd=str(REPO_ROOT), env=os.environ.copy())
    if r.returncode != 0:
        sys.exit(r.returncode)

    eng = snap_dir / "02_engine_system_prompt.txt"
    v0 = snap_dir / "03_v0_enrichment_context.txt"
    print(f"Klart: {snap_dir.relative_to(REPO_ROOT).as_posix()}/", file=sys.stderr)
    print(f"  {eng.name}  ({eng.stat().st_size} bytes)", file=sys.stderr)
    print(f"  {v0.name}   ({v0.stat().st_size} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()


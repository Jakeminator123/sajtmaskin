#!/usr/bin/env python3
"""
Samlat flöde: skriv prompt → en undermapp med del 1 (underlag) och valfritt del 2 (live LLM).

Del 1: samma filer som build_first_llm_underlag.py
Del 2: npx tsx scripts/testning_scarf/run_first_llm_live.ts (POST /api/ai/brief + /api/ai/chat)

Kräver för --live: npm run dev igång, AI_GATEWAY_API_KEY (eller motsv.) i .env.local.

  npm run first-llm:lab
  python scripts/testning_scarf/first_llm_promptlab.py --live
  python scripts/testning_scarf/first_llm_promptlab.py -p "text" --no-trace --live
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUT_ROOT = SCRIPT_DIR / "output" / "first_llm" / "lab"

UNDERLAG = SCRIPT_DIR / "build_first_llm_underlag.py"
LIVE_TS = SCRIPT_DIR / "run_first_llm_live.ts"


def read_multiline_prompt() -> str:
    print("Skriv din prompt. Avsluta med en tom rad:", file=sys.stderr)
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line == "":
            break
        lines.append(line)
    return "\n".join(lines).strip()


def resolve_prompt(prompt: str | None, prompt_file: Path | None) -> str:
    if prompt_file is not None:
        return prompt_file.read_text(encoding="utf-8").strip()
    if prompt:
        return prompt.strip()
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    return read_multiline_prompt()


def main() -> None:
    ap = argparse.ArgumentParser(description="Del 1 + valfritt del 2 för första LLM.")
    ap.add_argument("--prompt", "-p")
    ap.add_argument("--prompt-file", type=Path)
    ap.add_argument(
        "--live",
        action="store_true",
        help="Kör del 2 mot localhost (run_first_llm_live.ts)",
    )
    ap.add_argument(
        "--base-url",
        default="http://localhost:3000",
        help="Bas-URL för --live",
    )
    ap.add_argument(
        "--no-trace",
        action="store_true",
        help="Stäng av trace (default: trace på)",
    )
    ap.add_argument("--build-intent", default="website", choices=["website", "app", "template"])
    ap.add_argument(
        "--no-image-generations",
        action="store_true",
        help="Brief utan imageGenerations (default true)",
    )
    args = ap.parse_args()

    text = resolve_prompt(args.prompt, args.prompt_file)
    if not text:
        ap.error("Tom prompt")

    use_trace = not args.no_trace

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = OUT_ROOT / f"run_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        str(UNDERLAG),
        "--output-dir",
        str(out_dir),
        "-p",
        text,
        "--build-intent",
        args.build_intent,
    ]
    if use_trace:
        cmd.append("--with-trace")
    if args.no_image_generations:
        cmd.append("--no-image-generations")

    r = subprocess.run(cmd, cwd=str(REPO_ROOT))
    if r.returncode != 0:
        sys.exit(r.returncode)

    if args.live:
        tsx = REPO_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
        if tsx.is_file():
            live_cmd = ["node", str(tsx), str(LIVE_TS)]
        else:
            live_cmd = ["npx", "--yes", "tsx", str(LIVE_TS)]
        live_cmd += [
            "--output-dir",
            str(out_dir),
            "--base-url",
            args.base_url.strip().rstrip("/"),
            "--build-intent",
            args.build_intent,
        ]
        if args.no_image_generations:
            live_cmd.append("--no-image-generations")
        r2 = subprocess.run(live_cmd, cwd=str(REPO_ROOT))
        if r2.returncode != 0:
            sys.exit(r2.returncode)

    print(f"Klar: {out_dir.relative_to(REPO_ROOT).as_posix()}/", file=sys.stderr)


if __name__ == "__main__":
    main()

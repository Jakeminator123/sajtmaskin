#!/usr/bin/env python3
"""
Bygger underlag (JSON + README) för de *första* LLM-anropen i buildern
(brief / polish) samt ett skelett för första kodgenererings-stream.

Kör från repo-roten:

  python scripts/testning_scarf/build_first_llm_underlag.py -p "Min prompt"
  python scripts/testning_scarf/build_first_llm_underlag.py --output-dir path/to/run_XXX

Se: first_llm_promptlab.py (interaktivt + valfritt `--live`).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
OUTPUT_ROOT = SCRIPT_DIR / "output" / "first_llm" / "underlag"
TS_TRACE = SCRIPT_DIR / "trace-generation-context.ts"

BRIEF_SERVER_NOTE = """# Brief: vad servern lägger till

HTTP-kroppen till POST /api/ai/brief innehåller bara fältet `prompt` (plus modell m.m.).

I `src/app/api/ai/brief/route.ts` byggs användarmeddelandet till modellen som:

  userPrompt = prompt + valfri site-type-hint + rad om bilder (imageGenerations).

Alltså: jämför `01_post_api_ai_brief.json` med route-koden om du vill se exakt LLM-input.
"""


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


def resolve_prompt(args: argparse.Namespace) -> str:
    if getattr(args, "prompt_file", None):
        return Path(args.prompt_file).read_text(encoding="utf-8").strip()
    if args.prompt:
        return args.prompt.strip()
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    return read_multiline_prompt()


def run_ts_trace(prompt: str, *, offline: bool) -> dict[str, Any] | None:
    if not TS_TRACE.is_file():
        return None
    rel_script = TS_TRACE.relative_to(REPO_ROOT).as_posix()
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, encoding="utf-8", newline="\n"
    ) as tmp:
        tmp.write(prompt)
        pfile = tmp.name
    try:
        tail = [
            "--prompt-file",
            pfile,
            "--build-intent",
            "website",
            "--scaffold-mode",
            "auto",
            "--dynamic-preview-chars",
            "4000",
            "--portable-metadata",
        ]
        if offline:
            tail.append("--offline")
        tsx_cli = REPO_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
        if tsx_cli.is_file():
            cmd = ["node", str(tsx_cli), rel_script, *tail]
        else:
            cmd = ["npx", "--yes", "tsx", rel_script, *tail]
        proc = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=os.environ.copy(),
        )
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr or proc.stdout or "tsx trace failed\n")
            return None
        return json.loads(proc.stdout)
    finally:
        try:
            os.unlink(pfile)
        except OSError:
            pass


README_SV = """# Första LLM: vad menas?

I buildern är **inte** allt ett enda anrop. Ungefär i ordning:

| Steg | Vad | Endpoint / plats | När |
|------|-----|------------------|-----|
| 1a | **Deep brief** (strukturerad JSON: sidor, tonalitet, m.m.) | `POST /api/ai/brief` | När användaren startar chat **och** deep prompt-assist är på (`promptAssistDeep`). Svaret blir `meta.brief` + text till custom instructions. |
| 1b | **Polish / omskrivning** av själva prompten | `POST /api/ai/chat` (streaming) | När användaren klickar förbättra/rätta — **annat** anrop än brief. |
| 1c | **Ingen LLM** | `buildDynamicInstructionAddendumFromPrompt` (kod) | Om assist är av eller shallow utan deep — bara heuristik. |
| 2 | **Kodgenerering** | `POST /api/v0/chats/stream` (första prompten) | Här körs `prepareGenerationContext`, stor systemprompt, scaffold, merge. Det är **byggande modellen**, inte "första assist" i meningen brief. |
| (valfritt) | **Planläge** | Planner med egen modell | Om `planMode` — ytterligare ett LLM-steg. |

**Orchestrator** i er kod är främst `prepareGenerationContext` + stream-pipeline.

## Filer i denna mapp (del 1)

- `01`–`03`, `FORSTA_LLM_README.md`, `prompt_in.txt`, ev. `00_trace_context.json`
- `04_brief_server_note.txt` — brief: servern utökar prompten innan modellen

## Del 2 (live)

Kör `first_llm_promptlab.py --live` eller manuellt:

`npx tsx scripts/testning_scarf/run_first_llm_live.ts --output-dir <denna mapp>`

Då tillkommer `10_live_*` … `16_live_*` med faktiska HTTP-request/response.
"""


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Underlag för första LLM-stegen (brief/chat) + ev. trace."
    )
    ap.add_argument("--prompt", "-p", help="Användarprompt (rå text)")
    ap.add_argument("--prompt-file", type=Path, dest="prompt_file", help="Fil med prompt")
    ap.add_argument(
        "--output-dir",
        type=Path,
        help="Skriv allt hit (annars output/first_llm/underlag/run_<UTC>/)",
    )
    ap.add_argument(
        "--build-intent",
        default="website",
        choices=["website", "app", "template"],
    )
    ap.add_argument(
        "--no-image-generations",
        action="store_true",
        help="Sätt imageGenerations false (default true som i buildern)",
    )
    ap.add_argument("--provider", default="gateway", choices=["gateway", "v0", "anthropic"])
    ap.add_argument("--model", default="openai/gpt-5.2")
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument(
        "--with-trace",
        action="store_true",
        help="Kör trace-generation-context (full JSON i 00_trace_context.json)",
    )
    ap.add_argument(
        "--trace-online",
        action="store_true",
        help="Trace med embeddings (annars offline, default)",
    )
    args = ap.parse_args()

    text = resolve_prompt(args)
    if not text:
        ap.error("Tom prompt")

    trace_offline = not args.trace_online

    if args.output_dir:
        out_dir = args.output_dir.resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_dir = OUTPUT_ROOT / f"run_{stamp}"
        out_dir.mkdir(parents=True, exist_ok=True)

    brief_body = {
        "prompt": text,
        "provider": args.provider,
        "model": args.model,
        "temperature": args.temperature,
        "imageGenerations": not args.no_image_generations,
    }
    (out_dir / "01_post_api_ai_brief.json").write_text(
        json.dumps(brief_body, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    polish_example = {
        "endpoint": "POST /api/ai/chat",
        "note": "Exakt systemprompt byggs i buildPolishSystemPrompt() i promptAssist.ts",
        "example_body": {
            "provider": args.provider,
            "model": args.model,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": "<byggd av buildPolishSystemPrompt>"},
                {"role": "user", "content": text},
            ],
        },
    }
    (out_dir / "02_post_api_ai_chat_polish_example.json").write_text(
        json.dumps(polish_example, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    stream_meta: dict[str, Any] = {
        "note": "Första POST till kodgenerering efter eventuell brief — message + meta (useCreateChat).",
        "message": text,
        "meta_skeleton": {
            "isFirstPrompt": True,
            "buildIntent": args.build_intent,
            "scaffoldMode": "auto",
            "promptOriginal": text,
            "promptFormatted": text,
            "brief": "<fylls om /api/ai/brief körts; annars utelämnas>",
            "system": "<custom instructions från generateDynamicInstructions + användaren>",
        },
    }

    if args.with_trace:
        trace_data = run_ts_trace(text, offline=trace_offline)
        if trace_data:
            sc = trace_data.get("scaffold") or {}
            stream_meta["scaffold_preview"] = {
                "resolved": sc.get("resolved"),
                "keywordMatch": sc.get("keywordMatch"),
                "routePlan": trace_data.get("routePlan"),
            }
            (out_dir / "00_trace_context.json").write_text(
                json.dumps(trace_data, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        else:
            stream_meta["scaffold_preview_error"] = (
                "Kunde inte köra trace (saknas trace-generation-context.ts bredvid skriptet eller tsx misslyckades)."
            )

    (out_dir / "03_first_codegen_stream_meta.json").write_text(
        json.dumps(stream_meta, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    (out_dir / "04_brief_server_note.txt").write_text(BRIEF_SERVER_NOTE, encoding="utf-8")
    (out_dir / "FORSTA_LLM_README.md").write_text(README_SV, encoding="utf-8")
    (out_dir / "prompt_in.txt").write_text(text + "\n", encoding="utf-8")

    print(f"Skrev underlag: {out_dir.relative_to(REPO_ROOT).as_posix()}/")


if __name__ == "__main__":
    main()

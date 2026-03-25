#!/usr/bin/env python3
"""
Scaffold-/prompt-spårning för Sajtmaskin.

Standardflöde (interaktivt): ange bara din prompt, svara på om OpenAI/LLM ska
användas för embedding-sökning, och få utdata under scripts/labs/testning_scarf/output/prompt_trace/.

Alla sökvägar i skriptet är relativa till skriptets plats (inga hårdkodade diskar).

Kräver: Node 22+, npm install (tsx), repo-root som cwd.

Kör:
  python scripts/labs/testning_scarf/prompt_generation_trace.py
  python scripts/labs/testning_scarf/prompt_generation_trace.py -p "Min prompt"
  python scripts/labs/testning_scarf/prompt_generation_trace.py --no-llm -p "..."   # utan interaktion
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
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
TS_RUNNER = SCRIPT_DIR / "trace-generation-context.ts"
OUTPUT_ROOT = SCRIPT_DIR / "output" / "prompt_trace"


def run_trace(
    prompt: str,
    *,
    offline: bool,
    build_intent: str,
    scaffold_mode: str,
    scaffold_id: str | None,
    brief_path: Path | None,
    custom_path: Path | None,
    dynamic_preview_chars: int,
) -> dict[str, Any]:
    if not TS_RUNNER.is_file():
        sys.stderr.write(f"Saknar {TS_RUNNER.name} bredvid detta skript.\n")
        sys.exit(2)
    with tempfile.NamedTemporaryFile(
        "w",
        suffix=".txt",
        delete=False,
        encoding="utf-8",
        newline="\n",
    ) as tmp:
        tmp.write(prompt)
        pfile = tmp.name
    try:
        rel_script = TS_RUNNER.relative_to(REPO_ROOT).as_posix()
        tail = [
            "--prompt-file",
            pfile,
            "--build-intent",
            build_intent,
            "--scaffold-mode",
            scaffold_mode,
            "--dynamic-preview-chars",
            str(dynamic_preview_chars),
            "--portable-metadata",
        ]
        if offline:
            tail.append("--offline")
        if scaffold_id:
            tail += ["--scaffold-id", scaffold_id]
        if brief_path:
            tail += ["--brief-file", brief_path.resolve().as_posix()]
        if custom_path:
            tail += ["--custom-instructions-file", custom_path.resolve().as_posix()]
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
            sys.stderr.write(proc.stderr or proc.stdout or "tsx failed\n")
            sys.exit(proc.returncode)
        return json.loads(proc.stdout)
    finally:
        try:
            os.unlink(pfile)
        except OSError:
            pass


def format_report(data: dict[str, Any]) -> str:
    lines: list[str] = []
    def ln(s: str = "") -> None:
        lines.append(s)

    meta = data.get("meta", {})
    ln("=== Meta ===")
    ln(f"  Prompt längd: {meta.get('promptCharCount')} tecken")
    ln(f"  buildIntent: {meta.get('buildIntent')}  scaffoldMode: {meta.get('scaffoldMode')}")
    ln(f"  offline (ingen embedding-LLM): {meta.get('offline')}")
    if meta.get("scaffoldId"):
        ln(f"  scaffoldId (manual): {meta.get('scaffoldId')}")
    ln(f"  brief bifogad: {meta.get('briefProvided')}  OPENAI_API_KEY satt: {meta.get('openaiConfigured')}")
    ln()

    ln("=== Steg (tid i ms) ===")
    for s in data.get("steps", []):
        det = s.get("detail")
        extra = f"  → {json.dumps(det, ensure_ascii=False)}" if det else ""
        ln(f"  {s.get('name')}: {s.get('ms')} ms{extra}")
    ln()

    sc = data.get("scaffold", {})
    ln("=== Scaffold ===")
    km = sc.get("keywordMatch")
    ln(f"  Nyckelordsmatch: {km}")
    ln(f"  Embedding-top: {sc.get('embeddingTop')}")
    ln(f"  Resolverad (efter orchestrate): {sc.get('resolved')}")
    ln(f"  scaffoldContext tecken: {sc.get('scaffoldContextChars')}")
    ln()

    ln("=== Dossiers / template-library ===")
    dz = data.get("dossiers", {})
    ln(f"  Rot (repo-relativ): {dz.get('root')}")
    ln(f"  {dz.get('note', '')}")
    for m in dz.get("templateLibraryMatches", [])[:8]:
        ex = "finns" if m.get("dossierExists") else "saknas"
        ln(
            f"  - {m.get('id')}: score={m.get('matchScore')} q={m.get('qualityScore')} "
            f"families={m.get('recommendedScaffoldFamilies')} dossier {ex}"
        )
    ln()

    rp = data.get("routePlan")
    if rp:
        ln("=== Route plan ===")
        ln(json.dumps(rp, indent=2, ensure_ascii=False))
        ln()

    cap = data.get("capabilities")
    if cap:
        ln("=== Capabilities (infererade) ===")
        ln(json.dumps(cap, indent=2, ensure_ascii=False))
        ln()

    co = data.get("contracts", {})
    ln("=== Pre-generation contracts (utdrag) ===")
    ln(json.dumps(co, indent=2, ensure_ascii=False))
    ln()

    llm = data.get("llm", {})
    ln("=== LLM / prompt (ingen codegen körs) ===")
    ln(f"  {llm.get('explanation')}")
    spl = llm.get("systemPromptLengths", {})
    ln(
        f"  Systemprompt: total {spl.get('total')} tecken "
        f"(statisk ~{spl.get('static')}, dynamisk ~{spl.get('dynamic')})"
    )
    ln(f"  v0Enrichment (dynamisk kontext): {llm.get('v0EnrichmentChars')} tecken")
    ln()
    ln("--- User message (preview) ---")
    ln(llm.get("userMessagePreview", ""))
    ln()
    ln("--- Dynamic context (preview) ---")
    ln(llm.get("dynamicContextPreview", ""))
    return "\n".join(lines) + "\n"


def read_prompt_interactive() -> str:
    print("Skriv din prompt (fritext). Avsluta med en tom rad:")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line == "":
            break
        lines.append(line)
    text = "\n".join(lines).strip()
    if not text:
        print("Ingen prompt angiven.", file=sys.stderr)
        sys.exit(1)
    return text


def ask_use_llm() -> bool:
    while True:
        raw = input(
            "Använda LLM (OpenAI embeddings) för scaffold- och mall-matchning? [j/N]: ",
        ).strip().lower()
        if raw in ("", "n", "nej", "no"):
            return False
        if raw in ("j", "y", "ja", "yes"):
            return True
        print("Svara j eller n (standard: nej).")


def save_run(
    data: dict[str, Any],
    report_text: str,
    *,
    prompt: str,
    use_llm: bool,
) -> Path:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = OUTPUT_ROOT / f"run_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "trace.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (run_dir / "report.txt").write_text(report_text, encoding="utf-8")
    meta_lines = [
        f"embedding_llm: {use_llm}",
        f"offline_flag: {not use_llm}",
        "embedding_enrichment: vid Nej stängs OpenAI-embeddings av (scaffold, mall-sökning, KB/template i systemprompt).",
        f"prompt_file: prompt.txt",
        "",
    ]
    (run_dir / "meta.txt").write_text("\n".join(meta_lines), encoding="utf-8")
    (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    return run_dir


def main() -> None:
    p = argparse.ArgumentParser(
        description="Scaffold-trace med valfri OpenAI embedding-sökning.",
    )
    p.add_argument("--prompt", "-p", help="Prompt (annars interaktiv inmatning)")
    p.add_argument(
        "--use-llm",
        action="store_true",
        help="Tvinga på embedding-sökning (OpenAI)",
    )
    p.add_argument(
        "--no-llm",
        action="store_true",
        help="Tvinga av embedding-sökning (nyckelord endast)",
    )
    p.add_argument("--build-intent", default="website", choices=["website", "app", "template"])
    p.add_argument("--scaffold-mode", default="auto", choices=["auto", "manual", "off"])
    p.add_argument("--scaffold-id", default=None)
    p.add_argument("--brief-file", type=Path, default=None)
    p.add_argument("--custom-instructions-file", type=Path, default=None)
    p.add_argument("--dynamic-preview-chars", type=int, default=6000)
    p.add_argument("--json", action="store_true", help="Skriv endast JSON till stdout (ingen fil)")
    p.add_argument("--no-save", action="store_true", help="Skriv inte till output/prompt_trace/")
    args = p.parse_args()

    if args.use_llm and args.no_llm:
        print("Välj antingen --use-llm eller --no-llm.", file=sys.stderr)
        sys.exit(2)

    if args.prompt is not None:
        text = args.prompt
    else:
        text = read_prompt_interactive()

    if args.use_llm:
        use_llm = True
    elif args.no_llm:
        use_llm = False
    elif sys.stdin.isatty():
        use_llm = ask_use_llm()
    else:
        use_llm = False

    offline = not use_llm
    data = run_trace(
        text,
        offline=offline,
        build_intent=args.build_intent,
        scaffold_mode=args.scaffold_mode,
        scaffold_id=args.scaffold_id,
        brief_path=args.brief_file,
        custom_path=args.custom_instructions_file,
        dynamic_preview_chars=args.dynamic_preview_chars,
    )

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return

    report_body = format_report(data)
    print(report_body, end="")

    if not args.no_save:
        rel = save_run(data, report_body, prompt=text, use_llm=use_llm)
        try:
            display = rel.relative_to(REPO_ROOT).as_posix()
        except ValueError:
            display = rel.as_posix()
        print(f"\nSparat under: {display}/")


if __name__ == "__main__":
    main()


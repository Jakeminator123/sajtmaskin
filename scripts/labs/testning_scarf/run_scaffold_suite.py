#!/usr/bin/env python3
"""
Kör tio separata scaffold-trace-tester (en per intern runtime-scaffold) och sparar
utfiler under scripts/labs/testning_scarf/output/scaffold_suite/suite_<UTC>/

Använder prompt_generation_trace.py i samma mapp (offline som standard).

Kör från repo-roten:
  python scripts/labs/testning_scarf/run_scaffold_suite.py
  python scripts/labs/testning_scarf/run_scaffold_suite.py --use-llm
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent.parent
OUTPUT_ROOT = SCRIPT_DIR / "output" / "scaffold_suite"


def _load_prompt_trace_module():
    path = SCRIPT_DIR / "prompt_generation_trace.py"
    spec = importlib.util.spec_from_file_location("prompt_generation_trace", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Kunde inte ladda {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Ordning följer src/lib/gen/scaffolds/registry.ts (BASE_SCAFFOLDS)
SUITE_CASES: list[dict[str, Any]] = [
    {
        "id": "base-nextjs",
        "prompt": (
            "Minimal Next.js-startpunkt utan särskild bransch — bara ren app-struktur att bygga vidare på."
        ),
        "build_intent": "website",
        "scaffold_mode": "manual",
        "scaffold_id": "base-nextjs",
        "note_sv": (
            "Med buildIntent website väljs aldrig base-nextjs automatiskt via nyckelord "
            "(fallback blir landing-page). Här tvingas base-nextjs med scaffoldMode=manual."
        ),
    },
    {
        "id": "landing-page",
        "prompt": (
            "Vi är en byrå som behöver en tydlig hemsida för vårt företag med tjänster, "
            "kampanj och corporate känsla."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "Nyckelord för landing/marketing + website → landing-page som standardinriktning.",
    },
    {
        "id": "saas-landing",
        "prompt": (
            "Bygg en B2B saas-plattform med pricing, subscription, free trial och produktledd landningssida."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "SaaS- och pricing-nyckelord ska dominera över ren landing.",
    },
    {
        "id": "portfolio",
        "prompt": (
            "Personlig portfolio för fotograf och designer med utvalda case studies och kreativ presentation."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "Portfolio/creative-nyckelord.",
    },
    {
        "id": "blog",
        "prompt": (
            "En redaktionell blogg med artiklar, inlägg och nyhetsbrev i magasinstil."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "Blogg/artikel/inlägg-nyckelord.",
    },
    {
        "id": "dashboard",
        "prompt": (
            "Admin-dashboard med statistik, diagram, tabeller och rapporter för nyckeltal och översikt."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "Dashboard/analytics-nyckelord (även med website-intent).",
    },
    {
        "id": "auth-pages",
        "prompt": (
            "Vi behöver inloggning, registrering, glömt lösenord och återställning av konto med tydlig auth-flöde."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "Auth/login-nyckelord prioriteras före övriga i matchern.",
    },
    {
        "id": "ecommerce",
        "prompt": (
            "E-handel för Bolag X: vi säljer kläder på nätet med webbshop, varukorg, kassa och produktkatalog."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "E-handel/butik/kundvagn-nyckelord.",
    },
    {
        "id": "content-site",
        "prompt": (
            "En innehållsrik sajt med galleri, showcase och projekt i flera sektioner — fokus på berättande och material."
        ),
        "build_intent": "website",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": (
            "Content-site triggas när content-nyckelord når tröskel utan att saas/portfolio/landing/blog vinner först."
        ),
    },
    {
        "id": "app-shell",
        "prompt": (
            "Intern admin-panel med sidebar, verktyg och inställningar för teamet — ingen publik landningssida."
        ),
        "build_intent": "app",
        "scaffold_mode": "auto",
        "scaffold_id": None,
        "note_sv": "buildIntent=app utan stark dashboard-signal → app-shell (sidopanel/admin).",
    },
]


README_SV = """# Testsuite: tio interna scaffolds

## Är detta \"kategorier\" eller scaffolds?

De tio posterna motsvarar **de enda runtime-scaffolds** som finns i `src/lib/gen/scaffolds/registry.ts`.
Varje post är ett **ScaffoldManifest** (id + label + inbäddade startfiler), inte en fri \"kategori\" utanför koden.

- **Scaffold** = produktartefakt i repot (manifest + kodfiler som serialiseras in i prompten och mergas efter generering).
- **De tio** = hela uppsättningen valbara interna starters; egna motorn väljer bland just dessa (auto/manuellt/av).

## Används dossiers?

**Ja, indirekt.** Trace-json innehåller `dossiers.templateLibraryMatches`: sökning i den **kuraterade template-library**
(som byggts från dossiers under `research/external-templates/reference-library/dossiers/`). Det är **referensmaterial**
för prompt/kontext — inte samma sak som val av runtime-scaffold.

## Filer i denna mapp

- `NN_<scaffold-id>_trace.json` — full trace (portabla sökvägar).
- `NN_<scaffold-id>_report.txt` — läsbar rapport.
- `NN_<scaffold-id>_prompt.txt` — prompt + kort anteckning för fallet.
- `suite_manifest.json` — sammanfattning och pass/fail mot förväntat scaffold-id.
- `SUITE_README.md` — denna text.

## Körning

`python scripts/labs/testning_scarf/run_scaffold_suite.py` (standard offline). LLM: `--use-llm`.
"""


def main() -> None:
    p = argparse.ArgumentParser(description="Kör 10 scaffold-tracer och sparar under scripts/labs/testning_scarf/output/scaffold_suite/.")
    p.add_argument("--use-llm", action="store_true", help="Använd OpenAI embeddings (annars offline)")
    p.add_argument("--dynamic-preview-chars", type=int, default=5000)
    args = p.parse_args()

    mod = _load_prompt_trace_module()
    run_trace = mod.run_trace
    format_report = mod.format_report

    offline = not args.use_llm
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suite_dir = OUTPUT_ROOT / f"suite_{stamp}"
    suite_dir.mkdir(parents=True, exist_ok=True)

    manifest_rows: list[dict[str, Any]] = []
    failures: list[str] = []

    for i, case in enumerate(SUITE_CASES, start=1):
        sid = case["id"]
        prefix = f"{i:02d}_{sid}"
        prompt = str(case["prompt"])
        data = run_trace(
            prompt,
            offline=offline,
            build_intent=str(case["build_intent"]),
            scaffold_mode=str(case["scaffold_mode"]),
            scaffold_id=case.get("scaffold_id"),
            brief_path=None,
            custom_path=None,
            dynamic_preview_chars=args.dynamic_preview_chars,
        )
        resolved = (data.get("scaffold") or {}).get("resolved") or {}
        resolved_id = resolved.get("id")
        ok = resolved_id == sid
        if not ok:
            failures.append(f"{prefix}: förväntat {sid!r}, fick {resolved_id!r}")

        row = {
            "index": i,
            "expected_id": sid,
            "resolved_id": resolved_id,
            "match": ok,
            "build_intent": case["build_intent"],
            "scaffold_mode": case["scaffold_mode"],
            "scaffold_id_arg": case.get("scaffold_id"),
            "note_sv": case.get("note_sv"),
            "files": {
                "trace": f"{prefix}_trace.json",
                "report": f"{prefix}_report.txt",
                "prompt": f"{prefix}_prompt.txt",
            },
        }
        manifest_rows.append(row)

        (suite_dir / f"{prefix}_trace.json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (suite_dir / f"{prefix}_report.txt").write_text(
            format_report(data),
            encoding="utf-8",
        )
        extra = ""
        if case.get("note_sv"):
            extra = "\n\n## Anteckning (testfall)\n" + str(case["note_sv"]) + "\n"
        (suite_dir / f"{prefix}_prompt.txt").write_text(
            prompt + extra,
            encoding="utf-8",
        )

    manifest = {
        "generated_utc": stamp,
        "offline": offline,
        "cases": manifest_rows,
        "failures": failures,
        "all_match": len(failures) == 0,
    }
    (suite_dir / "suite_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (suite_dir / "SUITE_README.md").write_text(README_SV, encoding="utf-8")

    rel = suite_dir.relative_to(REPO_ROOT).as_posix()
    print(f"Klart: {rel}/")
    print(f"  manifest: suite_manifest.json  all_match={manifest['all_match']}")
    if failures:
        print("  AVVIKELSER:", file=sys.stderr)
        for f in failures:
            print(f"    - {f}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

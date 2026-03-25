# testning_scarf — scaffold-trace, första LLM, codegen-snapshot

Allt under `scripts/labs/testning_scarf/`. Kör från **repo-root**.

## Output (gemensamt)

All genererad data hamnar under:

`scripts/labs/testning_scarf/output/<kategori>/…`  
(gitignorerad)

| Mapp | Innehåll |
|------|----------|
| `output/prompt_trace/` | Enstaka körningar: `trace.json`, `report.txt`, `prompt.txt` |
| `output/scaffold_suite/` | Tio fall: `suite_<UTC>/`, manifest |
| `output/first_llm/underlag/` | `build_first_llm_underlag.py` (manuellt) |
| `output/first_llm/lab/` | `first_llm_promptlab.py` (underlag + ev. live) |
| `output/codegen_snapshot/` | Du skapar undermapp; se nedan |

## Exempelprompt (svensk hemsida)

- **`restaurang_hemsida_prompt.txt`** — kort prompt för trace/snapshot (restaurang, meny, bokning). Använd med `trace-generation-context.ts` och `--write-codegen-snapshot` (se [docs/architecture/scraped-scorefolds-pipeline.md](../../../docs/architecture/scraped-scorefolds-pipeline.md)).

## Skript (3 huvudingångar + 2 stöd)

1. **`prompt_generation_trace.py`** — interaktiv/CLI-trace (`prepareGenerationContext` m.m.), sparar under `output/prompt_trace/`.
2. **`run_scaffold_suite.py`** — alla 10 interna scaffolds, `output/scaffold_suite/`.
3. **`first_llm_promptlab.py`** — underlag för brief/polish + valfritt `--live` mot localhost, `output/first_llm/lab/`.

Stöd:

- **`trace-generation-context.ts`** — anropas av (1); kan även köras direkt med `npm run prompt:trace`.
- **`run_first_llm_live.ts`** — anropas av (3) med `--live`.

## Var ser jag vad kod-LLM:en matas med? (~38k tecken)

Det är **inte** `trace.json` i sin helhet — där är bara **förhandsvisning**.

Kör trace med snapshot (från repo-root):

```bash
npx tsx scripts/labs/testning_scarf/trace-generation-context.ts ^
  --prompt-file scripts/labs/testning_scarf/output/scaffold_suite/suite_XXX/02_landing-page_prompt.txt ^
  --strip-suite-note ^
  --write-codegen-snapshot scripts/labs/testning_scarf/output/codegen_snapshot/landing_demo
```

Öppna sedan:

- **`03_v0_enrichment_context.txt`** — dynamisk kontext (~38k i typiskt fall), det som ofta blandas in i v0-system.
- **`02_engine_system_prompt.txt`** — hela systemprompten för egen motor (ännu större).

`04_snapshot_meta.json` visar exakta teckenlängder.

## print_codegen_context.py

Tre raders standardprompt (ekonomisk dashboard, app-känsla) → skriver snapshot:

`python scripts/labs/testning_scarf/print_codegen_context.py`  
`npm run testning:codegen-print`  
Flaggor: `--offline`, `--build-intent website|app|template`, `--prompt-file path.txt`

Ut: `output/codegen_snapshot/dashboard_app_<UTC>/` med bl.a. `02_` och `03_`.

# Steg 4 — kvalitetshotspots och verifieringsplan

**Senast uppdaterad:** 2026-04-08

Leverans från **planfasen** för Steg 4: **rangordnade** riskytor, **doc-sync**-ankare och **konkret** test-/verifieringsplan — inte själva implementationen av nya features.

## A) Rangordnade kvalitetshotspots

Prioritet = **användarvärde** × **sannolikhet att påverka stabilitet** / **kostnad** (latens, LLM-anrop).

| Prio | Hotspot | Varför | Filer att läsa först |
|------|---------|--------|----------------------|
| 1 | **Syntax + LLM-fixer (`validateAndFix`)** | Direkt påverkan på om sparad kod är **parsbar**; fixer-loop kan dra tid eller ge falsk trygghet | `validate-and-fix.ts`, `llm-fixer.ts`, `repairPolicies` i manifest |
| 2 | **Preflight → verification blocking** | Styr om version **fails** eller får gå vidare; påverkar «känns klart» | `finalize-preflight.ts`, `finalize-version.ts` (efter `runFinalizePreflight`) |
| 3 | **`server-verify` + repair** | **Asynk** «sista» kvalitetslina efter preview-handoff; kan skapa nya versioner | `server-verify.ts`, `quality-gate-checks.ts` |
| 4 | **Verifier-pass i finalize** | Extra LLM-latens; **non-fatal** — risk att under-/överanvändas | `verifier-pass.ts`, `resolveVerifierPassPolicy` i `finalize-version.ts` |
| 5 | **Finalize path policy (fast-only)** | Hopp över bilder + verifier på lätta follow-ups — **medveten** latensvinst vs kvalitet | `resolveFinalizePathPolicy`, `FEATURES.useFinalizeDeepPath` |
| 6 | **Deterministisk autofix** | Många fixar = varning «heavy load»; kan maskera upstream-problem | `autofix/pipeline.ts` |
| 7 | **Naming debt `/api/v0/`** | Förvirrar avläsning av var codegen går; **inte** samma som v0-mallar | Stream routes under `src/app/api/v0/chats/*` |

**Obs:** `template-library` / extern pipeline är **uttryckligen inte** huvudspår för Steg 4-kvalitet (se `LLM-PIPELINE-REVIEWLAGE-OCH-OPNA-RISKER.md`).

## B) Verifieringsplan (beteende, inte bara typer)

Mål: tester och manuella kontroller som fångar **ordning**, **policy** och **regression** i finalize-kedjan.

### B1) Befintliga / riktade automatiska tester

- Utöka eller behåll täckning runt:
  - `finalize-pipeline-contract.ts` — fas-ID:n oförändrade mot dokumenterad ordning.
  - Mockade stream-tester under `src/app/api/v0/chats/**/route.test.ts` — säkerställ att finalize anropas efter generation (redan delvis).
- Lägg vid behov till **enhetstester** som mockar `validateAndFix` / `runVerifierPass` för att verifiera **skip**-logik när `runDeepPath === false` (lätt follow-up policy).

### B2) Manuella / integrationsscenarier (rekommenderad checklista)

1. **Första build (website)** — deep path påslagen: bildmaterialisering + ev. verifier enligt BuildSpec; kolla SSE `progress.step`-ordning.
2. **Lätt follow-up** (copy, fast verification, light context) — bekräfta `fast-only`-beteende: inga `materialize_images`/`verifier`-steg i telemetry om policy säger så.
3. **Repair-pass** (`repairPassIndex > 0`) — deep path tvingad; verifier enligt policy (oftast av för repair).
4. **Preflight blocking** — scenario som utlöser verification-blocking; version ska kunna markeras failed enligt DB-flöde.

### B3) Observability

- Jämför `data/prompt-dumps/*` **endast** som sekundär signal; **sanning** = kod + DB-state + SSE-loggar.
- För finalize: `devLogAppend` `type: "finalize.pipeline"` med `finalizePath` / `finalizePathReason`.

## C) Doc-sync (ankare)

När runtime i Steg 4 ändras, uppdatera minst:

- `docs/architecture/step4-post-generation.md`
- Denna fil (om prioritering eller testplan ändras)
- `.cursor/rules/terminology.mdc`
- `SYSTEMKARTA_SAJTMASKIN.txt`, `LLM_KEDJA_STEG_FOR_STEG.txt`
- `docs/architecture/builder-generation.md`
- `.cursor/rules/llm-pipeline-docs-sync.mdc`

Dashboard: `config/dashboard/app.py` (repair/verifier/timeouts), `scripts/scripts_dashboard.py` (termpanel), `config/dashboard/domain-map.json` vid nya doc-länkar.

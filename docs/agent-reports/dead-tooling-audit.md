# Dead Tooling Audit (spår 05)

## Scope och plan

Detta pass fokuserar på `scripts/`, rebuild/eval, prompt-dumps, generationslogg och generated artifacts.

Planen som kördes:

1. Kartlägga write/read-kedjor för artifacts och scripts.
2. Klassificera varje yta (`active`, `active but confusing`, `migration needed first`, `likely removable`).
3. Peka ut topp 10 förvirrande ytor.
4. Leverera cleanup-kandidater för senare pass.
5. Göra minst en säker, liten fix i detta pass.

## Vad som är sant idag (kort)

- Hot path i runtime är own-engine + runtime-scaffolds; externa pipelines är build-/toolingtid.
- `template-library.generated.json` används för tooling/validering, inte direkt i live prompt-injektion.
- `prompt-dumps` och `GENERATIONSLOGG` är observability (opt-in), inte source of truth.
- `scripts/rebuild_artifacts.py` är aktiv orkestrator för reproducerbar rebuild.
- Scriptpanelen (`scripts/scripts_dashboard.py`) är aktiv manuell operatörsyta men är inte runtimekritisk.

## Inventeringstabell (scripts + artifacts)

| Path | Owner/system | Input | Output | Används av | Status |
|---|---|---|---|---|---|
| `scripts/rebuild_artifacts.py` | Artifact rebuild orchestration | befintlig scrape-cache eller ny scrape, package scripts | ombyggda v0/template/scaffold artifacts + validering | `npm run artifacts:rebuild*`, scriptpanel | active |
| `scripts/template-library/full_template_refresh.py` | Extern template-pipeline | scrape/import/cache | `template-library.generated`, `scaffold-research`, embeddings | `template-pipeline:*`, rebuild-script | active |
| `scripts/scaffolds/scaffold_cli.py` | Scaffold pipeline CLI | discovery/template-library artifacts | scaffold artifacts, eval/verify output | `npm run scaffolds:*`, rebuild/scriptpanel | active |
| `scripts/eval/run-eval.ts` | Eval harness | eval prompts + repo checks | `eval-output/*` markdown | `npm run eval`, rebuild (valfritt) | active |
| `scripts/scripts_dashboard.py` | Manuell operatörspanel (Tkinter) | package scripts, artifactfiler | körning + statusvisning | `npm run scripts:dashboard` | active but confusing |
| `scripts/dashboard_shared.py` | Delad prompt-dump statuslogik | `data/prompt-dumps/*` + env | statusrader till dashboards | scriptpanel + config dashboard | active |
| `src/lib/gen/prompt-dump.ts` | Prompt observability | generation context | `data/prompt-dumps/*` latest-filer | own-engine stream + eval tooling | active |
| `src/lib/logging/generation-log-writer.ts` | Dev observability (`GENERATIONSLOGG`) | stream/events | `logs/generationslogg/*` | dev felsökning | active but confusing |
| `src/lib/gen/template-library/template-library.generated.json` | Curated template-library artifact | external pipeline build | sök-/valideringsbar katalog | template tooling + scaffold checks | active but confusing |
| `src/lib/gen/scaffolds/scaffold-research.generated.json` | Scaffold research overlay | template-library build | scaffold metadata overlay | runtime scaffold-registry + tooling | active |
| `src/lib/gen/scaffolds/scaffold-embeddings.json` | Scaffold semantic fallback | scaffold manifests + embeddings script | vectors | `searchScaffolds`, parity/test/tooling | active |
| `data/external-template-pipeline/reports/scaffold-candidates-curated.json` | Curation report | template/scaffold candidate pass | prioriterad kandidatlista | manuellt curationarbete | migration needed first |
| `EGEN_MOTOR_V2/` (legacy output dir) | Historisk eval-output | äldre eval-körningar | md-rapporter | ingen modern pipeline | likely removable |

## Topp 10 mest förvirrande ytor

1. `scripts/rebuild_artifacts.py` blandade "validate" och "eval"-steg i praktiken.
2. Scriptpanelens "safe/full all" döljer ganska tunga side effects bakom GUI-knappar.
3. `template-library.generated.json` ligger nära runtime-kod men används främst för tooling/validering.
4. `scaffold-research.generated.json` är runtime-relevant men ser ut som "bara genererad fil".
5. `prompt-dumps` tolkas lätt som systemsanning i stället för observability snapshot.
6. `GENERATIONSLOGG` producerar användbara loggar men är avsiktligt dev-only och lätt att övertolka.
7. Flera pipelines (v0-mallar, externa referenser, scaffolds) använder liknande ord men olika syften.
8. `scripts/README.md` beskriver många spår i samma dokument, hög kognitiv last.
9. `scaffold-candidates-curated.json` ser kanonisk ut men är egentligen curation-underlag.
10. Legacy-katalogen `EGEN_MOTOR_V2/` nämns fortfarande som historiskt sidospår.

## Cleanup-kandidater (framtida pass)

1. Flytta `EGEN_MOTOR_V2/` till ren lokal-historik/arkivpolicy (eller sluta referera helt).
2. Skilj tydligare på "validate" vs "eval" i rebuild-flöden och dashboards.
3. Inför lättviktig "read-only status"-körning för scriptpanelen som default.
4. Bryt ut kort "hot path vs tooling path"-översikt från `scripts/README.md` till en kompakt snabbguide.
5. Överväg att versionera curation-rapporter utanför runtime-nära träd om de inte behövs i repo.

## Fixar utförda i detta pass

1) Fixad förvirrande valideringskedja i `scripts/rebuild_artifacts.py`:

- `scaffolds:eval` körs nu **endast** när `--with-eval` är satt.
- Basvalidering kör alltid:
  - `template-library:validate-runtime`
  - `scaffolds:verify`

Effekt: scriptets faktiska beteende matchar nu beskrivningen ("validera outputs, kör eval valfritt") och minskar onödig tyngd i defaultläget.

2) Tydligare driftlägen i `scripts/scripts_dashboard.py`:

- Delade artifacts-rebuild i fyra explicita varianter:
  - reuse cache, validate-only
  - reuse cache, with eval
  - full scrape, validate-only
  - full scrape, with eval
- "Kör säker helkörning" och "Rensa och bygg om allt" använder nu validate-only som default.
- GUI-texten förklarar explicit att eval är ett tilläggsläge.

Effekt: mindre risk att köra onödigt tunga eval-pass av misstag.

3) Tydligare CLI-kontrakt i `package.json` + `scripts/README.md`:

- `artifacts:rebuild` och `artifacts:rebuild:full` är nu validate-only (med typecheck).
- Eval finns kvar som explicita varianter:
  - `artifacts:rebuild:with-eval`
  - `artifacts:rebuild:full:with-eval`
- Scriptpanelen använder nu dessa npm-scripts i stället för att duplicera python-flaggor.
- `scripts/README.md` beskriver nu skillnaden mellan validate-only och with-eval.

Effekt: samma semantik i CLI, dashboard och rebuild-script, med lägre risk för "osynlig" eval-kostnad.

## Kvarstående blockerare i detta pass

- Försök att göra `.cursorignore` konsekvent för `data/prompt-dumps/*` stoppades av filbehörigheter i worktreet (skrivrätt nekad för just den filen i denna session).

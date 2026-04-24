# OMTAG 2026-04-23 — komplett leverans

> **TL;DR:** 11 OMTAG-uppdrag mergade över ~20 timmar (natt → morgon → eftermiddag → kväll). Fas 0 + fas 1·03 + fas 1·05 + fas 2·A/B/C/D + fas 3·06 landade alla på master. Repot gjorde sitt största strukturella språng sedan start: 4 monoliter splittade, en eval-baseline etablerad, en unified event-bus, en AJV-hårdnad dossier-kontrakt, och "Nordic Future Summit"-klassen eliminerad. Kvar: E3 (recurring-patterns), M4 (syntaxFixPasses — skippad/dokumenterad), och parkerade stora spår (L1/L2/L3/M2/P32 B–F/M3/P33/WebContainers).

**Master vid avslut:** `05b7235dd` → några doc-sync-commits → final efter arkivering (denna commit). **Origin i sync.**

---

## Vad som landade på master 2026-04-23

| Fas | Uppdrag | Vad | Merge-commit |
|---|---|---|---|
| 0 | 01 embedding-diagnos | `scaffolds:embeddings` + prebuild-gate + hygien; dossier-embedding-observation ("capability-deterministic, inget script behövs") | `9c02b9923` |
| 0 | 02 eval-baseline | 10 canonical prompts + runner + diff-script + master-resultat committat | `18c3218d4` |
| 0 | 04 env-flag-collapse | 11 `SAJTMASKIN_*`-flaggor → hårdkodade konstanter | `62fccaa16` |
| 0 | 07 static-core-type-imports | 3 type-only-import-exempel i `02-component-contract.md` (sänker autofix-heavy-load-triggers) | `2e8912107` |
| 1 | 03 wave-split-heatspots | system-prompt.ts 1469→≤259, build-spec.ts 1103→≤316, promptAssist.ts 877→≤199, finalize-version.ts 1768→≤374. Alla med `git mv` (blame bevarad). | `c3388c80c` |
| 1 | 05 scaffold-default-removal | `app/page.tsx` får INTE komma från scaffold-default; saknas → verification-blocked. Löser "Nordic Future Summit"-klassen. | `d1bc644ae` |
| 2 | A follow-up-integrity | `follow-up-predicate.ts` (1 kontrakt, 3 callsites), P26-rest fixad, E1 prompt-duplicate bort (~250 tokens/followup), P19 Steg 3 basversions-badge | `c7bc16a6c` |
| 2 | B scaffold-variant-cleanup | `content-site` → `landing-page` (40 filer), `corporate-grid` vinner nu 4/4 B2B-prompts (var 0/20 i audit 2026-04-18). Totalt 20/20 exact matches | `93eb71875` |
| 2 | C autofix-import-hardening | E4 Required Imports Checklist (deterministisk shadcn-tabell i prompt), E5 3 react-fixers→1, M4 skippad+dokumenterad, E6 autofix-heavy-load strict-assert i preflight | `315de8dbf` |
| 2 | D dossier-contract | AJV-validator wire:ad i registry+CI+curate; 17 dossiers passerar; `defaultForCapability`-unicitet; instructions.md-rubrik-check | `0a0fbf488` |
| 3 | 06 unified-status-eventbus | Single-writer event-bus + `.runs.json`-index per versionId + `selectVersionStatus(events)`-projection (10 test-scenarier) | `05b7235dd` |

**Följdcommits:** doc-sync efter OMTAG 03, broken-ref-fix (`gen-pipeline-simplicity.mdc` → `pipeline-rules.mdc` i 6 filer), begreppsdrift-fix (`codegen-static-prompt` → `codegen-core-manifest` i `config/README.md`), lint-polish (unused helper i sections/visual-and-guidance.ts).

---

## Bedömning mot gpt-rapportens siffror

**Gpt-rapporten (före OMTAG):** 6.4/10 totalt · 6.9/10 mindre buggigt · 4.8/10 enklare/begripligare.

**Min (ärliga) bedömning efter OMTAG:**

| Dimension | Före OMTAG | Efter OMTAG | Delta | Motivering |
|---|---|---|---|---|
| **Mindre buggigt / robusthet** | 6.9 | **7.5** | +0.6 | Scaffold-default-block eliminerar "Nordic Future"-klassen. Follow-up-predicate ger en sanning där det fanns 3. Dossier-AJV vägrar invalid data. Event-bus reducerar 4 racing status-writers → 1 single-writer. |
| **Enklare / begripligare** | 4.8 | **5.9** | +1.1 | 4 monoliter splittade till paket (`system-prompt/`, `build-spec/`, `prompt-assist/`, `finalize-version/`). 11 env-flaggor borta. 3 react-fixers → 1. Prompt-duplicate borta (~250 tokens/followup). Begreppsdrift (`codegen-static-prompt` → `codegen-core-manifest`) synkad. Eval-baseline gör beslut mätbara. |
| **Totalt** | 6.4 | **~7.0** | +0.6 | Båda axlar upp. |

**Vad som fortfarande drar ner betyget** (kvar att adressera):

1. **`orchestrate.ts` (~705 rader)** — inte splittad. Kandidat för nästa split-våg.
2. **`route-plan.ts` (~679 rader)** — inte splittad.
3. **`config/ai_models/manifest.json` (~1023 rader)** — inte splittad.
4. **`src/lib/gen/` är fortfarande en bred yta** — många underdomäner. OMTAG 03 tog de värsta monoliterna men kärnkatalogens bredd adresserades inte.
5. **M4 (`syntaxFixPasses: 1`) skippad** — eval-baselinen täcker inte syntax-fixer-pipen, så den objektiva gaten som M4 kräver är oprövbar. Dokumenterat i `docs/plans/avklarat/omtag-2026-04-23/fas2-C-m4-findings.md`. Återöppnas med `EVAL_FULL=1` eller produktions-telemetri.
6. **E3 (`recurringQualityPatterns` in i codegen-prompt)** — inte levererad. Liten (~2 h) men kräver dedikerat pass.

**Vad som är sämre** (ärligt):

- Lokala worktrees kvarhållna av öppna agent-sessions (`f0i4`, `omtag-fas2B`, `cr4e` m.fl.). Harmless men kosmetiskt. Stäng agent-sessionerna och rensa med `git worktree remove --force`.
- Om syntax-fixer-flödet hade en möjlig latensvinst (M4) är den fortfarande outnyttjad.

**Ny kapacitet som inte fanns före:**

- **Eval-baseline** (`evals/results/baseline-master/`) — mätsticka för alla framtida ändringar. Regressionsgate i OMTAG användes flera gånger under waven.
- **Event-bus** — en sanning för status. UI:n kan nu successivt flyttas till `selectVersionStatus(events)`-projection.
- **Dossier-AJV** — kontraktet är hårt. M2 (fyll poolen) kan nu göras utan fear-of-drift.

---

## Vad som finns i repot efter OMTAG

**Arkiv:** [`docs/plans/avklarat/omtag-2026-04-23/`](docs/plans/avklarat/omtag-2026-04-23/) innehåller:
- 11 kördokument (01-07 + fas2/A-D)
- Rapporterna agenter producerade (`fas2-B-audit-before-after.md`, `fas2-C-m4-findings.md`, `01-FINDINGS.md`)
- `PARKED.md` — vad som explicit inte gjordes och varför
- Tidigare `STATUS-2026-04-24-morning.md` (natt+em-rapporten, arkiverad)
- `INDEX.md` som nav över arkivet
- `source-gpt-review/` med guldrapporten + 16 källfiler som blev inputs till fas 2

**Active plans efter uppdatering:** se `docs/plans/active/README.md`. 11 plan-filer totalt, varav de flesta är parkerade eller har top-note om vad OMTAG redan tog hand om.

**Explicit parkerat:** L1, L2, L3, M2, P32 Fas B–F, M3, P33, WebContainers, M4. Se `docs/plans/avklarat/omtag-2026-04-23/PARKED.md` för gatekeeper-villkor per spår.

---

## Vad du gör när du är redo för nästa våg

**Kort-lista** (i prioritetsordning):

1. **Stäng agent-sessions** och rensa worktrees med `git worktree list` + `git worktree remove --force <path>` där tillämpligt.
2. **Välj mellan** dessa tre nästa-jobb:
   - **A — Kör E3** (`recurringQualityPatterns` in i codegen-prompt). 2 h, litet men värdefullt.
   - **B — Starta nästa split-våg** (`orchestrate.ts` + `route-plan.ts`) om du vill fortsätta enkelhet-axeln.
   - **C — Flippa UI till `selectVersionStatus(events)`** från event-bussen (rör `BuilderShellContent.tsx` + `preview-panel` SSE-handling; 06-agenten lämnade projektionen redo men gjorde inte UI-omkopplingen).
3. **Bygg ut eval-surface** (`EVAL_FULL=1`) så M4 + M3 får objektiv gate.
4. **Flippa UI-transparens** för run-index — event-bussens `.runs.json` ger aggregerade views av repair-pass-mappar, men UI läser dem inte än.

**Att INTE göra utan vidare utredning** (från `PARKED.md`):

- Lägga till nya dossiers (M2) — kontraktet är hårt men poolen är rätt storlek för nu.
- L1 `runUnifiedRepair()` — kräver telemetri.
- L2 PromptKit — system-prompt just splittad; låt settle.

---

## Kronologisk referens

OMTAG-start: 2026-04-22 kväll (orkestrerings-commit `cb6d11f57`).
OMTAG-slut: 2026-04-23 kväll (denna STATUS-commit).

Totalt ~20 aktiva timmar, ~4 human-hours i agent-supervision, 11 uppdrag i 9 cloud-agenter (några parallellt).

---

**Slutkommentar:** Repo:t är nu strukturellt i sitt bästa läge sedan jag började granska det. Kärnan är mindre; begreppen är synkade; mätstickan finns; kontrakten är hårdare. Men det är INTE ett slutläge — det är en bas att bygga vidare från. gpt-rapportens observation att "orchestrate.ts, route-plan.ts, manifest.json fortfarande är stora" står kvar och bör adresseras i nästa våg.

— Claude, 2026-04-23 kväll

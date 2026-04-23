# Aktiva planer — konsoliderad översikt

Senast uppdaterad: 2026-04-23 (efter OMTAG-waven). Alla öppna steg listas i enhetligt A/B/C/D-format. Varje planfil behåller sin detaljerade text — tabellen nedan är routern.

> **Stor händelse 2026-04-23:** 11 uppdrag i OMTAG-waven mergade. Se arkivet [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/) och rotfilen `STATUS-2026-04-23-omtag-complete.md`. Flera planer här nedan har delvis bockats av — se top-note i respektive plan-fil.

## Öppna steg (sorterat efter prio + blocker)

| # | Plan | Kvarvarande steg | Effort | Prio | Blocker |
|---|------|------------------|--------|------|---------|
| A | [`P26-followup-orchestration-glitch.md`](./P26-followup-orchestration-glitch.md) | PR1+PR2 (A-fix + variant-lock) avklarade i OMTAG fas 2·A. PR3–PR9 (quality-gate probe, HMR-spam, raw-message-log, bygg-nu-UX, backoffice build-template, dossier re-embed, three-fiber-dossier) kvarstår. | varierar | Medel | Individuell per PR |
| B | [`P34-blocking-lint-in-validate-and-fix.md`](./P34-blocking-lint-in-validate-and-fix.md) | **C2** — aktivera `SAJTMASKIN_BLOCKING_ESLINT=true` i Vercel Preview. **D** — aktivera i prod efter latens-mätning. **E** — ta bort lint från bakgrundsgate. | ~3h + mätning | Medel | Latens-data |
| C | [`dossier-brief-sync.md`](./dossier-brief-sync.md) | P1/P2 polish — frivilligt | — | Låg | — |
| D | [`E-easy-medium-layer.md`](./E-easy-medium-layer.md) | ~~E1~~ · ~~E2~~ · ~~E4~~ · ~~E5~~ · ~~E6~~ · ~~E7~~ avklarade i OMTAG 2026-04-23. **E3** (`recurringQualityPatterns`) kvar. | ~2h | Medel | — |
| E | [`M-medium-hard-layer.md`](./M-medium-hard-layer.md) | ~~M1~~ avklarad i OMTAG fas 2·B. **M2** fyll dossier-pool (5-10 nya) — parkerad tills kontraktet stabiliserats. **M3** konsolidera 5 cross-file-import-fixers — parkerad på telemetri. **M4** syntaxFixPasses=1 — skippad (ej testbart med nuvarande eval). | varierande | Medel | Se `avklarat/omtag-2026-04-23/fas2-C-m4-findings.md` |
| F | [`L1-unified-repair-call.md`](./L1-unified-repair-call.md) | Slå ihop 4 LLM-fixer-anrop till ett `runUnifiedRepair()` | ~3 dagar | Medel | **Parkerad** per OMTAG `PARKED.md` — telemetri-data först |
| G | [`L2-prompt-kit.md`](./L2-prompt-kit.md) | `prompt-kit/` med canonical `composePrompt()` över alla 4 LLM-callsites | ~4 dagar | Medel | **Parkerad** — system-prompt splittad 2026-04-23 (OMTAG 03), settle först |
| H | [`L3-dossier-variants.md`](./L3-dossier-variants.md) | Behöver dossiers variants-koncept? Utvärdera efter M2 | ~1 vecka | Låg | **Parkerad** — M2 + observationstid |
| I | [`cloudagent-paket-A-doc-rewrite.md`](./cloudagent-paket-A-doc-rewrite.md) | 3 dossier v1→v2 doc-omskrivningar (D3, D5, D7) | ~3h | Låg | — (pipeline-paket-B klart i OMTAG fas 2·D) |
| J | [`P32-request-type-taxonomy.md`](./P32-request-type-taxonomy.md) | Fas A klar. **B** Q&A-shortcut, **C** micro-edit-pipeline, **D** multi-change wrap, **E** external-fetch-tool, **F** LLM-fallback | varierande | Medel | **Fas B-F parkerade** per OMTAG `PARKED.md` |
| K | [`P33-shadcn-ecosystem-expansion.md`](./P33-shadcn-ecosystem-expansion.md) | **A** fyll capability-luckor, **B** bredda capability-mapping, **C** fler community-registries, **D** embedding-retrieval, **E** llms.txt-synk | ~8h för A+B | Låg | **Parkerad** — produktbeslut |

**Summa öppet icke-parkerat arbete:** `P26` rest-PRs + `P34` aktivering + `E3` + dossier-brief polish + `cloudagent-paket-A` + `P32 Fas B` om avparkerat. ~1-2 veckor total.

**Parkerat per `avklarat/omtag-2026-04-23/PARKED.md`:** L1, L2, L3, M2, P32 B–F, M3, P33, WebContainers — avvakta tills gatekeeper-villkor uppfyllda.

## Kanonisk checklista

[`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) — kort smal lista (~4 öppna punkter) + telemetri-blockad + strategiska satsningar + bevarad historik över alla leverans-waves (2026-04-20, 2026-04-21, 2026-04-22, …).

## Avklarade waves

- **2026-04-23** — **OMTAG-waven** (11 uppdrag, 9 cloud-agenter över 3 faser). Fas 0: embedding-hygien + eval-baseline + env-flag-collapse + type-only-imports. Fas 1: wave-split (4 monoliter→paket) + scaffold-default-block. Fas 2: follow-up-predicate + scaffold-cleanup + autofix-härdning + dossier-AJV. Fas 3: unified-status-eventbus. Arkiv: [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/). Slutbedömning: `STATUS-2026-04-23-omtag-complete.md` i repo-rot.
- **2026-04-22** — LLM-flow-audit + 2 follow-up-pass. 20 verifierade buggar fixade över 3 commits (`a35eaa05e` + `8de85797b` + `3a2ec25d8`). Unicode-regex-grundinfrastruktur + CI-guard etablerad. Se [`../../../audit-reports/2026-04-22-llm-flow/SUMMARY.md`](../../../audit-reports/2026-04-22-llm-flow/SUMMARY.md) + `Kvarvarande-uppgifter.md` sektionen "Avklarat i LLM-flow-audit + follow-up (2026-04-22)".
- **2026-04-22** — Cleanup-wave pass 1+2 (7 commits över P2/P5/P1/S3/knip/P3/docs). PR #84.
- **2026-04-21** — `href↔route-safety-net` + P30 + P31 + `repair-loop-hardening` + `P20-shadcn-ecosystem-next`. Flyttade till [`../avklarat/`](../avklarat/).
- **2026-04-20** — Cloud-loop PR #69 (21 commits, Block 0+1+2). STATUS-sammanfattning i repo-roten.

## Arkiverade P-filer

Se [`../archived/`](../archived/) för historiska planer (`P17`, osv) och [`../avklarat/`](../avklarat/) för slutförda waves.

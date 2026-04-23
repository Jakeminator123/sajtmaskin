# Aktiva planer — konsoliderad översikt

Senast uppdaterad: 2026-04-23. Alla öppna steg listas i enhetligt A/B/C/D-format. Varje planfil behåller sin detaljerade text — tabellen nedan är routern.

## Öppna steg (sorterat efter prio + blocker)

| # | Plan | Kvarvarande steg | Effort | Prio | Blocker |
|---|------|------------------|--------|------|---------|
| A | [`P26-followup-orchestration-glitch.md`](./P26-followup-orchestration-glitch.md) | P26-uppföljare: `build_intent_promoted` triggar fortfarande på follow-ups trots PR1-merge | ~2h | Hög | — |
| B | [`P34-blocking-lint-in-validate-and-fix.md`](./P34-blocking-lint-in-validate-and-fix.md) | **C2** — aktivera `SAJTMASKIN_BLOCKING_ESLINT=true` i Vercel Preview via Dashboard. **D** — aktivera i prod efter latens-mätning. **E** — ta bort lint från bakgrundsgate. | ~3h + mätning | Medel | Latens-data |
| C | [`P19-old-content-ingress.md`](./P19-old-content-ingress.md) | **Steg 3** — UX-transparens för follow-up-basversion (SAJ-22) | 4-8h | Låg | UI-arbete |
| D | [`dossier-brief-sync.md`](./dossier-brief-sync.md) | P1/P2 polish — frivilligt | — | Låg | — |
| E | [`E-easy-medium-layer.md`](./E-easy-medium-layer.md) | **E1** follow-up-dubblett, **E2** isFollowUp-predicate, **E3** recurringQualityPatterns, **E4** imports-checklist, **E5** konsolidera react-fixers, **E6** strict assert i CI, **E7** variant-default | ~10h total | Medel | — |
| F | [`M-medium-hard-layer.md`](./M-medium-hard-layer.md) | ~~**M1** marketing-scaffold-merge~~ (avklarad 2026-04-23, OMTAG fas 2·B), **M2** fyll dossier-pool (5-10 nya), **M3** konsolidera 5 cross-file-import-fixers, **M4** syntaxFixPasses=1 | ~18-22h | Medel | M3 på telemetri |
| G | [`L1-unified-repair-call.md`](./L1-unified-repair-call.md) | Slå ihop 4 LLM-fixer-anrop till ett `runUnifiedRepair()` | ~3 dagar | Medel | Telemetri-data |
| H | [`L2-prompt-kit.md`](./L2-prompt-kit.md) | `prompt-kit/` med canonical `composePrompt()` — alla 4 LLM-anropssites går genom kompositor | ~4 dagar | Medel | — |
| I | [`L3-dossier-variants.md`](./L3-dossier-variants.md) | Beslut: behöver dossiers variants-koncept? Utvärdera efter M2 | ~1 vecka (om ja) | Låg | **M2** |
| J | [`cloudagent-paket-A-doc-rewrite.md`](./cloudagent-paket-A-doc-rewrite.md) | 3 dossier v1→v2 doc-omskrivningar (D3, D5, D7) — redo för cloudagent | ~3h | Låg | — |
| K | [`cloudagent-paket-B-schema-validation.md`](./cloudagent-paket-B-schema-validation.md) | AJV-validator över dossier-manifest (7 steg) — redo för cloudagent | ~5h | Medel | — |
| L | [`P32-request-type-taxonomy.md`](./P32-request-type-taxonomy.md) | Fas A klar. **B** Q&A-shortcut, **C** micro-edit-pipeline, **D** multi-change wrap, **E** external-fetch-tool, **F** LLM-fallback | Fas B: ~1 dag, C-F: se plan | Medel | Agreement |
| M | [`P33-shadcn-ecosystem-expansion.md`](./P33-shadcn-ecosystem-expansion.md) | **A** fyll capability-luckor, **B** bredda capability-mapping, **C** fler community-registries, **D** embedding-retrieval, **E** llms.txt-synk | ~8h för A+B | Låg | Agreement |

**Summa öppet arbete:** ~15-20 sidor verklig effort spritt på 13 spår. Ingen enskild plan kräver mer än en veckas insats. Flera kan göras parallellt (E ⇄ M ⇄ J/K är `parallel_safe`).

## Kanonisk checklista

[`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) — kort smal lista (~4 öppna punkter) + telemetri-blockad + strategiska satsningar + bevarad historik över alla leverans-waves (2026-04-20, 2026-04-21, 2026-04-22, …).

## Avklarade waves

- **2026-04-22** — LLM-flow-audit + 2 follow-up-pass. 20 verifierade buggar fixade över 3 commits (`a35eaa05e` + `8de85797b` + `3a2ec25d8`). Unicode-regex-grundinfrastruktur + CI-guard etablerad. Se [`../../../audit-reports/2026-04-22-llm-flow/SUMMARY.md`](../../../audit-reports/2026-04-22-llm-flow/SUMMARY.md) + `Kvarvarande-uppgifter.md` sektionen "Avklarat i LLM-flow-audit + follow-up (2026-04-22)".
- **2026-04-22** — Cleanup-wave pass 1+2 (7 commits över P2/P5/P1/S3/knip/P3/docs). PR #84.
- **2026-04-21** — `href↔route-safety-net` + P30 + P31 + `repair-loop-hardening` + `P20-shadcn-ecosystem-next`. Flyttade till [`../avklarat/`](../avklarat/).
- **2026-04-20** — Cloud-loop PR #69 (21 commits, Block 0+1+2). STATUS-sammanfattning i repo-roten.

## Arkiverade P-filer

Se [`../archived/`](../archived/) för historiska planer (`P17`, osv) och [`../avklarat/`](../avklarat/) för slutförda waves.

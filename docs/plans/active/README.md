# Aktiva planer — konsoliderad översikt

Senast uppdaterad: 2026-04-23 (efter OMTAG-waven). Alla öppna steg listas i enhetligt A/B/C/D-format. Varje planfil behåller sin detaljerade text — tabellen nedan är routern.

> **Stor händelse 2026-04-23:** 11 uppdrag i OMTAG-waven mergade. Se arkivet [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/) och rotfilen `STATUS-2026-04-23-omtag-complete.md`. Flera planer här nedan har delvis bockats av — se top-note i respektive plan-fil.

## Öppna steg (konsoliderat efter 2026-04-23-städ)

### Aktiva (icke-parkerade)

| # | Plan | Kvarvarande steg | Prio |
|---|------|------------------|------|
| A | [`P34-blocking-lint-in-validate-and-fix.md`](./P34-blocking-lint-in-validate-and-fix.md) | **C2** — aktivera `SAJTMASKIN_BLOCKING_ESLINT=true` i Vercel Preview via Dashboard. **D** — aktivera i prod efter latens. **E** — ta bort lint från bakgrundsgate. | Medel |
| B | [`cloudagent-paket-A-doc-rewrite.md`](./cloudagent-paket-A-doc-rewrite.md) | 3 dossier v1→v2 doc-omskrivningar (D3, D5, D7) — redo för cloudagent. | Låg |
| C | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #7 | **E3** — `recurringQualityPatterns` in i codegen-prompt. Enda kvarvarande från E-laget. ~2h. | Medel |
| D | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #8 | **P26 rest** — PR3–9 från ursprungliga P26-paketet (quality-gate probe, HMR-spam, raw-msg-log, bygg-nu-UX, backoffice build-template, three-fiber-dossier). | Låg–Medel per PR |
| E | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #9 | **Core-split v2:** `orchestrate.ts` (912) + `route-plan.ts` (742) splittas enligt samma mönster som OMTAG 03. | Medel |
| F | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #11 | **Event-bus UI-flip** — UI läser `selectVersionStatus(events)` istället för DB-flaggor. | Medel |

### Paused per OMTAG `PARKED.md`

| # | Plan | Gatekeeper |
|---|------|------------|
| G | [`L1-unified-repair-call.md`](./L1-unified-repair-call.md) | Telemetri-data + stabilt repo |
| H | [`L2-prompt-kit.md`](./L2-prompt-kit.md) | system-prompt-splittningen (OMTAG 03) settle:ad |
| I | [`L3-dossier-variants.md`](./L3-dossier-variants.md) | M2 + observationstid |
| J | [`P32-request-type-taxonomy.md`](./P32-request-type-taxonomy.md) Fas B–F | Stabil follow-up-semantik (✅) + bredare eval-surface |
| K | [`P33-shadcn-ecosystem-expansion.md`](./P33-shadcn-ecosystem-expansion.md) | Produktbeslut + core-split klart |

**Summa aktivt öppet arbete:** A–F (icke-parkerat) ≈ 1–2 veckor.

**Städat 2026-04-23 (efter OMTAG):** `E-easy-medium-layer.md`, `M-medium-hard-layer.md`, `P26-followup-orchestration-glitch.md`, `P19-old-content-ingress.md`, `dossier-brief-sync.md`, `cloudagent-paket-B-schema-validation.md` → arkiverade. Se [`../avklarat/omtag-2026-04-23/INDEX.md`](../avklarat/omtag-2026-04-23/INDEX.md).

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

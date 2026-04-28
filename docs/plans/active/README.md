# Aktiva planer — konsoliderad översikt

Senast uppdaterad: 2026-04-27 (arkivering av korplan + SEO-spec; ny scope-doc [`2026-04-27-llm-flode-varldsklass-scope.md`](./2026-04-27-llm-flode-varldsklass-scope.md) är nästa sessions anchor). Alla öppna steg listas i enhetligt A/B/C/D-format. Varje planfil behåller sin detaljerade text — tabellen nedan är routern.

## Lifecycle (snabb)

Full kontrakt: [`.cursor/rules/plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

| Tillstånd | Mapp |
|---|---|
| Aktivt eller redo-att-startas | `active/` |
| Väntar på gate | `active/parked/` |
| Mergat — historik | `avklarat/` |
| Skrotat | `archived/` |

Frontmatter-minimum: `id`, `status`, `created`, `linear` (issue-ID eller `null`). Index-filer (denna README, `Kvarvarande-uppgifter.md`) får sakna frontmatter. Plan utan commit-progress på 14 dagar ska parkas, avklaras eller få färsk progress-anteckning.

> **Stor händelse 2026-04-23:** 11 uppdrag i OMTAG-waven mergade. Se arkivet [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/) och slutrapporten [`../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md`](../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md). Flera planer här nedan har delvis bockats av — se top-note i respektive plan-fil.

## Scope-anchor (nästa session)

[`2026-04-27-llm-flode-varldsklass-scope.md`](./2026-04-27-llm-flode-varldsklass-scope.md) — 10-lagers målbild från extern review. Wave 4 (designval B2.x) + Wave 5 (säkerhet) + Wave 6 (observability) är nästa spår.

## Öppna steg (konsoliderat efter 2026-04-27-städ)

### Aktiva (icke-parkerade)

| # | Plan | Kvarvarande steg | Prio |
|---|------|------------------|------|
| A | [`P34-blocking-lint-in-validate-and-fix.md`](./P34-blocking-lint-in-validate-and-fix.md) | **C2** — aktivera `SAJTMASKIN_BLOCKING_ESLINT=true` i Vercel Preview via Dashboard. **D** — aktivera i prod efter latens. **E** — ta bort lint från bakgrundsgate. | Medel |
| B | [`cloudagent-paket-A-doc-rewrite.md`](./cloudagent-paket-A-doc-rewrite.md) | 3 dossier v1→v2 doc-omskrivningar (D3, D5, D7) — redo för cloudagent. | Låg |
| C | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #7 | **E3** — `recurringQualityPatterns` in i codegen-prompt. Enda kvarvarande från E-laget. ~2h. | Medel |
| D | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #8 | **P26 rest** — PR3–9 från ursprungliga P26-paketet (quality-gate probe, HMR-spam, raw-msg-log, bygg-nu-UX, backoffice build-template, three-fiber-dossier). | Låg–Medel per PR |
| E | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #9 | **Core-split v2:** `orchestrate.ts` (912) + `route-plan.ts` (742) splittas enligt samma mönster som OMTAG 03. | Medel |
| F | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #11 | **Event-bus UI-flip** — UI läser `selectVersionStatus(events)` istället för DB-flaggor. | Medel |
| L | [`KRAVER-DIALOG-2026-04-24.md`](./KRAVER-DIALOG-2026-04-24.md) | 7 punkter från långbänk-trion (databas/Redis observability) som kräver dialog: mega-cleanup ordering, TOCTOU-races, env-konvent, NDJSON-precision, refaktor-koordinering, fler strict schemas. | Låg–Medel |
| M | [`OPEN-THREADS-SCAFFOLDS-2026-04-24.md`](./OPEN-THREADS-SCAFFOLDS-2026-04-24.md) | 6 öppna trådar: scaffold-retry brief-context, matcher-kwNorm, scoring wire/keep/delete, scaffoldRetryUsed-upstream, sv-locale-routing, latency-mätning. SEO-spec (PR-A #103 + PR-B #105 ✅) arkiverad → [`../avklarat/SEO-F3-PROMOTION-NEXT-PR.md`](../avklarat/SEO-F3-PROMOTION-NEXT-PR.md). | Låg–Medel |
| N | [`2026-04-27-followup-vs-autorepair-lane-collision.md`](./2026-04-27-followup-vs-autorepair-lane-collision.md) | Utred och lås separation mellan användar-follow-up och auto-repair-lane så stale repair inte krockar med ny user-turn. | Medel |

### Paused per OMTAG `PARKED.md` — ligger i [`./parked/`](./parked/)

| # | Plan | Gatekeeper |
|---|------|------------|
| G | [`parked/L1-unified-repair-call.md`](./parked/L1-unified-repair-call.md) | Telemetri-data + stabilt repo |
| H | [`parked/L2-prompt-kit.md`](./parked/L2-prompt-kit.md) | system-prompt-splittningen (OMTAG 03) settle:ad |
| I | [`parked/L3-dossier-variants.md`](./parked/L3-dossier-variants.md) | M2 + observationstid |
| J | [`parked/P32-request-type-taxonomy.md`](./parked/P32-request-type-taxonomy.md) Fas B–F | Stabil follow-up-semantik (✅) + bredare eval-surface |
| K | [`parked/P33-shadcn-ecosystem-expansion.md`](./parked/P33-shadcn-ecosystem-expansion.md) | Produktbeslut + core-split klart |

**Summa aktivt öppet arbete:** A–F (icke-parkerat) ≈ 1–2 veckor.

**Städat 2026-04-27:** `2026-04-24-llm-flode-korplan/` (alla 7 waves via PR #101+103 ✅) + `SEO-F3-PROMOTION-NEXT-PR.md` (PR-A #103 + PR-B #105 ✅) → arkiverade i [`../avklarat/`](../avklarat/).

**Städat 2026-04-23 (efter OMTAG):** `E-easy-medium-layer.md`, `M-medium-hard-layer.md`, `P26-followup-orchestration-glitch.md`, `P19-old-content-ingress.md`, `dossier-brief-sync.md`, `cloudagent-paket-B-schema-validation.md` → arkiverade. Se [`../avklarat/omtag-2026-04-23/meta/INDEX.md`](../avklarat/omtag-2026-04-23/meta/INDEX.md).

## Kanonisk checklista

[`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) — kort smal lista (~4 öppna punkter) + telemetri-blockad + strategiska satsningar + bevarad historik över alla leverans-waves (2026-04-20, 2026-04-21, 2026-04-22, …).

## Avklarade waves

- **2026-04-27** — **LLM-flöde världsklass audit-session** (commits `d8525cbd6`…`dded81259`). 9 levererade SAJ-fixes (verifier suppress, manifest codeEntry, rollback till bestContent, needsPhysics regex, FEATURES.escalateMergeSyntaxToLlm, batch quality-gate/repair/readiness/product-postcheck, merge-preflight LLM-repair, abortSignal propagation, hibernate 404). Scope-doc: [`2026-04-27-llm-flode-varldsklass-scope.md`](./2026-04-27-llm-flode-varldsklass-scope.md).
- **2026-04-26** — **SEO + F3-promotion** (PR #102 docs + #103 PR-A + #105 PR-B → master `854bb9a31`). `seoPreferencesSchema`, `applyScaffoldSeoDefaults`, GET/PATCH `/api/projects/[id]/preferences`, `SeoOptInPanel`, deploy-time SEO-injection. Arkiverat: [`../avklarat/SEO-F3-PROMOTION-NEXT-PR.md`](../avklarat/SEO-F3-PROMOTION-NEXT-PR.md).
- **2026-04-24** — **LLM-flöde korplan** (7 waves + PR #101 + PR #103). Arkiverat: [`../avklarat/2026-04-24-llm-flode-korplan/`](../avklarat/2026-04-24-llm-flode-korplan/README.md).
- **2026-04-24** — **Långbänk-trio: databas + Redis observability** (4 commits över 3 långbänkar). Postgres FK-index (17 saknade applicerade), backoffice "Databashälsa" + "Redis-hälsa"-sidor med audit-loggad APPLY-knapp, 3 strict schemas (db-health/redis-health/audit), schema-drift-test, 19 vitest-tester + 15 backoffice-smoke. Arkiverat: [`../avklarat/master-post-cleanup-2026-04-23/`](../avklarat/master-post-cleanup-2026-04-23/).
- **2026-04-23** — **OMTAG-waven** (11 uppdrag, 9 cloud-agenter över 3 faser). Arkiv: [`../avklarat/omtag-2026-04-23/`](../avklarat/omtag-2026-04-23/). Slutbedömning: [`../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md`](../avklarat/omtag-2026-04-23/status/STATUS-2026-04-23-omtag-complete.md).
- **2026-04-22** — LLM-flow-audit + 2 follow-up-pass. 20 verifierade buggar fixade över 3 commits (`a35eaa05e` + `8de85797b` + `3a2ec25d8`). Unicode-regex-grundinfrastruktur + CI-guard etablerad. Se [`../../../audit-reports/2026-04-22-llm-flow/SUMMARY.md`](../../../audit-reports/2026-04-22-llm-flow/SUMMARY.md).
- **2026-04-22** — Cleanup-wave pass 1+2 (7 commits över P2/P5/P1/S3/knip/P3/docs). PR #84.
- **2026-04-21** — `href↔route-safety-net` + P30 + P31 + `repair-loop-hardening` + `P20-shadcn-ecosystem-next`. Flyttade till [`../avklarat/`](../avklarat/).
- **2026-04-20** — Cloud-loop PR #69 (21 commits, Block 0+1+2). STATUS-sammanfattning i repo-roten.

## Arkiverade P-filer

Se [`../archived/`](../archived/) för historiska planer (`P17`, osv) och [`../avklarat/`](../avklarat/) för slutförda waves.

# Aktiva planer (`docs/plans/active/`)

## Filer

| Fil | Status |
|-----|--------|
| [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) | Kanonisk checklista — uppdaterad efter wave 2026-04-20. |
| [`P19-old-content-ingress.md`](./P19-old-content-ingress.md) | Konservativ hardening — kräver bevis innan kodändringar. |
| [`P20-shadcn-ecosystem-next.md`](./P20-shadcn-ecosystem-next.md) | shadcn blocks + fonts strategi. Scaffold-toolkit redan levererat. |
| [`parallel-execution-2026-04.md`](./parallel-execution-2026-04.md) | Master-orchestrator för cleanup-vågen 2026-04-20. Behålls i `active/` tills uppföljarna P22b/P25b/P28 landat. |
| [`P22b-followup-caller-wiring.md`](./P22b-followup-caller-wiring.md) | Wave 4 follow-up till P22. Wirar `priorQualityTarget`/`followUpIntent`/`persistedVariantId` i `chat-message-stream-post.ts`. |
| [`P25b-version-panel-tooltips-and-overlay.md`](./P25b-version-panel-tooltips-and-overlay.md) | Wave 4 follow-up till P25. VersionHistory-tooltips + version_mismatch overlay-rendering. |
| [`P28-pre-existing-cleanup.md`](./P28-pre-existing-cleanup.md) | Wave 4 hygien-spår. 7 pre-existing test-failures + lint + schema-mismatch + engine-test isolation. |

## Avklarade i wave 2026-04-20

Flyttade till [`../avklarat/`](../avklarat/) av P27-validator efter sektion A+B+D:

| Plan | Levererade |
|---|---|
| `P21` | Per-tier `Repair`/`Timeouts`/`Briefing` i `manifest.json` |
| `P21b` | Test-sync för P21:s `fast.planner`-ändring |
| `P22` | Brief-guard, variant-lock, quality-target-arv, LLM safety net (helpers) |
| `P23` | Motion-reduce-trap-check, physics-keywords, route-dedup |
| `P24` | AST-baserad `next.config`-patcher, korrekt `startOutcome`, `runId` end-to-end |
| `P25` | CSP allow-list för Mixpanel, mjuk avatar-offline-state |
| `P26` | RunId-resolver i logger, reasoning-tokens-mätning, per-tier matris i `ModelTraceOverlay` |
| `P27` | Sektion A+B+D körda (sektion C lämnad till användaren, sektion E commits till användaren) |

## Arkiverade P-filer

| Fil | Anledning |
|-----|-----------|
| [`../archived/P17-unsplash-image-materialization.md`](../archived/P17-unsplash-image-materialization.md) | Felklassning implementerad (`e75325c9d`). |

## Lägesöversikt (2026-04-15)

Sessionen levererade: Unsplash-diagnostik, font-register (75 fonts), scaffold-aware komponentpool, `BUILD_INTENT_GUIDANCE`-extraktion, Fas 2 worldclass (kod + docs + schemas + backoffice-sync), P18-stängning (landing-varning), plankonsolidering och glossary-uppdatering.

**4 öppna punkter kvar:** 2 shadcn-spår (blocks + fonts, medelprio), 1 old-content ingress (medel-hög), 1 eval-baseline (låg). Fas 2 betraktas som stängd; Fas 3 är påbörjad.

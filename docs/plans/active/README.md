# Aktiva planer (`docs/plans/active/`)

## Filer

| Fil | Status |
|-----|--------|
| [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) | Kanonisk checklista — uppdaterad efter wave 2026-04-20 + konsolideringspass. |
| [`P19-old-content-ingress.md`](./P19-old-content-ingress.md) | Konservativ hardening — kräver bevis innan kodändringar. |
| [`P20-shadcn-ecosystem-next.md`](./P20-shadcn-ecosystem-next.md) | shadcn blocks + fonts strategi. Scaffold-toolkit redan levererat. |
| [`P26-followup-orchestration-glitch.md`](./P26-followup-orchestration-glitch.md) | 7 PR-branches lokalt; `build_intent_promoted` triggar fortfarande i live-loggen 2026-04-21 — verifiera merge-status. |
| [`P30-r3f-tuple-and-repair-feedback.md`](./P30-r3f-tuple-and-repair-feedback.md) | R3F vector-tuple autofix + LLM-fixer R3F-tips + gate-aware `no_improvement`-policy. Levererat 2026-04-21. |
| [`P31-feature-runtime-envs-and-f3-toggle.md`](./P31-feature-runtime-envs-and-f3-toggle.md) | Dossier-driven F3 envs (build/feature-runtime/warn-only) + `allowPlaceholdersInF3`-toggle + TS2749 autofix + needsPayments capability + OpenClaw builder-tips. Levererat 2026-04-21. |

## Avklarade i wave 2026-04-20

Flyttade till [`../avklarat/`](../avklarat/) av P27-validator efter sektion A+B+D + konsolideringspass:

| Plan | Levererade |
|---|---|
| `P21` | Per-tier `Repair`/`Timeouts`/`Briefing` i `manifest.json` |
| `P21b` | Test-sync för P21:s `fast.planner`-ändring |
| `P22` | Brief-guard, variant-lock, quality-target-arv, LLM safety net (helpers) |
| `P22b` (konsoliderad) | Caller-wiring: `chatId` + `followUpIntent` + `priorQualityTarget` ärvt från `orchestration_snapshot.buildSpec` i `chat-message-stream-post.ts`. Aktiverar P22:s helpers runtime. (Plan-fil borttagen, leverans i parallel-execution closure note.) |
| `P23` | Motion-reduce-trap-check, physics-keywords, route-dedup |
| `P24` | AST-baserad `next.config`-patcher, korrekt `startOutcome`, `runId` end-to-end |
| `P25` | CSP allow-list för Mixpanel, mjuk avatar-offline-state |
| `P26` | RunId-resolver i logger, reasoning-tokens-mätning, per-tier matris i `ModelTraceOverlay` |
| `P27` | Sektion A+B+D körda (sektion C lämnad till användaren, sektion E commits till användaren) |
| `parallel-execution-2026-04` | Wave-master arkiverad med closure-note. |

**Medvetet inte gjort i konsolideringen** (kvar som känd skuld i `Kvarvarande-uppgifter.md`):

- **P25b** (UX polish): VersionHistory tooltips + `VersionMismatchOverlayPayload` overlay-rendering. Kräver visuell verifiering — inte kandidat för fast turnaround.
- **P28** (pre-existing hygien): 7 test-failures + schema-parity + engine-test isolation. Lint-felet (P28 #6) togs in i konsolideringen; resten är pre-existing på master och kräver var-för-sig-investigation. Två stream-route-tester failar pga test-mock-drift (icke-mockad `createOwnEnginePipelineAndGenerationStream` + `tryGenerateServerAutoBrief`) — orelaterat till P22b:s wiring.

## Arkiverade P-filer

| Fil | Anledning |
|-----|-----------|
| [`../archived/P17-unsplash-image-materialization.md`](../archived/P17-unsplash-image-materialization.md) | Felklassning implementerad (`e75325c9d`). |

## Lägesöversikt (2026-04-15)

Sessionen levererade: Unsplash-diagnostik, font-register (75 fonts), scaffold-aware komponentpool, `BUILD_INTENT_GUIDANCE`-extraktion, Fas 2 worldclass (kod + docs + schemas + backoffice-sync), P18-stängning (landing-varning), plankonsolidering och glossary-uppdatering.

**4 öppna punkter kvar:** 2 shadcn-spår (blocks + fonts, medelprio), 1 old-content ingress (medel-hög), 1 eval-baseline (låg). Fas 2 betraktas som stängd; Fas 3 är påbörjad.

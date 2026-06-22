# Arkiverade planer (`avklarat/`)

Bulk-innehåll som tidigare låg här finns i **git-historik** (filer kan saknas i din klon).

## Grandmaster-stabiliseringsplanen (arkiverad 2026-06-22)

[`grandmaster/`](grandmaster/) — 8 områden (nivå 1–3), scope 100 % klart. [`bug-swarm/`](bug-swarm/) — bugg-letar-agentens findings (agenten avvecklad). Öppna spår som återstod flyttades till [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) (enda backlog-sanningen) innan arkiveringen, så inget tappades. Handoffs: [`../../handoffs/`](../../handoffs/).

## Wave 2026-04-20 (cleanup)

Åtta plan-filer levererades i cleanup-waven och är nu konsoliderade här. Detaljplanerna rensades 2026-04-29; använd git-historik vid behov.

| Plan | Levererade |
|---|---|
| `P21` | Per-tier `perTierRepairPolicies`/`perTierTimeouts`/`perTierBriefing` i `config/ai_models/manifest.json`. Gamla globala fält behållna som fallback. |
| `P21b` | Synkade `phase-routing.test.ts` mot P21:s nya `fast.planner` (`thinking:false / low`). |
| `P22` | Hård `forceDeepBrief`-guard på follow-up, `lockedVariantForFollowUp`, `inheritQualityTargetFromPriorVersion`, `classifyFollowUpIntentWithLlmFallback`. Caller-wiring konsoliderat i samma wave. |
| `P23` | `checkMotionReduceTrap` i verifier, `needsPhysics`-flagga, motion-safe-instruction, `deduplicateLocaleAlternateRoutes`. |
| `P24` | AST-baserad `patchNextConfigViaAst` (acorn), korrekt `startOutcome`-label, `runId` end-to-end, `VersionMismatchOverlayPayload`-typ. |
| `P25` | Mixpanel-allowlist i CSP, mjuk avatar-offline-state istället för error-toast. Tooltip + overlay-rendering uppskjuten — spåras som UX polish-debt i `active/Kvarvarande-uppgifter.md`. |
| `P26` | `resolveRunDirFromContext`, `extractReasoningTokens`, per-tier 5×5 matris i `ModelTraceOverlay`. |
| `P27` | Sektion A+B+D körda. Owner-file-konfliktscan grön. Sektion C (manuell browser-spotcheck) och sektion E (commits) lämnade till användaren. |

## Wave 2026-04-20 (sen-pass)

| Plan | Levererade |
|---|---|
| `P29` | Audit `03-konsolidering-pipeline.md` §3.4 helt stängd. Fas 1A (18 testlösa v0-chat-routes borta), Fas 1B (10 routes med UNIQUE tester migrerade till engine-side + alla v0-chat-filer borttagna), Fas 2-beslut (7 Class C-routes på `/api/v0/` är canonical permanent). 1172/1172 tester gröna. |

## Äldre

Äldre planfiler kan saknas i trädet men finns kvar i **git-historik**. Operativ sanning ligger nu i:

- [`../../architecture/fas3-preview-and-deploy.md`](../../architecture/fas3-preview-and-deploy.md)
- [`../../architecture/fas2-orchestration-and-build.md`](../../architecture/fas2-orchestration-and-build.md)

När en äldre plan inte längre finns som fil: behandla README:n här som pekare och använd git-historik vid behov i stället för att återintroducera duplicerade roadmap-dokument.

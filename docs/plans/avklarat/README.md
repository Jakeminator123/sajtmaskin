# Arkiverade planer (`avklarat/`)

Bulk-innehåll som tidigare låg här finns i **git-historik** (filer kan saknas i din klon).

## Wave 2026-04-20 (cleanup)

Åtta plan-filer levererade och konsoliderade enligt [`./parallel-execution-2026-04.md`](./parallel-execution-2026-04.md) (wave-master, arkiverad efter konsolidering):

| Plan | Levererade |
|---|---|
| [`P21-phase-routing-and-timeouts.md`](./P21-phase-routing-and-timeouts.md) | Per-tier `perTierRepairPolicies`/`perTierTimeouts`/`perTierBriefing` i `config/ai_models/manifest.json`. Gamla globala fält behållna som fallback. |
| [`P21b-phase-routing-test-sync.md`](./P21b-phase-routing-test-sync.md) | Synkade `phase-routing.test.ts` mot P21:s nya `fast.planner` (`thinking:false / low`). |
| [`P22-followup-flow-optimization.md`](./P22-followup-flow-optimization.md) | Hård `forceDeepBrief`-guard på follow-up, `lockedVariantForFollowUp`, `inheritQualityTargetFromPriorVersion`, `classifyFollowUpIntentWithLlmFallback`. Caller-wiring konsoliderat i samma wave: `chat-message-stream-post.ts` läser nu `priorQualityTarget` från `orchestration_snapshot.buildSpec` och skickar in `chatId` + `followUpIntent` så helpers aktiveras runtime. |
| [`P23-verifier-and-capability-hardening.md`](./P23-verifier-and-capability-hardening.md) | `checkMotionReduceTrap` i verifier, `needsPhysics`-flagga, motion-safe-instruction, `deduplicateLocaleAlternateRoutes`. |
| [`P24-preview-host-robustness.md`](./P24-preview-host-robustness.md) | AST-baserad `patchNextConfigViaAst` (acorn) för 5 next.config-shapes, korrekt `startOutcome`-label, `runId` end-to-end via `runIdResolverFromSession`, `VersionMismatchOverlayPayload`-typ. |
| [`P25-builder-ui-and-csp-hygiene.md`](./P25-builder-ui-and-csp-hygiene.md) | Mixpanel-allowlist i CSP, mjuk avatar-offline-state istället för error-toast. Tooltip + overlay-rendering uppskjuten — spåras som UX polish-debt i `active/Kvarvarande-uppgifter.md`. |
| [`P26-observability-and-logging.md`](./P26-observability-and-logging.md) | `resolveRunDirFromContext` i `generation-log-writer.ts`, `extractReasoningTokens` i `generation-stream.ts`, per-tier 5×5 matris i `ModelTraceOverlay`. |
| [`P27-validator.md`](./P27-validator.md) | Sektion A+B+D körda. Owner-file-konfliktscan grön. Sektion C (manuell browser-spotcheck) och sektion E (commits) lämnade till användaren. |

## Wave 2026-04-20 (sen-pass)

| Plan | Levererade |
|---|---|
| [`P29-v0-engine-consolidation.md`](./P29-v0-engine-consolidation.md) | Audit `03-konsolidering-pipeline.md` §3.4 helt stängd. Fas 1A (18 testlösa v0-chat-routes borta), Fas 1B (10 routes med UNIQUE tester migrerade till engine-side via 2 parallella write-subagents + alla 20 v0-filer + `v0-chats-compat.ts` borttagna), Fas 2-beslut (7 Class C-routes på `/api/v0/` är canonical permanent — ingen rename, dokumenterat i `engine-chats-path.ts` JSDoc + glossary). 1172/1172 tester gröna. |

## Äldre

Äldre planfiler kan saknas i trädet men finns kvar i **git-historik**. Operativ sanning ligger nu i:

- [`../../architecture/fas3-preview-and-deploy.md`](../../architecture/fas3-preview-and-deploy.md)
- [`../../architecture/builder-generation.md`](../../architecture/builder-generation.md)

När en äldre plan inte längre finns som fil: behandla README:n här som pekare och använd git-historik vid behov i stället för att återintroducera duplicerade roadmap-dokument.

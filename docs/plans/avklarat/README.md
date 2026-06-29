# Arkiverade planer (`avklarat/`)

Bulk-innehåll som tidigare låg här finns i **git-historik** (filer kan saknas i din klon).

## Grandmaster-stabiliseringsplan (2026-06-18 → 2026-06-22)

Sajtmaskins stabiliserings-/kontrakts-/städplan. **Scope 100 % levererat** — flyttad hit från `active/` 2026-06-22 (nivå 1–3 bevarade i [`grandmaster/`](grandmaster/); loggbok + closing-handoff i git-historik). Tag: `MILSTOLPE-2026-06-21-grandmaster-stabil`.

| Område (nivå 2) | Levererat (PR) |
|---|---|
| 1 Kontrakt & repo-regler | C1 #152, C2 #153 |
| 2 Stabilitetstester | S1 #147, S2 #151, S3 #163, S4 #150 |
| 3 Dokumentation & kartor | D1, D2 #148 |
| 4 Prompter (init+follow-up) | täckt (inget separat PR) |
| 5 Follow-up & preview-kontrakt | #165/166/168/169/172/174/176 + 5-Z |
| 6 Status & UI/UX (event-bus) | #159/160/161/162/163 |
| 7 False-green-härdning | #149/155/156/177/179/180 + B09 #185 |
| 8 Cleanup & hygien | arkiv + next-bump + ignore-prune −74 + eval-namnskugga |

**Bug-swarm-drive (B01–B15):** [`bug-swarm/README.md`](bug-swarm/README.md) — 10 fixade (#181/183/184/185/186/187), 3 ägarbeslut (B05/B07/B08), B12/B13/B01-klient = edge. **Kvarvarande live-backlog** (ägarbeslut + arkitektur B3/B1/B4/F4-F5) router:as från [`../active/README.md`](../active/README.md); detalj i [`grandmaster/_backlog-deferrad.md`](grandmaster/_backlog-deferrad.md).

## Wave 2026-04-20 (cleanup)

Åtta plan-filer levererades i cleanup-waven och är nu konsoliderade här. Detaljplanerna rensades 2026-04-29; använd git-historik vid behov.

| Plan | Levererade |
|---|---|
| `P21` | Per-tier `perTierRepairPolicies`/`perTierTimeouts`/`perTierBriefing` i `config/ai_models/manifest.json`. Gamla globala fält behållna som fallback. |
| `P21b` | Synkade `phase-routing.test.ts` mot P21:s nya `fast.planner` (`thinking:false / low`). |
| `P22` | Hård `forceDeepBrief`-guard på follow-up, `lockedVariantForFollowUp`, `inheritQualityTargetFromPriorVersion`, `classifyFollowUpIntentWithLlmFallback`. Caller-wiring konsoliderat i samma wave. |
| `P23` | `checkMotionReduceTrap` i verifier, `needsPhysics`-flagga, motion-safe-instruction, `deduplicateLocaleAlternateRoutes`. |
| `P24` | AST-baserad `patchNextConfigViaAst` (acorn), korrekt `startOutcome`-label, `runId` end-to-end, `VersionMismatchOverlayPayload`-typ. |
| `P25` | Mixpanel-allowlist i CSP, mjuk avatar-offline-state istället för error-toast. Tooltip + overlay-rendering uppskjuten — spåras som UX polish-debt i [`../archived/Kvarvarande-uppgifter.md`](../archived/Kvarvarande-uppgifter.md). |
| `P26` | `resolveRunDirFromContext`, `extractReasoningTokens`, per-tier 5×5 matris i `ModelTraceOverlay`. |
| `P27` | Sektion A+B+D körda. Owner-file-konfliktscan grön. Sektion C (manuell browser-spotcheck) och sektion E (commits) lämnade till användaren. |

## Wave 2026-04-20 (sen-pass)

| Plan | Levererade |
|---|---|
| `P29` | Audit `03-konsolidering-pipeline.md` §3.4 helt stängd. Fas 1A (18 testlösa v0-chat-routes borta), Fas 1B (10 routes med UNIQUE tester migrerade till engine-side + alla v0-chat-filer borttagna), Fas 2-beslut (7 Class C-routes på `/api/v0/` är canonical permanent). 1172/1172 tester gröna. |

## Äldre

Äldre planfiler kan saknas i trädet men finns kvar i **git-historik**. Operativ sanning ligger nu i:

- [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md) § FAS 3 (preview & deploy)
- [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md) § FAS 2 (orchestration & build)

När en äldre plan inte längre finns som fil: behandla README:n här som pekare och använd git-historik vid behov i stället för att återintroducera duplicerade roadmap-dokument.

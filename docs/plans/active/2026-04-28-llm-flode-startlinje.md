---
id: 2026-04-28-llm-flode-startlinje
status: scope
created: 2026-04-28
linear: null
parent: 2026-04-27-llm-flode-varldsklass-scope
supersedes: null
---

# LLM-flöde startlinje 2026-04-28

Konsoliderad lägesbild + prioriterad åtgärdslista efter att hardening-PRn 2026-04-28 mergat. Efter doc-triage 2026-05-01 är den här filen **primär LLM-masterplan**: den äger exekveringsordning och beslut, medan child-planer bara får bära smal implementation.

## Bakgrund

Under 2026-04-28 körde vi en hardening-pass på own-engine-flödet efter en misslyckad Nordtak-generering (`5cd55be8`). Två commits levererades på `master`:

| Commit | Innehåll |
|---|---|
| `3475484e9` | scaffold-prompt aldrig avhuggen TSX, hard cap inspirational `10k`, home-route-recovery även för trivial sida, `autofix.heavy_load` skippar verifier, `code_structure_failure` triggar inte scaffold-pivot, `engine.first_token_slow`-watchdog, `useLocalStorageSync` lint-fix |
| `8181f87e4` | `Component References` komprimerade till import/API-hints (full extern TSX togs bort) |

Mätningar efter (samma Nordtak-prompt, ny generation `b5b11a4b`):

| Mätning | Före | Efter |
|---|---:|---:|
| Systemprompt | ~93k chars | ~80k chars |
| Dynamic context | ~45k chars | ~32k chars |
| Reasoning | 250s | 223s |
| Preflight errors | 1 | 0 |
| Preview | blocked | VM live |
| Readiness | fail | PASS |

Postmortem från en annan körning samma dag finns under repo-roten ([`postmortem-2026-04-28-builder-generation.md`](../../../postmortem-2026-04-28-builder-generation.md), otrackad). Den dokumenterar **verifier-fixer-success-semantik** (se P0 nedan).

## Källor (underlag för nästa agent)

| Källa | Relevans |
|---|---|
| Postmortem run `20260428-041927-freeform` | Verifier-fixer success-semantik + UI-status från historiska rader |
| GitHub PR #117 (32 agentrapporter) | Prompt-/scaffold-/orchestration-fynd, läs `reports/builder-generation-hardening-multi-agent-970d/README.md` |
| GitHub PR #118 (20 r2-agenter, stackad på #117) | Triage av PR #117, score-rubrik (Severity × Confidence × Corroboration) |
| `data/prompt-dumps/own-engine-codegen/full-system.md` | Exakt systemprompt skickad till codegen-LLM |
| `data/prompt-dumps/orchestration-dynamic/generation-input-package.json` | Fan-in: brief, scaffold, variant, route plan, contracts |
| `logs/generationslogg/<run>/` | Per-run timeline + observability + fault-fix-index |
| `logs/site-observability/<chatId>/` | Per-chat history över flera versioner |
| `docs/plans/active/2026-04-27-llm-flode-varldsklass-scope.md` | Föregående scope-anchor (10-lager målbild) |
| `docs/plans/active/2026-04-27-followup-vs-autorepair-lane-collision.md` | Existerande aktiv plan över användar-follow-up vs auto-repair-lane — relaterar till **P1d** nedan |
| `BUG-SWARM-BACKLOG.md` | Kanonisk bugg-/riskinventering. Använd som triagekälla, inte som daglig körplan. |
| `docs/plans/active/prompt-slim-systemprompt.md` | Child-plan för promptbudget. Startlinjen länkar dit; duplicera inte prompt-slim-detaljer här. |
| `docs/ENV.md` + `docs/architecture/fas3-preview-and-deploy.md` | Env/F2/F3 runtime truth. Planen nedan pekar på doc-sync, men env-detaljer hör inte hemma i denna fil. |

## Konsolideringsbeslut 2026-05-01

Fem read-only granskningar jämförde deep-researchen, `BUG-SWARM-BACKLOG.md` och aktiva planfiler. Beslutet är att **inte** skapa fem nya planfiler. Den här startlinjen bär LLM-exekveringen, `prompt-slim-systemprompt.md` bär promptkapning, och `Kvarvarande-uppgifter.md` bär tvärgående rester.

| Område | Beslut | Backlog-koppling |
|---|---|---|
| Follow-up / 3D / app-semantik | Lägg in som **P1f/P1g** här: major-change detector + safe unlock för website→app. Ingen ny topp-plan. | G#10, G#13, G#20-G#22, G#25-G#26, G#57 |
| Prompt / context / dossiers | Behåll child-planen `prompt-slim-systemprompt.md`. Startlinjen anger bara beroenden och DoD. | U#47, G#13, G#25-G#26, G#57 |
| Env / runtime truth | Doc-sync i `docs/ENV.md` + `fas3-preview-and-deploy.md`, inte ny planfil. | G#16-G#22, U#6, U#77 |
| UX / status / preview-verifiering | Event-bus UI-flip och degraded states ska ligga i **P1e/P4f** + `Kvarvarande-uppgifter.md` #11. Copy-städ är lägre prio. | G#32, G#35, G#58/U#80, G#60, U#2 |
| Docs/backlog | `BUG-SWARM-BACKLOG.md` är inventering. Planer äger exekveringsordning. | Alla öppna P0-P3 |

### Planhygien

- Skapa inte nya LLM-planfiler innan detta dokument eller `prompt-slim-systemprompt.md` inte räcker.
- Om en överlappande scope-fil är färdigsyntetiserad hit, flytta den till `docs/plans/avklarat/` eller `docs/plans/archived/` i separat städcommit.
- Terminologi-/naming debt (`v0`, `sandbox`, copy) ska inte lyftas till P1 utan runtime-symtom.

## Superlista — prio + agentinstruktion

### P0 — Status-/repair-semantik som ger felaktiga signaler

| Spår | Vad | Källa | Var i kod |
|---|---|---|---|
| ~~P0a~~ ✅ **FIXAD 2026-04-28 långbänk** | `verifier-pass.fixer` får inte logga `success=true` när `findingsAfterRerun > findingsBefore` — anchor `success` + `fixerImproved` på `rerunBlockingCount < findings.blocking.length`; RAG-`result` ger `still-failing` när rerun crashed (var `fixed`) | Postmortem run `20260428-041927-freeform` | `src/lib/gen/stream/finalize-version/verifier-phase.ts` + ny regression-test i `finalize-version.test.ts` |
| ~~P0b~~ ✅ **FIXAD 2026-04-28 repair/status-closeout** | Versionsdiagnostik skiljer nu aktivt pass från historiska passlösa lifecycle-rader; UI-labeln säger `Loggfel` så den inte blandas ihop med `verification_state = failed` | Postmortem | `src/app/api/engine/chats/[chatId]/versions/[versionId]/error-log/summary.ts` + `VersionDiagnosticsDialog.tsx` |
| ~~P0c~~ ✅ **FIXAD 2026-04-28 repair/status-closeout** | `pruneStaleLogsIfCleanRepair` prunar äldre `engine_version_error_logs` på repair-pass utan preflight-/syntaxblockers även när verifier-only-fynd finns i senaste passet | PR #118 r2-03, postmortem | `src/lib/gen/stream/finalize-version/persist-side-effects.ts` + `runner.ts` |
| P0d | `provider_aborted_no_content`-stream → ingen retry/fallback. Användaren ser `site.aborted` utan möjlighet att starta om automatiskt | Tidigare triage + tidigare runs | `src/lib/gen/stream/stream-format.ts` (`abort` branch) + `useSendMessage` |

**Sidostädning samma långbänk:** 5 hardcoded-permanent ON/OFF-flaggor inlinade — `consistentRepairPassIndex`, `verifierRerunAfterFix`, `skipDoubleValidateAndFixOnMerge`, `escalateMergeSyntaxToLlm` (alla ON sedan omtag-04 / 2026-04-23), `previewPreWarm` (alltid `false`). `preview-prewarm.ts` + dess test raderade. `precache`-fält + `__preview-prewarm__`-gren rensade ur `preview-session.ts`. Dead exports (`isEffectiveInit`, `SHELL_PAGE_FINGERPRINT`) tagna ur `build-spec/`-barrel. Gör repair/fixer-kedjan enklare utan att ändra runtime-beteende.

### P1 — Init/follow-up-konsistens

| Spår | Vad | Källa | Var i kod |
|---|---|---|---|
| P1a | `generationMode` split-brain mellan `resolveOrchestrationBase` och `finalizeOrchestrationPrompts` (variant kan väljas i en mode och prompt-context byggas i annan) | PR #117 / PR #118 r2-01 | `src/lib/gen/orchestrate.ts` + `system-prompt/build-dynamic-context.ts` |
| P1b | Snapshot `briefSummary: null` clobbar follow-up-kontinuitet (Snapshot-Brief tappar deep-brief-värden) | PR #117 if-02 / PR #118 r2-02 | `src/lib/api/engine/chats/follow-up-orchestration-input.ts` (`buildFollowUpBriefFromSnapshot`) |
| P1c | Follow-up merge kan regressa `app/page.tsx` utan samma `code_structure_failure`-skydd som init | PR #117 if-05 / PR #118 r2-06 | `src/lib/gen/stream/finalize-merge.ts` (`LLM_ONLY_PATHS` + structural guard) |
| P1d | `2026-04-27-followup-vs-autorepair-lane-collision.md` — auto-repair-prompt sväljer user-follow-up. Befintlig aktiv plan, inte påbörjad | egen plan | `src/lib/gen/verify/server-verify.ts` (`triggerBuildErrorRepair`) + `useSendMessage` |
| P1e | Status från DB-flag istället för event-bus-projektion → UI hänger efter | PR #118 r2-04, r2-14, plans/active/README **F** | `src/lib/db/schema.ts` `engine_versions.preview_blocked` + `selectVersionStatus(events)` |
| ~~P1f~~ ✅ **FIXAD 2026-05-01** | Major-change detector för follow-ups som byter projektets natur: game/canvas/physics/score/collision/app-logik släpper nu scaffold-låset utan att små 3D-overlays gör det. | Deep-research 2026-05-01 + BUG-SWARM G#10/G#13/G#57 | `shouldIgnorePersistedScaffoldForMatch` + regressionstester |
| P1g | Safe unlock-kontrakt nästa lager: vid major-change ska systemet också kunna välja rätt context/readiness-policy utan att tappa F2/F3-semantik. | BUG-SWARM G#20-G#22/G#25-G#26 | `orchestrate.ts`, `buildFollowUpBriefFromSnapshot`, dossier/capability bridge, readiness/finalize |

### P2 — Latency / parallellisering / robusthet

| Spår | Vad | Förslag |
|---|---|---|
| P2a | Reasoning ≈ 220s + output ≈ 130s = ca 350s före autofix; brief ytterligare ≈ 30s seriellt | Mät om brief-modellens output kan strömmas in i orchestration parallellt med scaffold-pick (idag väntar orchestrate på brief). Värdera prompt cache-vänlig static/dynamic-uppdelning. |
| P2b | Mekaniska autofix-pass är seriella per fil i en pipeline | Hela `runAutoFixSinglePass` itererar filer i loop. Per-fil-fixers är pure functions → kan parallelliseras med `Promise.all` om vi behåller deterministisk ordning för loggning. Mät innan. |
| P2c | Verifier + preview-host-VM-start är seriella | Verifier är hybrid: deterministiska guardrails + read-only LLM-granskning. Preview-host-VM-bootstrap kan starta så fort `version.created` finns. Mät om vi kan kicka VM-bootstrap i parallell-trail med verifier-pass. |
| P2d | First-token watchdog finns men inducerar ingen action | Tröskel `120s` triggar `engine.first_token_slow` event + UI-progress, men ingen retry. Förslag: efter `240s` utan content-token, abort + retry på snabbare tier (gpt-5.4-mini) eller utan `thinking`. |
| P2e | Token rate / output cap | `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=102768`. Vi använde `35070` på Nordtak-init. Capen är inte boven. Höj **inte** capen utan att samtidigt mäta latency-effekt. |
| P2f | OpenAI prompt cache | Static core (`47608` chars) byter aldrig per request. Säkerställ att vi sätter `prompt_cache_key` (eller motsvarande) så cache faktiskt utnyttjas. |

### P3 — Prompt-kvalitet / mekaniska fixers

| Spår | Vad | Källa | Var i kod |
|---|---|---|---|
| P3a | Output har fortfarande `35` mekaniska autofixes på en 226-tecken-prompt — tröskel `5`, vi ligger 7× över | Senaste run `20260428-071959-freeform` | Mestadels `import-validator` + `value-used-from-type-import-fixer` + `jsx-checker`. Förstärk system-prompten? Pre-filtrera bort stable patterns? |
| P3b | `<HTMLInputElement />`-mönster fångas av `dom-builtin-jsx-fixer` men förekommer fortfarande | Senaste autofix.warnings | Lägg in en hard "do NOT" i F2-prompten + scaffold-prompten med exempelpar. |
| P3c | Scaffold placeholder `[Företagsnamn]` läcker fortfarande igenom trots regel | Postmortem + autofix-warning `[security:warn] dangerouslySetInnerHTML` | `src/lib/gen/scaffolds/<id>/files/app/layout.tsx`. Replace bracket placeholders deterministiskt med brief-namn före LLM ser scaffold-context. |
| P3d | `## Lessons from similar past builds` fyller på efter varje failure → snöbollar i prompten | Prompt-dump | Cap till topp-3 mest specifika, dropp generiska `navigation-placeholder-actions`-rader. |
| P3e | Static core + normal follow-up är fortfarande för tung. | `prompt-slim-systemprompt.md` | Child-planen äger kapningen. Den här masterplanen kräver att normal follow-up går mot <45k utan nytt promptlager och med eval-bevis. |

### P4 — Observability / docs / glossary

| Spår | Vad | Var |
|---|---|---|
| P4a | Lägg till nya event-typer i glossary: `engine.first_token_slow`, `verifier.skipped` (reason `autofix_heavy_load`), `engine.reasoning-slow` (UI progress phase) | `docs/architecture/glossary.md` § Termer |
| P4b | Backoffice-trend för `autofix.heavy_load` per scaffold + per modell | `backoffice/pages/llm_flode_telemetry.py` |
| P4c | Component-Reference compact format dokumenterat (`compact API/pattern hints`, max 3 referenser, max 8 imports) | `docs/llm/llm-chain-flowchart.md` eller `docs/architecture/fas2-orchestration-and-build.md` |
| ~~P4d~~ ✅ **FIXAD 2026-05-01** | `data/prompt-dumps/own-engine-codegen/meta.json` innehåller nu `staticCoreChars`, `dynamicChars`, `totalChars` och `separatorFound` så vi snabbt kan korsreferensa run-by-run | `src/lib/gen/prompt-dump.ts` |
| P4e | Env/F2/F3-sanning behöver doc-sync: `env.example` är dokumentation, preview-host/VM `.env.local` är effektiv runtime, och F3-readiness måste spegla verkliga integrationkrav. | `docs/ENV.md`, `docs/architecture/fas3-preview-and-deploy.md`, BUG-SWARM G#16-G#22 |
| P4f | UX-status ska skilja preview-materialisering från verifierad version samt visa degraded/silent states när backend-signaler finns. | `Kvarvarande-uppgifter.md` #11, BUG-SWARM G#32/G#35/G#58/U#80/G#60 |

## Förslag: arbetsfördelning för en till agent

```text
Agent A — P0 (status-semantik)
  P0a verifier-fixer success
  P0b error-log historisk vs aktuell
  P0c repairPassIndex + stale rows
  Stort fokus på tester. PR per delspår.

Agent B — P1 (init/follow-up)
  P1a generationMode split-brain (kärnfix)
  P1b briefSummary null
  P1c follow-up app/page.tsx guard
  P1d använder existerande plan 2026-04-27-followup-vs-autorepair-lane-collision
  P1g safe unlock context/readiness för game/3D/app-logik

Agent C — P2 (latency/parallellisering)
  P2a brief + scaffold-pick parallellisering
  P2b autofix-pass parallellisering (med determinism)
  P2c verifier + preview-VM parallellisering
  P2d first-token watchdog action

Agent D — P3+P4 (prompt + observability)
  P3a–c prompt-kvalitet
  P3d lessons-cap
  P3e koordinerar med prompt-slim child-plan
  P4a–f docs/glossary/backoffice/env/status
```

## Definition of done

| Krav | Bevis |
|---|---|
| P0a | Test som verifierar att `findings.after > before` aldrig sätter `success: true` |
| P0b | ✅ Error-log summary skiljer current från historical; dialogen visar `Loggfel` för loggrad i stället för verifieringsstatus |
| P0c | ✅ Stale `engine_version_error_logs` raderas när repair på samma `versionId` saknar preflight-/syntaxblockers |
| P1a–b | Snapshot test över follow-up med `briefSummary` både null och full → samma final variant + brief |
| P1d | Auto-repair-prompt får inte sväljas av user-follow-up — telemetry `user_followup_replayed_after_repair > 0` när relevant |
| P1f | ✅ Follow-up som explicit ber om spel/canvas/physics/score/collision kan låsa upp scaffold-rematch utan att små 3D-overlays gör det |
| P1g | Major-change follow-up behåller korrekt context/readiness-policy och F2/F3-semantik |
| P2 | Latency-eval (`evals/results/`) visar mätbar förbättring av init-latens utan kvalitetsregression |
| P3a | Mekaniska autofixes ≤ `15` på Nordtak-prompt-eqv |
| P3e | `prompt-slim-systemprompt.md` visar normal follow-up <45k och static core <35k utan smoke-regression |
| P4e | `docs/ENV.md` och `fas3-preview-and-deploy.md` beskriver samma env-precedence som runtimekod |
| P4f | UI läser event-bus/statusprojektion för preview/verifierad/degraded-status eller har explicit kvarvarande blocker |

## Inte att åtgärda i denna runda

- `provider_aborted` på providersidan (kan kräva multi-provider-fallback, för stort scope för en runda).
- `Static core` 47608 chars som paket-split — kräver eval-baseline för säker uppdelning.
- `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL` brus-loggar — fungerar som det ska, bara verbose.
- Terminologi-/naming debt kring `v0`, `sandbox`, "Bygg nu"/F3-copy utan runtime-symtom. Hanteras som P3/städ, inte som kärnfix.

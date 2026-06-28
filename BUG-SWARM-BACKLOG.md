# Bug-backlog (konsoliderad)

**Enda aktiva bugglistan i repot.** Lokal markdown är källan till sanning — ingen Linear, ingen extern tracker. Preflight (`scripts/dev/check-bug-backlog.mjs`) och canvas-generatorn (`scripts/canvas/build-llm-flow-canvas.mjs`) läser **`## Aktiv kö`** nedan.

Avslutade rader flyttas till [`docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-27.md`](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-27.md) (senaste) och [`backlog-arkiv-2026-06-24.md`](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-24.md) (fryst historik). Grandmaster-svärmens B01–B15 = löst historik i [`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

## Hur den hålls sann

| Regel | Vad |
| --- | --- |
| **Aktiv kö = bara öppna defekter** | Rader där systemet gör fel. Alla rader är `[ ]`. När en rad fixas: **flytta** den till arkivfilen som `[x]` med fix-referens (commit/PR). Bocka inte av på plats. |
| **En sanning per rad** | Skriv aldrig "FIXAD" i prosan på en `[ ]`-rad. Det är en motsägelse och preflighten failar (se `check-bug-backlog.mjs`). |
| **Beslut ≠ bug** | Saker där systemet gör som tänkt men vi *kan* välja annorlunda (fail-open, default-off-flaggor, degraded-policy) hör hemma i "Beslut & policy", inte i Aktiv kö — de räknas inte som risk i canvasen. |
| **Kan ej verifieras statiskt** | Fynd som kräver repro/livekörning hör i "Behöver repro" tills någon kört dem. |
| **Inflöde** | Nya buggar: `/buggrapport` (skriver en `M#`-rad här) eller PR-review-gaten (`pr-merge-review-gate.mdc` → logga med fil-ankare). |

**Status-legend:** `[ ]` = öppen. Källa-taggar: `G#`/`U#` = gamla GPT/UI-svärmlistor, `N#` = defensiv triage, `R#` = äldre kodrapport, `B#` = grandmaster-svärm, `E#` = eval, `FEL#`/`MB#`/`BB#` = PR-review-fynd, `M#` = manuellt rapporterad.

## Aktiv kö

Verkliga öppna defekter. Detta är den enda listan att jobba ur. Canvasen visar dessa som öppna huvudrisker.

| Klar | Status | Prio | Fynd | Källa | Beslut / nästa steg |
| --- | --- | --- | --- | --- | --- |
| [ ] | Öppen bug | P2 | F3 build-plan härleds från `preGenerationContracts`, inte parent-versionens filer → tomt build-plan-block fast koden har integrationer | G#20 | Tråda fil-härledda integrationer in i F3-prompten (`system-prompt/sections/session-contracts.ts` vs `finalize-design/route.ts`). Signal-ägar-fix i orchestrate/contract-derivering. |
| [ ] | Öppen bug | P2 | Init och follow-up har olika capability-universum (drift). #242 sektions-capabilities nu trådade i follow-up (#250) + init fast-lane-gate (#253), men `capability-dossier-bridge` saknar fortfarande sektions-id:n | G#26 | Konsolidera capability-källan över init + follow-up + dossier-bridge + `orchestrate.ts` (signal-ägarmatris). Ihop med G#25. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier/capability-threading svagt vissa paths (`capability-dossier-bridge.ts` → `orchestrate.ts`) | G#25 | Canonical-källa-konsolidering (samma spår som G#26). |
| [ ] | Öppen bug | P2 | `/finalize-design` detektionsfullständighet: `detect-integrations.ts`-regex kan missa en integration på filer som finns | G#21 | Konkret false-green (tomma filer → `409`) redan fixad; kvar = regex-täckning. `detect-integrations.ts`. |
| [ ] | Öppen inspektor-kluster | P2 | Inspect-bridge (flag-gated `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE`): (A) ingen fallback när `ready` saknas → inspektor inert; (B) bridge-capture skickar element-center, inte klickpunkt; (C) `?inspect=1` kan nå genererad apps `searchParams`; (D) flaggan saknar regel i `config/env-policy.json` | #164, #197 | A: ready-timeout → `map`/`ai` (`usePreviewInspectBridge.ts`). B: skicka `clientX/clientY` i pick-payload (`inspect-bridge-script.ts`). C: strippa param före iframe-nav (`PreviewPanel.tsx:withInspectParam`). D: env-policy-regel (`scripts/env/manage_env.py:get_rule`). |
| [ ] | Öppen bug | P3 | Plan-mode token-budget skalas mot tier-build-modellen, inte planner-fasen → planner-kontext skalas mot fel kontextfönster på anthropic-tier | MB-4 | OBS: nuvarande `engineModelId: resolveEngineModelId(resolvedModelTier)` är ett medvetet Bug 04#3-val (spegla codegens BuildSpec). Att blint sätta `engineModelId: planModel` regressar det. Riktig fix = frikoppla token-budget-modell från BuildSpec-modell. `create-chat-stream-post.ts:486-491` · `chat-message-stream-post.ts:754`. |
| [ ] | Öppen kvalitet-risk | P2 | Nya sektions-capabilities (`logo-cloud`, `stats-counter`, `feature-grid`, `cta-section`, `gallery-lightbox`, `stepper`) exponeras bara via Deep Brief-prompten → korta init-prompts + follow-ups missar dem | #242 | Tråda in i capability-inference + follow-up-detektion (`capability-dossier-bridge.ts`, `follow-up-capability-detection.ts`). Samma spår som G#25/G#26. |
| [ ] | Öppen kvalitet-risk | P2 | react-import-konsolidering bailar (no-op) när `import * as React` finns i filen → duplicerade named/type react-imports konsolideras inte, TS2300 kan kvarstå i den kombon. Säker no-op, ingen regression | #263 | Hantera namespace-fallet i `consolidateReactImports` (`src/lib/gen/autofix/rules/react-import-consolidated.ts`): merga named/type och lämna namespace-raden orörd. Codex P2 på PR #263. |
| [ ] | Öppen test-brist | P3 | `PreviewPanel.test.tsx`: 2 save-flow-tester timeoutar i `waitFor` ("saves blog post editor changes…" + "saves footer editor changes…"); editorn renderar OK, bara save→PATCH→`onFilesSaved`-flödet hänger. Reproducerar isolerat på Node 22.22.2, oberoende av env/secrets/DB | #261 | Pre-existing per HEAD `7706a27` (2026-06-27). Fixa timeouten i `src/components/builder/PreviewPanel.test.tsx`/komponenten, eller markera som känd. Flyttad hit från AGENTS.md för att hålla AGENTS.md tunn. |
| [ ] | Öppen bug | P2 | Quality-gate-routen håller `engine_version_jobs`-leasen över hela verify-anropet (preview-host-timeout ~300000ms ≈ route `maxDuration` 300s); dödar Vercel funktionen före abort står leasen `running` till 15-min-TTL → `version_busy` för accept/repair/verify i fönstret. Självläker via TTL/expiry-takeover (bundet fönster, ej permanent) | #260 | Route-budget-buffert (verify-timeout < route-budget), släpp leasen utanför route-budgeten, eller kortare lease-TTL för HTTP-routes. Codex P2 #4 deferrad från #256; #260 P2 #5 (repair-vs-edit-clobber) löst av #265. `quality-gate/route.ts`. |

## Behöver repro

Fynd som inte kan avgöras statiskt. Flytta till Aktiv kö när repro finns, eller till arkivet om de avfärdas.

| Fynd | Källa | Repro-krav |
| --- | --- | --- |
| B01-klient: vit/blank iframe — `fetchPreviewHostStatus` versionId-blind polling (re-pin saknas) | B01 | Live preview-host (separat repo). `preview-host-client.ts:134` kollar bara `running`, aldrig `versionId`. Branch `fix/preview-version-mismatch-polling`. |
| F3 auto-kick `onF3Ready` kringgår stale-base-409-gaten | B12 | Parallell F2-follow-up + F3-send mot samma chatId → förvänta 409. `chat-message-stream-post.ts` + `PreviewPanelF3Trigger.tsx` + `useSendMessage.ts`. |
| clear-redesign delta-brief tappas vid contract-gate-retry (tur 2) | B13 | clear-redesign + contract-gate returnerar → tur 2 ska ha delta-brief. `chat-message-stream-post.ts` + `follow-up-orchestration-input.ts`. |
| `arcade-with-klarna` failar med merge-syntax | E#1, R#10 | `npm run eval:weird-smoke:dump` mot LLM-providers (nycklar + nät + kostnad). |
| Scaffold required files kan tappas i finalize/export-path | R#9 | Deterministisk preflight/export-verifiering när repro finns. |
| Font materializer träffar mest baseline Inter (variant→font-parning) | G#53 | Eval-verifiering mot faktisk output. |
| Element crop missar små element vid DPI/zoom | G#70, U#52 | Inspector-worker (Playwright DPI/zoom). |
| Media local fallback `/api/uploads/media` kanske ej nås av preview-VM | U#29 | Verifiering mot preview-VM-kontext. |
| Analytics före cookie-consent (integritet) | U#56 | App-bred audit av var analytics initieras + gate på consent-flagga. |
| `previewUrlHint` base path + chatId | U#77 | Jämförelse mot live preview-host (täcks delvis av tester). |

## Beslut & policy (uppskjutet — ej aktiva buggar)

Systemet gör som tänkt; "fixen" är ett produkt-/arkitektur-**val** som medvetet skjutits upp. Räknas **inte** som risk i canvasen. Princip (Område 7): *systemet får misslyckas, men aldrig ljuga* — placeholder/stub/saknad hard-dossier får aldrig signalera success.

| Kluster | Källor | Val / blockare |
| --- | --- | --- |
| Degraded/placeholder-policy (placeholder = degraded, aldrig grön) | N#1, G#17, G#22, G#35, G#49, G#51, U#72 | Warning vs blocker per lane = gate-policybeslut; kan flippa version-status röd. |
| F2/F3 runtime-gate (Product Postcheck) | G#10, N#4, N#H3, R#6 | Default-off + fail-open idag; produktifiering till blockerande = pipeline-beslut. |
| Simplified-brief fallback sänker premium/3D | G#13 | Degraded-mode-signal = kvalitetspolicy (påverkar brief-compose + capability-threading). |
| Verifier-scope + recurring findings | G#33, N#5 | Hela filer vs snippets = verifier-arkitektur + token-budget; recurring-findings = nytt prompt-steg. |
| Verify-skip / cold cache | G#31, G#32 | Warm typecheck dokumenterat fail-open (`cache_cold`); cold-blockerande = infra-beslut. |
| Follow-up kvalitet/budget | G#57, N#3 | Jämka follow-up-gate mot init + hård regression-gate i CI = process-beslut. |
| Env-precedence / docs / refaktor | G#16, G#18, G#19 | `process.env`-refaktor (~100 filer), env-docs canonical-källa, `.env.local`-precedence = egna pass. |
| Säkerhet (deprio — eget pass) | G#40 (residual), #196, #197, B07, B-GA | TOCTOU/DNS-rebinding (IP-pinning), inspect spoof (nonce), publik media GET, OAuth-loggning. App-side SSRF redan fixad #196. |
| Quality-gate fail-open | B08 | Valt **släpp igenom**; felet loggas via `console.warn` (DB-oberoende). |
| Scaffold/variant/font-tuning | G#50, G#52, G#54, G#66 | Scaffold-defaulttext, pre-match vs embedding, Geist-workaround, adaptiv `MAX_PAGES` = heuristik-/produkttuning. |
| Produkt-/UX-gap | U#10, U#23, U#42, U#47, U#49, G#71 | Optimistic conflict, fler transcribe-språk, scraper-prioritet, OpenClaw 180k-context, D-ID session, PDF print-flöde. |
| Logg-/observability-/storage-städ | G#59, G#60, G#63, U#53, U#63, U#66 | Bred städ med sampling-/namespace-policy = sammanhållet pass, inte punktfix. |
| Arkitektur (deploy-topologi/lane) | B3/E2, B1, B4, F4/F5, B7/#140 | Durable event-bus (multi-instans), S3-lane blockerande, canvas-PR-token, bus-emits/manifest-Zod, DB/Blob-gate-PR. |
| A7-2 kod-default | B05 | Kod-fix (scope till valda dossiers) mergad #211; kod-default OFF kvarstår som ditt val (env satt i Vercel). |
| CTA-knapp i init-fast-lane | M#1 (EGEN-05) | `simpleWebsitePath` blockar `CTA-knapp` från fast lane via bredare `cta`-match än follow-up-vocabulary. By-design: namngiven sektions-capability i init ska gå full dossier-pipeline (#242 Alt A, testat `simple-website-path.test.ts:134`). Skillnaden mot follow-up (styling-tweak) är medveten. |
| components/ui canonical-skydd (drop av LLM-emitterade shadcn-stem-filer) | #263 | Avsiktligt: `components/ui/<shadcn-stem>` behandlas som host-ägda canonical runtime-filer; drop sker bara när canonical ersättning finns. App-specifika exports i en canonical shadcn-path stöds ej → revisitas om det dyker upp i riktiga generationer. Codex P2 på PR #263. |
| Deferred re-verify hoppas över av inflight | BB-265 (MEDIUM) | Stale-base-recovery i `repair/route.ts` schemalägger `triggerServerVerification` via `after()`; om `inflight` redan håller versionId returnerar den tidigt och callbacken no-op:ar medan raden står i `repairing`. Täcks av readiness-watchdogen (`failVersionVerificationIfUnleased`, lease-safe, targetar `repairing` när lease-tabellen finns) + den samtidiga körningen som äger versionen. Ingen ny race införd. Kommentar finns vid `after()`-siten. |

Full detalj + alla `[x]`/avfärdade rader: [`backlog-arkiv-2026-06-27.md`](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-27.md) · [`backlog-arkiv-2026-06-24.md`](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-24.md).

## Naming-debt: `v0ChatId`

Inte ett dött fält. Live DB-kolumn (`chats.v0_chat_id`, notNull/unique) + load-bearing konsument (`useBuilderVmPreview.ts` gatar VM-preview-bootstrap för legacy-mappade chattar). Full borttagning = tyst regression + bruten DB/payload-nyckel → kräver **migrationsplan** (byt internt symbolnamn, behåll DB/payload-kompat) per `docs/architecture/repository-and-platform.md`. Säker delmängd finns (död `|| data.v0ChatId`-läsning i `useCreateChat.ts`, okonsumerat duplikatfält i `/api/projects/[id]/chat`).

# Bug-backlog (konsoliderad)

**Enda aktiva bugglistan i repot.** Lokal markdown är källan till sanning — ingen Linear, ingen extern tracker. Preflight (`scripts/dev/check-bug-backlog.mjs`) och canvas-generatorn (`scripts/canvas/build-llm-flow-canvas.mjs`) läser **`## Aktiv kö`** nedan.

Avslutad, avfärdad och historisk triage är utflyttad till [`docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-24.md`](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-24.md). Grandmaster-svärmens B01–B15 = löst historik i [`docs/plans/avklarat/bug-swarm/README.md`](docs/plans/avklarat/bug-swarm/README.md).

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
| [ ] | Öppen bug | P2 | Init och follow-up har olika capability-universum (drift) | G#26 | Konsolidera capability-källan över init + follow-up + dossier-bridge + `orchestrate.ts` (signal-ägarmatris). Ihop med G#25. |
| [ ] | Öppen kvalitet-risk | P2 | Dossier/capability-threading svagt vissa paths (`capability-dossier-bridge.ts` → `orchestrate.ts`) | G#25 | Canonical-källa-konsolidering (samma spår som G#26). |
| [ ] | Öppen bug | P2 | `/finalize-design` detektionsfullständighet: `detect-integrations.ts`-regex kan missa en integration på filer som finns | G#21 | Konkret false-green (tomma filer → `409`) redan fixad; kvar = regex-täckning. `detect-integrations.ts`. |
| [ ] | Öppen schema-risk | P3 | `variantNomination` typas + konsumeras i drift-detektion men produceras inte av brief-schema → drift-koden alltid null (död) | G#56 | Lägg till i brief-strict-schema + prompt, ELLER ta bort drift-detektionen. `orchestrate.ts:879` · `system-prompt/types.ts`. |
| [ ] | Öppen bug | P3 | Plan-mode token-budget skalas mot tier-build-modellen, inte planner-fasen → planner-kontext skalas mot fel kontextfönster på anthropic-tier | MB-4 | Sätt `engineModelId: planModel` på plan-`orchestrationInput` i `create-chat-stream-post.ts` + `chat-message-stream-post.ts`. Låg prio (plan-artefakt, ej kod). |
| [ ] | Öppen inspektor-risk | P2 | Inspect-bridge: ingen fallback när flagga PÅ men bridge ej kan injiceras (`ready` saknas) → inspektor inert | #164 | Fall tillbaka till `map`/`ai`-läge. `PreviewPanel.tsx:170`. Flag-gated (`NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE`). |
| [ ] | Öppen env-städ | P2 | `NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE` saknar regel i `config/env-policy.json` (env-sync defaultar okända `NEXT_PUBLIC_*` till preview+prod) | #164 | Lägg env-policy-regel. `src/lib/env.ts:209` · `scripts/env/manage_env.py:get_rule`. |
| [ ] | Öppen inspektor-edge | P2 | Bridge-captures skickar element-center, inte faktisk klick-koordinat | #164 | Bevara klick-punkten. `usePreviewInspectBridge.ts:164`. |
| [ ] | Öppen läck-risk | P3 | `?inspect=1` kan nå genererad apps `searchParams`/`window.location.search` | #164, #197 | Strippa innan iframe-navigering. `PreviewPanel.tsx:withInspectParam`. |
| [ ] | Öppen validator-risk | P2 | Control-plane registry: `#fragment`-källreferenser valideras inte (strippar efter `#`, kollar bara att filen finns) → false-green i self-validating-kartan | #202 | Resolva JSON-fragment och faila när top-level-nyckeln saknas. `scripts/control-plane/check-registry.mjs:114`. |
| [ ] | Öppen kvalitet-risk | P2 | Nya sektions-capabilities (`logo-cloud`, `stats-counter`, `feature-grid`, `cta-section`, `gallery-lightbox`, `stepper`) exponeras bara via Deep Brief-prompten → korta init-prompts + follow-ups missar dem | #242 | Tråda in i capability-inference + follow-up-detektion (`capability-dossier-bridge.ts`, `follow-up-capability-detection.ts`). Samma spår som G#25/G#26. |
| [ ] | Öppen kvalitet-risk | P2 | react-import-konsolidering bailar (no-op) när `import * as React` finns i filen → duplicerade named/type react-imports konsolideras inte, TS2300 kan kvarstå i den kombon. Säker no-op, ingen regression | #263 | Hantera namespace-fallet i `consolidateReactImports` (`src/lib/gen/autofix/rules/react-import-consolidated.ts`): merga named/type och lämna namespace-raden orörd. Codex P2 på PR #263. |

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
| components/ui canonical-skydd (drop av LLM-emitterade shadcn-stem-filer) | #263 | Avsiktligt: `components/ui/<shadcn-stem>` behandlas som host-ägda canonical runtime-filer; drop sker bara när canonical ersättning finns. App-specifika exports i en canonical shadcn-path stöds ej → revisitas om det dyker upp i riktiga generationer. Codex P2 på PR #263. |

Full detalj + alla `[x]`/avfärdade rader: [`backlog-arkiv-2026-06-24.md`](docs/plans/avklarat/bug-swarm/backlog-arkiv-2026-06-24.md).

## Naming-debt: `v0ChatId`

Inte ett dött fält. Live DB-kolumn (`chats.v0_chat_id`, notNull/unique) + load-bearing konsument (`useBuilderVmPreview.ts` gatar VM-preview-bootstrap för legacy-mappade chattar). Full borttagning = tyst regression + bruten DB/payload-nyckel → kräver **migrationsplan** (byt internt symbolnamn, behåll DB/payload-kompat) per `docs/architecture/repository-and-platform.md`. Säker delmängd finns (död `|| data.v0ChatId`-läsning i `useCreateChat.ts`, okonsumerat duplikatfält i `/api/projects/[id]/chat`).

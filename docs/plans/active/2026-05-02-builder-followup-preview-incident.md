---
id: 2026-05-02-builder-followup-preview-incident
status: active
created: 2026-05-02
linear: null
parent: 2026-04-28-llm-flode-startlinje
supersedes: null
---

# Builder follow-up + preview-incident 2026-05-02

Aktiv child-plan efter lokal incident där en lyckad F2-design/follow-up upplevdes gå sönder vid nästa steg. Planen avgränsar hårda runtime-fel från UX/status-brus och ska landa i små fixar med riktade tester.

## 818-underlag

| Vinkel | Bedömning | Confidence |
|---|---|---:|
| Generationslogg | `8e35...` create `969...` och 3D-follow-up `77be...` gick igenom; nästa `Bygg integrationer nu` använde explicit äldre bas `969...` och slutade `site.empty_generation` med bara `suggestIntegration`. | 90% |
| Preview mismatch | `preview-status` har avsiktlig `version_mismatch`/`preview_session_id_mismatch`, men stale client-meta efter reload/versionbyte kan trigga fel recover-väg. | 72% |
| F2/F3 gate | F3-tooling styrs av `lifecycleStage`; tool-only F3-pass kan sluta utan filer. F2 kan fortfarande få hårda auth/payment-dossiers via capability/dossier-val. | 82% |
| Dependency preflight | Verbatim Stripe/Clerk-filer kan återställas utan att `package.json` får `stripe`/`@clerk/nextjs`, vilket ger `dependency_install_failure` och `previewBlocked=true`. | 90% |
| Follow-up base | F3/follow-up-bas ägs av klientens explicit skickade `engineBaseVersionId`/`activeVersionId`; om UI pekar på äldre version blir nästa pass felankrat. | 70% |
| UX/status | "Tänker", preview tom-state och mismatch-overlay blandar flera faser. Användaren kan läsa transient preview-state som generation-fel. | 68% |
| Testluckor | Bra route-/status-tester finns; saknas fokuserade tester för `useBuilderVmPreview`, tool-only empty generation och end-to-end F3-basval. | 72% |
| Docs/schema/backoffice | Planen hör hemma i `docs/plans/active`; preview/session- och F2/F3-kontraktsdocs behöver synkas om runtime-yta ändras. | 85% |
| GPT-dashboard | OpenAI/GPT-loggar visar både Deep Brief (`site-brief-generation.ts`) och codegen-/repair-steg. Dubbla rader för samma prompt kan vara avsiktliga delsteg, men måste korreleras mot `chatId`/`runId` för att se om create faktiskt startades dubbelt. | 75% |

## Rotorsakskarta

```text
Lyckad F2/follow-up
  -> ny version skapas (77be...)
  -> UI/F3-trigger eller explicit base ligger kvar på äldre version (969...)
  -> "Bygg integrationer" kör mot fel bas
  -> modellen gör suggestIntegration men producerar inga filer
  -> done_empty_output

Separat Codex/tanker-run
  -> ecommerce prompt väljer landing-page + integration-dossiers
  -> verbatim Stripe/Clerk-filer återställs
  -> package.json saknar pins
  -> project-sanity dependency_install_failure
  -> previewBlocked=true

Preview-yta
  -> session lagras per chatId med versionId/sandboxId
  -> UI kan ha stale previewUrl/sessionMeta efter reload/versionbyte
  -> version_mismatch eller preview_session_id_mismatch
  -> recover/overlay kan upplevas som "sidan trasig"

GPT-dashboard-yta
  -> /api/ai/brief kan göra Deep Brief före create
  -> create-chat kan göra server_auto_brief om meta.brief saknas
  -> codegen/repair kan ge separata "no output"-rader i provider-loggen
  -> provider-rader måste korreleras mot devLog/runId innan de kallas dubbla sidförsök
```

## Scope

| Spår | Mål | Primära filer |
|---|---|---|
| A. Basversion för follow-up/F3 | F3-trigger och vanlig follow-up ska inte omedvetet ankra mot äldre designversion efter en lyckad ny version. | `src/lib/hooks/chat/useSendMessage.ts`, `src/app/builder/BuilderShellContent.tsx`, `src/components/builder/preview-panel/*`, `src/app/api/engine/chats/[chatId]/finalize-design/route.ts` |
| B. Tool-only F3-output | `suggestIntegration`/`requestEnvVar` utan kodfiler ska bli tydlig await/retry/blocked-signal, inte tyst `empty_generation`. | `src/lib/providers/own-engine/generation-stream.ts`, `generation-stream-tools.ts`, stream-handler-tester |
| C. F2/F3 dossier + dependency | F2 ska inte dra in hårda Stripe/Clerk-dossiers; när F3 gör det ska dependencies pinnas innan preflight. | `src/lib/gen/orchestrate.ts`, `src/lib/gen/autofix/dep-completer.ts`, `src/lib/gen/project-scaffold.ts`, dossier-/preflight-tester |
| D. Preview session pinning | Stale `previewUrl`/`previewSessionId` får inte återanvändas över `activeVersionId` utan server-statuscheck. | `src/app/builder/useBuilderVmPreview.ts`, `src/app/builder/usePreviewSession.ts`, `src/app/api/engine/chats/[chatId]/preview-status/route.ts` |
| E. UX/status-copy | Skilj `tänker`, stream, preview boot, version mismatch och preflight blocker i UI-copy. | `MessageList.tsx`, `PreviewPanelEmptyState.tsx`, `VersionMismatchOverlay`, befintlig copy-plan |
| F. GPT-loggkorrelation | Provider-rader (`brief`, `server_auto_brief`, codegen, repair, no-output) ska kunna mappas till `chatId`/`runId` så dubbla faktiska creates kan skiljas från normala delsteg. | `src/app/api/ai/brief/route.ts`, `src/lib/builder/site-brief-generation.ts`, `src/lib/api/engine/chats/create-chat-stream-post.ts`, `src/lib/models/trace.ts`, `src/lib/db/services/prompt-logs.ts` |

## Ej i scope

| Utanför | Varför |
|---|---|
| Template payload-too-large | Separat preview-host/template-spår; användaren bad att strunta i det nu. |
| Download `zip` 404 | Separat sidecar/API-fel från rapporten. |
| Full dev-server/browser-repro direkt | Riskerar builder-coexistence. Bör göras först efter kodfixar och helst med ny chat eller efter att användaren stängt aktiv builder-tab. |
| Stort scaffold-byte från `landing-page` till `base-nextjs` | Preflight föreslår det som medium-confidence retry, men rotorsaken här är integration/deps/base-version. |

## Genomförande

1. **Verifiera basversion-flödet**
   - Läs `useSendMessage`, `BuilderShellContent`, `PreviewPanelF3Trigger` och `finalize-design`.
   - Lägg test som reproducerar: version `77be` skapas, men F3-trigger får inte fortsätta använda `969` utan explicit användarval.
   - Beslut: antingen nollställ `selectedVersionId` vid ny lyckad version eller varna/blocka F3 när `activeVersionId !== latestVersionId`.

2. **Gör tool-only F3-output explicit**
   - Särskilj `toolCalls.length > 0 && no files` från vanlig `done_empty_output`.
   - UX/SSE ska säga att integration kräver nästa steg eller retry, inte att generationen "bara blev tom".
   - Lägg regressionstest för `suggestIntegration` utan filer.

3. **Rätta F2/F3 + dependency-kontrakt**
   - Blockera auth/payment hard dossiers i F2 om inte `previewPolicy === fidelity3`.
   - Säkerställ att F3-dossierdeps (`stripe`, `@stripe/stripe-js`, `@clerk/nextjs`) mergeas till `package.json` före project-sanity.
   - Lägg test där verifierade Stripe/Clerk-filer inte ger `dependency_install_failure`.

4. **Stabilisera preview-session pinning**
   - Vid `activeVersionId`-byte: droppa stale session-meta och kräv `preview-status`/bootstrap för nya versionen.
   - Undvik att gammal `currentPreviewUrl` markerar ny version som redan klar.
   - Lägg hook-/route-test för reload med stale `previewSessionId`.

5. **UX/status-städ**
   - Knyt copy till faktiska faser: reasoning, generation, preflight blocked, preview starting, version mismatch.
   - Håll copy-fixarna små och separera från statuslogik enligt `2026-05-01-f2-f3-ux-copy-konsolidering.md`.

6. **Korrelera GPT-dashboard mot Sajtmaskin-runs**
   - Kontrollera att `/api/ai/brief` och `server_auto_brief` loggar `source`, `model`, `promptHash`, `chatId`/`runId` där det finns.
   - Lägg en smal devLog-rad när klientbrief saknas och server-auto-brief körs, så dubbla brief-anrop syns som `client_brief` vs `server_auto_brief`.
   - Lägg test/diagnos för att create-locken inte startar två `create-chat` för samma prompt medan brief-anropet pågår.

## Verifiering

| Efter spår | Kommando |
|---|---|
| Preview status/session | `npx vitest run "src/app/api/engine/chats/[chatId]/preview-status/route.test.ts" "src/app/builder/usePreviewSession.test.ts"` |
| Generation/tool-only | `npx vitest run "src/lib/providers/own-engine/generation-stream.golden.test.ts" "src/lib/providers/own-engine/generation-stream-tools.test.ts"` |
| F2/F3 + deps | `npx vitest run "src/lib/gen/autofix/dep-completer.test.ts" "src/lib/gen/validation/project-sanity.test.ts" "src/lib/gen/stream/finalize-preflight.test.ts" "src/lib/gen/build-spec.test.ts"` |
| GPT-loggkorrelation/create-lock | `npx vitest run "src/lib/api/ai/brief-cache.test.ts" "src/lib/builder/server-auto-brief-policy.test.ts" "src/lib/hooks/useInitBrief.test.ts" "src/lib/hooks/chat/helpers.test.ts"` |
| Allmänt efter kodändring | `npm run typecheck` + `ReadLints` på ändrade filer |

## Progress

| Datum | Status |
|---|---|
| 2026-05-02 | **F delvis klart:** Deep Brief/client brief och `server_auto_brief` får stabil `traceId`/`promptHash` i devLog/headers/meta, så GPT-dashboard-rader kan skiljas från faktisk codegen/repair. Verifierat med brief/cache/server-auto-tester och `npm run typecheck`. Kvar: duplicate-create-repro och övriga runtime-spår. |
| 2026-05-02 | **Duplicate-create-repro klart:** init-submit har nu ett synkront förberedelse-lås före Deep Brief. Två snabba submits startar bara ett brief-anrop och ett `createNewChat`. Verifierat med `useBuilderPromptActions.test.ts` + riktade brief/cache-tester + `npm run typecheck`. |
| 2026-05-02 | **B klart:** tool-only integration-output klassas nu som `tool_only_empty_generation` med `awaitingInput=true`, tydlig prompt och `site.awaiting_input` i devLog i stället för tyst `site.empty_generation`. Verifierat med `generation-stream.golden.test.ts`, `generation-stream-tools.test.ts`, `shared-own-engine-helpers.test.ts` och `npm run typecheck`. |
| 2026-05-02 | **A delvis klart:** `/finalize-design` stoppar nu explicit stale designversion med `409 stale_design_version` om en nyare preferred designversion finns, så F3 inte tyst forkas från äldre bas. Verifierat med ny route-test + `build-spec`/`tier3-build-spec` och `npm run typecheck`. Kvar i A: eventuell UI-copy för stale-version-toasten. |
| 2026-05-02 | **C klart:** F2 filtrerar bort F3-only hard integration dossiers (`payments`, `auth`, `ai-chat`, analytics/error-tracking) medan F3 tillåter dem. Tier-3 SDK-imports från restored Stripe/Clerk/Resend-dossiers får nu dependency pins innan project-sanity. Verifierat med `dep-completer`, `project-scaffold`, `orchestration-integration`, `dossiers/select` och `npm run typecheck`. |
| 2026-05-02 | **D klart:** VM-preview bootstrap hoppar inte längre över server-status/bootstrap bara för att `currentPreviewUrl` ser live ut; den kräver matchande `previewSessionId` för aktiv version. Detta stoppar stale preview-url/session-meta från att markera ny version som klar efter versionbyte/reload. Verifierat med `useBuilderVmPreview`, `usePreviewSession`, `preview-status` och `npm run typecheck`. |

## Dev-serverbeslut

Starta inte `npm run dev` som första steg. Börja med logg- och testrepro. Starta dev-server först när en UI-/preview-repro kräver det, och då:

- kontrollera terminaler först så ingen server dupliceras,
- öppna inte användarens aktiva builder-chat,
- använd ny chat/testdata eller be användaren stänga sin builder-tab,
- följ `builder-coexistence.mdc`.

## Definition of done

| Krav | Bevis |
|---|---|
| F3/follow-up bas använder rätt version eller blockar tydligt | Test + telemetry/UX-signal när vald version är stale |
| `suggestIntegration` utan kodfiler är inte tyst tom generation | Stream-/generation-test och tydlig status |
| F2 drar inte in hårda integrationer; F3 gör det med deps | BuildSpec/orchestrate + dep/preflight-tester |
| Preview-session mismatch hanteras utan stale URL/session reuse | Route-/hook-tester |
| GPT-dashboardens dubbla/no-output-rader är förklarbara | Provider/loggkorrelation visar vilka rader som är brief, server-auto-brief, codegen, repair eller faktisk duplicate create |
| Docs uppdaterade om runtime-kontrakt ändras | `fas2-orchestration-and-build.md`, `fas3-preview-and-deploy.md`, preview-session schema/backoffice endast vid faktisk ytförändring |

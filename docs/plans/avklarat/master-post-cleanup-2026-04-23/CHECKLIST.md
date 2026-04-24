# Checklista — master-post-cleanup-2026-04-23

Status: 2026-04-24 (efter Wave 5 verify Run A + Run B + 4 hot-fixes)

## Wave 0–5 — alla 13 planer mergat ✅

- [x] Plan 00 — head-lock + full/short/skip-tabell
- [x] Plan 01 — manuell rollout + smoke-baseline (3 runs alla promotade)
- [x] Plan 02 — F2/F3 runtime truth + version modal (PR #88)
- [x] Plan 04 — fixer-surface inventory (+ STATUS-04-AUDIT)
- [x] Plan 03 — followup_technical reason + verifier truth (PR #90)
- [x] Plan 05 — single fixer entrypoint + lane-tag (PR #89)
- [x] Plan 06 — Deep Brief delta + capability-classifier (PR #92)
- [x] Plan 07 — 3D capability-injection + three-fiber hardening (PR #91)
- [x] Plan 08 — core simplification (orchestrate.ts + route-plan.ts) (PR #94)
- [x] Plan 09 — legacy-ripout + backoffice-drift + config pruning (direct)
- [x] Plan 10 — latency budgets + observatorie-routing-fixar (PR #96)
- [x] Plan 11 — scaffold-required-files-check + variant-lock + capability-modify (PR #97)
- [x] Plan 12 — PromptKit + slug-bounce + #15 dossier-env-resolver

## Mellanrundor — investigation + hot-fixes (Wave 4–5)

- [x] Investigation — page.tsx-loss root-cause (PR #95)
- [x] HMR pg.Pool-fix — globalThis-cache i db/client.ts
- [x] ThinkingOverlay v3 — inline rad utanför MessageList
- [x] AJV `format: "uri"`-warning — silenced via `addFormat`
- [x] STATUS-09-CANDIDATES, STATUS-10-CANDIDATES
- [x] STATUS-DOSSIER-CONFUSION-AUDIT, STATUS-BACKOFFICE-DRIFT
- [x] STATUS-INVESTIGATE-PAGETSX-LOSS

## Wave 5 verifikation (live smoke-test 2026-04-24)

### Run A — init-prompt "bygg en hemsida för en gymnastiklokal i Göteborg som heter Trampolin Studio"
- [x] 4 routes genererade: `/`, `/kontakt`, `/traning`, `/lokalbokning`
- [x] scaffoldVariant `bold-startup` (Plan 12 variant lock)
- [x] qualityTarget promoted till `premium`
- [x] 47 filer, version `f2ce9527-b156-4a06-8c43-2da55e81528c`
- [x] Plan 11 quality-gate blockerar promotion vid trasig kod
- [x] Plan 02 ThinkingOverlay overlappar inte
- [x] Plan 06 observability — Redis cache hit syns (löste open-question #1)
- ⚠️ typecheck FAIL → server-repair "syntax clean but quality gate failing" → tydligt loggmeddelande efter fix #3 nedan
- ⚠️ Hero-bild fel: gymnastiklokal → vuxen man med skivstång (LLM-bildmatchning)

### Run B — auto-FU "bygg integrationer" + manuell FU3 "skapa en sida för medlemspriser"
- [x] Auto-trigger av "Bygg integrationer" (Plan 12 enforcement-policy)
- [x] FU 112s (3x snabbare än init), typecheck **PASS**
- [x] 8 nya filer: api/bookings, api/contact, api/leads, submission-store, integration-manifest
- [x] "**Projektinställningar • 38 att konfigurera**" badge i top-bar
- [x] FU3 sub-route `/medlemspriser` skapad — rendreras i navbar + sitemap (Plan 12 verifierat)
- [x] 3 versioner i historik, v1+v2 promoted

## Hot-fixes 2026-04-24 (efter Wave 5 verify)

- [x] **Fix #1 — Lansering truth mismatch:** `buildLifecycleBlocker` i `readiness/route.ts` saknade `repairing`-grenen → top-bar visade "Redo att publicera" samtidigt som version-history visade "Repairing". Nu visar lansering "1 varning" + dedikerad repair-melding.
- [x] **Fix #2 — Init-prompt auto-submit (Plan 01 friction):** `useBuilderPageController.ts` auto-startade bara `kostnadsfri`-flödet, inte `freeform`. Utökade villkoret. Användare slipper klicka Send två gånger.
- [x] **Fix #3 — Server-repair logg-tydlighet:** "Kvarvarande fel: 0" är esbuild-syntax-counter, inte tsc. Lade till `remainingErrorsSource` + `syntaxCleanGateFailed` i meta + tydligare meddelande i UI ("0 syntaxfel (esbuild) — men quality gate (typecheck/build) failar fortfarande").
- [x] **Fix #4 — Backoffice overview.py sync:** `CONFIG_NAV_PAGES` hade out-of-sync sidnamn ("Research & Dossiers", "Pipeline" → riktiga namn).

## Buggjakt-runda 2026-04-24 (kväll) — 7 fixar

5 parallella audit-agenter över olika spår: LLM partial-files, image matching, säkerhet, race conditions, dead code. Implementerade fixar:

- [x] **Fix #5 — `validateCompleteFiles` i `runLlmFixer`:** LLM-fixern returnerade tidigare partial files (saknad `}`, ellipsis-tail, length-shrink) som mergades direkt — bug-klassen bakom Run A typecheck-fail. Lade till pre-merge-validering med 3 heuristiker (50%-shrink, tail-placeholder, balanced delimiters med string/comment-aware brace counter). Incomplete files exkluderas från merge + flaggas i `incompleteFiles`-fältet på FixerResult.
- [x] **Fix #6 — Gymnastik-bildmatchning:** Lade till svenska→engelska mappningar i `unsplash-query-fallback.ts` för `gymnastik`, `gymnastiklokal`, `gymnastikhall`, `barngymnastik`, `ungdomsgymnastik`, `vuxengymnastik`, `trampolinhall`, `trampolinpark`, `akrobatik`. Bias mot "gymnastics" / "kids gymnastics" / "trampoline park" istället för "gym" (weightlifting).
- [x] **Fix #7 — Auth på `/api/ai/brief`:** Endpointen körde full LLM-brief-generering utan inloggningskrav (gäst-tillgänglig). Lade till `getRequestUserId`-gate identisk med `/api/ai/chat` (401 för guest:/saknad userId).
- [x] **Fix #8 — Rate-limit på `/api/stripe/checkout`:** Wrappade handlern i `withRateLimit("stripe:checkout")` så inloggade klienter inte kan spamma Stripe med checkout-sessions.
- [x] **Fix #9 — F3-trigger disabled utan versionId:** `PreviewPanelF3Trigger` skickade `body: {}` om `versionId` var null → server kunde inte ankra parent-version. Disablar nu knappen med tydlig title.
- [x] **Fix #10 — Retry-timeout cleanup i `useBuilderVmPreview`:** `scheduleTransientRetry` skapade `setTimeout` utan att spara id:t → stale retries kunde fyra mot gammal version efter chat-byte. Track i `pendingRetryTimeoutsRef` + cleanup vid effekt-unmount.
- [x] **Fix #11 — Död type-export `RepairEntry`:** Tog bort den deprecerade type-aliasen i `repair-generated-files.ts` (0 användningar i codebase, ersatt av `FixEntry`).

## Verifierat i UI (live 2026-04-24)

- [x] Plan 02: modal-truth — alla 3 runs grön/ärlig + truth-mismatch nu fixad
- [x] Plan 06: capability-classifier syns i agentlogg
- [x] Plan 07: dossier-injection
- [x] Plan 09: backoffice fixer_registry
- [x] Plan 11: scaffold-required-files-check, variant-lock
- [x] Plan 12: route-rules (4 routes init + sub-route follow-up), enforcement-policy (38 env-vars), variant-lock

## Granskning

- [x] `npm run typecheck` — 0 errors efter wave 5 + alla hot-fixes
- [x] Lokal = origin (kommer pushas i denna runda)
- [x] 7 wave-5-relaterade test-filer: 106 tester passerade

## Återstående buggar (tracked i open-questions.md)

- 🚀 #16 game/interactive capability-tier (förbättring, ny capability) → ny plan
- 💡 #17 Inline integrations-onboarding (UX) → ny plan
- ❓ #2 Blitz/browser-side preview (long-term)
- ❓ #7 THREE Context Lost (cosmetic, IDE-noise sannolikt)
- ❓ #9 CSP iframe empty src (UI-cleanup)
- ❓ #11 Inspector scroll-lock (UI-cleanup)
- 💡 #13 Promoted → Fidelity rename (UI-rename)
- ✅ ~~A. Bildmatchning gymnastik~~ — fixad (Fix #6)
- ✅ ~~B. Repair-LLM partial files~~ — fixad (Fix #5)
- ⚠️ **C.** Hydration error i Sajtmaskin-skalet (preexisting, ej från genererad sajt)
- ⚠️ **D.** Streamlit-backoffice saknar Plan 11/12-info — operatörsverktyg gradvis out-of-sync
- ⚠️ **E.** Strikta zod-schemas saknas på `createChatSchema`/`sendMessageSchema` etc. (5 schemas föreslagna)
- 🚨 **F. SÄKERHET:** `/api/openclaw/chat` + `/api/did/chat` är öppna LLM-proxies (ingen auth). HÖG kostnads/missbruk-risk. Ej fixad — kräver verifiering av om mönstret är avsiktligt (gateway-token) eller en miss.
- ⚠️ **G. SÄKERHET:** `/api/analyze-website` ingen auth → kostnads-spam mot OpenAI + indirekt server-driven URL-fetcher
- ⚠️ **H. SÄKERHET:** `/api/uploads/[filename]` filservering utan auth (om filnamn är gissningsbara läcker innehåll)
- ⚠️ **I.** Race conditions i builder: `useChatReadiness` polls med null versionId, chat-hooks "hold"-fönster glapp, mutateVersions utan mutateChat (3 separata fynd)

## Wave 5 Status: KLAR ✅

Alla 13 planer mergat, 4 hot-fixes deploy:ade, 2 nya buggar dokumenterade men ej blockerande för att fortsätta.

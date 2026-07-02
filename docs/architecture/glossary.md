# Glossary — Sajtmaskin

Kanonisk ordlista. **Korta entries.** Bara termer som är förväxlingsbenägna eller dyker upp i fler än en doc. Implementationsdetaljer hör hemma i fas-doc:n eller respektive plan.

> **Kod är source of truth.** Dök du på en term som inte står här? Grepa kodbasen — och om termen är i kod fler än en gång, lägg en kort rad här.

Övriga referenser: terminologi-snabbtabell `.cursor/rules/terminology.mdc` · signal-ägarmatris `llm-signal-flow.md` · fasflöden `fas{1,2,3}-*.md` · målbild `llm-flow-target-worldclass.md`.

---

## Promptsteg

| Typ | Vad | Fas |
|-----|-----|-----|
| Init / Create-chat | Första generering — hela orkestreringskedjan | 1→2→3 |
| Follow-up | Ändringsförfrågan i existerande chat — återanvänder scaffold/variant/quality | 1→2→3 |
| Deep Brief | LLM-anrop som producerar strukturerad sajtbrief (`site-brief-generation.ts`); injiceras i prompten via `buildDynamicContext()` (genereras inte där) | 1 |
| Server Auto-Brief | Fallback om klient inte skickade brief | 1 |
| Snapshot-Brief | Minimal brief rehydrerad från `orchestration_snapshot.briefSummary` på follow-up | 1 |
| Plan Mode | Planner-LLM som returnerar plan (JSON), inte sajtkod | 1→2 |
| Repair | LLM-fix efter genereringsfel; mekanisk autofix kommer först | 3 |
| Verifier Pass | Hybrid-pass: deterministiska guardrails + read-only LLM-granskning som producerar findings | 2/3 |
| Clarification | Agent ställer motfråga via `askClarifyingQuestion`-tool | 1 |

---

## Fas 1 — Före orkestrering

| Term | Kort |
|------|------|
| Raw Prompt | Obearbetad användarprompt. |
| Prompt Formatting | `formatPrompt()` minimal MÅL/TILLGÄNGLIGHET-wrapper. Borttagen från `useCreateChat`-init 2026-04-28; lever kvar i prompt-wizard och `prompt-assist/runner`. |
| Brief (`meta.brief`) | Strukturerat JSON-objekt (~24 fält). Schema: `siteBriefSchema`. `briefQuality`: `full` / `server-auto` / `none`. |
| Deep Brief | LLM-genererad sajtbrief, init-only. UI-flaggor: `canUseDeepBrief = !chatId`, `forceDeepBrief` (kall-option), `useDeepBrief` (lokal), `deepBriefEligible` (per-modell, OpenAI assist). |
| Snapshot-Brief | `buildFollowUpBriefFromSnapshot` — hydreras från `briefSummary` på follow-up. |
| Brief Guidance Override | Brief-fält (`domainProfile`, `motionLevel`, `qualityBar`, `seasonalHints`) som overridar deterministisk inferens. |
| Variant Pre-Match | Snabb keyword-only scaffold+variant-match (~1ms) före brief-generering. Producerar `VariantHints`. |
| Build Intent | `template` / `website` / `app`. |
| Build Method | `wizard` / `category` / `audit` / `freeform` / `kostnadsfri` — entry-källa. |
| Generation Mode | `init` / `followUp`. |
| Follow-up Intent | `clear-refine` · `clear-redesign` · `ambiguous-redesign` · `ambiguous-followup` · `neutral` · `capability-add` · `capability-modify`. Källa: `follow-up-intent-types.ts`. |
| Build Profile | `fast` · `pro` · `max` · `codex` · `anthropic` — UI-tier för codegen. |
| Generation Phase | `planner` · `generator` · `fixer` · `verifier` · `deploy-assistant` — per-fas modellrouting. |
| Core Rules | Oföränderliga produktregler i `config/prompt-core/*.md` (laddas via `codegen-core-manifest.json` → `static-core-loader.ts` → `composeEngineSystemPrompt`). Alias: *static core*, *statisk prompt*. |
| Per-Request Signal Cascade | EXPLICIT (brief-fält) > INDICATED (brief-LLM) > INFERRED (heuristik) > DEFAULT (variant) > FALLBACK (statiska). |

---

## Fas 2 — Orkestrering och byggnation

Scaffold-val → route plan → contracts → BuildSpec → dynamic context → system prompt → generation.

| Term | Kort |
|------|------|
| Orchestration Base | Resolved scaffold + route plan + contracts + BuildSpec. Källa: `resolveOrchestrationBase()` i `orchestrate.ts`. |
| Finalized Orchestration | Dynamic context + engineSystemPrompt färdiga (`finalizeOrchestrationPrompts`). |
| Scaffold | Runtime-startpunkt (9 st). Metadata i `manifest.ts`, filer under `files/`. |
| Scaffold Variant | Visuellt uttryck inom scaffold: typsnitt, motif, theme tokens, prompt hints. Lås:as via `persistedVariantId` på follow-up. |
| Variant-Lock | Scaffold-variant väljs deterministiskt vid init och låses för follow-ups inom samma chat. |
| Capability (dossier) | Sträng i `brief.requestedCapabilities`. 1:1 mot dossier (default-tie-break via `defaultForCapability`). |
| Route Plan | IA/ruttlista. Provenance: brief > scaffold > prompt. |
| Contract Plan | Auth, payment, database, env vars, integrations. |
| BuildSpec | Runtime-körpolicy från `deriveBuildSpec()` i `gen/build-spec/`. Fält: `changeScope`, `qualityTarget`, `contextPolicy`, `verificationPolicy`, `previewPolicy`, `tokenBudgets`, `routeRealization`, `stylePack`, `forbiddenPatterns`. |
| Dynamic Context | Request-specifik promptdel byggd i `buildDynamicContext()`. Prunad mot tokenbudget. |
| System Prompt | Core Rules + separator + Dynamic Context. |
| Generation Package | Kanonisk fan-in: systemPrompt + dynamicContext + pruning + lineageHash. |
| Design Priority | Hierarki: user-locked theme → brief → variant defaults → scaffold CSS baseline. |
| shadcn primitive | Lokal `src/components/ui/*`-komponent som importeras från `@/components/ui/<subpath>`. Synkas/guardas via `SHADCN_COMPONENTS` + `npm run shadcn:sync`; ingår i `## Your Toolkit`. |
| UI Recipe | Request-specifik shadcn registry-referens från `shadcn-ui-recipes.ts`: metadata, dependencies och kompakta filutdrag. Ersätter gamla `Component References`/`data/shadcn-examples`-vägen. |
| Dossier | Återanvändbar capability-modul som injiceras i codegen-prompten. Klass: `hard` (env-secrets) / `soft`. Fidelity: `verbatim` / `rewritable`. Källa: `data/dossiers/{hard,soft}/<id>/`. |
| `promptInstructionMode` | Per-dossier-manifestfält som styr hur mycket av `instructions.md` som når prompten: `compact` (default, manifest-deriverad summary) / `selected-sections` / `full`. Renderas i `system-prompt/sections/dossiers.ts`. |
| `selectedDossierIds` | Stream-meta-fält med exakt dossier-id-lista från orchestration. Primär källa för finalize/verbatim-policy; `requestedCapabilities` är fallback/autofix-signal. |

---

## Fas 3 — Repair, verifiering, quality gate

`FixCategory = "mechanical" | "llm"`. Skriv aldrig bara "autofix" — säg **mekanisk autofix** eller **LLM-fix**.

| Term | Kort |
|------|------|
| Mekanisk autofix | Pipeline av deterministiska fixers (`autofix/pipeline.ts`). |
| LLM-fix | `runLlmFixer`-anrop när mekaniken inte räcker. Eskaleras medvetet. |
| Validate and Fix | Syntax → progressiv mekanisk→LLM→mekanisk fix-loop. |
| Finalize | Samlad pipeline: URL-expansion → autofix → validate → image materialize → ev. verifier → save. |
| Finalize Path | `FinalizePathPolicy { runDeepPath: boolean, reason }` i `stream/finalize-version/policy.ts`. Telemetri: `runDeepPath: true → "full"`, `false → "light"`. `light` skippar image/verifier; repair-pass tvingar deep. |
| Preflight | Teknisk kontroll inför preview: routing, filkonsistens, blocking. Symbol: `runFinalizePreflight()`. |
| Verifier Pass | Hybrid: deterministiska guardrails + read-only LLM-granskning. Blocking-fynd → `runLlmFixer` → re-run 1×. |
| Quality Gate | Binärt pass/fail. Två lanes: `designPreview` (F2, `["typecheck"]`) och `integrationsBuild` (F3, `["typecheck", "build", "lint"]`). |
| Repair Loop Core | `runRepairLoop` — delad kärna för server-verify och manuell `/repair`. |
| Warm Repair | Targeted repair där bara trasiga filer (+ imports) skickas till LLM-fixer. |
| Repair Available | Versionstatus när serverrepair passerat quality gate men väntar på explicit accept. |
| Engine Version Lifecycle | `draft` → `verifying` → `repairing` → `repair_available` / `failed` / `promoted`. |
| Element Preservation Guard | Skydd mot att follow-up tappar high-value-element (`<video>`, `<canvas>`, `<iframe>`, R3F `<Canvas>`, Rapier `<Physics>`). |
| Codegen-eval `Surface/Final` | Eval-rapportens filräkning: `surface` = LLM-emitterad app-yta filtrerad från supportpaths; `final` = komplett körbart Next-projekt efter scaffold/finalize. |
| FaultEvent | Normaliserad läsmodell för befintliga fel-/fix-källor (`FixEntry`, error-log RAG, verifier-fynd, recurring patterns). Kan bära `routePath`, `capabilityIds` och `generationMode` för RAG-rerank. Adapterkontrakt, inte ny event-bus. |
| Fault promotion candidate | Read-only gruppering från `npm run faults:report` som visar återkommande fault patterns. Kolumnen `recommendedPromotion` använder interna taggar från `fault-promotion-report.ts` (t.ex. `mechanical-fixer-or-core-rule`, `scaffold-or-variant-fix`, `investigate`). |
| EngineEvent / event-bus | OMTAG-06 append-only event-stream per `versionId`. `EngineEventType`-union i `src/lib/logging/event-bus-types.ts` täcker `version.started`/`autofix.result`/`syntax.pass`/`preflight`/`verifier.done`/`repair.*`/`saved`/`build.error`/`degraded`/`done`. Persisteras som NDJSON under `data/runs/<versionId>/<runId>/events.ndjson` + `.runs.json`-index. **Inte** samma som `FaultEvent` (read-modell för fel-RAG) — bus är runtime-livscykel, FaultEvent är historik-slå-upp. |
| VersionStatus | Projektion av en EngineEvent-ström via `selectVersionStatus()` i `event-bus-projection.ts`. Bär `phase`, `previewBlocked`/`verificationBlocked`, `repairPassIndex`, `lastBuildError`, `verifierOutcome`, `degradations[]`. Server-projektion serveras via `GET /api/engine/chats/[chatId]/version-status`; client-konsumeras via `useVersionStatus` (poll, stoppar på `done`/`failed`). Legacy DB-helpern `resolveEngineVersionDisplayStatus` (i `src/lib/db/engine-version-lifecycle.ts`) är **borttagen** (Område 6-3). Bus-projektionen är **primär**; sedan #337 reconcilar `/version-status` + `/versions` den dock mot terminalt DB-`verification_state` (`reconcileTerminalDbState`) och `/version-status` + `/readiness` delar en lease-säker stale-watchdog (`settleStaleVerificationIfNeeded` i `src/lib/gen/verify/`) så en död verify-runda aldrig fastnar på "verifying". Klienten (`useVersionStatus`) har ett poll-tak (`maxNonTerminalMs`). |
| VersionDegradationKind | Closed enum (`verifier_skipped_heavy_load` / `verifier_skipped_by_policy` / `product_postcheck_skipped` / `product_postcheck_blocked`) för "works but degraded"-events. Emitteras via `version.degraded` på event-bus när en quality-gate hoppades — eller när F2-postchecken körde men hittade blockerande produktfel (`product_postcheck_blocked`) — men pipelinen i övrigt lyckades. Surfas i `VersionStatus.degradations` och i `backoffice/pages/llm_flode_telemetry.py` (`_render_degradations`). Lägg INTE till nya kinds utan både emitter och UX-konsument. |
| Fault promotion candidate | Read-only gruppering från `npm run faults:report` som visar återkommande fault patterns. Kolumnen `recommendedPromotion` använder interna taggar från `fault-promotion-report.ts` (t.ex. `mechanical-fixer-or-core-rule`, `scaffold-or-variant-fix`, `investigate`). |

---

## Preview / VM / F2-F3

| Term | Kort |
|------|------|
| VM / `preview_host` | Primär tier-2 live-preview via Fly.io. |
| Fidelity 2 (F2) | `previewPolicy: fidelity2` (design-loopen, install + dev). Default. |
| Fidelity 3 (F3) | `previewPolicy: fidelity3` (integrationer, install + build + dev). Triggas explicit via `POST /finalize-design`. |
| LifecycleStage | `"design"` (F2) eller `"integrations"` (F3). Persisteras i `engine_versions.lifecycle_stage`. F3 pekar på sin F2-fork via `parent_version_id`. |
| F2 render-first advisory | I F2 (`design`) failar ett typecheck-*only*-fel med **advisory-safe diagnostik** inte versionen. Regelägare: `isTypecheckOnlyAdvisory()` (`quality-gate-checks.ts`), delad av `quality-gate`-routen och bakgrunds-`server-verify` så vägarna aldrig är oense. Semantiska typfel (TS2322/TS2339/…) är advisory; modul-/export-resolution (`RENDER_RISK_TS_CODES`: TS2304/2305/2307/…) och oparsebar output failar hårt (bryter `next dev` också). Routen promotar och svarar `{ passed: true, vmGatePassed: false, designAdvisory: true }` (ingen auto-repair i `post-checks.ts`); server-verify försöker promota FÖRE terminal-emit och emitterar ingen terminal bus-händelse vid promote-no-op. Båda vägarna emitterar `version.degraded {typecheck_advisory}` → status visar "klar med varningar", aldrig solid grön. Build/lint/verifier/promote-guard förblir hårda; F3 kör alltid `typecheck+build+lint` hårt. |
| Tier-3 Integration | Integration vars env-keys måste ha riktiga värden vid runtime (Stripe, DB, Redis, OpenAI). F3-gate blockar bara på `enforcement: "build"`. |
| F2 SDK Guard | Mekanisk fixer som strippar tier-3 SDK-imports från F2-output. Deny-lista: `config/integrations/tier3-sdk-deny.json`. |
| EnvVar enforcement | Per envVar i hard-dossier: `build` (default, krävs i F3) / `feature-runtime` (banner när nyckel saknas) / `warn-only` (self-disable). |
| Dossier F2/F3-gräns | Samma dossier kan spänna F2 och F3. F2 renderar en klient-/demo-/placeholder-safe version; F3 aktiverar riktig integration. Kanonisk signal i dagens kod (helper `dossierRequiresF3`, uppräknad via `getF3RequiredCapabilities`): `envVars`/`enforcement: "build"` ELLER en `files[].role: "server"`-fil (backend-wiring hör till F3 — t.ex. `resend-contact-form`/`mailchimp-newsletter`, vars formulär i F2 är visuell mockup). Ingen separat `hard/soft/visual`-taxonomi styr fasen; `envVars: []` + enbart klientfiler ⇒ fullt F2-användbar. |
| `allowPlaceholdersInF3` | Toggle på `project_data.meta`. När true: placeholder-täckta build-keys passerar F3-gaten med varning. |
| Preview ID-set | `appProjectId` = builder-projekt, `chatId` = own-engine chat/lane + preview-host path key, `versionId` = `engine_versions`-rad, `previewSessionId` = aktiv preview-session, `previewUrl` = publik preview-URL, `runId` = observability/logg-run. Legacy: `sandboxId`/`sandboxUrl` bara som kompatibilitetsalias. |
| Fast Edit Lane | Deterministisk snabbredigeringsväg (0 LLM) för exakta, användarutpekade ändringar (kodvy/filträd/inspector). Motor: `src/lib/gen/quick-edit/`. Route: `POST /api/engine/chats/[chatId]/quick-edit`. Flagga: `NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT`. Ingen prompt-tolkning, ingen gissning. |
| Preview patch (hot patch) | `POST /preview/session/patch` på preview-host: skriver bara ändrade filer i den levande VM-workspacen utan att starta om Next dev. Dependency/config-ändring tvingar full restart. Flagga: `SAJTMASKIN_PREVIEW_PATCH_LANE`. Skiljt från `update` (full ersättning + restart). |
| Minor-version | `engine_versions`-rad med `edit_kind = "quick_edit"` och `parent_version_id` = major-version. Visas som `v3.1`, `v3.2` under sin major i VersionHistory. Immutabel (rollback bevaras), ingen ny heltalslinje per småändring. |

---

## Stabilitet, kontrakt & planering

Kanoniska termer från grandmaster-planen (`docs/plans/avklarat/grandmaster/`, avklarad 2026-06-22).

| Term | Kort |
|------|------|
| Stabilitetstester | Kuraterad lane bredare än regression: större buggar **och** UX-invarianter (t.ex. att `åäö` renderas i builder-chatten). Tre lägen: lokalt `npm run test:stability`, på PR, vid push. Tidigare "regressionstester". Källa: `02-stabilitetstester.md`. |
| Kontraktslager | Fyra lätta pelare i `docs/contracts/`: **schema** (struktur/dataformat) · **policy** (värden/mappningar) · **regel** (process, i `.cursor/rules/`) · **beslut/ADR** (varför). Schema låser dataformat, inte planering. |
| Beslut (ADR) | Arkitekturbeslut med kort motivering i `docs/contracts/beslut/NNNN-*.md`. ADR = *Architecture Decision Record*. Ingen merge-blockerande ADR-stapel (anti-Sajtbyggaren). |
| False-green (falskt grönt) | Systemet rapporterar pass/grönt fast runtime/verifiering inte stödjer det (placeholder som ser ut som success, autofix-stub, F2 fail-open). Hellre explicit `degraded`/blocker än tyst success. Härdning: `07-false-green-hardning.md`. |
| Plan-nivåmodell | Nivå 1 = målbild/index (`00-master-plan.md`) · nivå 2 = område · nivå 3 = byggar-agent-körbar aktivitet med smal `owner_files`, skapas just-in-time. Regel: `.cursor/rules/plan-lifecycle.mdc`. |

---

## Namnskuggor

Samma ord, flera kontexter. Skriv full term när det finns risk för missförstånd.

| Tvetydigt ord | Kontext A | Kontext B | Skriv |
|---------------|-----------|-----------|-------|
| `brief` | Deep Brief-objektet | "kort sammanfattning" | "Deep Brief" / "snapshot-brief" |
| `scaffold` | ScaffoldManifest (data) | Scaffold Selection (process) | full term |
| `context` | Dynamic Context (prompt-block) | generellt "kontext" | Stor bokstav: "Dynamic Context" |
| `contracts` | Contract Plan (integrations) | Orchestration Contract (bindemedel) | full term |
| `quality gate` | Finalize quality gate | Preview quality gate (verify lane) | "finalize" / "preview" quality gate |
| `preflight` | `runFinalizePreflight()` | generellt "förkontroll" | Stor bokstav: "Preflight" |
| `autofix` | Mekanisk pipeline (`FixCategory: mechanical`) | LLM-reparation (`FixCategory: llm`) | Skriv **mekanisk autofix** eller **LLM-fix**. Sandwich-mönstret (mekanisk → LLM → mekanisk → re-validera) körs i `validate-and-fix.ts` (per pass), `repair-loop.ts` (per pass, pre-LLM bara vid entry) och `partial_file_repair` (post-LLM per attempt; pre-LLM ärvs från finalize-pipens `autofix`-steg). Pre-LLM hoppas över på `alreadyMechanicallyFixed: true`; post-LLM hoppas över när LLM:en returnerar noop. Detaljer: [`llm-pipeline.md`](./llm-pipeline.md) § FAS 2 (finalize-pipeline / repair-gate). |
| `template-library` | Legacy artefakt-pipeline (deprecated) | builderns Mallar-tab eller scaffolds | undvik — använd "scaffold" eller "Mallar-tab" |
| `shadcn` | UI primitives och registry items | Sajtmaskin-scaffold eller dossier | skriv `shadcn primitive`, `UI Recipe`, `Scaffold` eller `Dossier` |
| `3D` / `game` | Dekorativ 3D (`visual-3d` / `physics-3d`) — `<Canvas>` som rör sig men ingen state/win/lose | Spelbar mini-game (`interactive-game` / `interactive-game-loop`) — state + loop + controls + collision + score + restart | full capability-id: `visual-3d` (decorative) · `physics-3d` (rigid bodies) · `interactive-game` (playable mechanic) |

---

## Legacy / inte återintroducera

| Term | Ersättare |
|------|-----------|
| AI Gateway / `AI_GATEWAY_API_KEY` | Direkt provider (OpenAI/Anthropic) |
| Vercel Sandbox (som primär preview) | VM / `preview_host` |
| `demoUrl` | `previewUrl` |
| `simplifiedBriefSchema` / `StructuredBrief` | `siteBriefSchema` / Brief |
| Spec-first-kedjan (`WebsiteSpec`, `processPromptWithSpec`, `briefToSpec`, `/api/ai/spec`, `specMode`) | Deep Brief |
| `Prompt Rewrite` / `Prompt Polish` / `Prompt Assist` (paraply) | Deep Brief |
| `Directives` / `Directive Cascade` | "Per-Request Signal Cascade" + `prompt-core/03-04` |
| `qualityGateTiers.tier2` / `serverVerify` / `promotion` | `designPreview` / `integrationsBuild` |
| `template-library` runtime-pipeline | Dossier-pipeline (`gen/dossiers/`) |
| `content-site` (scaffold) | Slagen ihop med `landing-page` |
| `RELEASE_CANDIDATE_PATTERNS` | F3 är explicit knapp |
| `sandbox` (generell term) | VM / `preview_host` |

---

## Domän → mappstruktur

| Domän | Primär plats |
|-------|-------------|
| Orchestration | `gen/` rot + `gen/orchestrate/` |
| Prompt assembly | `gen/system-prompt/` |
| BuildSpec | `gen/build-spec/` |
| Scaffold-data + matching | `gen/scaffolds/` |
| Scaffold-varianter | `gen/scaffold-variants/` |
| Dossiers | `gen/dossiers/` (+ data i `data/dossiers/{hard,soft}/`) |
| Autofix / repair | `gen/autofix/` |
| Finalize-pipeline | `gen/stream/finalize-version/` |
| Verifiering / quality gate | `gen/verify/` |
| Preview | `gen/preview/` |
| Deploy / Vercel API | `lib/deploy/` + `lib/vercel/` |

---

**Detaljerad ändringshistorik:** `git log -- docs/architecture/glossary.md`. Filen ska bara visa **det som är aktuellt** — inte berättelsen om hur vi kom hit. För ord/termer som inte längre står här: grepa repot eller läs respektive plan i `docs/plans/`.

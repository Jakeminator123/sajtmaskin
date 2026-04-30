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
| Dossier | Återanvändbar capability-modul som injiceras i codegen-prompten. Klass: `hard` (env-secrets) / `soft`. Fidelity: `verbatim` / `rewritable`. Källa: `data/dossiers/{hard,soft}/<id>/`. |

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
| Fault promotion candidate | Read-only gruppering från `npm run faults:report` som visar återkommande fault patterns och föreslår om de bör bli mekanisk fixer, Core Rule, dossier/scaffold-fix eller fortsatt utredning. |

---

## Preview / VM / F2-F3

| Term | Kort |
|------|------|
| VM / `preview_host` | Primär tier-2 live-preview via Fly.io. |
| Fidelity 2 (F2) | `previewPolicy: fidelity2` (design-loopen, install + dev). Default. |
| Fidelity 3 (F3) | `previewPolicy: fidelity3` (integrationer, install + build + dev). Triggas explicit via `POST /finalize-design`. |
| LifecycleStage | `"design"` (F2) eller `"integrations"` (F3). Persisteras i `engine_versions.lifecycle_stage`. F3 pekar på sin F2-fork via `parent_version_id`. |
| Tier-3 Integration | Integration vars env-keys måste ha riktiga värden vid runtime (Stripe, DB, Redis, OpenAI). F3-gate blockar bara på `enforcement: "build"`. |
| F2 SDK Guard | Mekanisk fixer som strippar tier-3 SDK-imports från F2-output. Deny-lista: `config/integrations/tier3-sdk-deny.json`. |
| EnvVar enforcement | Per envVar i hard-dossier: `build` (default, krävs i F3) / `feature-runtime` (banner när nyckel saknas) / `warn-only` (self-disable). |
| `allowPlaceholdersInF3` | Toggle på `project_data.meta`. När true: placeholder-täckta build-keys passerar F3-gaten med varning. |

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
| `autofix` | Mekanisk pipeline | LLM-reparation | **mekanisk autofix** / **LLM-fix** |
| `template-library` | Legacy artefakt-pipeline (deprecated) | builderns Mallar-tab eller scaffolds | undvik — använd "scaffold" eller "Mallar-tab" |

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

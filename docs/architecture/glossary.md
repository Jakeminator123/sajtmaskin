# Glossary — Sajtmaskin Terminology

Kanonisk ordlista. Navigationshjälp, inte en ersättning för att läsa koden.

**Kod är alltid source of truth.** Behöver du kodsymbol eller filsökväg — grepa. Behöver du pipeline-detaljer — se `docs/architecture/scaffold-system.md`.
**Användare, LLM:er och docs kan ha fel eller vara inaktuella.** Vid tvekan: verifiera mot koden innan du döper om, förenklar eller drar slutsatser.

Snabb förväxlingstabell: `.cursor/rules/terminology.mdc`.
Signallagrens tabell: `docs/schemas/orchestration-signal-contract.md`.

---

## Strategi

### Principer

1. **En term per koncept.** Två namn för samma sak → bara ett kanoniskt.
2. **Kod vinner över docs.** Etablerade kodsymboler slår docs-namn.
3. **Docs-only-termer måste motiveras** — mappa till kod eller fasa ut.
4. **Sammansatta samlingsnamn undviks.** `PostChecksAndQualityGate` → Post-Checks + Quality Gate.
5. **Fasindelning styr.** Varje term ägs av fasen där den skapas.

### Livscykelstatus

| Status | Betydelse |
|--------|-----------|
| **kanonisk** | Korrekt term i ny kod och nya docs |
| **alias** | Accepterat alternativnamn; inte i nya sammanhang |
| **legacy** | Bör fasas ut; ny kod ska använda kanonisk term |
| **döda** | Ska inte användas alls |

### Uppdateringspolicy

- Ny term → lägg till med status, fas och kort förklaring.
- Term byter betydelse → markera gammal som legacy, ny rad.
- Term försvinner ur kod → markera legacy/döda.
- Sammanslagningsregel: ≥80 % överlapp → slå ihop till en.

---

## Prompttyper och anropsklasser

| Typ | Vad det är | Fas |
|-----|-----------|-----|
| **Create-chat (init)** | Första generering — hela orkestreringskedjan körs | 1→2→3 |
| **Follow-up** | Ändringsförfrågan i befintlig chat — konservativ, återanvänder scaffold | 1→2→3 |
| **Deep Brief** | LLM genererar strukturerad sajtbrief. Expanderas server-side i `buildDynamicContext()`. | 1 |
| **Plan Mode** | Planner-LLM som returnerar plan (JSON), inte sajtkod | 1→2 |
| **Repair (fas 3)** | Efter fel i genererad kod: först mekaniska autofixar, vid behov LLM-fix | 3 |
| **Verifier Pass** | Read-only LLM-granskning, producerar findings | 3 |
| **Clarification** | Agent ställer motfråga istället för att generera | 1 |

**Viktiga skillnader:**
- **Init vs Follow-up:** Init bygger allt från scratch. Follow-up återanvänder scaffold, fryser routes, wrappar med filkontext.
- **Brief → Dynamic Context:** Deep Brief genererar ett strukturerat objekt som `buildDynamicContext()` expanderar till system-prompt-block (domain, motion, quality bar, project context, etc.).
- **Repair vs Follow-up:** Repair arbetar med felloggar, inte ny användarförfrågan.

---

## Fas 1 — Före orkestrering

Tolkning, förbättring och strukturering av prompt; modellval; intent-klassificering.

| Term | Vad det är | Status |
|------|-----------|--------|
| Raw Prompt | Obearbetad prompttext | kanonisk |
| Prompt Formatting | Minimal wrapper (MÅL + TILLGÄNGLIGHET). Fallback — körs bara utan brief. | kanonisk |
| ~~Prompt Rewrite~~ | LLM-driven förbättring (Förbättra). Borttagen — ersatt av Deep Brief → server-side expansion. | **borttagen** |
| ~~Prompt Polish~~ | Lätt copy-editor (Skriv om). Borttagen — ersatt av Deep Brief → server-side expansion. | **borttagen** |
| Prompt Orchestration | Strategi-/budget-/trunkerings-gate; väljer PromptStrategy | kanonisk |
| Prompt Strategy | `direct`, `phase_plan_build_refine`, `preserved` | kanonisk |
| Prompt Type | `wizard`, `freeform`, `technical`, `app`, `template`, etc. | kanonisk |
| Brief (`meta.brief`) | Strukturerat JSON-objekt (~24 fält: projectTitle, pages[], visualDirection, toneAndVoice, imagery, seo + designguidance-fält). Bär designintention. Genereras av LLM via `/api/ai/brief` (init) eller `tryGenerateServerAutoBrief` (server-fallback). `briefQuality`: `"full"`, `"server-auto"`, eller `"none"`. Follow-ups skickar inte brief — kontext via orchestration snapshot istället. | kanonisk |
| Brief Guidance Override | Brief-LLM-producerade designfält (`domainProfile`, `motionLevel`, `qualityBar`, `seasonalHints`) som overridar deterministisk inferens i `guidance-resolvers.ts`. Brief-explicit slår heuristik som slår statiska defaults i `prompt-core/`. Alla nya fält optionella — bakåtkompatibelt. | kanonisk |
| Variant Pre-Match | Snabb deterministisk keyword-only scaffold+variant-matchning (~1ms) som körs *före* brief-generering i `create-chat-stream-post.ts`. Producerar `VariantHints` som injiceras i brief-prompten. Den riktiga selektionen körs fortfarande i `resolveOrchestrationBase`/`finalizeOrchestrationPrompts` med full kontext. | kanonisk |
| Variant Hints | Kompakt sammanfattning av variant-defaults (colorMode, signatureMotif, fontPairing, promptHints, styleRules) som ges till Brief-LLM:en som startpunkt. `src/lib/gen/scaffold-variants/variant-hints.ts`. | kanonisk |
| Deep Brief | UI-term för brief-generering. Samma datatyp som Brief. `canUseDeepBrief` = `!chatId` (bara på init). Togglen `promptAssistDeep` i header styr om LLM-brief körs. | kanonisk |
| Server Auto-Brief | Server-side brief-fallback (`tryGenerateServerAutoBrief`) som körs av `create-chat-stream-post` om klient inte skickade `meta.brief`. `briefQuality: "server-auto"`. Avstängs för audit, follow-up, tekniska payloads. | kanonisk |
| Fallback Brief | Deterministisk minimal brief utan LLM (variant-defaults + prompt-heuristik). Planerad men ej implementerad. | planerad |
| Delta-Brief | Partiell brief-uppdatering vid `clear-redesign` follow-ups. `classifyFollowUpIntent() === "clear-redesign"` → kör `tryGenerateServerAutoBrief` med redesign-prompt + `priorDesignContext` (från `briefSummary` i snapshot) + variant-hints (pre-match). Ger Kod-LLM:en strukturerad designkontext vid redesigns istället för rått textmeddelande. | kanonisk |
| Shallow / Prompt-only | Inget brief-objekt. Prompten wrappas av `formatPrompt()` (MÅL/TILLGÄNGLIGHET) och nyckelord extraheras heuristiskt av `buildDynamicInstructionAddendumFromPrompt()`. Legacy-fallback. | kanonisk |
| ~~WebsiteSpec / SajtmaskinSpec~~ | Spec-first LLM-genererat strukturobjekt. `specMode` default false sedan Fas 1 världsklass. | **legacy** |
| Build Intent | `template \| website \| app` — vad användaren vill bygga | kanonisk |
| Build Method | `wizard \| category \| audit \| freeform \| kostnadsfri` — hur entry skedde | kanonisk |
| Generation Mode | `init \| followUp` | kanonisk |
| Follow-up Intent | `clear-refine \| clear-redesign \| ambiguous-redesign \| ambiguous-followup \| neutral` från `classifyFollowUpIntent` (regex-only). `lockedVariantForFollowUp` håller scaffold-varianten stabil mellan v1→v2 om intent ≠ `clear-redesign`. `inheritQualityTargetFromPriorVersion` arvslår om-räkningen av `qualityTarget` på follow-ups. | kanonisk |
| Plan Mode | Planner-LLM med plan-artefakt; PlanPhase: plan, build, refine, verify, done | kanonisk |
| Build Profile | `fast`, `pro`, `max`, `codex`, `anthropic` — UI-tiername för codegen | kanonisk |
| Generation Phase | `planner`, `generator`, `fixer`, `verifier`, `deploy-assistant` — per-fas modellrouting | kanonisk |
| Per-Tier Policy Fields | `perTierTimeouts`, `perTierRepairPolicies`, `perTierBriefing` i `config/ai_models/manifest.json` (sedan 2026-04-20). Tier-differentierade `engineRouteMaxDurationSeconds`/`verifierTimeoutMs`, `deterministicAutofixPasses`/`syntaxFixPasses`/`serverRepairPasses`, samt `briefingModel`. Snabb cap:as på 180s + `gpt-5.2` brief, Tanker får 800s + 240s verifier-timeout + `gpt-5.4`. Gamla globala fält behålls som fallback tills accessor-funktioner använder per-tier-fälten. | kanonisk |
| Thinking | Reasoning-flagga, inte en separat lane | kanonisk |
| Core Rules | Oföränderliga produktregler från `config/prompt-core/*.md` (stack, format, beteende, a11y, import, visuell baseline, content voice). Läses av `static-core-loader.ts` via `config/codegen-core-manifest.json`. Ersätter "Static Core". Sedan 2026-04-18 ingår även `03-visual-design.md` och `04-coding-direction.md` som tidigare låg i den borttagna directive-cascaden. | kanonisk |
| Static Core | Alias för Core Rules. Legacy-term — använd "Core Rules" i nya sammanhang. | alias |
| Per-Request Signal Cascade | Prioritetsordning för designsignal: (1) brief explicit (colorPalette, typography, mustHave), (2) brief inferred (domainProfile, motionLevel, qualityBar), (3) guidance-resolvers heuristik, (4) statiska defaults i `prompt-core/`. Renderas i `## Design Priority`-blocket. Ersätter den tidigare "Directive Cascade" som hade en aspirationell substitutionsmotor som aldrig användes. | kanonisk |
| ~~Directives~~ | Adaptiv promptmodul-katalog `config/prompt-directives/*.md` + `directive-loader.ts`. **Borttagen 2026-04-18**: bara 2 av 12 filer injicerades runtime. Innehållet flyttat till `prompt-core/03-visual-design.md` + `prompt-core/04-coding-direction.md`. Per-request signal lever i brief, scaffold-variant och guidance-resolvers. | **borttagen** |
| ~~Directive Cascade~~ | 4-nivå resolution-modell. **Borttagen 2026-04-18** tillsammans med directive-katalogen. Ersatt av "Per-Request Signal Cascade". | **borttagen** |
| ~~Prompt Assist (paraply)~~ | Otydligt samlingsnamn. Rewrite/Polish/model-picker borttagna. Deep Brief lever kvar. | **borttagen** |
| ~~StructuredBrief~~ | Docs-synonym för Deep Brief | **döda** |
| ~~simplifiedBriefSchema~~ | Borttaget brief-schema med 34 optionals, failade Anthropic >24 | **döda** |
| ~~gateway (provider-etikett)~~ | Historisk synonym för "openai" i PromptAssistProvider. Nu `"openai"`. | **döda** |
| ~~summarize (PromptStrategy)~~ | Aldrig producerad strategi, borttagen ur typen | **döda** |

---

## Fas 2 — Orkestrering och byggnation

Scaffold-val → route plan → contracts → BuildSpec → dynamic context → system prompt → generation.

| Term | Vad det är | Status |
|------|-----------|--------|
| Orchestration Input | Alla inputs till orkestreraren | kanonisk |
| Orchestration Base | Löst scaffold + route plan + contracts + BuildSpec | kanonisk |
| Finalized Orchestration | Dynamic context + engineSystemPrompt färdiga | kanonisk |
| Scaffold | Runtime-startpunkt (10 st). Metadata i manifest.ts, filer under files/ | kanonisk |
| Scaffold Selection | Keyword+capability-boost → embedding challenge | kanonisk |
| Scaffold Mode | `off \| auto \| manual` | kanonisk |
| Scaffold Serialize Mode | `structural \| inspirational`. Init→inspirational, followUp/heavy→structural | kanonisk |
| Scaffold Variant | Visuellt uttryck inom scaffold: typsnitt, motif, theme tokens, prompt hints. `variantId` bevaras i orchestration snapshot och återanvänds vid follow-up för att förhindra variant-drift. | kanonisk |
| Variant Structural Files | Init-only kodreferenser från variantens sourceTemplateIds + capability-driven | kanonisk |
| Variant Signature Patterns | `signaturePatterns` per variant: `{ layouts[], motifs[], antiPatterns[] }`. Konkret visuell guidance som ersatte de fyra borttagna generiska guidance-fälten 2026-04-17. Fylls i av `scripts/scaffolds/auto-curate-variant-patterns.ts` (GPT-5.4 + Zod). Renderas i `## Scaffold Variant`-blocket. | kanonisk |
| Variant Embedding Pick | `pickScaffoldVariantAsync()` — embedding-driven variant-selection som faller graciöst tillbaka till keyword `pickScaffoldVariant` när embeddings/API-key saknas. Existerar i orchestrate.ts som fallback. **Sedan 2026-04-18 låser create-chat det keyword-baserade pre-match-resultatet via `persistedVariantId`**, så async-pickaren körs i praktiken endast när låsningen missas (id stale, plan-mode, eval-runner). Detta håller brief-LLM-hints och codegen synkade på samma variant. | kanonisk |
| Capability Map | Snabb klassificering: auth, ecommerce, forms, 3D, motion, charts, **physics** (sedan 2026-04-20: `needsPhysics` triggas av "åker omkring/svävar/flyger/gravity/kolliderar/fysik" och kräver `@react-three/rapier` med `<Physics>` + `<RigidBody>` ovanpå `needs3D`) | kanonisk |
| Motion-Reduce Trap | Anti-mönster där generatorn applicerar `motion-reduce:hidden` på hela `<Canvas>` eller fixed-overlay-wrapper utan `motion-safe:`-fallback → 3D-lagret blir `display:none` när användaren har prefers-reduced-motion. Verifier:s `checkMotionReduceTrap` (sedan 2026-04-20) ger blocking-finding och capability-inference instruerar nu explicit `motion-safe:` på inre mesh istället. | kanonisk |
| Locale Alternate Routes | `/contact`↔`/kontakt`, `/about`↔`/om`, `/services`↔`/tjanster`. `deduplicateLocaleAlternateRoutes` (sedan 2026-04-20) i `route-plan.ts` behåller den som matchar projektets resolved locale (default `sv`). | kanonisk |
| Route Plan | Planerad IA/ruttlista. Provenance: brief > scaffold > prompt | kanonisk |
| Route Realization | Policylager: vilka routes realiseras i denna generation | kanonisk |
| Contract Plan | Auth, payment, database, env vars, integrations | kanonisk |
| Build Policy / BuildSpec | Runtime-körpolicy härledd per request av `deriveBuildSpec()`. Fält: `changeScope` (copy/local-layout/redesign/...), `qualityTarget`, `contextPolicy` (light/normal/heavy), `verificationPolicy`, `previewPolicy`, `tokenBudgets`, `routeRealization`, `stylePack`, `forbiddenPatterns`. Inte en fil — ett internt objekt som styr *hur* generering körs, inte *vad* som genereras. | kanonisk |
| Finalize Path | Telemetrietikett för finalize-läge: `full` (hela kedjan) eller `light` (skippar image/verifier) | kanonisk |
| Orchestration Contract | Binder scaffold→routes→valideringsförväntningar | kanonisk |
| Design Priority | Explicit hierarki i dynamisk kontext: (1) user-locked theme, (2) brief, (3) variant defaults, (4) scaffold CSS baseline. Löser prioritetskonflikt mellan designkällor. `required: true`, priority 89. | kanonisk |
| Dynamic Context | Request-specifik promptdel byggd i `buildDynamicContext()`: scaffold + routes + contracts + brief + tema + guidance-resolvers + tier-3 design/integrations-block. Prunad mot tokenbudget. | kanonisk |
| System Prompt | Core Rules + Dynamic Context (sedan directive-cascade-borttaget 2026-04-18). | kanonisk |
| Generation Package | Kanonisk fan-in: systemPrompt + dynamicContext + pruning + lineageHash | kanonisk |
| Your Toolkit | Scaffold-medveten shadcn-sammanfattning i prompten. Primära komponentgrupper per scaffold (via `SCAFFOLD_PRIMARY_GROUPS` + variant `sectionInventory`), sedan "also available". + capability-hints. | kanonisk |
| Google Font Registry | Central fontdatapost (`src/lib/gen/data/google-font-registry.ts`): ~75 fonts med importnamn, displaynamn, CSS-variabel, kategori. Används av font-import-fixer (autofix) och font-hint i systemprompten. | kanonisk |
| Component References | Tre lager: lokala exempel, officiellt register, community-registries | kanonisk |
| Agent Tools | Tool-definitioner för planner/agent-flöden | kanonisk |
| Template-Library | Kuraterad referensartefakt byggd från externa Vercel-templates | kanonisk |
| Dossier | Build-time researchartefakt per extern template | kanonisk |
| Scaffold-Variant Inventarium | Beslutsunderlag i [`docs/architecture/scaffold-system.md`](./scaffold-system.md) — per-scaffold och per-variant tabell med kvalitet och förslag på cleanup. Inte runtime-data. | kanonisk |
| ~~Capability Pack~~ | Borttaget. `buildCapabilityHints()` täcker behovet. | **borttaget** |
| ~~Enhancement Pack~~ | Borttaget. Prompts styr via static core. | **borttaget** |
| ~~DynamicContextAssembly~~ | Docs-synonym | **döda** |
| ~~OwnEngineGenerator~~ | Docs-namn utan kodsymbol | **döda** |

---

## Fas 3 — Repair, verifiering och quality gate

### Mekanisk autofix vs LLM-fix (två separata spår)

Kodtypen `FixCategory` är `"mechanical" | "llm"` (`src/lib/gen/autofix/types.ts`). Alla fixar loggas som `FixEntry` med `category` så telemetri och rapporter kan skilja dem.

**Mekanisk autofix** — deterministiska steg (regex/AST/heuristik) som körs i en **pipeline av många små fixers**, inte en enda funktion som "formaterar om hela repot". Exempel på inriktning: import-validering, JSX-kontroller, metadata/cn-imports, typsnitt, scroll-smooth, lucide, m.m. (`src/lib/gen/autofix/pipeline.ts` och undermappar). Arbetar på **genererat projektinnehåll** i finalize-flödet, inte på godtycklig hel-repo omformatering. Framtida design: en preflight- eller validerings-signal kan i princip routas till **en** namngiven mekanisk fixer — det är inte samma sak som en global typografi-normalisering av all text.

**LLM-fix** — separat bana: modelldrivet reparationsanrop (`runLlmFixer` m.fl.) när mekaniken inte räcker. Dyrt och icke-deterministiskt; eskaleras medvetet.

**Ska inte blandas ihop:** säg **mekanisk autofix** resp. **LLM-fix** (eller LLM-autofix om du menar just LLM-spåret). Ordagrant "autofix" utan kvalificering syftar oftast på det mekaniska spåret i kodbasen. Äldre synonymer ("deterministisk autofix", "fixer", "repair") ska inte introduceras i ny kod.

### Fix-kategorier (kort)

| Kategori | Vad | Egenskap |
|----------|-----|----------|
| **Mekanisk fix** | Deterministisk regex/AST-fix | Gratis, snabb, reproducerbar. Körs i pipeline. |
| **LLM-fix** | Modelldrivet reparationsanrop | Dyrt, icke-deterministiskt. Bara vid behov. |

### Termer

| Term | Vad det är | Status |
|------|-----------|--------|
| Autofix (mekanisk) | Mekanisk fix-pipeline — kedja av fixers, se ovan | kanonisk |
| Validate and Fix | Syntax → progressiv mekanisk→LLM→mekanisk fix-loop | kanonisk |
| LLM Fixer | LLM-fix med fixer-prompt | kanonisk |
| Finalize | Samlad pipeline: URL-expansion → autofix → validate → image materialize → ev. verifier → save | kanonisk |
| Image Materialize | Materialiserar bildalias/placeholders | kanonisk |
| Verifier Pass | LLM-driven read-only granskning som producerar `blocking` + `quality` findings. Sedan 2026-04-20: `checkMotionReduceTrap` flaggar `motion-reduce:hidden` på `<Canvas>` / fixed-overlay utan `motion-safe:`-fallback. **Sedan denna leverans (Wave 2):** blocking-fynd matas tillbaka in i `runLlmFixer` på pre-VM-vägen via `formatVerifierFindingsAsFixerErrors()` med 60 s timeout + `phaseRouting.fixer`-modell. När fixern lyckas rensas `verifierBlockingFindings` så versionen inte markeras verifier-blocked för fynd som redan reparerats. SSE: `progress.verifier` får `phase: "fixing"` resp. `phase: "fixed"` med `findingsBefore`/`fixerImproved`. Re-validation av verifier körs medvetet INTE inline (skulle förlänga `done` med 5–15 sek) — server-verify (Fas 3) fångar resten. | kanonisk |
| Run-Dir Resolver | `resolveRunDirFromContext({ chatId, runId, slug })` i `generation-log-writer.ts` (sedan 2026-04-20). Slår upp aktiv run-katalog via `runId`, sedan via `chatId`-index, sist `_unrouted/<slug>/`-fallback. Eliminerar `could not resolve run dir`-warning-spam i normalfallet. `runIdResolverFromSession` i preview-host (`runtime.js`) trådar `runId` från sajtmaskin via `/preview/session/start` + `/update`. | kanonisk |
| Reasoning Tokens | Separat token-mätvärde för LLM-reasoning (osynlig "tankearbete") vs visible output. `extractReasoningTokens` (sedan 2026-04-20) i `generation-stream.ts` läser från `usage.reasoning_tokens` (OpenAI Responses-API) eller `tokenUsage.reasoningTokens` (AI-SDK). Loggas som separat `stream.token-usage`-event så thinking-modeller inte längre ser misstänkt billiga i loggen. | kanonisk |
| Version-Mismatch Overlay | UX-mekanism för perioden mellan att en ny version sparas och att preview-VM:en hunnit reload:a. `VersionMismatchOverlayPayload`-typ exporteras från `preview-host-client.ts` (sedan P24, 2026-04-20). Faktisk overlay-rendering i preview-panel-komponenten är ännu inte landad — spåras som UX polish-debt i `docs/plans/active/Kvarvarande-uppgifter.md`. | kanonisk |
| Preflight | Teknisk kontroll inför preview: routing, filkonsistens, blocking | kanonisk |
| Quality Gate | Binärt pass/fail-beslut. Två lanes (2026-04): `designPreview` (F2) och `integrationsBuild` (F3). | kanonisk |
| Quality Gate Tiers | Manifeststyrda check-profiler i `config/ai_models/manifest.json` (`qualityGateTiers`). 4-lane-shapen (`tier2`/`serverVerify`/`promotion`/`interactive`) konsoliderades 2026-04 till `designPreview`/`integrationsBuild`. | kanonisk |
| ~~`tier2` / `serverVerify` / `promotion` / `interactive` (lanes)~~ | Gamla lane-namn. Konsoliderade 2026-04. | **borttagna** — se `designPreview` / `integrationsBuild` |
| `designPreview` (lane) | F2 quality gate. `["typecheck"]`. Kör efter finalize och i bakgrunds-`server-verify`. | kanonisk |
| `integrationsBuild` (lane) | F3 quality gate. `["typecheck", "build"]`. Används vid promotion / "Bygg integrationer"-flödet. | kanonisk |
| Server Verify | Asynkron verify + repair-loop efter finalize | kanonisk |
| Repair Loop Core (`runRepairLoop`) | Delad repair-kärna för server-verify och manuell `/repair` | kanonisk |
| Warm Repair | Targeted repair där bara trasiga filer (+ imports) skickas till LLM-fixer | kanonisk |
| Repair Available (`repair_available`) | Versionstatus när serverrepair passerat quality gate men väntar på explicit accept | kanonisk |
| Accept Repair (`accept-repair`) | API-steg som applicerar `repaired_files_json` till `files_json` för pending repair | kanonisk |
| Repair Accept Timeout | Manifeststyrd timeout (`repairAcceptTimeoutMinutes`) för auto-accept av pending repair | kanonisk |
| Repair Error Manifest (`errorManifest`) | Strukturerat felunderlag per fil (diagnostics + import-impact) i repair-loop/loggmeta | kanonisk |
| Install Cache Share (`install-cache-share`) | Verify-lane signal om `node_modules` delning via dependency fingerprint | kanonisk |
| Install Peer Fallback (`install-peer-fallback`) | Verify-lane signal om peer-konflikt och fallback-install med `--legacy-peer-deps` | kanonisk |
| Post-Checks | Client-side post-genererings-orkestrering | kanonisk |
| Engine Version Lifecycle | `draft`, `verifying`, `repairing`, `repair_available`, `failed`, `promoted` | kanonisk |
| Scaffold Retry | Sen diagnos + scaffoldpivot-förslag vid misslyckad generation | kanonisk |
| ~~PostChecksAndQualityGate~~ | Sammansatt docs-term | **döda** |

---

## Dokumenterade namnskuggor

En **namnskugga** betyder att samma ord används för flera olika saker. Det är inte samma sak som en **fixkategori**: mekanisk autofix och LLM-fix är två olika typer av åtgärder, inte två betydelser av samma ord.

| Tvetydigt ord | Kontext A | Kontext B | Rekommendation |
|---------------|-----------|-----------|----------------|
| `brief` | Deep Brief-objektet | "kort sammanfattning" | Skriv "Deep Brief" |
| `scaffold` | ScaffoldManifest (data) | Scaffold Selection (process) | "scaffold" vs "scaffold selection" |
| `context` | Dynamic Context (prompt-block) | generellt "kontext" | Stor bokstav: "Dynamic Context" |
| `contracts` | Contract Plan (integrations) | Orchestration Contract (bindemedel) | Skriv full term |
| `reference` | ScaffoldReferenceTemplate | DesignReferenceAsset (figma/bild) | Skriv full term |
| `reference` | Reference Library (dossier-rot) | referenceCategories (BuildSpec) | Skriv full term |
| `quality gate` | Finalize quality gate (pass/fail) | Preview quality gate (verify lane) | "finalize" resp. "preview" quality gate |
| `preflight` | `runFinalizePreflight()` | generellt "förkontroll" | Stor bokstav: "Preflight" |
| `autofix` | Mekanisk pipeline (`FixCategory: mechanical`) | LLM-reparation (`FixCategory: llm`) | Skriv **mekanisk autofix** eller **LLM-fix** |

---

## Preview, VM och sandbox

| Term | Vad det är | Status |
|------|-----------|--------|
| preview | Det användaren ser i buildern | kanonisk |
| VM / `preview_host` | Primär tier-2 live-preview via Fly.io | kanonisk |
| `preview-session` | Bootstrap-route för tier-2-preview | kanonisk |
| `previewPending` | Finalize klar, preview väntas | kanonisk |
| `previewUrlHint` | Temporär VM-hint, inte slutlig previewUrl | kanonisk |
| `legacyShimPreviewUrl` | Shim-/fallback-URL | legacy |
| ~~sandbox~~ (generell term) | Legacy-/compat-term | **legacy** — använd VM / `preview_host` |
| Fidelity 2 / 3 | F2 = `previewPolicy: fidelity2` (design-loopen, npm install + next dev). F3 = `previewPolicy: fidelity3` (integrationer, install + build + dev). F3 triggas ENBART explicit via `POST /api/engine/chats/[chatId]/finalize-design`. Auto-promotering från prompt-heuristik (t.ex. "deploy-ready", `RELEASE_CANDIDATE_PATTERNS`) borttagen 2026-04. | kanonisk |
| LifecycleStage | `"design"` (F2) eller `"integrations"` (F3). Härleds från `BuildSpec.previewPolicy` vid version-insert och persisteras i `engine_versions.lifecycle_stage`. F3-versioner pekar på sin F2-fork via `engine_versions.parent_version_id`. | kanonisk |
| Tier-3 Integration / "tredje gradens integration" | Integration vars env-keys måste ha riktiga värden för att fungera vid runtime (Stripe-secret, Supabase-URL, Redis, OpenAI, …). Per-key-klassificering i `src/lib/integrations/placeholder-harmless.ts`. F3 vägrar starta tills alla `requiredRealEnvKeys` är satta — verifieras av `validateTier3Readiness` via `/finalize-design`. | kanonisk |
| Tier3BuildSpec | Strukturerat F3-byggkontrakt (`src/lib/integrations/tier3-build-spec.ts`): per integration `requiredRealEnvKeys`, `placeholderOkEnvKeys`, `buildInstructions[]`, `setupGuide`. Renderas som `## Tier-3 Integration Build Plan` i F3-system-prompten. | kanonisk |
| `placeholderHarmless` (per env-key) | Booleansk klassificering: harmlösa keys (Stripe-publishable, AUTH_SECRET, GA-id, search-only) får placeholdras även i F3. Tier-3-keys (DB-URL, Stripe-secret, Redis, OpenAI) stripas från F3-merge och kräver riktiga värden. | kanonisk |
| Validate-step (esbuild + warm tsc) | Konsoliderat finalize-steg `validate_syntax` (sedan denna leverans) som först kör esbuild-syntax-validering och, när esbuild når `passed`, kör `runWarmTscPass` mot per-scaffold warm `node_modules`-cache (`runPreVmTypecheck`). Båda valideringarna delar `fixBudgetMs`, samma `runLlmFixer`-loop med `phaseRouting.fixer`-modell + 60 s abort-timeout, samma early-stop-policy och samma SSE-progress-stream (`phase: "validating" \| "tsc-validating" \| "tsc-fixing" \| "tsc-passed" \| "tsc-skipped"`). `ValidateFixResult.tsc` exponerar utfallet (`ran`/`skipped`/`diagnosticCount`/`repaired`). Tidigare separat steg `pre_vm_typecheck` är borta från `OWN_ENGINE_POST_STREAM_PIPELINE`. F3 (`previewPolicy === "fidelity3"`) sätter `forceTsc: true` så integrations-bygget alltid betalar för tsc-passet. Fail-open vid kall cache (`SAJTMASKIN_PRE_VM_TYPECHECK` av). **Sedan 2026-04-20-fix:** `runLlmFixer` triggas på *alla* pass inom budget. Tidigare låg `gave-up`-grenen *före* fixer-blocket på sista pass, vilket gjorde fixern dead code när `pass === SYNTAX_FIX_MAX_PASSES` — och helt oåtkomlig om manifestets `syntaxFixPasses` sänktes till 1. | kanonisk |
| F2 SDK Guard | Mekanisk autofix-fixer (`tier3-sdk-guard-fixer`) som strippar tier-3 SDK-imports (Stripe, Supabase, Clerk, Auth.js, Redis, OpenAI, Resend, Algolia, Sentry, Sanity, Storyblok, …) från F2-output. Aktiveras endast vid `previewPolicy === "fidelity2"`. Single source of truth: `config/integrations/tier3-sdk-deny.json` (laddas via `src/lib/integrations/tier3-sdk-deny.ts`); samma JSON renderar även F2 Contract-blocket i system-prompten, så autofix och LLM-instruktion kan inte driva isär. | kanonisk |
| F2 Contract (system-prompt) | Hård sektion (`## Generation Stage: F2 / Design (HARD CONTRACT)`) som injiceras i system-prompten när `previewPolicy !== "fidelity3"`. Förbjuder modellen att importera tier-3 SDKs eller använda `process.env.X` för tier-3 keys, instruerar mock-data + visual placeholders för payment/auth/search/etc. Komplement till F2 SDK Guard som städar mekaniskt om modellen ändå läcker. | kanonisk |
| Domain Veto (dossiers) | Hård filter ovanpå embedding-similaritet i `dossiers/select.ts`. När prompten detekteras som "lightweight" (hospitality, restaurant, portfolio, blog, event, charity, small-business-brochure) blockeras dossier-kategorier som inte hör hemma där (`payments`, `auth`, `database`, `cms`, `realtime`, `ai`, `search`) — även om embedding säger ja. Explicit prompt-keywords ("Stripe", "inloggning", …) unblockar respektive kategori. Modul: `src/lib/gen/dossiers/domain-veto.ts`. | kanonisk |
| Project env file (`env.example`) | Auto-genererad användarsynlig dokumentationsfil som mountas i den genererade sajtens filträd (`versions.files_json`). Listar harmless + tier-3 stub placeholders i F2 så användaren ser exakt vilka nycklar projektet kan tänkas använda; i F3 strippas tier-3 stubs och `projectEnvVars` mergas in som user-lager. Next.js läser INTE filen — det är en hjälpfil som användaren kopierar till `.env.local` lokalt. Modul: `src/lib/gen/preview/project-env-file.ts`. Ej att förväxla med preview-VM:ns interna `.env.local` som skrivs av `buildPreviewEnvLocalContents` och som faktiskt boot:ar previewen. Filnamnet hette tidigare `env.env` (renamed 2026-04 — injectorn rensar legacy-filer automatiskt vid nästa generering). | kanonisk |
| Element Preservation Guard | Skydd mot att follow-up-generering tappar bort high-value UI-element (`<video>`, `<canvas>`, `<iframe>`, `<form>`, R3F `<Canvas>`, Rapier `<Physics>`, video-/media-komponenter, play-button-UI, sektionslandmärken). Två lager: (1) `## Element Preservation Rule` i system-prompt + `elementPreservationReminder` i prompt-wrappen instruerar LLM:en att behålla allt som inte explicit ska bort; (2) `mergeVersionFilesWithWarnings({ rejectDroppedStructuralElements: true })` i `finalize-merge.ts` avvisar mekaniskt en ny fil som tappat element och behåller den gamla. Detection-modul: `src/lib/gen/context/structural-elements.ts`. Inventoryn injiceras också i follow-up-prompten via `buildFileContext({ includeStructuralInventory: true })`. **Sedan denna leverans (Wave 1):** rejections bubblas upp via SSE `done.rejectedStructural` (separat array från `rejectedShrinks`) och loggas som `warnLog("Element Preservation Guard reverted follow-up file(s)")` i `finalize-merge.ts`. Tidigare buggade scenariot "byt hero till intro" (där sektionslandmärket `hero` försvann och guarden tyst behöll den gamla filen) är nu observerbart både server-side och i UI:t. | kanonisk |
| jsx-checker DOM-globals guard | Filter i `src/lib/gen/autofix/jsx-checker.ts` som hindrar autofix-pipelinen från att skapa falska `import X from "@/components/<kebab>"` för built-in DOM-typer (`HTMLDivElement`, `HTMLFormElement`, `FormEvent` etc.) som råkar matcha JSX-tag-regexen i TS generic-position (`useRef<HTMLDivElement>`). Använder `GLOBAL_TYPES`-set + `isDenylistedStubDefaultName` (från `rules/import-binding-ast.ts`) som final safety net. `flattenMultilineImports` normaliserar multiline `import { ... }`-block så att t.ex. `type RapierRigidBody` i en R3F/Rapier-import inte felaktigt rapporteras som saknad. Komplement till behavioral-contract-sektionen "DOM and Global Types — Never Import". | kanonisk |
| Tier-2 downgrade-guard (preview) | Skydd i `useBuilderPageController.ts`-versions-sync som hindrar att en redan etablerad tier-2 (VM/Fly) `currentPreviewUrl` skrivs över av en compatibility-shim-URL från databasens `version.previewUrl`. SSE `preview-ready` kan ge klienten Fly-URL:en innan DB:n hunnit persistera den; utan guarden skulle nästa re-render läsa shim-URL:en och visa det som "blå overlay" i builder-iframen. Guarden är aktiv när `!didChangeVersion` — versionsbyte tillåts fortfarande gå "neråt". | kanonisk |
| Preview-URL invalidation (P19 ingress 1) | Sedan 2026-04-20: `updateVersionFiles()` i `src/lib/db/chat-repository-pg.ts` nollställer `engine_versions.preview_url` när klienten muterar `files_json` via PUT/PATCH `/api/engine/chats/[chatId]/files`. Stänger ingress-punkt 1 i `docs/plans/active/P19-old-content-ingress.md`: tidigare kunde nästa preview-session-request kortsluta till `startOutcome: "reused_url"` mot stale tier-2 VM-snapshot trots att filerna i DB hade uppdaterats. Distinkt från `Tier-2 downgrade-guard` ovan — den skyddar klient-sidans iframe; detta skyddar server-sidans bootstrap. | kanonisk |
| Community registry block selection (deterministic) | Sedan 2026-04-20: `selectCandidates()` i `src/lib/gen/data/community-registry-fetch.ts` använder DJB-style hash av `prompt::sectionType::namespace` istället för `Math.random()` för att välja vilket registry-block som hämtas per detected section-type. Samma prompt → samma section-recipes över reruns. Olika sektioner inom samma prompt får fortfarande olika picks (seeden inkluderar `sectionType`). Pinnat av regress-test som kör samma `(prompt, capabilities)` två gånger och jämför hämtade URL:er. | kanonisk |
| Observability metrics (`/api/metrics`) | Sedan 2026-04-20: `src/lib/observability/metrics.ts` exponerar Prometheus-metrics via `prom-client@^15`. Singleton-Registry cachas på `globalThis.__sajtmaskinMetricsRegistry` (Next dev-mode hot-reload-säker). Helpers: `recordPhaseDuration` / `incFixerCall` / `incVerifierBlocking` / `incPartialFileRepair` / `incEarlyStop` / `recordPromptToDone` / `incBriefCache` / `incIngressEvent`. 12 kanoniska faser i `OBSERVED_PHASES` (utan `pre_vm_typecheck` — uppgår i `validate_syntax`). Wirad i `validate-and-fix.ts` (phase + early-stop), `verifier-pass.ts` (phase + per-finding blocking), `finalize-version.ts` (partial-file-repair), `create-chat-stream-post.ts` + `chat-message-stream-post.ts` (P50 via `prompt-to-done-stream.ts`-byte-detection), `brief/route.ts` (cache hit/miss/skip), `preview-session/route.ts` (`preview_reused_url` ingress) och `version-manager.ts` (followup-base branch). Alla call-sites fail-safe. Custom-metric-prefix `sajtmaskin_*`. Endpoint: `GET /api/metrics` med `Authorization: Bearer <SAJTMASKIN_METRICS_TOKEN>` eller `?token=<X>`-query (tom env = 503 disabled). Operativ surface: Streamlit `backoffice/pages/observability.py` (P50/P95-cards, per-fas histogram, counter-tabeller). Avlåser audit Tier A #12/#16, §3.1, §3.3 + P19 Steg 1-data. | kanonisk |
| Brief cache (Redis) | Sedan 2026-04-20: `src/lib/api/ai/brief-cache.ts` cacher `/api/ai/brief`-LLM-output i Redis 24h på key `brief:v1:<modelId>:<chatId-or-anon>:<sha256-24>` med extra inputs (`imageGenerations`, `temperature`, `maxTokens`) i hashen så retries med olika knobs missar. Gated på `FEATURES.useRedisCache`; tom Redis-config = no-op. Hit replays JSON byte-identiskt med samma headers (`X-Provider`/`X-Key-Source`/`X-Brief-Quality`) plus `X-Brief-Cache: hit\|miss\|skip` så klienter kan observera. Telemetri-counter `sajtmaskin_brief_cache_total{outcome}`. Audit Tier B #20. | kanonisk |
| v0-import freshness-signal (P19 Steg 4) | Sedan 2026-04-20: `POST /api/template` (lokal v0-import-gren) inkluderar `source: { templateId, timestamp, ageSeconds, stale, sourceSlugs, categoryLabel }` i responsen. `stale` beräknas mot `STALENESS_THRESHOLD_SECONDS = 30 dagar`. Icke-parseable/saknad timestamp → `ageSeconds: null, stale: false`. När `stale === true` skrivs `devLogAppend("latest", { type: "v0-import.stale-source", ... })` — ingen UI-blockering, bara informationssignal som klienter kan surface:a. P19 Steg 4 stängd; Steg 1 + 3 återstår. | kanonisk |
| `promptAssist.allowed.models` (unified) | Sedan 2026-04-20: `config/ai_models/manifest.json` exponerar ny unified `allowed.models`-array som är unionen av `gatewayClassModels` + `anthropicDirectModels` (gateway-class först). Provider härleds från model-id-prefix (`openai/`, `anthropic/`, `anthropic-direct/`). Additivt — båda legacy-arrayerna kvarstår för bakåtkompat. `getPromptAssistAllowedFromManifest()` returnerar nu även `models`-fältet (fallback till union om manifestet saknar det). Nya callers bör föredra unified-accessorn. Audit Tier B #23. | kanonisk |
| F2 quality-gate `build`-check | Sedan 2026-04-20: `qualityGateTiers.designPreview` i `config/ai_models/manifest.json` kör `["typecheck", "build"]` (var `["typecheck"]`). Audit Tier S #7 / `01-buggar.md` §1.5. `build`-passet fångar Next-runtime-fel (broken imports, runtime-crashes som compile:ar fint) *före* preview-iframen renderar, vilket undviker "blank HTML"-incidenter. Kostar ~5–20s extra per finalize + +5–10 USD/mån i Fly-CPU. Default-fallback i `src/lib/gen/verify/quality-gate-checks.ts` matchar manifestet, så runtime kan inte tyst falla tillbaka till bara `typecheck`. För att kostnadsbegränsa, sätt arrayen till `["typecheck"]` i miljöns manifest. | kanonisk |
| v0/engine route consolidation (P29) | **STÄNGD 2026-04-20.** Hela `/api/v0/chats/**`-trädet borttaget (Fas 1A + 1B). `src/lib/api/engine/chats/v0-chats-compat.ts` (`logLegacyV0ChatsHit`) borta. Fas 2-beslut: 7 Class C-routes (`init-registry`, `integrations/vercel/projects`, `projects/instructions`, `projects/[id]/env-vars`, `deployments/*`) **behålls på `/api/v0/`** som canonical permanent URL — ingen rename till `/api/legacy/v0/*`. Motivering: routerna är inte arkitektur-legacy, rename skulle vara kosmetisk med klient-deploy-koordineringskostnad utan funktionellt värde. Audit `03-konsolidering-pipeline.md` §3.4 / Tier A #14 helt stängd. Klient-prefixet för chat-trafik är `ENGINE_CHATS_API_PREFIX` i `src/lib/api/engine-chats-path.ts` (se JSDoc-block där för Class C-policyn). Plan flyttad till `docs/plans/avklarat/P29-v0-engine-consolidation.md`. | kanonisk |
| dep-version-validator (autofix) | Sista steget i deterministisk autofix-pipeline (`src/lib/gen/autofix/dep-version-validator.ts`, steg 7c). Frågar `https://registry.npmjs.org` (via `npm-registry.ts`-klient med 24h fil-cache i `os.tmpdir()`, 1.5s timeout, fail-safe vid offline) för varje paket i `package.json` `dependencies`/`devDependencies` och bumpar specs vars major INTE finns publicerad till `^<latest>`. Fångar både LLM-hallucinerade versioner och stale poster i `KNOWN_PACKAGES`-tabellen i `dep-completer.ts`. Komplement till `scripts/deps/validate-baseline-npm-versions.ts` (CI/manuell check av scaffold-baseline) — validatorn kör per generering, scriptet kör vid baseline-ändring. Sista skyddet mot "vit sida pga `npm install` ENOENT". | kanonisk |
| SAJTMASKIN_SHIM_PREVIEW_DISABLED | Env-flagga (default OFF) som stänger av legacy "compatibility shim"-previewen helt. När satt till `true`/`1`/`yes`/`on` returnerar `buildPreviewUrl()` `null`, `/api/preview-render`-routen svarar `410 Gone` med diagnostic `render_route_shim_disabled`, och `isShimOrMissingPreviewUrl()` behandlar alla icke-tier-2 URLs som "behöver upgrade" så bootstrappen re-runs om en stale legacy-URL slipper igenom. UI:t hanterar avsaknad av preview-URL via `PreviewPanelEmptyState`. Tier-2 VM-previewen (Fly) påverkas inte. Implementerad i `src/lib/gen/preview/legacy/compatibility-shim.ts` (`isShimPreviewDisabled()` helper). | kanonisk |
| SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR | Env-flagga som styr post-VM `triggerBuildErrorRepair`-loopen i `src/lib/gen/verify/server-verify.ts`. Sedan denna leverans (Wave 4): default ON i `development` + Vercel `preview`, default OFF i `production` (avgörs av `VERCEL_ENV` resp. `NODE_ENV` via `isAutoRepairBuildErrorEnabled()`). Explicit värde (`1`/`true`/`on`/`yes` eller `0`/`false`/`off`/`no`) overridar default. När `build-error` SSE emitteras matas felet in i samma `runRepairLoop` som `triggerServerVerification` (delad `inflight`-set per `versionId` så ingen dubbel-trigger). Tidigare default OFF överallt — ledde till tysta vit-sida-buggar i dev när VM:en kraschade. | kanonisk |

---

## Produkttermer

| Term | Betyder | Blanda inte ihop med |
|------|---------|---------------------|
| `v0-mallar` / Mallar-tab | Builderns mallkatalog | template-library, scaffolds |
| Vercel-mallar | Extern research från Vercel Templates | v0-mallar, scaffolds |
| `template-library` | Kuraterad referensartefakt | v0-mallar, scaffolds |
| scaffolds | Interna runtime-startpunkter | template-library, Vercel-mallar |
| `Group` (ikon vs 3D) | Lucide exporterar ikonen `Group`; Three.js/`@react-three/fiber` använder `Group` som nod — samma PascalCase | Autofix får inte lägga till lucide-`Group` när filen redan har `import type { Group } from "three"` (jsx-checker känner igen `import type`) |
| own-engine | Enda aktiva codegen-vägen | OpenClaw, gammal v0-runtime |
| `backoffice` | Lokal Streamlit-app — startas via `python sajtmaskin_backoffice.py` (entrypoint relauncherar `streamlit run`). Källkod under `backoffice/` (`shared.py` + `pages/*`). Skriver till `config/`, läser från `config/`, `data/`, `logs/`. **Inte** Next.js API-server, **inte** Fly-VM/preview_host. | Next.js-runtime under `src/app/api/`, preview-VM (Fly), "dashboard" (legacy namn på samma sak) |
| OpenClaw / Sajtagenten | Separat assistent-/agentyta | Builderns LLM-flöde |
| `appProjectId` | Användarprojektets id | `chatId`, `VERCEL_PROJECT_ID` |
| `chatId` | Own-engine-chattens id | `appProjectId` |

**`v0` betyder tre saker:** (1) API-versionering `/api/v0/` (2) naming debt i symboler (3) Mallar-tab. `v0-sdk`, `src/lib/v0/`, `V0_API_KEY` borta ur runtime.

**Builder model lanes:** Byggmodell = Build Profile · Deep Brief = automatisk init-expansion (alltid aktiv) · Thinking = reasoning-flagga, inte lane. _(Förbättra/Skriv om-knapparna borttagna.)_

**Dossier-status (`_status`)** styr om en dossier injiceras vid runtime:

| `_status` | Runtime-aktiv? | Sätts av | Innebörd |
|---|---|---|---|
| `active` | Ja | Curator (hand eller `auto-curate.ts`) | Färdig att användas |
| `draft` | Nej | Pipeline (skiss → draft) | Behöver curation innan aktivering |
| `source-archived` | Nej | `compat-test.ts --apply` | GitHub-källa är arkiverad |
| `source-stale` | Nej | `compat-test.ts --apply` | GitHub-källa har inte commits > 540d |
| `source-unreachable` | Nej | `compat-test.ts --apply` | GitHub-källa returnerar 404 / parse-fel |

`_deprecationReason` = informationssträng (max 240 tecken) som förklarar varför dossiern är bruten. `_replacementUrl` = pekare till ersättnings-repo (när källan är sunset). Båda är informationsfält — runtime-filtrering drivs av `_status` ensamt.

`compat-test.ts --apply` är **återhämtande**: om en dossier tidigare flaggats som `source-*` men källan är frisk igen, återställs `_status` till `active` automatiskt.

---

**Core Rules ↔ statisk prompt** är **samma sak** sett från olika håll:
- `Core Rules` = innehållet (immutable produktregler — stack, output-format, behavior, komponentkontrakt).
- `statisk prompt` / `static system prompt` / `static core` = den färdig-ihopklistrade prefix-strängen som skickas som `system`-meddelande till codegen-LLM:en.
- Filhemmet: `config/prompt-core/*.md` listade i `config/codegen-core-manifest.json`.
- Loadern: `src/lib/gen/static-core-loader.ts` → `getStaticCoreFromWorkspace()`.
- Compose-funktionen: `composeEngineSystemPrompt(dynamicContextText)` limmar Core Rules + `\n\n---\n\n` + dynamic context.
- **Den gamla `prompt-static/`-mappen är borttagen** (apr 2026). Säg `prompt-core/` eller `Core Rules`.

---

## Env-lager

1. **Plattformens env:** repoets `.env*`, Vercel env vars, `src/lib/env.ts` + `config/env-policy.json`.
2. **Genererad sajts env:** egen `.env.local` i byggprojektet/previewmiljön.
3. **Project env file (`env.example`):** användarsynlig dokumentationsfil i den genererade sajtens filträd (Next.js läser INTE filen — den är hjälptext, riktiga värden går i `.env.local`). Auto-genererad av `src/lib/gen/preview/project-env-file.ts` och mountad i `versions.files_json` av `injectProjectEnvFileIntoFilesJson` (kallas i `finalize-version.ts`). Listar harmless + tier3-stub placeholders i F2 (så användaren ser exakt vilka nycklar som finns); i F3 strippas tier3-stubs och `projectEnvVars` mergas in som user-lager. Filens roll är att hålla F2-chatten tyst — riktiga värden fylls i via env-panelen som mountas först i F3, eller (lokalt) genom att kopiera till `.env.local`. Se [`docs/ENV.md`](../ENV.md) § "Project env file". Renamed från `env.env` 2026-04.
4. **Felsökningsordning:** preview → project env file → plattforms-env.

---

## Legacy som inte ska återintroduceras

| Term | Varför |
|------|--------|
| AI Gateway / `AI_GATEWAY_API_KEY` | Borttaget ur runtime |
| `Vercel Sandbox` (som primär preview) | VM / `preview_host` är aktiv väg |
| `demoUrl` | Legacy naming; publikt namn är `previewUrl` |
| `detectScaffoldMode()` | Var död kod, borttagen |
| `applyScaffoldTraits()` | Borttagen, traits i manifest direkt |
| `EXTENDED_CUSTOM_INSTRUCTIONS` | Borttagen; `LEGACY_EXTENDED_CUSTOM_INSTRUCTIONS` kvar som compat |
| `simplifiedBriefSchema` | Borttaget; `siteBriefSchema` är enda schemat |
| `GATEWAY_ASSIST_MODELS` | Borttagen re-export; använd `ASSIST_MODELS` |
| `isGatewayAssistModel()` | Borttagen; ersatt av `isOpenAIAssistModel()` |
| `SPEC_FILE_INSTRUCTION` | Borttagen ur init-flödet (specMode default false) |
| `RELEASE_CANDIDATE_PATTERNS` | Borttagen 2026-04. Auto-promotering till F3 från prompt-keywords ("deploy-ready", "production") togs bort när F3 blev en explicit knapp. |
| `qualityGateTiers.tier2` / `serverVerify` / `promotion` / `interactive` | Borttagna 2026-04. Konsoliderade till `designPreview` (F2) + `integrationsBuild` (F3). |
| `40-generated-site-integration-placeholders.env.txt` | Splittad 2026-04 i `40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`. |

---

## Domän → mappstruktur

| Domän | Primär plats |
|-------|-------------|
| Orchestration (scaffold + route + contracts + BuildSpec) | `gen/` rot |
| Prompt assembly (system prompt, dynamic context) | `gen/` rot |
| Scaffold-data och matching | `gen/scaffolds/` |
| Scaffold-varianter | `gen/scaffold-variants/` |
| SSE wire-format | `gen/stream/` |
| Autofix och repair | `gen/autofix/` |
| Finalize-pipeline | `gen/stream/` |
| Verifiering och quality gate | `gen/verify/` |
| Preview | `gen/preview/` |
| Export/projektskelett | `gen/export/` |
| Env/config | `lib/` rot |
| Deploy och Vercel API | `lib/deploy/` + `lib/vercel/` |

---

Senast uppdaterad: 2026-04-18 (Directive cascade borttagen — 10 oanvända directive-filer + directive-loader.ts + manifest + 2 backoffice-pages raderade. visual-design och content-voice flyttade till prompt-core. "Per-Request Signal Cascade" ersätter "Directive Cascade" som term). Versionhistorik finns i git.

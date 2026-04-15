# Glossary — Sajtmaskin Terminology

Kanonisk ordlista. Navigationshjälp, inte en ersättning för att läsa koden.

**Kod är alltid source of truth.** Behöver du kodsymbol eller filsökväg — grepa. Behöver du pipeline-detaljer — se `docs/architecture/scaffold-schema.md`.
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
| Deep Brief | LLM-genererad strukturerad sajtbrief. Kanonisk semantisk expansion för init. | kanonisk |
| Server Auto-Brief | Server-side brief-fallback för underspecificerade prompts | kanonisk |
| ~~WebsiteSpec / SajtmaskinSpec~~ | Spec-first LLM-genererat strukturobjekt. `specMode` default false sedan Fas 1 världsklass. | **legacy** |
| Build Intent | `template \| website \| app` — vad användaren vill bygga | kanonisk |
| Build Method | `wizard \| category \| audit \| freeform \| kostnadsfri` — hur entry skedde | kanonisk |
| Generation Mode | `init \| followUp` | kanonisk |
| Plan Mode | Planner-LLM med plan-artefakt; PlanPhase: plan, build, refine, verify, done | kanonisk |
| Build Profile | `fast`, `pro`, `max`, `codex`, `anthropic` — UI-tiername för codegen | kanonisk |
| Generation Phase | `planner`, `generator`, `fixer`, `verifier`, `deploy-assistant` — per-fas modellrouting | kanonisk |
| Thinking | Reasoning-flagga, inte en separat lane | kanonisk |
| Static Core | Stabila produktpolicyregler från `config/prompt-static/*.md` | kanonisk |
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
| Scaffold Variant | Visuellt uttryck inom scaffold: typsnitt, motif, theme tokens, prompt hints | kanonisk |
| Variant Structural Files | Init-only kodreferenser från variantens sourceTemplateIds + capability-driven | kanonisk |
| Capability Map | Snabb klassificering: auth, ecommerce, forms, 3D, motion, charts | kanonisk |
| Route Plan | Planerad IA/ruttlista. Provenance: brief > scaffold > prompt | kanonisk |
| Route Realization | Policylager: vilka routes realiseras i denna generation | kanonisk |
| Contract Plan | Auth, payment, database, env vars, integrations | kanonisk |
| Build Policy / BuildSpec | Körpolicy: changeScope, qualityTarget, contextPolicy, tokenBudgets | kanonisk |
| Finalize Path | Telemetrietikett för finalize-läge: `full` (hela kedjan) eller `light` (skippar image/verifier) | kanonisk |
| Orchestration Contract | Binder scaffold→routes→valideringsförväntningar | kanonisk |
| Dynamic Context | Request-specifik promptdel: scaffold + routes + contracts + brief + tema. Prunad. | kanonisk |
| System Prompt | Static Core + Dynamic Context | kanonisk |
| Generation Package | Kanonisk fan-in: systemPrompt + dynamicContext + pruning + lineageHash | kanonisk |
| Your Toolkit | Scaffold-medveten shadcn-sammanfattning i prompten. Primära komponentgrupper per scaffold (via `SCAFFOLD_PRIMARY_GROUPS` + variant `sectionInventory`), sedan "also available". + capability-hints. | kanonisk |
| Google Font Registry | Central fontdatapost (`src/lib/gen/data/google-font-registry.ts`): ~75 fonts med importnamn, displaynamn, CSS-variabel, kategori. Används av font-import-fixer (autofix) och font-hint i systemprompten. | kanonisk |
| Component References | Tre lager: lokala exempel, officiellt register, community-registries | kanonisk |
| Agent Tools | Tool-definitioner för planner/agent-flöden | kanonisk |
| Template-Library | Kuraterad referensartefakt byggd från externa Vercel-templates | kanonisk |
| Dossier | Build-time researchartefakt per extern template | kanonisk |
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
| Finalize | Samlad pipeline: autofix → URL-expansion → validate → image materialize → ev. verifier → save | kanonisk |
| Image Materialize | Materialiserar bildalias/placeholders | kanonisk |
| Verifier Pass | LLM-driven read-only granskning. `blocking` findings är advisory och stoppar inte persist. | kanonisk |
| Preflight | Teknisk kontroll inför preview: routing, filkonsistens, blocking | kanonisk |
| Quality Gate | Binärt pass/fail-beslut. Fyra lanes: tier-2, server-verify, promotion, interactive. | kanonisk |
| Quality Gate Tiers | Manifeststyrda check-profiler i `config/ai_models/manifest.json` (`qualityGateTiers`) | kanonisk |
| Server Verify | Asynkron verify + repair-loop efter finalize | kanonisk |
| Repair Loop Core (`runRepairLoop`) | Delad repair-kärna för server-verify och manuell `/repair` | kanonisk |
| Warm Repair | Targeted repair där bara trasiga filer (+ imports) skickas till LLM-fixer | kanonisk |
| Post-Checks | Client-side post-genererings-orkestrering | kanonisk |
| Engine Version Lifecycle | `draft`, `verifying`, `repairing`, `failed`, `promoted` | kanonisk |
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
| Fidelity 2 / 3 | Normal resp. strikt (next build) preview-lane | kanonisk |

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
| OpenClaw / Sajtagenten | Separat assistent-/agentyta | Builderns LLM-flöde |
| `appProjectId` | Användarprojektets id | `chatId`, `VERCEL_PROJECT_ID` |
| `chatId` | Own-engine-chattens id | `appProjectId` |

**`v0` betyder tre saker:** (1) API-versionering `/api/v0/` (2) naming debt i symboler (3) Mallar-tab. `v0-sdk`, `src/lib/v0/`, `V0_API_KEY` borta ur runtime.

**Builder model lanes:** Byggmodell = Build Profile · Deep Brief = automatisk init-expansion (alltid aktiv) · Thinking = reasoning-flagga, inte lane. _(Förbättra/Skriv om-knapparna borttagna.)_

---

## Env-lager

1. **Plattformens env:** repoets `.env*`, Vercel env vars, `src/lib/env.ts` + `config/env-policy.json`.
2. **Genererad sajts env:** egen `.env.local` i byggprojektet/previewmiljön.
3. **Felsökningsordning:** preview → plattforms-env.

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

Senast uppdaterad: 2026-04-15 (Fas 2+3: finalizePath full/light, qualityGateTiers i manifest, delad runRepairLoop + warm repair, syncad preview/deploy-telemetri). Versionhistorik finns i git.

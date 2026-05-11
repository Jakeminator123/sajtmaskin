# LLM-flöde end-to-end (Fas 1)

**Senast uppdaterad:** 2026-04-23.
**Syfte:** kort, praktiskt svar på "vad händer när användaren skickar en prompt?".
**Scope:** Fas 1 (förberedelse). För Fas 2/3 se [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) och [fas3-preview-and-deploy.md](./fas3-preview-and-deploy.md). För **målbild** (vart vi siktar): [`llm-flow-target-worldclass.md`](./llm-flow-target-worldclass.md).

---

## En mening

> En användarprompt går genom **Deep Brief** (1 LLM-anrop) som returnerar strukturerad brief + nomineringar; `orchestrate.ts` plockar **scaffold + variant + dossiers**; allt komponeras till en system-prompt med **Core Rules**-prefix + dynamisk del; codegen-LLM:n får detta + ursprungliga prompten och bygger sajten.

## Init vs Follow-up — kortast möjligt

| | Init | Follow-up |
|---|---|---|
| Operation | **Genesis** — bygg ny artifact graph | **Delta** — operation på existerande graph |
| Brief | Full Deep Brief (LLM) | Snapshot-brief från `briefSummary` (ingen LLM-runda) |
| Scaffold/variant | Embedding + brief.nomination | Frusen via `persistedScaffoldId` / `persistedVariantId` (utom `clear-redesign`) |
| Routes | Fri planering | Frusna mot existerande filer |
| Quality target | Färsk inferens | Ärvs från prior version |

**Implikation:** follow-up är inte "nästan init". Det är en delta-operation med samma build-motor men ärvt kontrakt. Se [`llm-flow-target-worldclass.md`](./llm-flow-target-worldclass.md) för målbild.

---

## Vad fas 1 är (och inte är)

```
USER PROMPT
    │
    ▼
┌──────────────────────────────────────────┐
│ FAS 1 — Förberedelse                     │
│ 1. Deep Brief expanderar + nominerar     │
│    + deklarerar requestedCapabilities    │
│ 2. Scaffold pickas (embedding-driven)    │
│ 3. Variant pickas inom scaffold          │
│ 4. Dossiers pickas deterministic         │
│    (1 per requested capability)          │
│ 5. Dynamic prompt komponeras             │
└──────────────────────────────────────────┘
    │
    ▼
FAS 2 — Codegen LLM bygger sajten
    │
    ▼
FAS 3 — Verify, repair, preview-VM, deploy
```

| Inte fas 1 | Tillhör |
|---|---|
| Själva kodgenereringen | Fas 2 |
| Verifiering, autofix, repairs | Fas 3 |
| Preview-VM dispatch + deploy | Fas 3 |
| Hand- eller AI-kuration av nya dossiers (`scripts/dossiers/curate-from-reference.ts`) | Offline / backoffice |
| Bygga scaffold-embeddings (för scaffold-pick) | Ingestion-pipeline (offline) |

---

## Hur prioriteringen funkar — vem "vinner"?

Användarens intuition: "scaffold variant lägger upp grundstruktur, dynamisk prompt läggs ovanpå". **Inte riktigt** — så här är det faktiskt:

| Lager | Vad det styr | Var i prompten | Override-bar av högre lager? |
|---|---|---|---|
| `prompt-core/*.md` (Core Rules) | Stack (Next 16, React 19, Tailwind v4, shadcn), output-format, behavior | **Prefix** till hela system-meddelandet | **Aldrig** (bryts inte) |
| `## Build Intent` + `## Custom Instructions` | Hård user-intent + dev-overrides | Tidigt i dynamisk del | Bara av Core Rules |
| **Brief-Locked Design Values** | Briefens designvärden: visual direction, tone, qualityBar, motionLevel, palette, typography | `## Brief-Locked Design Values` före variant | Av user-locked theme tokens |
| **Scaffold** (filer + research) | Faktiska TSX/CSS-filer + struktur-baseline | `## Critical Scaffold Files` + `## Scaffold File Tree` | Inte direkt — LLM får anpassa men inte bryta strukturen |
| **Scaffold Variant** | Visuell signatur: `signaturePatterns`, `colorMode`, `fontPairings`, `themeTokens` | `## Scaffold Variant (this generation)` | Av brief-fält |
| **Brief** (Deep Brief output) | Project context, pages, sections, visual direction, mustHave/avoid | `## Project Context`, `## Visual Identity`, `## Pages & Sections`, `## Must Have`, `## Domain Inference` | Av user-locked theme tokens (UI-låsta värden) |
| **Dossier instructions** | Hur en integration ska användas | `## Available Dossiers` + `## Selected Dossier Instructions` | — (anpassningsbara) |
| **Dossier files (verbatim)** | Faktisk integration-glue (Stripe webhook, auth middleware) | `## Dossier Files To Emit Verbatim` | **Aldrig** — LLM måste emit:a oförändrade |
| Statisk visuell baseline (`prompt-core/03-visual-design.md` + `04-coding-direction.md`) | Visuell standardprosa, content voice | I Core Rules sedan 2026-04-18 | Av allt högre |

**Den explicita ordningen** står i prompten själv som `## Design Priority`-block:

1. User-locked theme tokens (om satta i builder-UI) — absolut, bryts aldrig
2. Brief visual direction (colorPalette, typography, tone, domainProfile) — primary intent
3. Scaffold Variant defaults (theme tokens, font pairings, signature motif, prompt hints) — fallback när brief är tyst
4. Static core defaults (`prompt-core/03-visual-design.md` + `04-coding-direction.md`) — sista utvägen

**Så svaret på "vem vinner":** Brief vinner över Variant där briefen säger något konkret, och den prioriteten syns nu tidigt i prompten via `## Brief-Locked Design Values`. Där brief är tyst tar variant över. Och scaffold-koden (TSX-filerna) levereras som baseline oavsett — variant ändrar bara visuell signatur ovanpå.

---

## Designprinciper

| Princip | Innebörd |
|---|---|
| Statisk prompt aldrig bryts | Core Rules (`prompt-core/*.md` listade i `codegen-core-manifest.json`) är spelregler för LLM:n. Inget i fas 1 får motsäga dem |
| Deep Brief = expansion + nominering | Brief returnerar JSON med (a) utbyggd intent, (b) `scaffoldNomination`, `variantNomination`, (c) `requestedCapabilities` (string[]). Inget mer |
| Scaffold/variant: embedding kan överrösta brief-nominering | Brief-nomineringen är en hint. Embedding-pick i orchestrate kan **bekräfta eller överrösta** med drift-logg. **Dossiers gör INTE detta** — där är brief sanningen |
| Ansvarsuppdelning | Scaffold = struktur. Variant = visuell signatur. Dossier = capability-implementation (1:1 mot brief.requestedCapabilities). Inga överlappande ansvar |
| Per-Request Signal Cascade | EXPLICIT (Brief-fält) > INDICATED (Brief-LLM tolkning) > INFERRED (heuristik i `guidance-resolvers.ts`) > DEFAULT (variant) > FALLBACK (statiska defaults i `prompt-core/`). Tidigare "Directive Cascade" + `prompt-directives/` är borttagna 2026-04-18 |
| Dossier som riktig kod | När en dossier väljs renderas dess `instructions.md` i prompten, och filer med `injectionMode: "verbatim"` (default för hard-class api-routes/middleware/glue) injiceras byte-exakt under `## Dossier Files To Emit Verbatim` |

---

## Det faktiska flödet, steg för steg

```
[1] User skickar prompt (init)
        │
        ▼
[2] BRIEF GENERATION (gpt-5.4, Deep Brief)
    Input:  prompt + ev. prevBrief
    Output: structured Brief JSON
            ├── Standard fält: projectTitle, oneSentencePitch, pages,
            │   visualDirection, imagery, uiNotes, seo, domainProfile,
            │   motionLevel, qualityBar, mustHave, avoid
            └── Nomineringar: scaffoldNomination, variantNomination,
                requestedCapabilities (string[])
        │
        ▼
[3] SCAFFOLD PICK (orchestrate.ts)
    - matchScaffoldAuto: embedding + keyword hybrid
    - Brief.scaffoldNomination loggas som drift om mismatch
    - Selected scaffold determinerar bas-filerna
        │
        ▼
[4] VARIANT PICK (orchestrate.ts)
    - I create-chat-flödet: keyword pre-match (pickScaffoldVariant) körs
      tidigt för brief-hints, och dess id skickas till orchestrate som
      persistedVariantId. orchestrate hämtar då samma variant via
      getVariantById — async embedding-pickaren körs INTE. Brief och
      codegen ser garanterat samma variant.
    - Fallback: om persistedVariantId saknas eller blir stale körs
      pickScaffoldVariantAsync (embedding mot signaturePatterns).
    - Bara variants under valt scaffold (1:N)
        │
        ▼
[5] DOSSIER PICK (selectDossiersForRequest, v2)
    - Läser brief.requestedCapabilities (string[])
    - För varje capability: hitta matchande dossier via getDossiersByCapability
    - Tie-break på defaultForCapability=true; annars id-sort
    - Hard-class: kolla envVars i process.env → mark configured
    - Eager-load instructions.md för valda dossiers
    - Inga embeddings, ingen domain-veto, inga cap. Det brief säger är det
      som injiceras (1:1 capability → dossier eller noll om saknas).
        │
        ▼
[6] DYNAMIC CONTEXT BUILD (buildDynamicContext)
    Bygger ett 50-100 KB block med (i prioritetsordning):
    ├── Build Intent + Custom Instructions
    ├── Generation Profile + Generation Mode
    ├── Brief-Locked Design Values (brief över variant)
    ├── Scaffold Variant (signaturePatterns)
    ├── Design Priority (per-request signal cascade)
    ├── Scaffold (filer + research priorities)
    ├── Pages & Sections (från brief)
    ├── Project Context, Visual Identity, Imagery (från brief)
    ├── Must Have, Avoid, UI Notes (från brief)
    ├── Domain Inference, Quality Bar, Motion Level
    ├── Available Dossiers (lista)
    ├── Selected Dossier Instructions (per vald dossier)
    ├── Dossier Files To Emit Verbatim (krävs oförändrade)
    ├── Route Plan + Pre-generation Contracts
    ├── Your Toolkit (shadcn + komponent-palette)
    └── Component References (shadcn examples)
        │
        ▼
[7] COMPOSE FINAL SYSTEM PROMPT (composeEngineSystemPrompt)
    Output: prompt-core text + SYSTEM_PROMPT_SEPARATOR + dynamic context
        │
        ▼
[8] CODEGEN LLM (Fas 2)
    - Får system + user-prompt + chat-historik
    - Streamar CodeProject-block (file="..." + content)
    - Verbatim-filer ska komma ut oförändrade
        │
        ▼
[9] FINALIZE + PREVIEW + VERIFY (Fas 3)
```

---

## Init vs followUp — påverkan

| Aspekt | `init` (första prompten) | `followUp` (efterföljande) |
|---|---|---|
| Brief genereras? | Ja, med Deep Brief LLM | Nej — använder lagrad brief från init |
| Scaffold-pick | Embedding + brief.nomination | Lagrad scaffold (`persistedScaffoldId`) — ingen ny pick |
| Variant-pick | Embedding + brief.nomination | Lagrad variant (`persistedVariantId`) |
| Dossier-pick | Capability-driven från brief.requestedCapabilities | Capability-driven från (uppdaterad) brief — användaren kan lägga till capabilities och triggar nya dossier-injektioner i nästa generering |
| Drift-detection | Loggas normalt | Loggas med `mode: "followUp"` så det kan filtreras |
| Brief-nominerings-fält | Färska från LLM | Kan vara stale (från init) — drift-loggar märker upp `mode` |

---

## Kontroll-punkter

| Checkpoint | Kommando |
|---|---|
| Brief returnerar nomineringar | Trigga generation, kolla `data/prompt-dumps/orchestration-dynamic/generation-input-package.json` för `brief.scaffoldNomination/variantNomination/requestedCapabilities` |
| Drift loggas | Sök terminal-output efter `[orchestrate] scaffold_drift`, `variant_drift`. Brief-LLM-stavfel (id som inte finns i registry) loggas som `scaffold_unknown_brief_nomination` |
| Dossier-pick fungerar | Trigga generation, sök `[orchestrate] dossiers_selected` i loggen. byCapability ska visa 1 dossier per requested capability |
| Verbatim-block syns | Sök `## Dossier Files To Emit Verbatim` i `data/prompt-dumps/own-engine-codegen/full-system.md` |
| Hard-dossier saknar env | `## Available Dossiers` visar `[UNCONFIGURED — render placeholder UI]`-badge istället för `[configured]` |

---

## Status

Klart (✓): Brief-LLM strukturerad JSON · Brief-nomineringar (Fas 1.0) · Scaffold-pick (embedding + keyword hybrid) · Variant-pick (embedding mot signaturePatterns) · Drift-detection · Dossier-system v2 (capability-driven, deterministic — `data/dossiers/{hard,soft}/`) · Dossier instructions injicerat i prompt · Dossier-filer levererade verbatim · Hard-class env-preflight (`configured`-flagga).

Borttaget (2026-04-18): `config/prompt-static/` (16 filer) · `backoffice/pages/prompt_static.py` · Dead loader-fallback i `static-core-loader.ts`.

Borttaget (2026-04-20): Dossier-pipeline v1 (auto-curate, embeddings, scaffold-recommendations.json, domain-veto, 16 pipeline-skript, 96-dossier-pool) · `archive/dossiers-legacy-2026-04-20/` om det behövs som referens.

---

## Risker + mitigations

| Risk | Mitigation |
|---|---|
| Brief-LLM deklarerar capability som inte har en dossier | `selectDossiersForRequest` skippar tyst — capability bara hoppas över, inte krasch |
| Hard-dossier saknar env-vars i preview | Markeras `configured: false` → system-prompt instruerar codegen-LLM att rendera placeholder-UI istället för krasch |
| Två dossiers delar samma capability | `defaultForCapability=true` vinner. Annars id-sort (deterministic). Redaktion fångar duplicering via `capability-map.json` |
| Dossier-filer krockar med scaffold-filer (samma path) | `src/lib/gen/system-prompt/sections/dossiers.ts` (ca rad 19 och 123): `SCAFFOLD_RESERVED_PATHS` skippar dossier-verbatim på `app/layout.tsx`, `package.json`, etc. + loggar varning |
| Lägga till en ny capability utan att uppdatera brief-LLM-prompten | Brief-LLM:n returnerar då aldrig kapabiliteten → dossiern injiceras aldrig. Backoffice "Capability map"-tab visar verifierbart vilka capabilities som finns |

# LLM-flöde end-to-end (Fas 1)

**Senast uppdaterad:** 2026-04-20.
**Syfte:** kort, praktiskt svar på "vad händer när användaren skickar en prompt?".
**Scope:** Fas 1 (förberedelse). För Fas 2/3 se [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) och [fas3-preview-and-deploy.md](./fas3-preview-and-deploy.md).

---

## En mening

> En användarprompt går genom **Deep Brief** (1 LLM-anrop) som returnerar strukturerad brief + nomineringar; `orchestrate.ts` plockar **scaffold + variant + dossiers**; allt komponeras till en system-prompt med **Core Rules**-prefix + dynamisk del; codegen-LLM:n får detta + ursprungliga prompten och bygger sajten.

---

## Vad fas 1 är (och inte är)

```
USER PROMPT
    │
    ▼
┌──────────────────────────────────────────┐
│ FAS 1 — Förberedelse                     │
│ 1. Deep Brief expanderar + nominerar     │
│ 2. Scaffold pickas (embedding-driven)    │
│ 3. Variant pickas inom scaffold          │
│ 4. Dossiers (1-3 st) pickas              │
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
| Scrape Vercel-mallar för dossier-kandidater | Ingestion-pipeline (offline) |
| Bygga embeddings | Ingestion-pipeline (offline) |

---

## Hur prioriteringen funkar — vem "vinner"?

Användarens intuition: "scaffold variant lägger upp grundstruktur, dynamisk prompt läggs ovanpå". **Inte riktigt** — så här är det faktiskt:

| Lager | Vad det styr | Var i prompten | Override-bar av högre lager? |
|---|---|---|---|
| `prompt-core/*.md` (Core Rules) | Stack (Next 16, React 19, Tailwind v4, shadcn), output-format, behavior | **Prefix** till hela system-meddelandet | **Aldrig** (bryts inte) |
| `## Build Intent` + `## Custom Instructions` | Hård user-intent + dev-overrides | Tidigt i dynamisk del | Bara av Core Rules |
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

**Så svaret på "vem vinner":** Brief vinner över Variant, men bara där brief säger något konkret. Där brief är tyst tar variant över. Och scaffold-koden (TSX-filerna) levereras som baseline oavsett — variant ändrar bara visuell signatur ovanpå.

---

## Designprinciper

| Princip | Innebörd |
|---|---|
| Statisk prompt aldrig bryts | Core Rules (`prompt-core/*.md` listade i `codegen-core-manifest.json`) är spelregler för LLM:n. Inget i fas 1 får motsäga dem |
| Deep Brief = expansion + nominering | Brief returnerar JSON med (a) utbyggd intent, (b) `scaffoldNomination`, `variantNomination`, `dossierNominations`. Inget mer |
| Embedding är källa till sanning vid tvetydighet | Brief-nomineringen är en hint. Embedding-pick i orchestrate kan **bekräfta eller överrösta** med drift-logg |
| Ansvarsuppdelning | Scaffold = struktur. Variant = visuell signatur. Dossier = integration. Inga överlappande ansvar |
| Per-Request Signal Cascade | EXPLICIT (Brief-fält) > INDICATED (Brief-LLM tolkning) > INFERRED (heuristik i `guidance-resolvers.ts`) > DEFAULT (variant) > FALLBACK (statiska defaults i `prompt-core/`). Tidigare "Directive Cascade" + `prompt-directives/` är borttagna 2026-04-18 |
| Dossier som riktig kod | När dossier väljs ska dess `components/`-filer faktiskt levereras till output-projektet (`injectionMode: "verbatim"`), inte bara beskrivas för LLM:n |

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
                dossierNominations (med confidence)
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
[5] DOSSIER PICK (selectDossiersForRequest)
    - Filtrerar ut active dossiers (skippar source-archived/-stale/-unreachable)
    - Embedding-sökning över utökad query:
      prompt + 7 brief-fält + capabilityHints + routePlanSummary
    - Boost från scaffold-recommendations.json (alwaysInclude/primary/suggested)
    - Cap: max 1/kategori, max 5 totalt
    - Brief.dossierNominations loggas som drift mot final selection
        │
        ▼
[6] DYNAMIC CONTEXT BUILD (buildDynamicContext)
    Bygger ett 50-100 KB block med (i prioritetsordning):
    ├── Build Intent + Custom Instructions
    ├── Generation Profile + Generation Mode
    ├── Design Priority (per-request signal cascade)
    ├── Scaffold (filer + research priorities)
    ├── Scaffold Variant (signaturePatterns)
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
| Dossier-pick | Full embedding-pass | Full embedding-pass (kan ändras per follow-up) |
| Drift-detection | Loggas normalt | Loggas med `mode: "followUp"` så det kan filtreras |
| Brief-nominerings-fält | Färska från LLM | Kan vara stale (från init) — drift-loggar märker upp `mode` |

---

## Kontroll-punkter

| Checkpoint | Kommando |
|---|---|
| Brief returnerar nomineringar | Trigga generation, kolla `data/prompt-dumps/orchestration-dynamic/generation-input-package.json` för `brief.scaffoldNomination/variantNomination/dossierNominations` |
| Drift loggas | Sök terminal-output efter `[orchestrate] scaffold_drift`, `variant_drift`, `dossier_drift`. Brief-LLM-stavfel (id som inte finns i registry) loggas som `scaffold_unknown_brief_nomination` |
| Dossier-pick fungerar | `npm run dossiers:smoke-prompt` |
| Verbatim-block syns | Sök `## Dossier Files To Emit Verbatim` i `data/prompt-dumps/own-engine-codegen/full-system.md` |
| Källhälsa fungerar | `npm run dossiers:compat` |

---

## Status

Klart (✓): Brief-LLM strukturerad JSON · Brief-nomineringar (Fas 1.0) · Scaffold-pick (embedding + keyword hybrid) · Variant-pick (embedding mot signaturePatterns) · Drift-detection · Dossier-pick med utökad query (7 brief-fält) · Dossier instructions injicerat i prompt · Dossier-filer levererade verbatim (Fas 1.5) · GitHub-källhälsa per dossier · Vercel-katalog-utbyggnad (419 templates skrapade + GitHub-validerade).

Borttaget (2026-04-18): `config/prompt-static/` (16 filer) · `backoffice/pages/prompt_static.py` · Dead loader-fallback i `static-core-loader.ts`.

---

## Backlog (förbättringar)

| Idé | Värde | Storlek |
|---|---|---|
| Brief-LLM får dossier-nominering-hint från top-1 embedding pre-call | Lägre drift, snabbare iteration | Liten |
| `injectionPlan` i `DossierSelectionResult` (explicit lista över verbatim-filer) | Bättre observability | Liten |
| Variant kan override:a vissa scaffold-filer (t.ex. `app/page.tsx`) inom ramen | Större varians per scaffold | Stor — kräver merge-logic mellan variant + scaffold + brief |
| Dossier embedding inkluderar `topics` från GitHub | Bättre matchning för niche-integrationer | Liten |
| GitHub-health filter (skip `_status: source-archived`) i dossier-selection | Färre stale matchningar | Liten |
| Brief-LLM Zod-schema: scaffoldNomination required om buildIntent=website/template | Tydligare kontrakt | Liten |

---

## Risker + mitigations

| Risk | Mitigation |
|---|---|
| Brief-LLM hallucinerar dossier-id som inte finns | Validera mot master.json + skip ogiltiga med varning |
| Embedding-pick överröstar brief utan motiv | Drift-logg med båda pickar + reason → debugbar |
| Dossier-filer krockar med scaffold-filer (samma path) | Konflikt-detection före leverans → varna LLM eller ta scaffold-filen |
| Stale dossier-källa ger Next 14-mönster i Next 16-projekt | GitHub-health filter (kräver compat-test + github-enrich) |

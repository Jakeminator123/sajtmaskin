# LLM-flöde end-to-end (Fas 1)

> **Senast uppdaterad:** 2026-04-18 efter Fas 1.0 + 1.5 + Vercel-katalog-utbyggnad.
> **Syfte:** ge ett kort, praktiskt svar på "vad händer när användaren skickar en prompt?".
> **Ägare:** denna agent. Fas 2 (codegen-LLM-streaming) och Fas 3 (verify/repair/VM-dispatch) ägs av andra agenter.

---

## En mening först

> En användarprompt går genom **Deep Brief** (1 LLM-anrop) som returnerar en strukturerad brief + nomineringar; orchestrate.ts plockar **scaffold + variant + dossiers**; allt komponeras till en system-prompt med statisk **Core Rules**-prefix + dynamisk del; codegen-LLM:n får detta + den ursprungliga prompten och bygger sajten.

---

## Hur prioriteringen faktiskt funkar — vem "vinner"?

Användarens intuition: "scaffold variant lägger upp grundstruktur, dynamisk prompt läggs ovanpå". **Inte riktigt** — så här är det faktiskt:

| Lager | Vad det styr | Var i prompten | Override-bar av högre lager? |
|---|---|---|---|
| `prompt-core/*.md` (= statisk prompt) | Stack (Next 16, React 19, Tailwind v4, shadcn), output-format, behavior | **Prefix** till hela system-meddelandet | **Aldrig** (bryts inte) |
| `## Build Intent` + `## Custom Instructions` | Hård user-intent + dev-overrides | Tidigt i dynamisk del | Bara av Core Rules |
| **Scaffold** (filer + research) | **Faktiska TSX/CSS-filer + struktur-baseline** | `## Critical Scaffold Files` + `## Scaffold File Tree` | Inte direkt — LLM får anpassa men inte bryta strukturen |
| **Scaffold Variant** | Visuell signatur: `signaturePatterns`, `colorMode`, `fontPairings`, `themeTokens` | `## Scaffold Variant (this generation)` | Av brief-fält |
| **Brief** (Deep Brief output) | Project context, pages, sections, visual direction, mustHave/avoid | `## Project Context`, `## Visual Identity`, `## Pages & Sections`, `## Must Have`, `## Domain Inference` | Av user-locked theme tokens (UI-låsta värden) |
| **Dossier instructions** | Hur en integration ska användas | `## Available Dossiers` + `## Selected Dossier Instructions` | — (anpassningsbara) |
| **Dossier files (verbatim)** | Faktisk integration-glue (Stripe webhook, auth middleware) | `## Dossier Files To Emit Verbatim` | **Aldrig** — LLM måste emit:a oförändrade |
| Directive defaults (`prompt-directives/*.md`) | Visuell standardprosa | `## Visual Design Quality`, `## Coding Direction` (bara 2 av 12 injiceras) | Av allt högre |

**Den explicita ordningen** står i prompten själv som `## Design Priority`-block:

> 1. User-locked theme tokens (om satta i builder-UI) — absolut, bryts aldrig
> 2. Brief visual direction (colorPalette, typography, tone, domainProfile) — primary intent
> 3. Scaffold Variant defaults (theme tokens, font pairings, signature motif, prompt hints) — fallback när brief är tyst
> 4. Directive defaults — placeholder-text, sista utvägen

**Så svaret på "vem vinner":** `Brief` vinner över `Variant`, men bara där brief säger något konkret. Där brief är tyst tar variant över. Och scaffold-koden (TSX-filerna) levereras som baseline oavsett — variant ändrar bara visuell signatur ovanpå.

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
            └── Nomineringar (Fas 1.0): scaffoldNomination,
                variantNomination, dossierNominations (med confidence)
        │
        ▼
[3] SCAFFOLD PICK (orchestrate.ts)
    - matchScaffoldAuto: embedding + keyword hybrid
    - Brief.scaffoldNomination loggas som drift om mismatch
    - Selected scaffold determinerar bas-filerna
        │
        ▼
[4] VARIANT PICK (orchestrate.ts)
    - pickScaffoldVariantAsync: embedding mot signaturePatterns
    - Bara variants under valt scaffold (1:N)
    - Brief.variantNomination loggas som drift om mismatch
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
    ├── Design Priority (cascade-regel)
    ├── Scaffold (filer + research priorities)
    ├── Scaffold Variant (signaturePatterns)
    ├── Pages & Sections (från brief)
    ├── Project Context, Visual Identity, Imagery (från brief)
    ├── Must Have, Avoid, UI Notes (från brief)
    ├── Domain Inference, Quality Bar, Motion Level
    ├── Available Dossiers (lista)
    ├── Selected Dossier Instructions (per vald dossier)
    ├── Dossier Files To Emit Verbatim (Fas 1.5 — krävs oförändrade)
    ├── Route Plan + Pre-generation Contracts
    ├── Your Toolkit (shadcn + komponent-palette)
    ├── Component References (shadcn examples)
    └── Visual Design Quality + Coding Direction (de 2 directives som klistras in)
        │
        ▼
[7] COMPOSE FINAL SYSTEM PROMPT (composeEngineSystemPrompt)
    Output: prompt-core text + "\n\n---\n\n" + dynamic context
        │
        ▼
[8] CODEGEN LLM (Fas 2 — annan agent)
    - Får system + user-prompt + chat-historik
    - Streamar CodeProject-block (file="..." + content)
    - Verbatim-filer ska komma ut oförändrade
        │
        ▼
[9] VERIFY + REPAIR + VM-DISPATCH (Fas 3 — annan agent)
```

---

## Kontroll-punkter — hur du verifierar

| Checkpoint | Kommando |
|---|---|
| Brief returnerar nomineringar | Trigga generation, kolla `data/prompt-dumps/orchestration-dynamic/generation-input-package.json` för `brief.scaffoldNomination/variantNomination/dossierNominations` |
| Drift loggas | Sök terminal-output efter `[orchestrate] scaffold_drift`, `variant_drift`, `dossier_drift`. Brief-LLM-stavfel (id som inte finns i registry) loggas separat som `scaffold_unknown_brief_nomination` så äkta drift-signaler inte drunknar. |
| Dossier-pick fungerar | `npm run dossiers:smoke-prompt` |
| Verbatim-block syns | Sök `## Dossier Files To Emit Verbatim` i `data/prompt-dumps/own-engine-codegen/full-system.md` |
| Källhälsa fungerar | `npm run dossiers:compat` (ska visa ok=N stora antal nu) |

---

## Vad som ÄR klart (Fas 1)

| Komponent | Klart? |
|---|---|
| Brief-LLM med strukturerad JSON | ✓ |
| Brief-nomineringar (scaffold/variant/dossier med confidence) | ✓ Fas 1.0 |
| Scaffold-pick (embedding + keyword hybrid) | ✓ |
| Variant-pick (embedding mot signaturePatterns) | ✓ |
| Drift-detection (scaffold/variant/dossier + init/followUp-mode) | ✓ Fas 1.0 |
| Dossier-pick med utökad query (7 brief-fält) | ✓ Fas 1.0 |
| Dossier instructions injicerat i prompt | ✓ |
| **Dossier filer levererade verbatim** (`injectionMode: "verbatim"`) | ✓ Fas 1.5 |
| GitHub-källhälsa per dossier (compat-test) | ✓ |
| Vercel-katalog-utbyggnad (419 templates skrapade + GitHub-validerade) | ✓ |

## Vad som INTE är Fas 1 (rör inte)

| Komponent | Tillhör |
|---|---|
| Codegen-LLM streaming | Fas 2 |
| Post-stream finalize / file-merging | Fas 2 |
| Server-verify, autofix, repair | **Fas 3 — annan agent** |
| Quality gate, lifecycle stage | **Fas 3 — annan agent** |
| VM-dispatch, deploy till preview | **Fas 4** |
| OpenClaw / Sajtagent (assistent-yta) | Separat spår |

---

## Vad som kan förbättras härnäst (Fas 1.6+, om du vill)

| Idé | Värde | Storlek |
|---|---|---|
| Brief-LLM får dossier-nominering-hint från top-1 embedding pre-call | Lägre drift, snabbare iteration | Liten |
| `injectionPlan` i `DossierSelectionResult` (explicit lista över verbatim-filer) | Bättre observability | Liten |
| Variant kan override:a vissa scaffold-filer (t.ex. `app/page.tsx`) inom ramen | Större varians per scaffold | **Stor** — kräver merge-logic mellan variant + scaffold + brief |
| Substitutionsmotor för directives (`{{placeholder}}`) | Renare cascade | Medel — men inte nödvändig (cascade fungerar via separata block idag) |
| Dossier embedding inkluderar `topics` från GitHub | Bättre matchning för niche-integrationer | Liten |

---

## Ändringslogg

| Datum | Ändring |
|---|---|
| 2026-04-18 | Skapad efter att Fas 1.0 + 1.5 + Vercel-katalog-utbyggnaden klart. Konsoliderar `llm-flow-fas1-plan.md` (mål) med faktiskt körande implementation. |

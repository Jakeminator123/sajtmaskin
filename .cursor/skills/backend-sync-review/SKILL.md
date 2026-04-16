# Backend-Frontend Sync Review

Granskar kopplingen mellan frontend-wizard/builder och backend-generering. Säkerställer att ALL data som samlas in i frontend verkligen når motorn och att backend-kapaciteten utnyttjas maximalt.

**Trigger:** Användaren säger "Granska backend-sync", "backend review", "skill sync" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Varje bit data som samlas in ska nå modellen. Inget får tappas."
- Fokus: data som försvinner mellan frontend och backend, oanvända backend-features, felmappade fält

## Subagenter

### Agent 1 — Wizard Data → Needs Analysis Prompt
- **Fil:** `reviews/sync-01-wizard-prompt.txt`
- **Scope:** `src/components/builder/IntakeWizard.tsx`, `src/lib/builder/needs-analysis.ts`
- **Fokus:** Mappa VARJE wizard-fält till dess plats i `buildNeedsAnalysisPrompt`. Finns det fält som samlas in men aldrig används? `WizardAnswers` vs `WIZARD_FIELD_LABELS` — matchar de? `fieldMessages` — tappas någon?

### Agent 2 — Brief Pipeline
- **Fil:** `reviews/sync-02-brief.txt`
- **Scope:** `src/lib/builder/site-brief-generation.ts`, `src/lib/hooks/useInitBrief.ts`, `create-chat-stream-post.ts`
- **Fokus:** Deep Brief — genereras den korrekt? Når den motorn? `meta.brief` — kan den vara null? Vilka fält i Brief-schemat fylls i vs lämnas tomma? Tappar `parseChatRequestMeta` data?

### Agent 3 — Image Attachments Pipeline
- **Fil:** `reviews/sync-03-images.txt`
- **Scope:** `BuilderShellContent.tsx` (upload-logik), `create-chat-stream-post.ts`, `request-metadata.ts`
- **Fokus:** Uppladdade bilder → `uploadedMediaRef` → `attachments` → `requestAttachments` → `referenceAttachments`. Traceera EXAKT var varje bild hamnar. `mediaCatalog` — byggs den? `urlMap` — inkluderas bild-alias? Skrapade bilder vs uppladdade — behandlas de lika?

### Agent 4 — Theme & Colors Pipeline
- **Fil:** `reviews/sync-04-theme.txt`
- **Scope:** `useBuilderState.ts`, `BuilderShellContent.tsx`, `orchestrate.ts`, `system-prompt.ts`
- **Fokus:** `brandColors` från wizard → `designTheme` / `customThemeColors` → `themeColors` i orchestration → `themeOverride` i system prompt. Hela kedjan — tappas färger? Blir de rätt format (hex/hsl)?

### Agent 5 — Scaffold & Template Selection
- **Fil:** `reviews/sync-05-scaffold.txt`
- **Scope:** `orchestrate.ts`, `scaffolds/`, `template-library/`
- **Fokus:** Hur väljs scaffold? Matchar `scaffoldMode` och `scaffoldId` det som användaren angett? Template guidance — når den modellen? Variant-selection — fungerar den? Missas relevanta templates?

### Agent 6 — System Prompt Completeness
- **Fil:** `reviews/sync-06-system-prompt.txt`
- **Scope:** `src/lib/gen/system-prompt.ts`, `config/prompt-static/`
- **Fokus:** `buildDynamicContext` — vilka sektioner genereras? Vilka är tomma/saknas? `mediaCatalog`, `brief`, `themeOverride`, `designReferences` — är alla fyllda? Budgetpruning — klipps viktig data bort?

### Agent 7 — Image Materializer & Finalize
- **Fil:** `reviews/sync-07-materializer.txt`
- **Scope:** `src/lib/gen/post-process/image-materializer.ts`, `finalize-version.ts`
- **Fokus:** `materializeImages` — tar den emot `userMediaUrls`? Används de FÖRE Unsplash? `expandUrls` — expanderas `{{USER_IMG_n}}` korrekt? Skriver modellen `{{alias}}`-tokens eller ignorerar den dem?

### Agent 8 — Oanvänd Backend-kapacitet
- **Fil:** `reviews/sync-08-unused-capacity.txt`
- **Scope:** `src/lib/gen/`, `src/lib/own-engine/`, `config/`
- **Fokus:** Backend-features som finns men inte används av frontend: `imageGenerations`, `componentPalette`, `designThemePreset`, `capabilityHints`, `preGenerationContracts`. Vilka ger bättre resultat om de aktiveras? Vilka modell-tiers finns men används aldrig?

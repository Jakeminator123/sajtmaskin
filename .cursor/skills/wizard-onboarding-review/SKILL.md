# Wizard & Onboarding Review

Apple-minimalist UX-granskning av intake-wizarden: stegflöde, formulär, skrapning, media och onboarding.

**Trigger:** Användaren säger "Granska wizard", "review wizard", "skill 4" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Wizarden ska kännas som iPhone-setup — ett steg i taget, aldrig överväldigande."
- Fokus: onödig text/frågor, visuellt brus, flödeslogik, dålig copy

## Subagenter

### Agent 1 — Stegflöde & Progression
- **Fil:** `reviews/wizard-01-flow.txt`
- **Scope:** `src/components/builder/IntakeWizard.tsx` (steps-array, StepId, navigation)
- **Fokus:** Antal steg — är det för många? Kan steg slås ihop? Är ordningen logisk? Kan man hoppa över steg? Visar progress-dots tydligt var man är?

### Agent 2 — Formulärfält & Input
- **Fil:** `reviews/wizard-02-forms.txt`
- **Scope:** `IntakeWizard.tsx` (step-komponenter: BusinessStep, OfferStep, etc.)
- **Fokus:** Fältdesign, labels, placeholders, validering. Är fälten för många per steg? Är labels tydliga? Finns det smart autofill? Är obligatoriska fält markerade?

### Agent 3 — Skrapning & Progress-banner
- **Fil:** `reviews/wizard-03-scraping.txt`
- **Scope:** `IntakeWizard.tsx` (handleScrape, scrapeProgress, progress-modal)
- **Fokus:** Skrapnings-UX: progress-bannern, fastext, vad visas medan man väntar. Är det tydligt vad som händer? Kan man avbryta? Vad händer vid fel?

### Agent 4 — Kategori & Modulväljare
- **Fil:** `reviews/wizard-04-modules.txt`
- **Scope:** `IntakeWizard.tsx` (PagesStep, FEATURE_MODULES)
- **Fokus:** Modulväljar-UX: är korten tydliga? Är kategorierna logiska? Är ikoner hjälpsamma? Kan man söka/filtrera? Jämför med Shopify app-gallery.

### Agent 5 — Media Upload
- **Fil:** `reviews/wizard-05-media.txt`
- **Scope:** `IntakeWizard.tsx` (MediaStep, scrapedImages)
- **Fokus:** Drag-and-drop-ytan, skrapade bilder, context-input. Är det tydligt hur man laddar upp? Fungerar preview? Är skrapade bilder-väljaren intuitiv?

### Agent 6 — Copy & Mikro-text
- **Fil:** `reviews/wizard-06-copy.txt`
- **Scope:** Alla text-strängar i `IntakeWizard.tsx`
- **Fokus:** KRITISKT — all synlig text. Lista VARJE rubrik, beskrivning, placeholder och knapptext. Vilka kan kortas? Vilka kan tas bort helt? Apple-regel: om det kan sägas med 3 ord, använd inte 10.

### Agent 7 — Animationer & Övergångar
- **Fil:** `reviews/wizard-07-motion.txt`
- **Scope:** `IntakeWizard.tsx` (steg-transitions, MOTION-klass)
- **Fokus:** Steg-övergångar (slide/fade), knapp-animationer, progress-animation. Är de smidiga? Rätt hastighet? Finns det jank? Jämför med iOS Settings-slides.

### Agent 8 — Data → Deep Brief Pipeline
- **Fil:** `reviews/wizard-08-data-pipeline.txt`
- **Scope:** `IntakeWizard.tsx` (onComplete, fieldMessages), `src/lib/builder/needs-analysis.ts`
- **Fokus:** Vilken wizard-data når deep brief? Vilka fält tappas? Är fieldMessages-formatet optimalt? Når skrapade bilder/modulval till LLM:en? Verifiera hela dataflödet.

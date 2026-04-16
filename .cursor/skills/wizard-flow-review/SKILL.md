# Wizard & Onboarding Flow Review

Granskar wizarden från start till generation: frågornas kvalitet, flödet, bildhantering, skrapning, och dataöverföring till backend.

**Trigger:** Användaren säger "Granska wizard", "wizard flow review", "skill wizard" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Wizarden ska vara så kort och smart att användaren knappt märker den."
- Fokus: frågornas relevans, datakvalitet, bildhantering, produktskrapning

## Subagenter

### Agent 1 — Question Flow & Step Count
- **Fil:** `reviews/wizard-flow-01-steps.txt`
- **Scope:** `src/components/builder/IntakeWizard.tsx`
- **Fokus:** Hur många steg finns? Vilka frågor ställs? Kan steg slås ihop? Vilka frågor kan AI:n svara på själv baserat på skrapning? Finns det dead-end-steg?

### Agent 2 — Scraping Quality (Products)
- **Fil:** `reviews/wizard-flow-02-scraping.txt`
- **Scope:** `src/lib/builder/company-intel.ts`, `src/app/api/builder/company-intel/route.ts`
- **Fokus:** Webshop-skrapning — hittas produktbeskrivningar? Produktbilder? Priser? Kategorier? Logo? Vilken data missas? Vilka selektorer/patterns används? Kan cheerio/metadata-parsing förbättras?

### Agent 3 — Image & Logo Collection
- **Fil:** `reviews/wizard-flow-03-images.txt`
- **Scope:** `IntakeWizard.tsx` (MediaStep), `BuilderShellContent.tsx` (upload-logik)
- **Fokus:** Hur samlas bilder in? Skrapade vs uppladdade. Försvinner bilder på vägen? Logotyp-detection — fungerar den? Taggas bilder med rätt purpose (logo, product, hero)?

### Agent 4 — Data Pipeline to Backend
- **Fil:** `reviews/wizard-flow-04-pipeline.txt`
- **Scope:** `BuilderShellContent.tsx` (handleIntakeWizardComplete), `needs-analysis.ts`
- **Fokus:** Vad händer med wizard-data? Vilka fält når `buildNeedsAnalysisPrompt`? Tappas information? Mappas fält korrekt? Nyckeldata: `siteType`, `offer`, `brandColors`, `targetAudience`, `primaryCta`.

### Agent 5 — Smart Defaults & Auto-fill
- **Fil:** `reviews/wizard-flow-05-autofill.txt`
- **Scope:** `IntakeWizard.tsx`, scrape-relaterad logik
- **Fokus:** Prefylls fält automatiskt från skrapning? Företagsnamn, adress, telefon, öppettider. Vilka fält KAN auto-fyllas men gör det inte? Kan AI:n föreslå svar?

### Agent 6 — Wizard UX & Visual Design
- **Fil:** `reviews/wizard-flow-06-ux.txt`
- **Scope:** `IntakeWizard.tsx` (UI-komponenter)
- **Fokus:** Visuell design — modal, bakgrund, knappar, typografi. Progression-indikator. Back-knapp. Animationer mellan steg. Keyboard-navigering. Mobil-UX.

### Agent 7 — Product Input Step
- **Fil:** `reviews/wizard-flow-07-products.txt`
- **Scope:** `IntakeWizard.tsx` (ProductStep/MenuStep)
- **Fokus:** Produktinmatning för webshoppar — kan man lägga till produkter med bild, beskrivning, pris, kategori? Taggar (Populärt, Nyhet, Rea)? Bulk-import? Drag-and-drop ordning? Skrapade produkter — visas de med bilder?

### Agent 8 — Wizard Completion & Handoff
- **Fil:** `reviews/wizard-flow-08-handoff.txt`
- **Scope:** `IntakeWizard.tsx` (finish-logik), `BuilderShellContent.tsx`
- **Fokus:** Vad händer vid "Fortsätt"? Visas en sammanfattning? Kan användaren redigera innan generation startar? "Bygga nu" vs "Ändra..." — är flödet tydligt? Startar generation automatiskt?

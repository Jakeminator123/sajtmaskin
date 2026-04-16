# Generation Quality & Uniqueness Review

Granskar att genererade sajter är unika, visuellt starka, och utnyttjar alla tillgängliga moduler/design-variationer. Ingen sajt ska se "generisk" ut.

**Trigger:** Användaren säger "Granska generering", "quality review", "skill quality" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Varje genererad sajt ska se ut som en unik, handgjord design — inte AI-genererad."
- Fokus: variation i design, bildanvändning, innehållskvalitet, modulvariation

## Subagenter

### Agent 1 — Page Structure Variety
- **Fil:** `reviews/quality-01-structure.txt`
- **Scope:** `src/lib/builder/needs-analysis.ts` (buildPageStructure)
- **Fokus:** Sidstrukturen — genereras tillräckligt många sidor? Minst 3 vid init? Är sektionerna varierande per bransch? Finns det tillräckligt med sektionstyper (hero, features, testimonials, CTA, FAQ, team, gallery)? Upprepas samma mönster?

### Agent 2 — Prompt Quality for Init
- **Fil:** `reviews/quality-02-init-prompt.txt`
- **Scope:** `src/lib/builder/needs-analysis.ts` (buildNeedsAnalysisPrompt)
- **Fokus:** Init-prompten — är den tillräckligt detaljerad? Ger den modellen tillräckligt med kontext om företaget? Finns det branschspecifika instruktioner? Tone-of-voice? Innehållskvalitet — säger den åt modellen att skriva RIKTIGA texter?

### Agent 3 — Scaffold Variety
- **Fil:** `reviews/quality-03-scaffolds.txt`
- **Scope:** `src/lib/gen/scaffolds/`, `scaffold-variants.ts`
- **Fokus:** Hur många scaffolds finns? Variants per scaffold? Väljs de tillräckligt varierat? Har alla branscher minst en bra scaffold? Finns det scaffolds som aldrig väljs? `sessionSeed` — ger den tillräcklig variation?

### Agent 4 — Design Theme Variation
- **Fil:** `reviews/quality-04-themes.txt`
- **Scope:** `src/lib/builder/theme-presets.ts`, `system-prompt.ts` (theme-sektion)
- **Fokus:** Temapresets — hur många finns? Appliceras användarens `brandColors` korrekt? Blir alla sajter samma blå/grå-schema om inga färger anges? Typografi — varieras fonter mellan sajter?

### Agent 5 — Image & Media Usage
- **Fil:** `reviews/quality-05-images.txt`
- **Scope:** `config/prompt-static/06-images.md`, `image-materializer.ts`, `system-prompt.ts`
- **Fokus:** Bildanvändning — placeholder-texter, Unsplash-kvalitet. Användarens bilder — prioriteras de? Logo-placering. Hero-bilder — är de tillräckligt stora/varierade? Bildtexter i `text`-parametern — är de branschspecifika?

### Agent 6 — Content Quality (Swedish)
- **Fil:** `reviews/quality-06-content.txt`
- **Scope:** `needs-analysis.ts` (språk/ton-sektion), `config/prompt-static/`
- **Fokus:** Svenskan — är den naturlig? Finns det engelska läckor? Kundcitat — trovärdiga? Produktbeskrivningar — generiska eller anpassade? CTA-texter — varierade? SEO-metadata — unik per sida?

### Agent 7 — Component & Module Variety
- **Fil:** `reviews/quality-07-components.txt`
- **Scope:** `src/lib/gen/capability-inference.ts`, `route-plan.ts`, shadcn-exempel
- **Fokus:** Vilka UI-komponenter/moduler kan modellen använda? shadcn-komponenter — vilka är tillgängliga? Används accordion, tabs, carousel, dialog tillräckligt? Finns det moduler som aldrig genereras?

### Agent 8 — Follow-up Generation Quality
- **Fil:** `reviews/quality-08-followup.txt`
- **Scope:** `src/lib/gen/orchestrate.ts` (followUp-mode), `finalize-version.ts`
- **Fokus:** Vad händer vid "Lägg till en undersida" eller "Ändra färgschema"? Behålls befintlig design/layout? Genereras hela sajten om eller bara deltan? Kvalitet på follow-up vs init — degraderar den?

# Templates & Discovery Review

Apple-minimalist UX-granskning av template-galleriet, kategorisidor och template-väljaren i buildern.

**Trigger:** Användaren säger "Granska templates", "review gallery", "skill 7" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Templates ska inspirera — som App Store featured cards. Ren, visuell, minimal text."
- Fokus: kortdesign, bildkvalitet, onödig text, sökning/filtrering

## Subagenter

### Agent 1 — Gallery Grid & Layout
- **Fil:** `reviews/tpl-01-grid.txt`
- **Scope:** `src/components/templates/template-gallery.tsx`
- **Fokus:** Grid-layout, kortproportioner, spacing. Är korten lika stora? Är gridet responsivt? Finns det lazy loading? Jämför med Dribbble/Behance grid.

### Agent 2 — Template Cards
- **Fil:** `reviews/tpl-02-cards.txt`
- **Scope:** `template-gallery.tsx` (kort-komponenter)
- **Fokus:** Kortens innehåll — bild, titel, beskrivning, tags. Finns det för mycket text? Är bilden dominant? Hover-effekter? Jämför med App Store cards.

### Agent 3 — Kategori-navigering
- **Fil:** `reviews/tpl-03-categories.txt`
- **Scope:** `src/app/category/[type]/page.tsx`, `src/app/templates/page.tsx`
- **Fokus:** Kategori-filter, tabs/chips, URL-routing. Är kategorier logiska? Kan man filtrera på flera? Finns det en "alla"-vy? Jämför med Shopify themes.

### Agent 4 — Preview Modal
- **Fil:** `reviews/tpl-04-modal.txt`
- **Scope:** `src/components/templates/preview-modal.tsx`
- **Fokus:** Template-preview i modal/popup. Storlek, bildvisning, info-layout. Kan man se sajten live? Finns det en "använd denna"-knapp? Är den snabb att öppna?

### Agent 5 — Template Picker Popup (i Builder)
- **Fil:** `reviews/tpl-05-picker.txt`
- **Scope:** `src/components/builder/TemplatePickerPopup.tsx`
- **Fokus:** In-builder template-väljaren. Hur öppnar man den? Är den förvirrande vs galleriet? Dubblerar den funktionalitet? Kan den förenklas?

### Agent 6 — Sök & Filter
- **Fil:** `reviews/tpl-06-search.txt`
- **Scope:** Template-sidor, sökfunktionalitet
- **Fokus:** Finns det sök? Fungerar det? Kan man filtrera på bransch, stil, funktioner? Är resultaten relevanta? Jämför med Vercel templates-sök.

### Agent 7 — Quick Prompts
- **Fil:** `reviews/tpl-07-quickprompts.txt`
- **Scope:** `category/[type]/page.tsx` (quick prompts-sektion)
- **Fokus:** Quick prompt-chips. Är de hjälpsamma? Relevanta? För många? Kan man se vad de gör innan man klickar? Jämför med ChatGPT suggested prompts.

### Agent 8 — Template → Builder Flöde
- **Fil:** `reviews/tpl-08-flow.txt`
- **Scope:** Template-sidor → builder-routing, dataöverföring
- **Fokus:** Vad händer när man klickar "Skapa" på en template? Skickas man till builder med rätt data? Startar wizarden? Förpopuleras fält? Är övergången smidig eller abrupt?

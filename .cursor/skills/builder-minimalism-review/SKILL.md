# Builder Minimalism & Progressive Disclosure Review

Granskar hela buildern ur perspektivet: "Visa så lite som möjligt, dölj resten bakom snygga expanderbara menyer." Post-generation-ytan, toolbars, metadata, filer, rutter — allt ska vara minimerat som default.

**Trigger:** Användaren säger "Granska minimalism", "minimalistisk review", "skill minimalism" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Default = rent. Avancerat = gömt bakom ett klick."
- Fokus: vad som visas som standard som borde vara dolt, onödiga labels/text, UI-element som kan kollapsa

## Subagenter

### Agent 1 — Post-Generation Suggestions
- **Fil:** `reviews/minimal-01-suggestions.txt`
- **Scope:** `src/app/builder/BuilderShellContent.tsx`, `src/components/builder/ChatInterface.tsx`, `PostGenerationAdvisor.tsx`, `NextStepPickerPopup.tsx`
- **Fokus:** Förslagschips efter generation — är de för många? Tar de för mycket yta? Bör de ligga i en "Vad vill du göra?"-dropdown istället för inline? Är texterna för långa?

### Agent 2 — Preview Chrome & Routes
- **Fil:** `reviews/minimal-02-preview-chrome.txt`
- **Scope:** `src/components/builder/preview-panel/PreviewPanelChrome.tsx`
- **Fokus:** Routes-bar (/, /om, /boka etc.) — visas för många rutter? Bör hela ruttlistan vara kollapsad bakom en dropdown? Verktyg-menyn — kan den förenklas? Device-switcher — bör den vara dold som default?

### Agent 3 — File Tree & Code Panel
- **Fil:** `reviews/minimal-03-files.txt`
- **Scope:** `src/components/builder/preview-panel/`, kodredigeringsvy
- **Fokus:** Fillistan som visas efter generation (layout.tsx, globals.css etc.) — ska den vara synlig alls som default? Kan den ligga bakom "Visa filer" / "Kod"? Kodpanelen — när ska den visas?

### Agent 4 — Sidebar & Metadata
- **Fil:** `reviews/minimal-04-metadata.txt`
- **Scope:** `src/app/builder/BuilderShellContent.tsx`, sidopaneler
- **Fokus:** Projektinställningar, metadata, "Publicera"-knapp. Vad ska vara synligt utan att klicka? Ska "Publicera" vara den ENDA synliga knappen i headern? Kan resten döljas bakom "..." eller "Inställningar"?

### Agent 5 — Chat Input & Advanced
- **Fil:** `reviews/minimal-05-chat-input.txt`
- **Scope:** `src/components/builder/ChatInterface.tsx`, `src/components/ai-elements/prompt-input/`
- **Fokus:** "Avancerat"-sektionen under chatinput — vad ska synas vs döljas? Bifoga-knappar, modellval, systempromptar. Bör allt utom textfält + skicka-knapp vara dolt som default?

### Agent 6 — Builder Header
- **Fil:** `reviews/minimal-06-header.txt`
- **Scope:** `src/components/builder/BuilderHeader.tsx`
- **Fokus:** Hur minimal kan headern bli? Bara logotyp + "Publicera"? Kan allt annat (projektnamn, versions-info, undo/redo) döljas i en meny?

### Agent 7 — Empty States & Loading
- **Fil:** `reviews/minimal-07-empty-states.txt`
- **Scope:** `src/components/builder/preview-panel/PreviewPanelEmptyState.tsx`, `GenerationProgress.tsx`
- **Fokus:** Laddnings-UI under generation — är texterna för långa? Kan det vara ännu enklare? "Bygger din sajt..." med en progress-bar räcker? Ikon + en rad text max.

### Agent 8 — Overall Information Density
- **Fil:** `reviews/minimal-08-density.txt`
- **Scope:** Alla builder-komponenter
- **Fokus:** Totalbild — gör en "pixel audit". Vilka UI-element finns synliga direkt efter generation? Lista varje synligt element och bedöm: BEHÅLL / DÖLJ / TA BORT. Mål: max 5 synliga kontroller utöver preview + chatinput.

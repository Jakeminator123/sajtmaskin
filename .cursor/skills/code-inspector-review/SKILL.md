# Code Editor & Inspector Review

Apple-minimalist UX-granskning av kodpanelen, inspektorn och utvecklarverktygen i buildern.

**Trigger:** Användaren säger "Granska code editor", "review inspector", "skill 6" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Kodpanelen ska vara för power users — ren, snabb, inte i vägen för vanliga användare."
- Fokus: tillgänglighet för icke-utvecklare, onödig komplexitet, visuell renhet

## Subagenter

### Agent 1 — Kod-panel Tabbar & Navigation
- **Fil:** `reviews/code-01-tabs.txt`
- **Scope:** `src/components/builder/preview-panel/PreviewPanelCode.tsx`
- **Fokus:** Fil-tabbar, navigering mellan filer. Är tabbar tydliga? Kan man söka i filer? Finns det en filträd-vy? Jämför med VS Code — progressivt avslöjande.

### Agent 2 — Kodeditor & Syntax
- **Fil:** `reviews/code-02-editor.txt`
- **Scope:** `PreviewPanelCodeSectionEditors.tsx`
- **Fokus:** Syntax highlighting, fontstorlek, radnummer. Är editorn läsbar? Kan man kopiera kod? Finns det line wrapping? Är tema/färger konsekventa med resten?

### Agent 3 — Inspector Overlay
- **Fil:** `reviews/code-03-inspector.txt`
- **Scope:** `PreviewPanelInspectorDev.tsx`
- **Fokus:** Inspektörens utseende och funktionalitet. Vad visar den? Är den förvirrande för icke-utvecklare? Borde den vara dold by default? Jämför med Chrome DevTools element inspector.

### Agent 4 — Preview ↔ Kod Synk
- **Fil:** `reviews/code-04-sync.txt`
- **Scope:** Preview-panel, kod-panel, click-to-source
- **Fokus:** Kan man klicka i preview och se motsvarande kod? Synkas scroll? Markeras aktiv komponent? Finns det "inspect element"-funktionalitet?

### Agent 5 — Copy & Export
- **Fil:** `reviews/code-05-export.txt`
- **Scope:** Kod-panel, export/download-knappar
- **Fokus:** Kan man kopiera enskilda filer? Ladda ner hela projektet? Exportera till GitHub? Är copy-knappen synlig? Finns det feedback vid kopiering?

### Agent 6 — Redigering i Kodpanelen
- **Fil:** `reviews/code-06-editing.txt`
- **Scope:** Kodpanel, om redigering stöds
- **Fokus:** Kan man redigera kod direkt? Uppdateras preview live? Finns det undo? Är det tydligt att man redigerar? Risk att man förstör sin sajt?

### Agent 7 — Backend-funktioner Tillgängliga via UI
- **Fil:** `reviews/code-07-backend-features.txt`
- **Scope:** Alla builder-komponenter, backend API-routes
- **Fokus:** KRITISKT — vilka backend-funktioner (spara, publicera, domän, versioner, undo, deploy) finns men saknar UI-koppling? Lista alla API-routes under `/api/` och markera vilka som har frontend-UI och vilka som saknar det.

### Agent 8 — Dev Tools Access
- **Fil:** `reviews/code-08-devtools.txt`
- **Scope:** Inspector, konsol-output, error boundaries
- **Fokus:** Finns det en inbyggd konsol/logg? Visar den build-errors? Kan icke-tekniska användare förstå den? Borde dev-tools vara helt dolda och bara tillgängliga via shortcut?

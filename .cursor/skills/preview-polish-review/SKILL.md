# Preview Panel Polish Review

Granskar preview-panelen: iframe-rendering, laddningsstates, device-switcher, navigation, och den övergripande "wow-faktorn" när sajten visas.

**Trigger:** Användaren säger "Granska preview", "preview polish", "skill preview" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Preview ska kännas som att man tittar på sin RIKTIGA sajt — inte ett utvecklarverktyg."
- Fokus: visuell kvalitet, laddningstider, sömlösa övergångar, minimal chrome

## Subagenter

### Agent 1 — iframe Background & First Paint
- **Fil:** `reviews/preview-polish-01-firstpaint.txt`
- **Scope:** `PreviewPanelFrame.tsx`, `preview-host/src/runtime.js`
- **Fokus:** Vad ser användaren FÖRST? Svart flash? Vit flash? Bakgrundsfärg-matchning mellan preview-host och builder. Hur snabbt ser man content? Behövs en skeleton-loader?

### Agent 2 — GenerationProgress UX
- **Fil:** `reviews/preview-polish-02-progress.txt`
- **Scope:** `GenerationProgress.tsx`, `PreviewPanelEmptyState.tsx`
- **Fokus:** Progressbaren — är den trovärdig? Matchar procenttalen verkligheten? Statustexter ("Bygger backend...", "Väljer fonter...") — är de tillräckligt varierande? Kan den vara ännu enklare?

### Agent 3 — Device Switcher
- **Fil:** `reviews/preview-polish-03-devices.txt`
- **Scope:** `PreviewPanelChrome.tsx`, device-relaterade delar
- **Fokus:** Desktop/tablet/mobil-switcher. Är övergången smooth? Behöver den finnas synligt eller kan den döljas? Storlekar korrekta? Har devicen en realistisk frame/bezel?

### Agent 4 — Route Navigation
- **Fil:** `reviews/preview-polish-04-routes.txt`
- **Scope:** `PreviewPanelChrome.tsx`, `preview-route-helpers.ts`, hooks
- **Fokus:** Ruttnavigering i preview — fungerar den pålitligt? Back/forward? Är aktiv rutt tydligt markerad? Vad händer vid 404? Bör navigeringen se ut som en riktig webbläsar-adressfält?

### Agent 5 — Preview Loading States
- **Fil:** `reviews/preview-polish-05-loading.txt`
- **Scope:** `PreviewPanelFrame.tsx`, `PreviewPanelEmptyState.tsx`
- **Fokus:** Alla övergångar: tom → laddning → preview → ny version. Finns det blinkningar? Dubbel-rendering? Visas gammal version medan ny laddas? Smooth fade-in?

### Agent 6 — Refresh & Error States
- **Fil:** `reviews/preview-polish-06-errors.txt`
- **Scope:** `PreviewPanelChrome.tsx`, `PreviewPanelFrame.tsx`, error-hantering
- **Fokus:** Vad händer vid build-fel? Timeout? Nätverksfel? Är felmeddelandena användbara? Finns det en tydlig "Försök igen"-knapp? Stackar fel ihop sig?

### Agent 7 — Zoom & Scroll
- **Fil:** `reviews/preview-polish-07-zoom.txt`
- **Scope:** `PreviewPanelFrame.tsx`, zoom-kontroller
- **Fokus:** Kan man zooma in/ut i preview? Scroll-beteende — synkar det med device-frame? Är scroll-baren synlig/dold? Touch-scroll på surfplatta?

### Agent 8 — Preview vs Production Parity
- **Fil:** `reviews/preview-polish-08-parity.txt`
- **Scope:** `preview-host/`, `runtime.js`, `placeholder-svg.js`
- **Fokus:** Hur likt är preview-resultatet det som deployade sajten ser ut som? Skillnader i fonts, färger, bilder, layout? Next.js-version, Tailwind-version — matchar de?

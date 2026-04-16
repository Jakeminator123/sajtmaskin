# Preview Panel & VM Review

Apple-minimalist UX-granskning av preview-panelen: iframe, VM-anslutning, den svarta rutan och laddningstillstånd.

**Trigger:** Användaren säger "Granska preview VM", "review preview", "skill 3" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Preview ska vara som Quick Look — omedelbar, ren, inget chrome i vägen."
- Fokus: den svarta rutan, onödigt chrome, laddningstider, visuellt brus

## Subagenter

### Agent 1 — Svarta Rutan / Empty State
- **Fil:** `reviews/preview-01-empty-state.txt`
- **Scope:** `src/components/builder/preview-panel/PreviewPanelEmptyState.tsx`
- **Fokus:** KRITISKT — den svarta/mörka rutan som dyker upp innan sajten skapas. Vad visar den? Varför är den svart? Vad BORDE den visa istället? Kan den visa en mjuk illustration, en kort text, eller helt enkelt vara vit? Jämför med Figma empty canvas.

### Agent 2 — Iframe Chrome & Toolbar
- **Fil:** `reviews/preview-02-chrome.txt`
- **Scope:** `src/components/builder/preview-panel/PreviewPanelChrome.tsx`
- **Fokus:** URL-bar, device-knappar, verktygsknappar. Hur mycket plats tar toolbaren? Kan den krympas? Finns onödiga badges/labels? Jämför med Safari inspector — minimal chrome.

### Agent 3 — VM-anslutning & Loading
- **Fil:** `reviews/preview-03-vm-loading.txt`
- **Scope:** `PreviewPanelFrame.tsx`, `src/lib/builder/preview-session/`
- **Fokus:** Vad händer medan VM startar? Hur lång tid tar det? Vad ser användaren? Finns det en smooth transition från "laddar" till "redo"? Vad händer vid VM-fel?

### Agent 4 — Device Preview Modes
- **Fil:** `reviews/preview-04-devices.txt`
- **Scope:** `PreviewPanelChrome.tsx`, device-switchar
- **Fokus:** Desktop/tablet/mobil-switchar. Är de intuitiva? Smooth transition mellan storlekar? Reflekterar de verklig responsivitet? Jämför med Chrome DevTools device toolbar.

### Agent 5 — Route Navigation
- **Fil:** `reviews/preview-05-routes.txt`
- **Scope:** `PreviewPanelChrome.tsx` (route pills)
- **Fokus:** Hur navigerar man mellan sidor i preview? Är route-pills tydliga? Kan man se alla sidor? Finns det en sitemap-vy? Jämför med Webflow page navigator.

### Agent 6 — Composer Overlay (Visual Edit)
- **Fil:** `reviews/preview-06-composer.txt`
- **Scope:** `src/components/builder/preview-panel/PreviewPanelComposer.tsx`
- **Fokus:** Composer/visual edit mode. Hur aktiveras det? Är hint-card tydlig? Kan man redigera direkt i preview? Jämför med Squarespace inline editing.

### Agent 7 — Felhantering & Fallbacks
- **Fil:** `reviews/preview-07-errors.txt`
- **Scope:** `PreviewPanelFrame.tsx`, felstates
- **Fokus:** Vad händer om iframe inte laddar? 404? Timeout? Är felmeddelanden hjälpsamma? Kan man refresha? Finns det en graceful degradation?

### Agent 8 — Preview ↔ Backend-koppling
- **Fil:** `reviews/preview-08-backend.txt`
- **Scope:** `src/lib/builder/preview-session/`, `src/lib/gen/preview/`
- **Fokus:** Hur kopplas preview till VM/sandbox? Vilken data flödar? Finns det race conditions? Är reconnect-logiken robust? Vilka API-anrop görs och kan de optimeras?

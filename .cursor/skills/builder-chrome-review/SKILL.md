# Builder Chrome & Layout Review

Apple-minimalist UX-granskning av builderns yttre skal: header, paneler, layout och navigation.

**Trigger:** Användaren säger "Granska builder chrome", "review chrome", "skill 1" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Varje pixel räknas. Minimalism = ta bort, inte lägga till."
- Fokus: onödig text, visuellt brus, dålig hierarki, saknad funktionalitet, responsivitet

## Subagenter

### Agent 1 — Header & Top Bar
- **Fil:** `reviews/chrome-01-header.txt`
- **Scope:** `src/components/builder/BuilderHeader.tsx`
- **Fokus:** Hur mycket yta tar headern? Kan den krympas? Finns onödiga knappar/text? Är overflow-menyn logisk? Jämför med Apple-appar (Pages, Keynote) — minimal top bar.

### Agent 2 — Panel Split & Proportioner
- **Fil:** `reviews/chrome-02-panels.txt`
- **Scope:** `src/app/builder/BuilderLayout.tsx`, `BuilderShellContent.tsx`
- **Fokus:** Chat vs preview-proportioner. Är default-splitten optimal? Kan chat-panelen kollapsa helt? Finns det onödiga marginaler/padding?

### Agent 3 — Responsiv Layout (Mobil)
- **Fil:** `reviews/chrome-03-responsive.txt`
- **Scope:** `BuilderShellContent.tsx`, `BuilderLayout.tsx`
- **Fokus:** Mobil-tabbar (chat/preview switch). Fungerar touch? Är tab-switchen tydlig? Kan man nå alla funktioner på mobil?

### Agent 4 — Navigation & Routing
- **Fil:** `reviews/chrome-04-navigation.txt`
- **Scope:** `src/app/builder/`, breadcrumbs, URL-struktur
- **Fokus:** Kan man navigera tillbaka? Finns det dead-end states? Är URL:er deeplinkbara? Back-knapp-beteende.

### Agent 5 — Toolbar Density
- **Fil:** `reviews/chrome-05-toolbar.txt`
- **Scope:** `BuilderHeader.tsx`, `PreviewPanelChrome.tsx`
- **Fokus:** Antal synliga knappar/ikoner. Finns det redundanta kontroller? Kan fler saker grupperas? Jämför med Figma/Notion — progressivt avslöjande.

### Agent 6 — Whitespace & Visuell Hierarki
- **Fil:** `reviews/chrome-06-whitespace.txt`
- **Scope:** Alla builder-komponenter
- **Fokus:** Padding/margin-konsistens. Finns det ställen med för lite eller för mycket whitespace? Är den visuella hierarkin tydlig (primär/sekundär/tertiär)?

### Agent 7 — Motion & Transitions
- **Fil:** `reviews/chrome-07-motion.txt`
- **Scope:** CSS/Tailwind-animationer i builder-komponenter
- **Fokus:** Är övergångar konsekventa? Finns det jank eller för långa animationer? Saknas det transitions där det borde finnas? Apple-standard: 200–300ms ease-out.

### Agent 8 — Dark Mode & Temahantering
- **Fil:** `reviews/chrome-08-theme.txt`
- **Scope:** `globals.css`, CSS-variabler, Tailwind config
- **Fokus:** Används CSS-variabler konsekvent? Finns hardkodade färger? Är dark mode disabled medvetet och dokumenterat? Fungerar temat end-to-end?

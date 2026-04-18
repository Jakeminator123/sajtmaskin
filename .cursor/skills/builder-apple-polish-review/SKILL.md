# Builder Apple Polish Review

Granskar hela builder-ytan (chrome, paneler, chat, preview, overlays, knappar, typografi, färg, motion) ur perspektivet: "Byggd av Apples marknadsavdelning — ikon-fri, typografi-driven, lugn, självsäker."

**Trigger:** Användaren säger "apple polish", "Apple-pass builder", "skill apple polish" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar sin yta, läser alla relevanta filer, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt.
- Perspektiv: "Vi är Apple. Borttaget är bättre än tillagt. Typografi > ikoner. Vitt ljus > färgat brus."
- Fokus: rester av AI-estetik (Sparkles, gradienter, neon, emojis), spretig typografi, oklar hierarki, onödiga dividers, tjocka shadows, icke-SF-likt spacing.
- Jämför alltid mot apple.com, Pages, Keynote, iWork Preview — inte mot generiska SaaS-mallar.

## Subagenter

### Agent 1 — Typografisk rytm
- **Fil:** `reviews/apple-01-typography.txt`
- **Scope:** `src/app/builder/**`, `src/components/builder/**`, `globals.css`, Tailwind config.
- **Fokus:** Storlekar, line-height, tracking, font-weight-skala. Finns 9 olika text-sizes där 4 räcker? Är tracking för löst/stramt? Används `font-semibold` på för många ställen? Förslag: definiera Apple-likt system med display / title / body / footnote / caption.

### Agent 2 — Färg och kontrast
- **Fil:** `reviews/apple-02-color.txt`
- **Scope:** Tailwind-klasser i builder-komponenter, CSS-variabler i `globals.css`.
- **Fokus:** Finns rester av `primary/10`-tonade bakgrunder, `shadow-primary/20`-halor, gradienter? Apple använder nästan enbart vitt/grått + en accent. Lista alla platser där accentfärgen överanvänds och föreslå reduktion till svart/grå + accent endast på CTA.

### Agent 3 — Spacing & luft
- **Fil:** `reviews/apple-03-spacing.txt`
- **Scope:** `BuilderShellContent.tsx`, `BuilderHeader.tsx`, `ChatInterface.tsx`, `PreviewPanelChrome.tsx`, alla overlays.
- **Fokus:** Padding/margin-inkonsekvens. Är builder trång (p-2, gap-1.5) där Apple skulle gett luft (p-6, gap-4)? Identifiera max 10 platser där luft saknas och max 5 där det är för mycket. Föreslå gemensam 4/8/16/24/32-skala.

### Agent 4 — Motion & transitions
- **Fil:** `reviews/apple-04-motion.txt`
- **Scope:** Alla `transition-*`, `animate-*`, `motion-safe:*`-klasser i builder.
- **Fokus:** Apple-tempo (150–250ms ease-out). Finns jank, bouncy-animationer, för långa fades, diskrepans mellan panelbyten och overlay-öppning? Föreslå EN motion-kurva och EN duration-skala för hela buildern.

### Agent 5 — Ytor, radier och skuggor
- **Fil:** `reviews/apple-05-surfaces.txt`
- **Scope:** Cards, dialogs, drawers, buttons, chips.
- **Fokus:** Radier (rounded-lg vs rounded-xl vs rounded-2xl vs rounded-3xl) — Apple använder oftast 12/16/22 px konsekvent per yta. Skuggor: finns tjocka "dark ring shadows" som borde vara subtila diffuse? Lista yta-typer och föreslå EN radie + skugg-par för varje.

### Agent 6 — Ikon- och emoji-detox
- **Fil:** `reviews/apple-06-icon-detox.txt`
- **Scope:** Hela `src/components/builder/**`, `src/components/ai-elements/**`, `src/app/builder/**`.
- **Fokus:** Leta kvarvarande `lucide-react`-ikoner, emoji, dekorativa SVG:er. Apple-marknadsyta är typografi-först. Lista varje fyndplats, kategorisera som FUNKTIONELL (behåll, ev. minimal) / DEKORATIV (ta bort) / REDUNDANT (ersätt med text).

### Agent 7 — CTA- och knappsystem
- **Fil:** `reviews/apple-07-buttons.txt`
- **Scope:** Alla `<button>`/`<Button>` i builder, chat, preview, overlays.
- **Fokus:** Finns >2 primära stilar? Apple har typiskt: filled pill (primär), text link (sekundär), ikon-pill (tertiär). Lista knappvarianter, föreslå konsolidering till 3 stilar med EN storlek-skala (sm/md/lg = 32/40/48).

### Agent 8 — Overall Apple-feel pixelgranskning
- **Fil:** `reviews/apple-08-overall-pass.txt`
- **Scope:** Allt ovan synthesized.
- **Fokus:** Gör en "skärmdumps-walkthrough" i text: empty state → wizard → loading → byggd sajt → post-generation. På varje steg, lista upp till 5 konkreta saker Apples designteam skulle tagit bort och 3 saker de skulle förstärkt. Mål: sajten ska kännas som "apple.com/mac" mer än "ChatGPT for websites".

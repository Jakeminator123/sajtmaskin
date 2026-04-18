# Backend Surface Mapping

Tar resultatet av `backend-capability-audit` (eller läser backenden direkt) och designar **hur** varje smart backend-funktion ska exponeras i en minimalistisk Apple-yta utan att rubba den lugna defaulten. Alltid progressiv avslöjning: ingen feature får storma fram — men varje feature ska vara max 2 klick bort.

**Trigger:** Användaren säger "backend surface", "exponera backend", "skill surface mapping" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent designar en exponeringsyta, läser relevant kod, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 50 rader. Format per feature:
  `- BACKEND: <funktion> (fil:rad) → UI-YTA: <plats> — INTERAKTION: <steg> — SYNLIG DEFAULT? (JA/NEJ) — 1 radig copy-förslag (svenska)`
- Perspektiv: "Apple hade inte dolt funktionen — Apple hade döljt knappen. Funktioner finns under lugnt ytlager, alltid exakt 1 handling bort för den som söker."
- Alla copy-förslag på svenska, max 4 ord där möjligt.
- Läs `backend-capability-audit`-reviewsen om de finns, annars inspektera kod direkt.

## Subagenter

### Agent 1 — Global command palette (⌘K)
- **Fil:** `reviews/surface-01-command-palette.txt`
- **Fokus:** Föreslå en global ⌘K-palette för alla backend-actions (regenerera, byt scaffold, force autofix, starta om VM, visa brief, deploy, rollback). Lista vilka actions som hör hemma här och deras Apple-likt minimala beskrivningar. Ange exakt aktiveringsyta (global, även när chat kollapsad).

### Agent 2 — Chat-slash-commands
- **Fil:** `reviews/surface-02-slash-commands.txt`
- **Fokus:** Vilka backend-funktioner passar som `/`-kommandon i chatten (ex. `/regen`, `/fix`, `/route add`, `/deploy`, `/style`, `/brief`)? Lista varje, mappning till backend-endpoint, förväntad output i chat-svaret.

### Agent 3 — Preview-chrome actions
- **Fil:** `reviews/surface-03-preview-actions.txt`
- **Scope:** `PreviewPanelChrome.tsx`, route-tabs, device-switcher, verktygsmeny.
- **Fokus:** Vilka backend-actions hör hemma nära preview (reload, hard-rebuild, show error, copy console, open in new tab, inspect route)? Max 3 synliga, resten bakom `···`. Specificera ordning och copy.

### Agent 4 — Header overflow-meny
- **Fil:** `reviews/surface-04-header-overflow.txt`
- **Scope:** `BuilderHeader.tsx`.
- **Fokus:** Vilka backend-funktioner hör hemma i header-overflow (projekt-inställningar, env, byt scaffold, ladda ner kod, återställ version, release notes)? Lista max 7 items med copy + hotkeys. Allt annat borde INTE finnas där.

### Agent 5 — Details drawer sections
- **Fil:** `reviews/surface-05-details-drawer.txt`
- **Scope:** `BuilderDetailsDrawer.tsx`.
- **Fokus:** Drawern är det naturliga hemmet för power-features. Föreslå sektioner i ordning: Sidor · Filer · Brief · Inställningar · Logs. Varje sektion en rad intro-text, första inuti är kompakt läsning, expanderbar för detaljer.

### Agent 6 — Inline context-actions i chatten
- **Fil:** `reviews/surface-06-chat-inline.txt`
- **Scope:** `ChatInterface.tsx`, meddelandebubblor, advisor-chips.
- **Fokus:** När LLM svarat — vilka backend-actions hör hemma som små ghost-länkar i bubblan ("visa diff", "spara version", "ångra", "regenerera")? Max 3 per bubbla. Copy-förslag.

### Agent 7 — Publicera/Deploy-yta
- **Fil:** `reviews/surface-07-publish.txt`
- **Scope:** Deploy-pipeline + `src/app/api/v0/deployments/route.ts`.
- **Fokus:** Hur ska publicering kännas? En knapp "Publicera" → sheet med: URL, env-val, rollback, build log (collapsed). Lista allt som backenden kan men idag inte visas; föreslå EN minimal primärfärgad pillknapp i header + sheet-UI.

### Agent 8 — Power-settings (advanced)
- **Fil:** `reviews/surface-08-advanced.txt`
- **Fokus:** Vilka backend-features hör i en gömd "Avancerat"-sektion (feature flags, modellval, experimentella scaffolds, debug-preview, verbose-brief)? Designa UI så att den som inte söker det aldrig ser det, men Cmd+Shift+A eller `/avancerat` ger direkt åtkomst.

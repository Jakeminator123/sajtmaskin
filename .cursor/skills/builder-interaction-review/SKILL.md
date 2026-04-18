# Builder Interaction Review

Granskar mikro-interaktion i buildern: hover, focus, keyboard, gestures, shortcuts, context-menus, drag/drop, select-states. Apple-yta mäts inte i pixlar utan i tangenttryckningar — varje återkommande handling ska ha en shortcut; varje shortcut ska kännas naturlig.

**Trigger:** Användaren säger "interaction review", "micro-interaktion", "skill interaction" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar sin yta, läser relevant kod, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 40 rader. Format: nuvarande beteende → föreslaget beteende → betyg 1–5.
- Perspektiv: "Apple-appar kräver inte att du ser UI för att använda dem. Allt återkommande har kortkommando, hover, och focus-ring som förklarar sig självt."
- Shortcut-standard: macOS först (⌘), Windows fallback (Ctrl), aldrig F-tangenter.

## Subagenter

### Agent 1 — Keyboard shortcuts, global
- **Fil:** `reviews/interaction-01-shortcuts-global.txt`
- **Fokus:** Inventera alla nuvarande globala kortkommandon, identifiera luckor. Föreslå standardset: ⌘K palette, ⌘\ toggle chat dock, ⌘⇧P publicera, ⌘/ fokusera chat-input, ⌘⌥R regenerera, ? visa shortcuts.

### Agent 2 — Chat-input interaktion
- **Fil:** `reviews/interaction-02-chat-input.txt`
- **Scope:** `src/components/ai-elements/prompt-input/`, `ChatInterface.tsx`.
- **Fokus:** Enter vs Shift+Enter, multiline-auto-grow, @-mentions för filer/rutter, slash-commands, paste av bilder, dra fil över input. Lista konkreta gaps.

### Agent 3 — Preview-panel gestures
- **Fil:** `reviews/interaction-03-preview-gestures.txt`
- **Scope:** `PreviewPanel.tsx`, `PreviewPanelFrame.tsx`.
- **Fokus:** Klick på element i iframe (inspektionsläge?), pinch-zoom, pan i mobil-view, scroll-lock när iframe tar över. Föreslå subtila Apple-likt interaktioner (tap-to-highlight element, shift-klick för inspect).

### Agent 4 — Route-tabs interaktion
- **Fil:** `reviews/interaction-04-route-tabs.txt`
- **Scope:** `PreviewPanelChrome.tsx`, shell-routes, route-builder.
- **Fokus:** Klick växlar route. Högerklick → context menu (byt namn, ta bort, bygg ut, duplicera). Drag-ordna rutter. Keyboard: ⌘1–9 för rutter. Föreslå komplett interaktionsmodell.

### Agent 5 — Chat-dock handle och minimera
- **Fil:** `reviews/interaction-05-dock-handle.txt`
- **Scope:** Chat-dock-relaterad layout (ska designas parallellt med `chat-dock-behavior-review`).
- **Fokus:** Klick på `>`/`<` = toggle. Dubbelklick = reset-bredd. Dra = justera bredd. Hover = tooltip "Minimera chatten (⌘\\)". Keyboard focus på handle. Beskriv exakt med motion (200ms ease-out).

### Agent 6 — Hover och focus states
- **Fil:** `reviews/interaction-06-hover-focus.txt`
- **Scope:** Alla interaktiva element i buildern.
- **Fokus:** Finns tydlig focus-ring (Apple: 2px ring accent/40)? Hover ger rätt feedback (inte bg-change där border räcker)? Inga knappar som ser klickbara ut när de är disabled. Lista värsta 10 platserna.

### Agent 7 — Drag & drop
- **Fil:** `reviews/interaction-07-drag-drop.txt`
- **Scope:** Wizard media-upload, filer i drawer, ev. route-ordning.
- **Fokus:** Var stödjer vi DnD idag? Var borde vi (släpp fil → chatten tolkar, dra rutt → ordna)? Lista med värde/insats-bedömning.

### Agent 8 — Context menus och long-press
- **Fil:** `reviews/interaction-08-context-menus.txt`
- **Fokus:** Högerklick/long-press — vad händer idag? Föreslå minimalt set per yta: chatbubbla (kopiera, citera, regenerera), preview-element (inspekt, regenerera-sektion), route-tab (byt namn, duplicera, ta bort), fil i drawer (öppna, kopiera, ladda ner).

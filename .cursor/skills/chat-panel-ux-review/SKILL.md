# Chat Panel UX Review

Granskar chattrutas storlek, placering, drag-and-drop, minimering och interaktion med preview-panelen. Målet: chattrutan ska kunna dras fritt, minimeras med en knapp, och vara mindre som default.

**Trigger:** Användaren säger "Granska chattpanel", "chat UX review", "skill chat" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Chattrutan är ett verktyg, inte huvudytan. Preview ÄR huvudytan."
- Fokus: storlek, draggbarhet, minimering, overlay-beteende, responsivitet

## Subagenter

### Agent 1 — Chat Panel Size & Proportions
- **Fil:** `reviews/chat-panel-01-size.txt`
- **Scope:** `src/app/builder/BuilderShellContent.tsx`, `BuilderLayout.tsx`
- **Fokus:** Hur bred är chatpanelen som default? Kan den vara smalare (30% istället för 50%)? Vad är minimum-bredd? Finns det en resize-handle? Beskriv exakt vilka CSS/klasser som styr bredden.

### Agent 2 — Minimize/Expand Button
- **Fil:** `reviews/chat-panel-02-minimize.txt`
- **Scope:** `BuilderShellContent.tsx`, `ChatInterface.tsx`
- **Fokus:** Finns det en knapp för att minimera chatten (< / >)? Om inte, beskriv exakt var den borde sitta. Vad händer med preview när chatten minimeras? Bör chatten bli en liten flytande bubbla?

### Agent 3 — Draggable Chat Window
- **Fil:** `reviews/chat-panel-03-draggable.txt`
- **Scope:** `BuilderShellContent.tsx`, `ChatInterface.tsx`
- **Fokus:** Kan chattrutan dras fritt över preview? Vilken teknik behövs (react-draggable, CSS transform, pointer events)? Bör den ha en title-bar som drag-handle? Skugga/overlay vid drag? Beskriv implementationsstrategi.

### Agent 4 — Chat Overlay on Preview
- **Fil:** `reviews/chat-panel-04-overlay.txt`
- **Scope:** `BuilderShellContent.tsx`, preview-panel-komponenter
- **Fokus:** Kan chattrutan ligga OVANPÅ preview istället för bredvid? Flytande kort med bakgrundsdimning? Kan preview vara 100% bredd medan chatten flyter? Jämför med Cursor/Copilot-style inline-chat.

### Agent 5 — Chat Message Density
- **Fil:** `reviews/chat-panel-05-density.txt`
- **Scope:** `src/components/builder/MessageList.tsx`, `ChatInterface.tsx`
- **Fokus:** Tar meddelanden för mycket vertikal plats? Padding/margin per meddelande. Avatar-storlek. Timestamp-visning. Kan meddelanden vara mer kompakta? Kodblock-storlek.

### Agent 6 — Chat Input Footprint
- **Fil:** `reviews/chat-panel-06-input.txt`
- **Scope:** `src/components/ai-elements/prompt-input/`
- **Fokus:** Hur stor är input-ytan? Kan den auto-expandera vid typing och krympa vid blur? Knappar under input (bifoga, avancerat) — bör de vara ikoner utan text? Total höjd av input-komponenten.

### Agent 7 — Mobile Chat Behavior
- **Fil:** `reviews/chat-panel-07-mobile.txt`
- **Scope:** `BuilderShellContent.tsx`, responsiv logik
- **Fokus:** Hur fungerar chatten på mobil? Full-screen overlay? Tab-switch? Swipe-gesture? Kan man se preview och chatt samtidigt på surfplatta?

### Agent 8 — Chat State Persistence
- **Fil:** `reviews/chat-panel-08-state.txt`
- **Scope:** `BuilderShellContent.tsx`, state management
- **Fokus:** Sparas chatrutans position/storlek vid minimize/drag? Återställs vid sidladdning? Finns det en "återställ default"-knapp? Bör minimerat läge sparas i localStorage?

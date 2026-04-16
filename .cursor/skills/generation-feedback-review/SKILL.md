# Generation Flow & Feedback Review

Apple-minimalist UX-granskning av generationsflödet: thinking overlay, progress, statusmeddelanden och completion.

**Trigger:** Användaren säger "Granska generation", "review generation flow", "skill 5" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Under generation vill användaren se resultat — inte process. En progress-bar och en mening räcker."
- Fokus: processtext som kan tas bort, visuellt brus, onödiga animationer

## Subagenter

### Agent 1 — Thinking Overlay
- **Fil:** `reviews/gen-01-thinking.txt`
- **Scope:** `src/components/builder/ThinkingOverlay.tsx`
- **Fokus:** Vad visar overlay:n? Är texten nödvändig? Kan den reduceras till bara en ikon + "Skapar din sajt..."? Blockerar den interaktion? Jämför med Apple loading states.

### Agent 2 — Generation Progress
- **Fil:** `reviews/gen-02-progress.txt`
- **Scope:** `src/components/builder/preview-panel/GenerationProgress.tsx`
- **Fokus:** Progress-komponentens design. Procent-display, fas-prickar, tips-text. Är fas-texterna nödvändiga? Kan progress visas mer minimalt? Jämför med macOS install-progress.

### Agent 3 — Chattens Processmeddelanden
- **Fil:** `reviews/gen-03-chat-process.txt`
- **Scope:** `MessageList.tsx`, `ChatInterface.tsx`
- **Fokus:** KRITISKT — vilka meddelanden dyker upp i chatten under generation? "Skapar plan...", "Genererar kod...", "Verifierar..." etc. Lista ALLA och klassificera: BEHÅLL / TA BORT / SAMMANFOGA. Målet: max 1–2 statusrader, inte en logg.

### Agent 4 — Generation Summary
- **Fil:** `reviews/gen-04-summary.txt`
- **Scope:** `src/components/builder/GenerationSummary.tsx`
- **Fokus:** Vad visas när generationen är klar? Är sammanfattningen nyttig? Finns det onödig teknisk info (filnamn, paket)? Kan den göras mer visuell?

### Agent 5 — Cancel & Abort
- **Fil:** `reviews/gen-05-cancel.txt`
- **Scope:** `BuilderShellContent.tsx` (cancel), `useChatMessaging.ts` (AbortController)
- **Fokus:** Kan man avbryta en generation? Är cancel-knappen synlig och tydlig? Vad händer efter cancel — clean state eller half-baked? Är det tydligt att generationen stoppades?

### Agent 6 — Felhantering Under Generation
- **Fil:** `reviews/gen-06-errors.txt`
- **Scope:** Felmeddelanden i gen-pipeline, autofix-logik
- **Fokus:** Vad händer vid generationsfel? Timeout? LLM-fel? Buildfel? Är felmeddelanden begripliga? Kan man retry? Visas felet i chatten eller som overlay?

### Agent 7 — Streaming & Real-time Updates
- **Fil:** `reviews/gen-07-streaming.txt`
- **Scope:** `src/lib/hooks/chat/`, streaming-logik
- **Fokus:** Hur streamas AI-svar? Är det smooth? Finns det flicker? Uppdateras preview i realtid medan koden genereras? Är det tydligt att något händer?

### Agent 8 — Post-Generation State
- **Fil:** `reviews/gen-08-post-gen.txt`
- **Scope:** `BuilderShellContent.tsx`, `PreviewPanel.tsx`
- **Fokus:** Vad händer direkt efter att sajten är klar? Scrollas preview dit? Visas en "din sajt är klar"-signal? Kan man direkt börja redigera? Finns det en naturlig nästa steg-uppmaning?

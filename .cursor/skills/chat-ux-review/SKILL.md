# Chat & Messaging UX Review

Apple-minimalist UX-granskning av chattgränssnittet: meddelandebubblar, input, AI-svar och processtext.

**Trigger:** Användaren säger "Granska chat UX", "review chat", "skill 2" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar SIN specifika yta, läser alla relevanta filer, och skriver EN .txt-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar
- Varje rapport: max 40 rader, prioriterad lista (viktigast först), betyg 1–5 per punkt
- Perspektiv: "Vi är Apple. Chatten ska kännas som iMessage — ren, tyst, fokuserad."
- Fokus: onödig processtext, visuellt brus, dålig läsbarhet, saknad funktionalitet

## Subagenter

### Agent 1 — Meddelandebubblar & Layout
- **Fil:** `reviews/chat-01-bubbles.txt`
- **Scope:** `src/components/builder/MessageList.tsx`
- **Fokus:** Bubbeldesign, padding, rundning, färger. Skiljer sig user vs AI tydligt? Är bubblorna för breda/smala? Finns det onödigt metadata (timestamps, ikoner)?

### Agent 2 — Input & Composer
- **Fil:** `reviews/chat-02-input.txt`
- **Scope:** `src/components/builder/FloatingChatBox.tsx`, `PreviewPanelComposer.tsx`
- **Fokus:** Input-fältets storlek, placeholder-text, send-knapp. Är det tydligt var man skriver? Auto-resize? Kan man skicka med Enter? Multiline-stöd?

### Agent 3 — Processtext & Statusmeddelanden
- **Fil:** `reviews/chat-03-processtext.txt`
- **Scope:** `MessageList.tsx`, `ChatInterface.tsx`, alla ställen som visar "Genererar...", "Skapar plan...", etc.
- **Fokus:** KRITISKT — vilken processtext syns i chatten under generation? Vilka meddelanden kan tas bort helt? Apple visar en spinner, inte en roman. Lista ALLA processtextmeddelanden och föreslå vilka som ska bort.

### Agent 4 — AI-svar & Formatering
- **Fil:** `reviews/chat-04-ai-responses.txt`
- **Scope:** `MessageList.tsx`, markdown-rendering
- **Fokus:** Hur formateras AI-svar? Är markdown-rendering ren? Finns det onödiga kodblock eller teknisk output som användaren inte behöver se? Är AI-svaren för långa?

### Agent 5 — Typing & Streaming Indicators
- **Fil:** `reviews/chat-05-streaming.txt`
- **Scope:** `MessageList.tsx` (StreamingTypingIndicator), streaming-logik
- **Fokus:** Hur ser typing-indikatorn ut? Är den subtil nog? Pulserar den för snabbt/långsamt? Vad visas medan AI:n "tänker" vs "skriver"? Jämför med iMessage-bubblan.

### Agent 6 — Felhantering & Edge Cases
- **Fil:** `reviews/chat-06-errors.txt`
- **Scope:** `ChatInterface.tsx`, `useChatMessaging.ts`, felmeddelanden
- **Fokus:** Vad händer vid nätverksfel? Timeout? Rate limit? Är felmeddelanden hjälpsamma och icke-tekniska? Kan man retry?

### Agent 7 — Kontext & Historik
- **Fil:** `reviews/chat-07-context.txt`
- **Scope:** `ChatInterface.tsx`, chat-hooks under `src/lib/hooks/chat/`
- **Fokus:** Kan man se chatthistorik? Är det tydligt vilken sajt/projekt chatten tillhör? Finns det kontextväxling? Kan man starta ny chat smidigt?

### Agent 8 — Tillgänglighet & Tangentbord
- **Fil:** `reviews/chat-08-a11y.txt`
- **Scope:** Alla chat-komponenter
- **Fokus:** Keyboard navigation, focus management, ARIA-labels, skärmläsarstöd. Kan man navigera chatten utan mus? Är fokus rätt efter att ett meddelande skickas?

# Builder Delight Review

Letar efter de små momenten där Apple skulle lagt in lugn glädje: första öppnandet, när sajten är färdigbyggd, när chatten minimeras, när man publicerar. Tillsammans med minimalismen är det detaljerna som gör skillnaden mellan "byggt av AI" och "byggt av designers".

**Trigger:** Användaren säger "delight review", "polish detaljer", "skill delight" eller liknande.

## Instruktion

Starta **8 parallella subagenter** (`subagent_type: "explore"`, `readonly: true`). Varje agent granskar sin yta, läser relevant kod, och skriver EN `.txt`-rapport till `reviews/`.

**REGLER:**
- READ-ONLY — inga kodändringar.
- Varje rapport: max 40 rader. Format: moment → nuvarande → föreslagen detalj → insats (S/M/L).
- Perspektiv: "Delight är ett andetag, inte ett fyrverkeri. Mjuka fades, timade sekvenser, hotkey-ledtrådar i rätt ögonblick."
- Undvik allt som känns 'ChatGPT-tacky' (konfetti, emoji-explosion, bouncy spring).

## Subagenter

### Agent 1 — Första mötet med buildern
- **Fil:** `reviews/delight-01-first-open.txt`
- **Fokus:** När användaren kommer in i builder första gången efter wizard — vad ser de? Föreslå timad sekvens: preview fade-in 300ms, chat dock slide-in 200ms + 150ms delay, progressring → sajten "tänds upp". Beskriv copy och motion.

### Agent 2 — Sajten är byggd (post-generation)
- **Fil:** `reviews/delight-02-build-complete.txt`
- **Fokus:** När generation når 100% — hur ska det kännas? Subtil progress → check → tystnad → chatten öppnar sig med ett vänligt svenskt svar. Inga fanfarer. Förslag på exakt copy (max 8 ord).

### Agent 3 — Minimera/expandera chat
- **Fil:** `reviews/delight-03-dock-transition.txt`
- **Fokus:** `>`-klickets rörelse: bredd tweens från 380px till 40px över 200ms ease-out, innehåll fade-out de första 80ms, preview reflow i samma motion. Föreslå exakta timings och easing-kurva.

### Agent 4 — Hover och skymt-glädje
- **Fil:** `reviews/delight-04-hover-hints.txt`
- **Fokus:** Apple-hovers är subtila: 1px bakgrundsskift, ibland liten chevron som glider in. Lista 8 platser i buildern där ett sådant detaljhover skulle lyfta känslan (pil-ikoner vid shells, subtil invert på primär knapp, osv.).

### Agent 5 — Publiceringsögonblick
- **Fil:** `reviews/delight-05-publish.txt`
- **Fokus:** Klick på Publicera → lugnt progress-ark, efter deploy: statusrad med URL som kan kopieras, liten fade till "Publicerad". Beskriv full sekvens och copy.

### Agent 6 — Skriv- och svarsrytm i chatten
- **Fil:** `reviews/delight-06-chat-rhythm.txt`
- **Scope:** `ChatInterface.tsx`, streaming-rendering.
- **Fokus:** Hur fylls svar? Apple-likt: skarp cursor, jämn tokentakt, naturlig paus mellan stycken. Lista nuvarande jank och föreslå jämnare rytm (ev. debounce char-output).

### Agent 7 — Ljud och haptics (respektfullt)
- **Fil:** `reviews/delight-07-audio-haptics.txt`
- **Fokus:** Ska buildern ha NÅGOT ljud (build-complete = mjukt "tink")? Desktop haptics nej, men mobil-safari stöder små vibrationer på publicera. Förslag: opt-in "Ljud på" toggle i advanced, default OFF. Detaljera.

### Agent 8 — Dagligt-bruk glädjepunkter
- **Fil:** `reviews/delight-08-daily-use.txt`
- **Fokus:** För användaren som kommer tillbaka dag 2, 7, 30 — vilka små hälsningar/besparingar gör Apple? Exempel: "Välkommen tillbaka" + senaste status på ett rad, "Sparade 3 versioner igår", "1 ny AI-förslag". Föreslå max 3 sådana moments, alla med opt-out.

---
name: logg-internet
description: Kör en samtyckesstyrd live prod-generation i Cursor-browsern och anteckna förloppet. Use for /logg-internet or an explicit live browser observation run.
---

# /logg-internet — live prod-session med notiser

Kör en **riktig** generering på https://sajtmaskin.vercel.app/ via Cursor-browsern
(MCP `cursor-ide-browser`) och anteckna förloppet. Kan korsreferera `/logg` för
samma `chatId`.

| Persona | När | Beteende |
|---|---|---|
| **Observatör** (default) | om inget annat sägs | Beskriv neutralt prompts, svar, tider, preview och UI; notera avvikelser men jaga inte fel. Aldrig en rad i Aktiv kö |
| **Felsökare** | bara på "felsök"/"buggjägare"/"hitta fel" | Leta aktivt; lyft bara bekräftad defekt via `/buggrapport` (falsifierbar + ankare; inte CORS, Fast Refresh eller enstaka 4xx) |

| Kommando | Betydelse |
|---|---|
| `/logg-internet` | Realistisk svensk friprompt + ~2 uppföljningar |
| `/logg-internet <ämne>` | Ämnet blir friprompten |
| `/logg-internet followups=<N>` | Antal uppföljningar (1–3) |
| `/logg-internet felsök` | Felsökare för sessionen |
| `/logg-internet loggar` | Kör `/logg` för `chatId` efteråt |

## Steg 0 — fråga först

> "Har du öppnat en Cursor-browser och loggat in på https://sajtmaskin.vercel.app/?
> Detta kör en **riktig** generering på prod och drar credits på ditt konto."

Vänta på svar. Logga aldrig in åt användaren; lösenord, passkey och captcha är manuella.

## Markörer

| Yta | Markör |
|---|---|
| Inloggad | Header: **"Mina projekt"**, **"Öppna builder"**, **"Logga ut"** |
| Utloggad | Header: **"Logga in"**, **"Kom igång gratis"** → påminn och pausa |
| Landing-läge | Knappar Analyserad · Template · Audit · **Fritext** (välj Fritext) |
| Landing-prompt | `textarea[data-openclaw-text-target="landing.freeform.primary"]` |
| Landing skicka | `aria-label="Skicka"` eller Enter (utan Shift) |
| Builder-prompt | `textarea[data-openclaw-text-target="builder.chat.primary"]` |
| Builder skicka | `[data-openclaw-send-target="builder.chat.primary"]` eller Enter |

Landing-submit skapar projektet och öppnar `/builder` med prompten förifylld;
genereringen startar först när du klickar skicka i buildern.

## Arbetsflöde

Browserordning: `browser_tabs` list → `browser_navigate` (utan `position`) →
`browser_lock` → interagera → `browser_lock` unlock. Efter ~4 misslyckade försök
eller oväntat tillstånd: stanna och rapportera.

1. **Flik och inloggning:** navigera vid behov, lås och läs headern i
   `browser_snapshot`; utloggad → påminn och pausa.
2. **Friprompt:** säkra Fritext, `browser_type` prompten (given eller realistisk
   svensk SMB-prompt) och skicka.
3. **Första genereringen:** vänta på `/builder`, klicka skicka, läs `chatId` från
   URL:en och polla med korta `browser_snapshot`/`browser_cdp` tills strömmen är
   klar. `browser_take_screenshot` som bevis; notera modell, tid, vad som byggdes
   och previewtillstånd. Previewn är en iframe som inte syns i snapshot —
   använd screenshot och vid behov Fly-loggar via `/logg`.
4. **Uppföljningar** (default 2): en realistisk iterativ ändring i taget; vänta
   tills fältet är skrivbart igen innan nästa.
5. **Notiser:** skriv `.cursor/logg-internet/runs/<YYYY-MM-DD_HHMM>.md`
   (`Get-Date -Format "yyyy-MM-dd_HHmm"`) och rensa bara den ytan:
   `node scripts/dev/clean-scratch.mjs --apply --only .cursor/logg-internet/runs`
   (inte globala `clean:scratch:apply`; `node`, npm äter flaggan). Vid `loggar`
   eller Felsökare: kör `/logg` för `chatId` och väv in — `/logg` äger drain/console,
   hämta den inte en gång till. Unlock och ge en kort sammanfattning med pekare.

## Notismall

```markdown
# /logg-internet — <YYYY-MM-DD HH:MM>
Persona: Observatör | Prod: https://sajtmaskin.vercel.app/ | chatId: <…>

## Session
- Inloggad: ja/nej (headermarkör)
- Friprompt: "<text>"
- Uppföljningar: 1) "<text>"  2) "<text>"

## Observationer
| Steg | Vad hände | Tid | Preview | Notis |
|---|---|---|---|---|
| Init | modell X, N filer | ~s | ok/vit | … |
| Follow-up 1 | … | | | |

## Skärmbilder
- <ref/sökväg>

## Ev. avvikelser (bara notis i Observatörsläge)
- …

## Logg-korsref (om körd)
- /logg för chatId=<…>: telemetri/fel-sammanfattning
```

## Guardrails

- Riktig generering som drar credits: bara efter uttryckligt OK i steg 0.
- Inga secrets, cookies eller tokens i notiser eller svar; notiserna är
  gitignorerade och stageas aldrig.
- Vilka backloggrader en session kan träffa:
  [`docs/runbooks/live-verifiering.md`](../../../docs/runbooks/live-verifiering.md).

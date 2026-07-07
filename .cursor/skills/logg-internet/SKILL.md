---
name: logg-internet
description: >-
  Kör en live prod-session i Cursor-browsern på https://sajtmaskin.vercel.app/: verifierar inloggning, skriver en friprompt på startsidan (landing.freeform.primary) och i snitt två uppföljningsprompter i buildern, och ANTECKNAR vad som händer (observatörspersona) snarare än att jaga fel. Kopplad till loggarna — kan korsreferera mot /logg efteråt. Use when the user runs /logg-internet, says "logg-internet" / "logg internet", or wants a note-taking live prod browser generation run.
---

# /logg-internet — live prod-session med notiser

Kör en **riktig** generering på produktions-sajten via **Cursor-browsern** och
**antecknar** hur körningen går. Default-persona = **Observatör** (ta notiser, inte
jaga fel). Kopplad till loggarna: kan korsreferera mot `/logg` för samma `chatId`.

Prod-URL: **https://sajtmaskin.vercel.app/**

## Persona (default: ta notiser)

| Persona | När | Beteende |
|---|---|---|
| **Observatör** (default) | alltid, om inget annat sägs | Beskriv neutralt vad som händer: prompts, svar, tider, preview-utfall, UI-tillstånd. Notera avvikelser, men jaga **inte** fel. |
| **Felsökare** | bara om användaren säger "felsök" / "buggjägare" / "hitta fel" | Aktivt leta fel: console/network-fel, preview-krasch, trasiga flöden. Lyft bekräftad defekt via `/buggrapport`. |

Utgå alltid från Observatör i diskussion och körning tills användaren säger annat.

## Trigger & argument

| Kommando | Betydelse |
|---|---|
| `/logg-internet` | Observatörssession: agenten komponerar en realistisk svensk friprompt + ~2 uppföljningar. |
| `/logg-internet <ämne/prompt>` | Använd angivet ämne/prompt som friprompt (t.ex. "frisörsalong i Göteborg"). |
| `/logg-internet followups=<N>` | Antal uppföljningar (default ~2, rimligt 1–3). |
| `/logg-internet felsök` | Byt till Felsökare-persona för denna session. |
| `/logg-internet loggar` | Korsreferera mot `/logg` (backend-loggar) efter sessionen. |

## Steg 0 — Fråga först

**Fråga alltid** innan något annat:

> "Har du öppnat en Cursor-browser och loggat in på https://sajtmaskin.vercel.app/?
> Detta kör en **riktig** generering på prod och drar credits på ditt konto."

Vänta på svar. Logga **aldrig** in åt användaren (lösenord/passkey är manuellt).

## Target-map (verifierade markörer i koden)

| Yta | Markör | Åtgärd |
|---|---|---|
| Inloggad? | Header visar **"Mina projekt"** + **"Öppna builder"** + **"Logga ut"** | fortsätt |
| Utloggad? | Header visar **"Logga in"** + **"Kom igång gratis"** | påminn + pausa |
| Landing-lägen | Knappar: Analyserad · Template · Audit · **Fritext** | välj **Fritext** (default) |
| Landing friprompt | `textarea[data-openclaw-text-target="landing.freeform.primary"]`, placeholder "Skriv fritt — berätta vad du vill skapa…" | skriv text |
| Landing skicka | Knapp `aria-label="Skicka"` (pil upp) — eller **Enter** (utan Shift) | skicka |
| Builder-prompt | `textarea[data-openclaw-text-target="builder.chat.primary"]` | skriv uppföljning |
| Builder skicka | Knapp `[data-openclaw-send-target="builder.chat.primary"]` — eller **Enter** | skicka |

> Landing-submit skapar projektet och navigerar till `/builder` med prompten **förifylld** i
> builder-fältet. Generering startar **först vid explicit skicka** i buildern (så steg 3 måste klicka skicka).

## Arbetsflöde (Cursor-browser MCP `cursor-ide-browser`)

Ordning för lås: **navigate → lock → interagera → unlock**. Utelämna `position` så
fokus behålls (bakgrundsautomation). Vid ihållande stopp (~4 misslyckade försök):
**stanna och rapportera** vad du såg — improvisera inte vidare.

```text
- [ ] 0. Fråga om browser öppen + inloggad på prod (steg 0)
- [ ] 1. Verifiera flik + inloggning (annars påminn och pausa)
- [ ] 2. Friprompt på landing (Fritext) → skicka
- [ ] 3. Builder: klicka skicka → generering startar → observera tills klar
- [ ] 4. ~2 uppföljningsprompter, en i taget, observera var och en
- [ ] 5. Skriv notiser + (valfritt) korsref mot /logg → unlock
```

### 1. Verifiera flik + inloggning

- `browser_tabs` (`action: "list"`) → finns en flik på `sajtmaskin.vercel.app`? Annars `browser_navigate` dit.
- `browser_lock` (`action: "lock"`).
- `browser_snapshot` → läs headern. Ser du **"Logga in"/"Kom igång gratis"** → **oinloggad**:
  påminn användaren ("Du verkar oinloggad — logga in i browsern och säg till"), **pausa**.
  Ser du **"Mina projekt"/"Öppna builder"** → inloggad, fortsätt.

### 2. Friprompt på landing

- Säkra **Fritext**-läget (klicka knappen om annat läge är aktivt).
- Hitta friprompt-fältet i snapshoten (textarea med placeholdern ovan; bekräfta vid behov
  identiteten med `browser_cdp` `DOM`/`Runtime.evaluate` mot `[data-openclaw-text-target="landing.freeform.primary"]`).
- `browser_type` in prompten (given av användaren, annars en realistisk svensk SMB-prompt,
  t.ex. "Jag driver en frisörsalong i Göteborg med 3 anställda och vill ha bokning online").
- Skicka: `browser_press_key` **Enter** (utan Shift) eller `browser_click` på **"Skicka"**.

### 3. Starta + observera första genereringen

- Vänta på `/builder`. `browser_snapshot`. Builder-fältet är förifyllt → `browser_click`
  på skicka-knappen (`data-openclaw-send-target="builder.chat.primary"`) för att **starta**.
- Läs `chatId` från URL:en (t.ex. `/builder?chat=…`) — behövs för logg-korsref.
- Observera streaming: poll:a med korta `browser_snapshot` eller `browser_cdp`
  (`Runtime.evaluate`) tills strömmen är klar och preview visas. `browser_take_screenshot`
  för bevis. **Notera** modell, ungefärlig tid, vad som byggdes, preview-tillstånd.
- Console/network vid behov: `browser_cdp` (`Log.enable`, `Network.enable`) — läs, jaga inte
  fel i Observatörsläge.

### 4. Uppföljningar (~2)

För varje uppföljning (default 2; 1–3):

- Komponera en realistisk iterativ ändring på svenska (t.ex. "Lägg till en prissektion med
  tre paket", "Byt till mörkt färgtema och lägg till kontaktformulär").
- `browser_type` in i `builder.chat.primary` → skicka (Enter eller skicka-knappen).
- Vänta tills fältet är skrivbart igen / skicka-knappen är redo innan nästa. Observera + notera.

### 5. Notiser + ev. logg-korsref

- Skriv en notis-fil: `.cursor/logg-internet/runs/<YYYY-MM-DD_HHMM>.md` (tidsstämpel:
  `Get-Date -Format "yyyy-MM-dd_HHmm"`). Se mallen nedan.
- **Valfritt** (om `loggar` eller Felsökare): korsreferera mot `/logg` för `chatId` —
  hämta backend-telemetri/fel för samma sajt och väv in i notiserna (inkl. **DB-pool-hälsa**:
  `/logg` flaggar connect-timeout/EMAXCONNSESSION för körningsfönstret).
- `browser_lock` (`action: "unlock"`).
- Ge användaren en kort sammanfattning i chatten + pekare till notis-filen.

## Notis-mall

```markdown
# /logg-internet — <YYYY-MM-DD HH:MM>
Persona: Observatör | Prod: https://sajtmaskin.vercel.app/ | chatId: <…>

## Session
- Inloggad: ja/nej (headermarkör)
- Friprompt: "<text>"
- Uppföljningar: 1) "<text>"  2) "<text>"

## Observationer (per steg)
| Steg | Vad hände | Tid | Preview | Notis |
|---|---|---|---|---|
| Init | modell X, N filer | ~s | ok/vit | … |
| Follow-up 1 | … | | | |
| Follow-up 2 | … | | | |

## Skärmbilder
- <ref/sökväg>

## Ev. avvikelser (bara notis, ej åtgärd i Observatörsläge)
- …

## Logg-korsref (om körd)
- /logg för chatId=<…>: telemetri/fel-sammanfattning
```

## Guardrails

- **Prod = riktig generering** som drar credits. Kör bara efter uttryckligt OK (steg 0).
- **Logga aldrig in åt användaren.** Lösenord/passkey/captcha = manuellt — påminn och pausa.
- **Default = ta notiser.** Byt till Felsökare bara på begäran; lyft bekräftad defekt via `/buggrapport`.
- Browser-ordning: navigate → lock → interagera → **unlock**. Utelämna `position`.
- Fastnar det (~4 misslyckade försök eller oväntat tillstånd): **stanna och rapportera**, improvisera inte.
- Preview körs i **iframe** — innehållet syns inte i snapshot. Observera via screenshot + (vid behov) Fly preview-host-loggar (se `/logg`).
- Skriv inga secrets/cookies/tokens i notiser eller svar.
- Notis-filer ligger i gitignored `.cursor/logg-internet/` — stage dem aldrig.

## Related

- Kommando: [`.cursor/commands/logg-internet.md`](../../commands/logg-internet.md)
- Backend-loggar (DB/Vercel/Fly): [`.cursor/skills/logg/SKILL.md`](../logg/SKILL.md)
- Notis-yta: [`.cursor/logg-internet/README.md`](../../logg-internet/README.md)
- Lyft bekräftad defekt: `/buggrapport` → `BUG-SWARM-BACKLOG.md`
- Browser-server: `cursor-ide-browser` MCP (lock/unlock, snapshot, type, click, cdp)

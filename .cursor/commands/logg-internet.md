# /logg-internet — live prod-session med notiser

Kör en **riktig** generering på produktions-sajten via **Cursor-browsern** och **antecknar** hur körningen går. Default-persona = **Observatör** (ta notiser, inte jaga fel). Kopplad till loggarna — kan korsreferera mot `/logg` för samma `chatId`.

Prod-URL: **https://sajtmaskin.vercel.app/**

## Fråga först

Innan något annat: fråga om användaren har **öppnat en Cursor-browser** och **loggat in** på prod-URL:en. Detta drar credits på riktigt. Logga **aldrig** in åt användaren — påminn och pausa om headern visar "Logga in"/"Kom igång gratis".

## Argument

| Kommando | Betydelse |
|---|---|
| `/logg-internet` | Observatörssession: agenten komponerar friprompt + ~2 uppföljningar. |
| `/logg-internet <ämne>` | Använd angivet ämne som friprompt. |
| `/logg-internet followups=<N>` | Antal uppföljningar (default ~2). |
| `/logg-internet felsök` | Byt till Felsökare-persona. |
| `/logg-internet loggar` | Korsreferera mot `/logg` (backend-loggar) efteråt. |

## Flöde

1. **Fråga** om browser öppen + inloggad på prod.
2. **Verifiera** flik + inloggning (`browser_tabs` → `browser_navigate` → `browser_lock` → `browser_snapshot`). Header "Mina projekt"/"Öppna builder" = inloggad; "Logga in" = påminn + pausa.
3. **Friprompt** i Fritext-fältet (`landing.freeform.primary`) → skicka (Enter eller "Skicka").
4. **Builder**: klicka skicka (`builder.chat.primary`) för att starta genereringen; läs `chatId` från URL:en; observera tills preview visas.
5. **~2 uppföljningar** i `builder.chat.primary`, en i taget, observera var och en.
6. **Notiser** till `.cursor/logg-internet/runs/<ts>.md` + (valfritt) korsref mot `/logg`; `browser_lock` unlock; kort chattsummering.

## Persona

- **Observatör (default):** beskriv neutralt vad som händer; jaga inte fel. Utgå från detta i all diskussion tills du säger annat.
- **Felsökare (på begäran):** leta aktivt fel (console/network/preview); lyft bekräftad defekt via `/buggrapport`.

## Anti-mönster

- Köra utan att fråga/verifiera inloggning först (steg 0–2).
- Logga in åt användaren eller lösa captcha/passkey automatiskt.
- Gå i felsökarläge utan att användaren bett om det.
- Improvisera vidare efter upprepade misslyckanden — stanna och rapportera.
- Klistra in secrets/cookies/tokens i notiser.

## Projekt-skill

Fullständigt browser-MCP-flöde, target-map och notis-mall: [`.cursor/skills/logg-internet/SKILL.md`](../skills/logg-internet/SKILL.md).

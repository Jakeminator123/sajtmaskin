# .cursor/logg-internet/

Lokal **notis-yta** för `/logg-internet` — live prod-sessioner där agenten kör en riktig generering via **Cursor-browsern** på produktions-URL:en och **antecknar** vad som händer. Mappen är **gitignored** (utom denna README) och ligger inte på GitHub.

> **Observatörsläge, inte felsökarläge.** Default är att **ta notiser** — beskriva vad som sker över UI och loggar, inte att jaga buggar. Byt bara till felsökarläge om du säger till. En bekräftad defekt lyfts manuellt vidare via `/buggrapport` till `BUG-SWARM-BACKLOG.md`.

## Varför gitignored (inte indexerad, men läsbar)

`.gitignore` respekteras av Cursors index, så notiserna hamnar **inte** i semantisk sökning och stör inte andra agenter. Filerna är fortfarande läs/skrivbara via explicit sökväg — så `/logg-internet` kan skriva hit medan vanliga agenter inte råkar dra in dem. Inte en hård sandbox.

## Layout

```text
.cursor/logg-internet/
  README.md                     # committad — denna konvention
  runs/
    YYYY-MM-DD_HHMM.md          # en notis-fil per session (persona, prompts, observationer, ev. logg-korsref)
```

## Kör

- `/logg-internet` → observatörssession på prod (friprompt + ~2 uppföljningar), notiser.
- `/logg-internet <ämne>` → använd angivet ämne som friprompt.
- Detaljer: [`.cursor/commands/logg-internet.md`](../commands/logg-internet.md) och [`.cursor/skills/logg-internet/SKILL.md`](../skills/logg-internet/SKILL.md).

## Relation till `/logg`

`/logg` hämtar **backend-loggar** (produktionsdatabas, Vercel, Fly) för senaste sajten. `/logg-internet` är **live-observationslagret** ovanpå: den kör själva sajten i browsern och antecknar. De kan kombineras — efter en session kan `/logg-internet` korsreferera mot `/logg` för samma `chatId`.

---
status: active
owner: unassigned
created: 2026-07-25
topic: Chattens utdata — ta bort den råa kodväggen, gör historiken nedfällbar och sluta slösa OpenClaw-kontext på kodfragment. Täcker F9 och Ö9.
source: Observationssession 2026-07-25 (`.cursor/logg-internet/runs/2026-07-25_0302.md`), användarens elementval i prod-previewen. Kodverifierat mot master `57416834`.
parent: 00-master-plan.md
---

# Spår 03 — Chattens utdata

## TL;DR

Den 5 212 px höga bubblan med rå TSX-kod i chatten är **inte** env-styrd, kommer
**inte** från Vercels env och **inte** från Fly. Den är ett rent
renderingsfel i `src/components/builder/GenerationSummary.tsx`, och den kan tas
bort utan att något annat påverkas — den lagrade meddelandetexten är oförändrad
och är det som resten av systemet läser.

Samtidigt är hela chatthistoriken oavvisbar: den kan inte fällas ned, så den
äter previewyta även när användaren inte vill läsa den (Ö9).

## Frågan som ställdes: är kodväggen env-styrd, och läser OpenClaw den?

Tre svar, alla kodverifierade.

### 1. Ingen env är inblandad

Bubblan renderas av `GenerationSummary.tsx:157-163` — `previewText`, dvs.
`parsed.proseText`, i en `div` med `whitespace-pre-wrap`. Det matchar exakt det
DOM-element som valdes i previewen. Ingen env-variabel, ingen serverflagga,
ingen Fly-konfiguration rör den.

Den *enda* env-flaggan i närheten gäller något annat: `message-scroller-feature.ts`
läser `NEXT_PUBLIC_SAJTMASKIN_MESSAGE_SCROLLER` för att välja
scroll-implementation. Den styr inte innehållet i bubblan.

### 2. Varför den uppstår

`parseGenerationContent` (rad 25–61) tar bort kod med två regexer som **kräver en
avslutande** ` ``` `:

```text
CODE_BLOCK_RE       = /```(\w+)\s+file="([^"]+)"[^\n]*\n([\s\S]*?)```/g
GENERIC_CODE_BLOCK_RE = /```(\w+)?[^\n]*\n([\s\S]*?)```/g
```

Allt som blir kvar hamnar i `proseText`. Det finns en guard för fallet
"kodström utan kompletta fences" (rad 100–110), men den fungerar bara när det
finns **noll** kompletta block:

```text
const hasOpenFences = !parsed.hasCodeBlocks && (…)
```

Det blandade fallet — minst ett komplett block **plus** ett oavslutat — har ingen
guard. Då är `hasCodeBlocks` sant, koden i det oavslutade blocket överlever
strippningen, och tredje grenen renderar den som en vägg.

Bevis för att det är klient-state och inte databasen: de sparade meddelandena för
körningen har **balanserade** fences (16 markörer / 8 öppnare i meddelandet
01:40:24, 8 / 4 i 01:42:28). En omladdning av sidan skulle alltså kollapsa
väggen. Skärmbilden visar också att räknaren intill sa "Genererat 2 filer" medan
det sparade meddelandet har fyra — samma undertalning från samma orsak.

### 3. OpenClaw läser inte bubblan — men får kodfragmentet ändå

OpenClaw läser aldrig DOM. Två separata vägar in:

| Väg | Källa | Effekt av kodväggen |
|---|---|---|
| **Kodkontext** (den som betyder något) | `resolveFileContext(chatId, versionId)` → versionens filer i DB, via `server-context.ts:158-178` | **ingen** — helt oberoende av chattbubblan |
| **Senaste meddelanden** | `buildRecentContextMessages` i `BuilderShellContent.tsx:106-110` → sista 5 meddelanden, rå `content` klippt till 3 000 tecken, sedan whitespace-plattad och klippt till 2 200 i `server-context.ts:89-97` | ~2 200 tecken av OpenClaws kontextbudget går till ett godtyckligt TSX-fragment |

Svaret på frågan är alltså: **du kan ta bort kodväggen visuellt utan att störa
något.** Den är inte källan till OpenClaws kodkunskap. Att dessutom rensa
kodblock ur `recentMessages` *förbättrar* OpenClaw — fragmentet har inget
informationsvärde, det bara tränger ut riktig historik.

## Ö9 — nedfällbar utdata

Användarens önskemål: hela utdata-chatten ska kunna fällas ned till
chatinputens överkant, för att frigöra previewyta. Två delar:

1. **Mekaniken.** Chattpanelen (`div#builder-chat-panel` →
   `MessageScroller`-området) får ett kollapsat läge där bara inputen och
   Verktyg-raden syns. Läget ska överleva omladdning.
2. **Innehållet.** Användaren noterade att historiken innehåller loggrader som
   "antingen ska tas bort eller göras om". Konkret: auto-reparationsprompterna
   (3 518 och 4 246 tecken) sparas som **user**-meddelanden och renderas som om
   användaren skrivit dem. De hör inte i historiken som användarprompter.

Del 2 är inte kosmetik — det är samma ärlighetsproblem som spår 01 och 06: UI
påstår att användaren sa något användaren aldrig sa.

## Sekvens

Steg 1 är fristående och billigt. Steg 2–3 rör chattpanelen och måste köras
**efter** spår 04 (som lyfter state ur previewpanelens verktygsrad in i samma
område).

### Steg 1 — F9: täpp till det blandade fence-fallet

- Beräkna en **fence-balans** i stället för att bara räkna kompletta block: om
  antalet ` ``` `-markörer är ojämnt, eller om det finns en `file="…"`-öppnare
  efter det sista kompletta blocket, ska svansen behandlas som kod.
- Lägg svansen i den kollapsade "Genererat innehåll"-rutan som redan finns (rad
  119–142), inte i prosabubblan.
- `parsed.files` ska räkna även den oavslutade filen, så räknaren inte undertalar.
- Ny test: innehåll med två kompletta block + ett oavslutat renderar **ingen**
  prosabubbla med kod, och räknaren säger 3 filer.
- Ny test: ren prosa som *nämner* `file="…"` mitt i en mening renderas fortfarande
  som text (den befintliga regeln på rad 98–102 får inte gå förlorad).

### Steg 2 — rensa kodblock ur OpenClaw-kontexten

- `toContextMessage` (`BuilderShellContent.tsx:98-104`) ska strippa fenced
  kodblock och ersätta dem med en kort markör, t.ex.
  `[genererade 5 filer]`, innan innehållet klipps till 3 000 tecken.
- Samma normalisering gäller `latestAssistantMessage` som skickas till
  tips-routen.
- Ny test: ett assistentmeddelande med 50 kB kod ger en kontextrad under 200
  tecken som ändå säger hur många filer det gällde.

### Steg 3 — Ö9: nedfällbart utdatafält

- Kollapsläge på chattpanelen, med tillstånd sparat per chat (samma mönster som
  andra panellägen i buildern).
- I kollapsat läge: inputen, Verktyg-raden och en tunn rad som säger hur många
  meddelanden som är dolda plus status för pågående generering. Man ska inte
  behöva fälla upp för att se att något körs.
- Previewpanelen ska ta över den frigjorda höjden.

### Steg 4 — Ö9 del 2: sluta rendera systemprompter som användarprompter

- Auto-reparationsprompten ska märkas som systemgenererad — antingen en egen roll
  eller ett metadatafält — och renderas som en kollapsad systemrad, inte som en
  användarbubbla.
- Kravet är att den fortfarande finns kvar för felsökning; den ska inte tas bort
  ur databasen.
- Ny test: ett reparationsmeddelande renderas inte med användarens bubbelstil.

## Definition of done

| # | Krav | Bevis |
|---|---|---|
| 1 | Ingen rå kodvägg kan renderas i en chattbubbla, i något fence-läge | nya tester (blandat, oavslutat, prosa-med-`file=`) |
| 2 | Filräknaren undertalar inte vid oavslutad fence | nytt test |
| 3 | OpenClaw-kontexten innehåller inga kodblock från chatthistoriken | nytt test |
| 4 | OpenClaws kodkontext via `resolveFileContext` är oförändrad | befintliga tester gröna |
| 5 | Chattens utdata kan fällas ned till inputens överkant och läget överlever omladdning | manuell körning |
| 6 | Pågående generering syns även i kollapsat läge | manuell körning |
| 7 | Auto-reparationsprompter renderas inte som användarmeddelanden | nytt test |

## Risker

| Risk | Hantering |
|---|---|
| Att strippa kod ur `recentMessages` gör OpenClaw sämre på frågor om "senaste output" | markören ska säga hur många filer och vilka sökvägar; den riktiga koden finns via `resolveFileContext` |
| Kollapsläget gömmer fel som användaren behöver se | låt blockerande status ligga kvar i den tunna raden, inte inne i det kollapsade |
| Rollmärkningen av reparationsprompter kan bryta befintliga historikkonsumenter | additivt metadatafält är säkrare än en ny roll; verifiera mot alla läsare av `engine_messages` |

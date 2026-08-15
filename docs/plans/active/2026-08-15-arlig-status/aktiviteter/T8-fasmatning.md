# T8 — fasmätningen mäter fel

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Slutstegsvyn rapporterar fas-tider som inte går att använda. Två prod-körningar
2026-08-14:

| Körning | Rapporterad ström | Rapporterade faser |
|---|---|---|
| `182d424b-6c9a-42f1-a3a5-4df12f7b5421` | `Generering klar (373s)` | `reasoning 0.3s, output 0.4s` |
| `6e865848-8df5-46e9-aa81-c52ce7221d07` | `Generering klar (337s)` | `reasoning 0.3s, output 0.4s` |

Summan av faserna är 0,7 sekunder av 337. Samma två värden i båda körningarna,
oavsett hur lång strömmen var. Det är inte en avrundning — mätpunkterna mäter
något annat än vad etiketten påstår.

Effekten: när någon felsöker en långsam generering är den enda uppdelningen som
finns oanvändbar, och man tvingas gissa var tiden gick. Det är samma grundfel som
resten av det här initiativet handlar om — en signal som påstår mer än den mätt.

## Uppgift

Gör fas-tiderna sanna, så att de tillsammans förklarar strömtiden.

1. **Hitta den kanoniska ägaren först.** Mätpunkterna ligger i
   `src/lib/gen/stream/stream-format.ts` (sök `firstReasoningTokenAt`,
   `firstContentTokenAt`, `streamStartedAt`). Etiketten renderas i
   progress-stegen — spåra vem som räknar innan du ändrar, och ändra räknaren,
   inte texten.
2. **Avgör vad faserna ska betyda** och skriv ner det i koden: rimligen tiden
   *från* strömstart *till* första reasoning-token, och *från* första
   reasoning-token till första content-token, plus resten av strömmen. Nuvarande
   värden ser ut att mäta ett avstånd mellan två närliggande tidsstämplar snarare
   än en fas-varaktighet.
3. **Låt summan gå ihop.** Faserna ska tillsammans ligga nära den rapporterade
   totala strömtiden. Finns en period som inte tillhör någon fas ska den ha ett
   eget namn, inte försvinna.

## Vad som INTE ingår

- Ändra inte hur totaltiden (`durationMs` i `generation_telemetry`) mäts — den är
  korrekt; det är den som avslöjar felet.
- Bygg ingen ny telemetri-yta och ingen ny visuell komponent.
- Rör inte reasoning-heartbeaten (var 15:e sekund) — den fyller en annan funktion.
- Ingen env-flagga.

## Verifiering

- Test som matar en simulerad ström med kända tidsstämplar och visar att
  fassumman ligger nära totaltiden (tillåt en liten tolerans, inte en faktor 400).
- Test för en ström **utan** reasoning-tokens (thinking av) så att fasen blir noll
  eller utelämnas i stället för att skriva ett missvisande värde.
- `npm run typecheck` + riktad vitest på de sviter som rör `stream-format`.

## Klart när

Fas-tiderna summerar till något som liknar strömtiden, en körning utan reasoning
inte rapporterar en påhittad reasoning-fas, och ett test skulle fånga en
återgång till 0,3/0,4-beteendet.

# T12 — runbookens drain-ordning: env + deploy **före** drainen skapas

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

[`docs/runbooks/vercel-log-drain.md`](../../../../runbooks/vercel-log-drain.md)
rekommenderar i dag denna ordning (rad ~62–67):

```text
1. Deploya koden (ENABLED unset → default av).
2. Skapa drainen i dashboarden.
3. Sätt VERCEL_LOG_DRAIN_SECRET + VERCEL_LOG_DRAIN_ENABLED=true.
4. Deploya igen — först då accepteras signerade leveranser.
```

Mellan steg 2 och 4 är drainen **live mot en mottagare som svarar `410`**. Det är
exakt tillståndet som orsakade kostnadsincidenten 2026-08-11 som samma runbook
beskriver längre ner: ~2,8 miljoner invocations på en timme.

Ordningen kan inverteras så att farofönstret aldrig uppstår, eftersom
ownership-proben (`x-vercel-verify`, osignerad) fungerar **oberoende** av
kill-switchen — det står redan i runbooken på rad ~30–32.

## Uppgift

Skriv om uppsättningsordningen till den säkra varianten och förklara varför:

```text
1. Sätt VERCEL_LOG_DRAIN_SECRET + VERCEL_LOG_DRAIN_ENABLED=true i production.
2. Deploya. Nu är mottagaren redo och svarar aldrig 410.
3. Verifiera med det signerade självtestet (finns redan i runbooken).
4. Skapa DÄREFTER drainen — med loop-brytaren nedan.
```

Lägg också till loop-brytaren vid källan, som saknas i runbooken i dag. Vercels
drain-API stödjer sampling per sökväg:

```json
"sampling": [{ "type": "log", "rate": 0, "requestPath": "/api/drains/vercel" }]
```

Med `rate: 0` kastar **Vercel** ingest-routens egna loggrader innan de levereras.
Det är ett tredje skyddslager utanför `isSelfDrainLog` (som bara håller *tabellen*
ren) och `410`-brytaren (som bara begränsar skadan i efterhand). Skriv tydligt att
`isSelfDrainLog` **inte** stoppar anropen — bara raderna.

Faktisk status att spegla i runbooken:

| Sak | Nuläge 2026-08-15 |
|---|---|
| Befintliga drains | Noll (`/v1/drains` → `{"drains": []}`) |
| `VERCEL_LOG_DRAIN_SECRET` | Finns i production sedan 2026-08-11 |
| `VERCEL_LOG_DRAIN_ENABLED` | Satt till `true` i production 2026-08-15 — slår igenom vid nästa prod-deploy |

Nämn även att `POST /v1/drains/test` finns för att validera leveranskonfigurationen
innan `POST /v1/drains` skapar något skarpt, och att en spend alert i Vercel Billing
är den yttersta nödbromsen.

## Vad som INTE ingår

- **Skapa ingen drain.** Det är T11 och kräver att prod-deployen skett först.
- Ändra ingen kod i `src/app/api/drains/vercel/route.ts` eller
  `src/lib/vercel/vercel-log-drain.ts` — mottagaren är korrekt byggd.
- Sätt inga env-variabler.

## Verifiering

- `npm run docs:links` — alla länkar i den redigerade filen ska resolva.
- `npm run docs:check`
- Läs igenom att den gamla ordningen är **ersatt**, inte att en ny ordning lagts
  till under den. Två motstridiga recept i samma runbook är värre än ett dåligt.

## Klart när

Runbooken beskriver en ordning som inte kan skapa farofönstret, loop-brytaren vid
källan är dokumenterad, och det står uttryckligen att `isSelfDrainLog` skyddar
tabellen men inte anropen.

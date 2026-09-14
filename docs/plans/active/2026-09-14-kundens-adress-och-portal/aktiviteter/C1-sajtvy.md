# C1 — Sajtvy `/projects/[id]`

Område: [03](../03-kundportal.md). Kan börja före abonnemangsimplementation.
Samordna `src/proxy.ts` med A2 och C3.

## Leverans

| Sektion | Innehåll |
|---|---|
| Adress | Primäradress, kopiera, öppna; väntande adress ska framgå |
| Status | Senaste verkliga publicering, bygger/fel och senare paus |
| Redigera | Öppna rätt projekt/version i befintlig builder |
| Publicera | Återanvänd deployflödet och dess kontroller; visa vilken version |
| Domän och export | Integrationspunkter för C2 och B1 |
| SEO | Återanvänd inställningskomponenten; adresskontraktet gäller även opt-out |

Projektkorten på `/projects` får adress/status och länk till sajtvyn. Visa ingen
teknisk provider-fallback som en färdig branded adress. Schemalagd framtida
publicering, nya teamroller och en ny redigerare ingår inte.

## Grundskydd

- Skydda `/projects/<id>` med medveten dynamisk/prefixmatchning i `src/proxy.ts`.
  Dagens set med exakta routes räcker inte ensamt.
- Använd `getAppProjectByIdForRequest` eller samma serverägarkontroll vid varje
  läsning och mutation. Projekt-ID från klienten är aldrig behörighet.
- Återanvänd plattformens JWT-auth. Kundytan använder inte admin-komponenter.
- Radering får inte lämna ett aktivt abonnemang som fortsätter debiteras.
  När D2 kopplas på ska raderingsflödet samordnas med uppsägning och domänexit;
  blockera hellre radering av aktivt abonnemang tills det flödet finns.

## Klart när

En kund kan se och hantera sin sajt, publicera vald version och öppna editorn.
Builderns befintliga publicering fungerar fortfarande. Riktad verifiering
omfattar utloggad åtkomst och en annan användares projekt-ID, både läsning och
skrivning. Typecheck och berörda tester räcker för denna avgränsade UI-etapp.

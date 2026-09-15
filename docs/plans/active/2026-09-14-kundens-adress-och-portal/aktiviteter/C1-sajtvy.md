# C1 — Sajtvy `/projects/[id]`

## Genomförandestatus 2026-09-15

C1:s sajtvy är kod på `preview` (#1358). C2 (#1384) och B1 (#1367) är
inkopplade i samma yta. Abonnemang och raderingssamordning väntar på D2
(#1385). Det är inte kundaktivering.

Område: [03](../03-kundportal.md). Leveransen gjordes före
abonnemangsimplementationen och samordnades med A2/C3:s `src/proxy.ts`-skydd.

## Levererad yta

| Sektion | Innehåll |
|---|---|
| Adress | Primäradress, kopiera, öppna; väntande adress framgår |
| Status | Senaste verkliga publicering och bygger/fel; senare paus ägs av D3 |
| Redigera | Öppnar rätt projekt/version i befintlig builder |
| Publicera | Återanvänder deployflödet och dess kontroller; vald version visas |
| Domän och export | C2-flödet och B1-exporten är inkopplade; C2-runtime mot riktig domän kvar |
| SEO | Återanvänder inställningskomponenten; adresskontraktet gäller även opt-out |

Projektkorten på `/projects` har adress/status och länk till sajtvyn. Den
levererade ytan visar inte teknisk provider-fallback som en färdig branded
adress. Schemalagd framtida publicering, nya teamroller och en ny redigerare
ingår inte.

## Leveransbevis och kodägare

- Sajtvyn ägs av [`page.tsx`](../../../../../src/app/projects/[id]/page.tsx)
  och dess serverdata av
  [`route.ts`](../../../../../src/app/api/projects/[id]/site/route.ts).
- Dynamiskt routeskydd ägs av [`src/proxy.ts`](../../../../../src/proxy.ts),
  och API:t gör serverägd projektkontroll i stället för att lita på klientens
  projekt-ID. Kundytan återanvänder plattformens JWT-auth och inga
  admin-komponenter.
- Riktade route-, ägar-, label-, overview-, republish- och proxytester följde
  med #1358; builderns befintliga publicering bevarades.

## Kvarvarande D2-koppling

Radering får inte lämna ett aktivt abonnemang som fortsätter debiteras. När D2
kopplas på ska raderingsflödet samordnas med uppsägning och domänexit; blockera
hellre radering av aktivt abonnemang tills det flödet finns.

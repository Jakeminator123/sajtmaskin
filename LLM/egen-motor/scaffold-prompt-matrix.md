# Scaffold Prompt Matrix — manuell validering

> Syfte: Testprompts för att verifiera att matchern väljer rätt scaffold. Använd vid manuell validering.

## Användning

1. Skriv in varje prompt i byggaren (eller kör matchern direkt).
2. Kontrollera att vald scaffold matchar förväntat.
3. Markera ✅/❌ i tabellen.

## Matris

| Scaffold       | Testprompt (svenska)                                      | Förväntat |
|----------------|-----------------------------------------------------------|-----------|
| landing-page   | Bygg en hemsida för mitt konsultföretag med tjänster och kontakt | landing-page |
| landing-page   | Kampanjsida för vår nya produktlansering                   | landing-page |
| saas-landing   | SaaS-plattform för projektledning med prissida och free trial | saas-landing |
| saas-landing   | B2B-mjukvara med abonnemang och priser                    | saas-landing |
| portfolio      | Personlig portfoliosajt för fotograf med case studies     | portfolio |
| portfolio      | CV-sida för utvecklare med projekt och erfarenhet          | portfolio |
| blog           | Blogg om design med artiklar och kategorier               | blog |
| blog           | Nyhetsbrev och redaktionellt innehåll                     | blog |
| dashboard      | Dashboard med statistik och översikt för e-handel          | dashboard |
| dashboard      | Instrumentpanel med diagram och rapporter                  | dashboard |
| auth-pages     | Inloggningssida och registrering                          | auth-pages |
| auth-pages     | Glömt lösenord och återställning                          | auth-pages |

## Matris (engelska)

| Scaffold       | Testprompt (english)                                      | Expected |
|----------------|------------------------------------------------------------|----------|
| landing-page   | Company website for a consulting agency with services     | landing-page |
| saas-landing   | SaaS product with pricing page and subscription tiers     | saas-landing |
| portfolio      | Personal portfolio for a designer with selected work      | portfolio |
| blog           | Blog about software development with articles              | blog |
| dashboard      | Analytics dashboard with charts and metrics               | dashboard |
| auth-pages     | Login and signup pages for a web app                      | auth-pages |

## Gränsfall

| Prompt | Förväntat | Notering |
|--------|-----------|----------|
| "Bygg en sajt" (tunt) | landing-page |
| "App med admin" | app-shell |
| "Dashboard med analytics" | dashboard |
| "Blogg med portfolio" | blog eller portfolio |
| "Landing med blog" | landing-page eller blog |

## Kör matchern manuellt

Använd builder-UI med scaffold-mode på "auto" och verifiera vald scaffold. Alternativt: importera `matchScaffold` från `@/lib/gen/scaffolds` i ett test eller script.

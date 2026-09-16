# 02 — Äganderätt och exit

Föreslagen modell: [N2](00-master-plan.md). Leverans: [B1](aktiviteter/B1-exportkontrakt.md).

## Vad kunden får

| Del | Kundens rätt eller ansvar | Sajtmaskins uppgift |
|---|---|---|
| Egen domän | Registreras och ägs av kunden; förnyas hos registraren | Koppla till rätt sajt och visa status |
| Genererad kod | Export och användning enligt gällande licenser | Leverera byggbar export med instruktioner |
| Eget innehåll och media | Tillhör kunden i den mån kunden har rättigheterna | Tillgängliggöra uttag |
| Hostingprojekt | Administreras av Sajtmaskin under abonnemanget | Builds, publicering, alias och drift |
| Externa tjänster | Konton, nycklar och data kan behöva flyttas separat | Redovisa beroenden och vad exporten omfattar |

Lova inte exklusiv upphovsrätt till AI-output eller tredjepartspaket. Licenser
för bilder, typsnitt och bibliotek följer med; plattformens egen backend och
API-hemligheter ingår inte i kundens export.

Att administrera Vercel-projektet är ett praktiskt MVP-val. Det betyder inte
att en framtida projektöverlåtelse skulle göra en portal eller serviceavgift
omöjlig; sådant är bara utanför detta arbetspaket.

## BYOD och domänköp

BYOD betyder att kunden tar med en egen domän. Det är grunden, inte en onödig
funktion. Kunden kan köpa hos valfri registrar och sedan koppla i portalen.

Domänköp inne i Sajtmaskin är ett separat registrarflöde med registrantuppgifter,
förnyelse, transfer och felhantering. `SM-007` och köpflaggan förblir parkerade.
Vi behöver inte lösa det flödet för att sälja en bra webbplatstjänst.

Automatisk DNS-koppling kan senare förenkla BYOD utan att kunden överlåter
ägandet. Den manuella kopplingsvägen måste ändå fungera; se [C2](aktiviteter/C2-domanflode.md).

## Exit i MVP

Återanvänd GitHub-exporten, gör den synlig i portalen och erbjud uttag av
kundens media. Beskriv env-namn och externa tjänster utan att exportera
plattformens nycklar. Externa databaser exporteras inte automatiskt bara för
att koden gör det. Kunden behåller åtkomst till export under betalningspaus.

Klart när en export har installerats och byggts utanför plattformen och
kundtexten beskriver vad som faktiskt följde med. Helautomatisk flytt av
databas, registrar eller hostingkonto ingår inte.

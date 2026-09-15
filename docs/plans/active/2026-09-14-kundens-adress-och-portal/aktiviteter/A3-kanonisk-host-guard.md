# A3 — Primäradress i metadata och runtime

## Genomförandestatus 2026-09-15

**Kod på preview. Redirect-flagga av. Offline-kontrakt utökat. Runtime inte
verifierad.** Facit är `origin/preview` `712090882`, inte plan-SHA
`33935b8d`. #1369 levererade det stängda adresskontraktet. #1386 är
host-identitetsfixen: en host är produktion bara med aktuellt bevis. #1391
är production-identitetsfixen: `liveVersionId` / Publicera om pekar på
Vercels aktuella production-deployment, inte senaste READY. Okänd identitet
gissas inte. Last-working 3-label provider behålls bara när alias-status är
tillfälligt `unknown`. Rollback mot same-host rensar nu en stale hanterad
307/noindex i äldre `vercel.json`. Riktade tester täcker custom över
branded, unik READY-URL och saknad identitet. Live branded → egen domän →
branded är fortfarande BLOCKED: A1:s testhosts är NXDOMAIN.

Två lager, inte en flagga:

| Lager | Default på preview | Vad som krävs för att slå på |
|---|---|---|
| Identitet / `NEXT_PUBLIC_SITE_URL` | Alltid från aktuellt bevis | Ingen env-flagga. Utan bevis: ingen `SITE_URL`, inget `noindex`-gissning |
| 307-redirect provider → primärhost | Av | `SAJTMASKIN_CANONICAL_ADDRESS_CONTRACT=true` **och** attesterat samma-projekt-alias **och** in-process HTTPS-bevis |

Flaggan öppnar inte A4, C2 eller branded-pilot. Det är inte A3-klart i drift:
två testhosts under `sites.*` över HTTPS saknas, och branded → egen domän →
branded är inte kört på en faktisk kundtestdeployment.

Område: [01](../01-varumarkta-adresser.md). Efter [A2](A2-branded-eligibility.md)
för gemensamma deployfiler. Samordna kontrakt med [C2](C2-domanflode.md).

## Verifierat problem

`project-scaffold.ts` läser `NEXT_PUBLIC_SITE_URL` med `https://example.com`
som fallback. Deployvägens `envVarsForDeploy` kommer från projektets env;
ingen obligatorisk kanonisk URL injiceras där. SEO-passet är separat opt-in.
Det betyder att scaffoldbaserade sajter utan rätt env eller SEO-omskrivning
kan publiceras med exempeladresser. Det är inte bevis för att alla genererade
sajter har identisk metadata.

## En verifierad adresskälla

- Låt samma verifierade projektidentitet styra kundens live-URL, host-redirect
  och scaffoldens `NEXT_PUBLIC_SITE_URL`. Kunden väljer primäradress genom
  domänflödet. Ett fritt env-värde får inte ensamt bli redirectmål.
- Korrekt adress sätts före build, även när SEO-copy är av. Vid konflikt med
  ett äldre kundsatt env-värde: visa åtgärd och använd den verifierade
  adresspolicyn; låt inte tre olika canonical-källor bestå tyst.
- Om ingen kundadress fungerar: behåll senaste fungerande publicering och
  rapportera väntande adress, alternativt skapa endast teknisk preview.
- HTTPS verifieras separat från att Vercel accepterat ägarskap/alias. Bekräftat
  ogiltig domän och tillfälligt okänd provider-status hanteras olika; okänd
  status får inte kasta bort senaste fungerande identitet.

## Redirect och indexering

Produktionens kända provider-host omdirigeras till fungerande primärhost med
bibehållen path/query. Börja pilot med temporär 307; använd 308 först när
mål och rollback är verifierade. Omdirigera inte andra projekts hostnamn,
plattformens egen host eller skyddade preview-deployer med ett brett regex.
Provkör även formulär/OAuth/webhooks som kan vara beroende av gamla URL:er.

`next.config` kan användas men befintlig kundkonfiguration måste slås ihop.
En ändring av bara scaffoldens default når inte säkert redan genererade filer.
Felaktig deklarativ konfiguration kan också fälla en build eller skapa loopar.
Visa bevis för både nya och redan existerande projekt.

`X-Robots-Tag: noindex` för teknisk provider/preview är kompletterande
sökstyrning, inte hemlighållande. Kundens primärhost ska inte råka få headern.

## Adressbyte och rollback är drift

Miljövariabler och `next.config` blir del av kundsajtens build. En flaggändring
på Sajtmaskins eget projekt ändrar inte dem. Egen domän till/från branded kräver
därför kontrollerad ompublicering eller motsvarande verifierad provider-routing.
Markera bytet färdigt först när både UI och HTTP använder samma adress.

Vid rollback behåll den gamla fungerande målhosten medan redirects ersätts.
Om målhosten är trasig behövs återställning/ompublicering av kunddeploymenten;
appens flagga räcker inte. Permanent cachead 308 kräver särskild försiktighet.

## Klart när

En faktisk kundtestdeployment klarar branded → egen domän → branded, med rätt
metadata, sitemap, provider-redirect och utan loop. En äldre genererad konfig
klarar samma flöde. SEO-opt-out, skyddad preview, ett nekad/okänt domänsvar och
rollback ingår i riktad verifiering. Ingen fungerande kundsajt ersätts vid fel.

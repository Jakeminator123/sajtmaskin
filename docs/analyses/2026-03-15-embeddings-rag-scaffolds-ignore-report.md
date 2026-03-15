# Embeddings, RAG, scaffolds och ignore-regler

Datum: `2026-03-15`

## Syfte

Den här rapporten reder ut fyra saker som i nuläget lätt flyter ihop i
Sajtmaskin:

1. `embeddings`
2. RAG-liknande retrieval
3. `scaffolds` och builderns `Mall: Auto`
4. effekten av `.gitignore` och `.cursorignore`

Målet är att skilja på vad som faktiskt är sant i kodbasen och vad som bara
låter sannolikt när man tittar på UI:t eller filnamn.

## Kort slutsats

Det finns i dag ingen separat vektordatabas eller klassisk "RAG-databas" i
projektet. I stället använder Sajtmaskin flera lokala, förberäknade
embeddings-filer i JSON-format och kombinerar dem med keyword-fallbacks.

Det betyder:

- `embeddings` förbättrar semantisk träffsäkerhet, men systemet är inte helt
  beroende av dem för att fungera
- `Mall: Auto` väljer mellan interna runtime-scaffolds, inte mellan alla
  externa mallar eller alla snippets
- prompten berikas dessutom från ett separat dokumentations-/referenslager,
  vilket är något annat än scaffold-valet
- `.cursorignore` döljer exakt de genererade JSON-filer som är mest relevanta
  för att förstå retrieval-delen, så felsökning blir spretigare än den behöver
  vara

Den viktigaste korrigeringen är därför:

> Sajtmaskin har retrieval och embeddings, men inte en separat RAG-databas.
> Runtime-lanen är scaffold-driven och retrieval-lanen är ett stödskikt för
> promptberikning.

## Vad embeddings används till

Embeddings används i fyra tydliga spår:

| Spår | Fil | Roll |
| --- | --- | --- |
| Template gallery search | `src/lib/templates/template-search.ts` | Semantisk sökning bland gallery items |
| Template library search | `src/lib/gen/template-library/search.ts` | Semantisk sökning i kuraterad referensdata |
| Scaffold search | `src/lib/gen/scaffolds/scaffold-search.ts` | Semantisk fallback vid scaffold-val |
| Docs knowledge base | `src/lib/gen/context/semantic-search.ts` via `knowledge-base.ts` | Semantisk docs-sökning för promptberikning |

Det gemensamma mönstret är:

1. en lokal JSON-fil med förberäknade embeddings laddas
2. användarens query embed-das vid runtime
3. cosine similarity räknas mot det lokala indexet
4. top-k-resultat returneras

Det här syns tydligt i:

- `src/lib/templates/template-search.ts`
- `src/lib/gen/template-library/search.ts`
- `src/lib/gen/scaffolds/scaffold-search.ts`

## Finns det en riktig RAG-databas?

Nej, inte i betydelsen separat vektorlagring som Pinecone, pgvector,
Supabase vector store eller liknande.

Det som finns är i praktiken ett lokalt retrieval-index byggt av JSON-filer:

- `src/lib/templates/template-embeddings.json`
- `src/lib/gen/template-library/template-library-embeddings.json`
- `src/lib/gen/scaffolds/scaffold-embeddings.json`
- `src/lib/gen/data/docs-embeddings.json`

Det här är alltså en enklare RAG-liknande modell:

- retrieval finns
- augmentation finns
- men lagringen är filbaserad, inte databasbaserad

Den tydligaste augmentation-punkten finns i `src/lib/gen/system-prompt.ts`,
där `buildDynamicContext()` hämtar:

- docs-träffar via `searchKnowledgeBaseAsync(...)`
- template references via `searchTemplateLibrary(...)`

Det läggs sedan in i systemprompten som:

- `Relevant Documentation`
- `Relevant Template References`
- `Reference Code Snippets`

## Måste man "köra embeddings" för att RAG ska kunna skapas?

Ja och nej, beroende på vad du menar med "skapas".

### Om du menar: bygga det semantiska indexet

Ja. Då måste embeddings-filerna genereras minst en gång.

Det görs via scripts som:

- `scripts/generate-docs-embeddings.ts`
- `scripts/generate-scaffold-embeddings.ts`
- `scripts/generate-template-embeddings.ts`
- `scripts/generate-template-library-embeddings.ts`

Det finns också särskild refresh för template embeddings via:

- `src/app/api/admin/templates/embeddings/route.ts`
- `src/app/api/cron/templates/embeddings/route.ts`

Det betyder att om indexet inte redan finns, eller om det är gammalt, så måste
det regenereras för att semantisk retrieval ska ha något att söka i.

### Om du menar: måste hela buildern ha embeddings för att fungera

Nej.

Kodbasen har på flera ställen uttryckliga fallback-spår:

- `src/lib/templates/template-search.ts` faller tillbaka till
  `fallbackKeywordSearch(...)`
- `src/lib/gen/template-library/search.ts` faller tillbaka till
  `keywordSearch(...)`
- `src/lib/gen/context/knowledge-base.ts` kör keyword först och använder
  semantic som förstärkning när keyword-resultaten är svaga
- `src/lib/gen/scaffolds/matcher.ts` använder keyword som primär strategi och
  embeddings bara när resultatet annars blir ett generiskt default-val

Det korrekta sättet att beskriva systemet är därför:

> Embeddings är ett kvalitets- och träffsäkerhetslager, inte ett absolut
> driftkrav för att promptflödet ska fungera.

## Hur `Mall: Auto` faktiskt fungerar

Dropdownen i buildern definieras i `src/components/builder/BuilderHeader.tsx`.
Knappen visar:

- `Mall: Av`
- `Mall: Auto`
- eller etiketten för en manuellt vald scaffold

När användaren väljer `Auto` skickas detta vidare som metadata:

- `scaffoldMode`
- `scaffoldId` vid manuellt val

Detta sätts i både:

- `src/lib/hooks/chat/useCreateChat.ts`
- `src/lib/hooks/chat/useSendMessage.ts`

På serversidan normaliseras metadata i
`src/lib/gen/request-metadata.ts` via `extractScaffoldSettingsFromMeta(...)`,
och sedan går den in i `prepareGenerationContext(...)` i
`src/lib/gen/orchestrate.ts`.

Det centrala beslutsflödet är:

1. `off` -> ingen scaffold
2. `manual` + `scaffoldId` -> exakt den scaffolden används
3. tidigare sparad scaffold -> återanvänds
4. `auto` -> `matchScaffoldWithEmbeddings(prompt, buildIntent)`

## Hur auto-matchningen väljer scaffold

Själva scaffold-matchningen finns i `src/lib/gen/scaffolds/matcher.ts`.

Den fungerar i två steg:

### Steg 1: keyword-baserad matchning

Systemet försöker först avgöra om prompten liknar t.ex.:

- landing page
- SaaS
- portfolio
- blog
- dashboard
- app shell
- auth pages
- ecommerce
- content site

Om keyword-matchningen är tydlig används det resultatet direkt.

### Steg 2: embeddings-fallback

Embeddings används bara när keyword-spåret annars hade landat i ett generiskt
default-val som:

- `landing-page`
- `base-nextjs`

Det är viktigt: embeddings avgör alltså inte hela scaffold-valet från början.
De används som ett extra försök när keyword-listorna inte räcker.

Det här är en ganska konservativ strategi och minskar risken för att en vanlig
företagssajt felaktigt hamnar i ett specialiserat app- eller auth-skal.

## Hur många scaffolds finns just nu

Det interna runtime-registret i `src/lib/gen/scaffolds/registry.ts` innehåller
för närvarande tio scaffolds:

1. `base-nextjs`
2. `landing-page`
3. `saas-landing`
4. `portfolio`
5. `blog`
6. `dashboard`
7. `auth-pages`
8. `ecommerce`
9. `content-site`
10. `app-shell`

Om du upplever att du "kan välja nio" i UI:t är den säkraste kodmässiga
slutsatsen just nu att registret har tio interna runtime-scaffolds. Det kan
alltså vara en observationsskillnad i UI:t, inte ett faktiskt niotal i
registret.

## Vad som inte är samma sak som scaffold-val

Här finns den största begreppsfällan i hela området.

### 1. Template gallery

`src/lib/templates/` är ett produkt-/UI-lager för användarens mallupptäckt.
Det är inte samma sak som runtime scaffold-registret.

### 2. Runtime scaffolds

`src/lib/gen/scaffolds/` är de interna starter projects som motorn faktiskt
utgår från under generering.

### 3. Docs snippets

`src/lib/gen/data/docs-snippets.ts` innehåller `DOCS_SNIPPETS`. Den filen har
just nu 73 snippet-poster. De används för docs-/knowledge-base-berikning, inte
för att välja vilken scaffold som ska bli startpunkt.

### 4. Template library references

`src/lib/gen/template-library/` är ytterligare ett separat referenslager.
`searchTemplateLibrary(...)` används i `buildDynamicContext()` för att hämta
kuraterade referensmallar och utvalda filutdrag som läggs in i prompten.

Detta betyder att din modell av systemet bör vara:

- scaffold-val = välja startstruktur
- docs snippets = tillföra komponent-/mönsterkunskap
- template library = tillföra referensinspiration och utvalda kodutdrag

Det är alltså inte ett enda stort snippet-register som ersätter scaffolds.

## Hämtas kanske 150 snippets när man skickar prompten?

Inte enligt den verifierbara runtime-koden.

Det jag kan bekräfta säkert är:

- `DOCS_SNIPPETS` har 73 poster
- `buildDynamicContext()` hämtar upp till 7 knowledge-base-resultat
- `buildDynamicContext()` hämtar upp till 3 template-library-matcher
- av dessa används högst 2 för `Reference Code Snippets`

Med andra ord finns det flera retrieval-källor, men prompten fylls inte med
ett okontrollerat hundratal snippets per request. Tvärtom finns tydliga tak
för hur mycket som får följa med in i promptbudgeten.

Det som fortfarande är svårt att verifiera exakt i den här sessionen är hur
många poster `template-library.generated.json` totalt innehåller, eftersom just
den genererade filen filtreras av `.cursorignore`. Men det påverkar inte den
viktigaste slutsatsen: template library är ett separat referenslager, inte samma
sak som scaffold-registret.

## Hur retrieval-kedjan faktiskt ser ut

Det mest träffsäkra sättet att beskriva flödet är:

1. användaren skriver prompt i buildern
2. buildern skickar `scaffoldMode`/`scaffoldId` i metadata
3. servern kör `prepareGenerationContext(...)`
4. scaffold väljs manuellt, återanvänds eller auto-matchas
5. scaffold serialiseras till promptkontext
6. docs knowledge base söks
7. template library söks
8. relevanta utdrag läggs in i systemprompten
9. genereringen körs i egen motor eller v0-fallback-lane

Det betyder att retrieval här är en promptberikningskedja, inte ett separat
databasanrop som ensam driver hela systemet.

## Ignore-regler: vad som faktiskt döljs

Här finns ett verkligt problem, men det är främst ett
observations-/felsökningsproblem, inte nödvändigtvis ett runtime-problem.

### `.gitignore`

`.gitignore` styr vad som inte ska commitas. Här är det i huvudsak rimligt:

- `.env*`
- nycklar och certifikat
- loggar
- lokala automation- och rapportartefakter
- stora research-/cache-mappar

Detta är bra ur säkerhets- och repo-hygienperspektiv.

### `.cursorignore`

`.cursorignore` styr vad Cursor inte indexerar. Där göms bland annat:

- `.env*`
- `src/lib/gen/data/docs-embeddings.json`
- `src/lib/gen/scaffolds/scaffold-embeddings.json`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`
- `src/lib/gen/template-library/template-library-embeddings.json`
- `src/lib/gen/template-library/template-library.generated.json`
- stora research-mappar
- loggar och automation-runner-spår

Filen säger dessutom uttryckligen att dessa artefakter ska hållas borta från
indexering för att minska brus.

## Min bedömning av ignore-läget

Om din fråga är "är det för mycket ignorerat för att man lätt ska kunna förstå
och felsöka embeddings/RAG/scaffold-problemet?", så är svaret:

Ja, lite grann.

Det är inte katastrofalt och det är inte fel ur säkerhetssynpunkt, men just för
den här typen av analys skapar `.cursorignore` onödig friktion eftersom flera
nyckelartefakter i retrieval-lagret är dolda från vanlig indexering och sökning.

Det märks särskilt på tre typer av filer:

1. genererade embeddings-filer
2. genererade template-library-filer
3. lokala `.env`-filer

Effekten blir att man lätt får känslan att "systemet är spretigt" trots att
själva runtime-kedjan i koden egentligen är ganska strukturerad.

## Är `.env`-filerna ett problem?

Jag tolkar din referens till `nv` som att du menar `.env`.

Min bedömning är:

- i `.gitignore` ska de fortsätta vara ignorerade
- i `.cursorignore` är det också rimligt att de är dolda som standard
- men det gör att env-relaterad felsökning nästan alltid kräver explicit
  manuell läsning i stället för vanlig AI-indexering

Det är alltså inte fel, men det är viktigt att veta att "dold för Cursor" inte
betyder "finns inte".

## Praktisk huvudbild

Om man komprimerar hela nuläget till några raka påståenden blir det:

1. Sajtmaskin använder embeddings i flera spår, men inte via en separat
   vektordatabas.
2. Runtime-lanen är scaffold-driven och väljer bland tio interna scaffolds.
3. `Mall: Auto` använder keyword först och embeddings som försiktig fallback.
4. Docs snippets och template-library references är stödmaterial till prompten,
   inte ersättare för scaffold-registret.
5. Embeddings måste genereras för att semantiska index ska finnas, men systemet
   har fortfarande fungerande keyword-fallbacks utan dem.
6. `.cursorignore` döljer flera av de viktigaste artefakterna för just denna
   analys, vilket gör felsökning mer splittrad än nödvändigt.

## Rekommenderade nästa steg

Jag skulle prioritera följande:

1. Dokumentera ett enda officiellt svar på frågan "vad är skillnaden mellan
   hemsidemall, scaffold, docs snippets och template references?" i en kort
   intern guide.
2. Lägg till en liten debug-/operationsguide för embeddings:
   vilka filer som finns, hur de regenereras och vilka fallbacks som gäller.
3. Överväg att lätta på `.cursorignore` för just
   `template-library.generated.json` och eventuellt
   `scaffold-research.generated.json`, eftersom de är högsignal-filer vid
   analys men inte nödvändigtvis säkerhetskänsliga.
4. Behåll `.env*` ignorerade i både Git och Cursor.
5. Om du vill ha en verklig "RAG-databas" i framtiden behöver retrieval-lagret
   flyttas från lokala JSON-index till en faktisk vektorstore. Det är inte så
   systemet fungerar i dag.

## Slutbedömning

Det du upplever som spretigt är förståeligt, men kärnlogiken är faktiskt mer
ordnad än den ser ut:

- scaffold-valet är separat
- docs-/template-retrieval är separata stödskikt
- embeddings är förbättringslager, inte ensam ryggrad

Det som framför allt gör helheten svår att läsa just nu är begreppsblandning i
UI/mentala modeller och att flera viktiga genererade artefakter är dolda från
normal Cursor-indexering.

# LLM Pipeline - reviewlage och oppna risker

Kort arbetsdokument for extern review efter Steg 3.

## Kort lagebild

- Builderns LLM-kedja ar i grunden bra strukturerad.
- Steg 2 och Steg 3 ar nu betydligt tydligare an tidigare:
  - scaffoldval / route plan / BuildSpec
  - faktisk LLM-input
  - budget / pruning / observability
- Kedjan ar **inte** fardigoptimerad for alltid. Det finns fortfarande naming debt, komplexitet och delar som ar mindre genomlysta an onskat.

## Kvarvarande svagheter mot idealet

1. Naming debt finns kvar, sarskilt runt `/api/v0/` och `sandbox`.
   - `/api/v0/` betyder nu API-versionering / compat, inte gamla v0-providern.
   - `sandbox` lever kvar i kontrakt, typer, DB-falt och vissa kommentarer trots att VM / `preview_host` ar riktningen.
   - Det gor kedjan svarare att lasa, sarskilt for nya agenter eller externa reviewers.

2. Follow-up-flodet ar fortfarande ganska komplext.
   - Det finns flera lager fore modellanropet:
     - intent-klassning
     - previousFiles/file-context
     - persisted scaffold-logik
     - contract clarification
     - prompt orchestration
     - attachment hydration
   - Det ar fungerande, men svarare att resonera om an init-flodet.

3. `template-library` / extern-pipeline ar fortfarande tung att forsta.
   - Det ar **inte** langre direkt prompt-injection i `system-prompt.ts`.
   - Men det ar fortfarande viktigt for scaffold research, validering och vissa lokala skriptfloden.
   - Alltsa: inte "dod", men heller inte lika direkt runtime-nara som scaffolds.

4. Steg 4 och Steg 5 ar inte lika genomlysta som Steg 2 och Steg 3.
   - Steg 4 = generate / finalize / validate
   - Steg 5 = preview / version materialization / uppfoljning
   - De delarna har mer kvarvarande komplexitet och fler gamla namn/kompatspår.

## Andra saker som bor kollas i review

- Verkliga buggrisker eller regressionsrisker i follow-up-floden.
- Om docs eller dashboardar nagonstans overdriver observability till att lata som source of truth.
- Om samma signal skickas in tva ganger under andra namn.
- Om `BuildSpec`, route plan och scaffold research fortfarande har nagon dold overlappning.
- Om det finns tester som bara verifierar implementationdetaljer i stallet for faktisk beteendesanning.
- Om gamla kompattermer fortfarande smyger in i ny kod eller nya docs.

## Terminologi att vara extra vaksam pa

Foljande ord blandas latt ihop och bor granskas aktivt:

- `v0-mallar` vs `template-library` vs scaffolds
- `/api/v0/` som API-versionering vs historisk v0-provider
- `sandbox` vs preview / VM / `preview_host`
- `user-turn` vs systemprompt vs dynamic context
- `template` / `mall` utan forlangning
- "original prompt" nar det egentligen menas:
  - builderns ursprungliga text
  - den orkestrerade prompten
  - den faktiska user-turn som skickas till modellen

## Viktigt om reviewperspektiv

Ja: granskningen bor aktivt forsoka hitta

- buggar
- regressionsrisker
- naming debt
- overlappande begrepp
- svara engelska ord som anvands som genvagar for olika saker
- missvisande "for korta" forklaringar i docs och dashboardar

Reviewn bor **inte** i forsta hand fokusera pa smak eller stil, utan pa:

- ar beteendet ratt?
- ar source of truth tydlig?
- ar orden tillrackligt exakta?
- finns det dod eller missvisande compatlogik som borde rensas senare?

## Kandidater for senare stadning (inte radera nu blint)

- `/api/v0/chats/*`-compatlagret nar faktisk anvandning ar nere pa noll
- `sandbox`-namn i kontrakt och kommentarer dar VM/preview redan ar den faktiska sanningen
- delar av extern template-pipeline om de senare separeras tydligare fran runtime-nara delar
- docs som upprepar samma forklaring med olika ord

## Inte "radera nu"

Foljde slutsatser ska **inte** dras utan bredare verifiering:

- att hela `template-library` kan raderas
- att hela `data/external-template-pipeline/` ar onodig
- att `/api/v0/` redan ar trygg att ta bort
- att `sandbox`-namn i preview-kontrakt kan bytas brett utan migreringsplan
- att `legacyShimPreviewUrl` kan tas bort utan separat UI/API-kontraktspass
- att avatar / D-ID / OpenClaw ar samma sak som builderns codegenflode

## Steg 4 review triage - parkera cleanup uttryckligen

Foljande kluster ar **medvetet parkerade** till ett separat migreringspass (inte detta Steg 4-triagepass):

- `/api/v0/` compat-lagret
- `sandbox`-namn i preview/kontrakt
- `legacyShimPreviewUrl` / shim-sparet
- bred `template-library` / extern-pipeline-rensning

Skal: de ar fortfarande aktivt refererade i runtime, UI, tester och/eller docs och krav pa telemetri + kontraktsmigrering finns innan saker borttagning.

## Ar det redo for extern review?

Ja.

Steg 3 ar tillrackligt sammanhangande for att skickas pa extern review nu.

Det som ar bra att be reviewn fokusera pa ar:

1. Finns nagon verklig buggrisk i faktisk LLM-input eller follow-up-flodet?
2. Finns nagon kvarvarande dubbel kontext eller missvisande observability?
3. Ar terminologin tillrackligt tydlig, eller finns det fortfarande ord som skymmer vad som faktiskt hander?
4. Finns nagon tydlig kluster av legacy/compat som bor planeras for senare borttagning?

## Efter review

Om reviewn hittar verkliga problem:

- buggar / regressionsrisker -> fixa
- naming / docs / dashboard-missar -> synka
- bredare cleanup eller preview/finalize-fragor -> planera under Steg 4 eller Steg 5

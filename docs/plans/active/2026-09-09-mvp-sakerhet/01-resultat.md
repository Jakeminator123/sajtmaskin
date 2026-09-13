# Resultat och releaseöverlämning

## Underlag och scope

- Revision vid start: preview `e4a58031dd644b4700b1312991a3f0156331ab52`.
- Integrationsbas: preview `17afaed7222af227e8477b68a2644c5c21f81f32`.
- Vercel preview: `17afaed7222af227e8477b68a2644c5c21f81f32`, deployment
  `dpl_36niYk4oX5nrEzdFgiTu5wsTAq8i`, READY vid ny kontroll 2026-09-09.
- Produktion/master: `678594c74635168b400971282da958a127070b21` vid kontroll.
- #1320 fick SHA-bunden COMMENT-sign-off efter 40 riktade tester; #1324 efter
  272 runtime-guard-kontroller. GitHub nekade formell approval av det egna
  kontots PR. Båda mergades därefter av annan aktör och ingår i basen.
- Fem implementationsagenter med separata kodägare, parent-integration och en
  fristående readonly granskare. Ingen Grok-modell var tillgänglig.
- Preview och produktion fortsätter dela databas. Beslutet finns i
  [ägarregistret](../../../decisions/README.md).
- Ingen merge, host-deploy, verklig kundbetalning eller skrivning till
  leverantörernas databaser har gjorts i uppdraget.

## Kod som ingår

| Område | Förändring | Verifiering och begränsning |
|---|---|---|
| Google-koppling (`SM-079`) | Transaktion, sorterade identitetslås och radlås. Ett overifierat kontos lösenord tas bort när Google kopplas; ett tidigare verifierat kontos lösenord bevaras. Identitetskonflikter avvisas. | Regression använder faktisk service och `loginUser`. Redan historiskt felkopplade konton repareras **inte** automatiskt: dagens `email_verified=true` bevisar inte vem som satte lösenordet. |
| Wizard (`SM-078`) | Ny migration aktiverar RLS och återkallar PUBLIC/anon/authenticated-rättigheter. Backend/service_role behåller åtkomst. Båda befintliga migrationsvägar använder samma ordning. | Exakta SQL-källor körda två gånger i isolerad PGlite 0.3.14: åtta klient-DML-försök nekas med 42501 och backend CRUD fungerar. Ett separat test i befintlig PostgreSQL-CI-lane kan inte hoppa över när `REQUIRE_POSTGRES_TESTS=1`. |
| Genereringskostnad (`SM-081`) | Kontolås före betalt intent-/brief-/genereringsarbete, förnyad behörighets-/saldokontroll under låset och ägarsäker upplåsning. Samma kontonyckel i preview/production. | Avbrottstest håller låset genom faktisk provideravslutning, persistens och debitering. 20 minuters TTL är kraschskydd över dagens 950-sekunders ruttak. Detta är **ingen beloppsreservation eller garanti om maximal AI-kostnad**. |
| Host-release | Obligatorisk full Git-SHA byggs in i Docker-image. `npm --prefix preview-host run deploy` använder en ren snapshot av committade byggfiler. `/health` läser inbakad releaseidentitet, inte Vercel-/runtime-env. | Lokala HTTP-/Git-/Fly-stubtester passerar. Docker saknas lokalt; faktisk image och driftsatt SHA är ännu inte verifierade. Identitet är inte projektisolering (`SM-080`). |
| Kundinformation | Fasta revisionsdatum, borttaget DG97, rättad AI-/leverantörs- och USA-lagringstext. Uppfunna 41/28-mätvärden och grundarnamnet Erik tas bort. | Ingen ny bolagsidentitet, postadress eller juridisk garanti har hittats på. Befintligt Pretty Good AB och kontaktuppgifter behöver fortfarande verifieras av ägaren. |

## Oberoende review och triage

- P2: Drizzle kapslar PostgreSQL-felet 23505 i `cause`; återförsöket måste
  testa faktisk adapterform. Rättat med begränsad cause-sökning och faktisk `DrizzleQueryError` i regressionstestet.
- P1: Miljöprefix på kontolåset tillät parallellt arbete mot samma kreditsaldo
  via preview och production. Rättat till gemensam kontonyckel, med tester av
  två separata miljöinstanser och gammal låsägares sena upplåsning.
- Granskaren fann inga ytterligare konkreta regressionsfel i SQL-härdning,
  release-snapshot eller kundtext. Samlad readonly review av `fd44b07330d94f992fc0a77d4b16d6b189441714`
  bekräftade båda rättningarna utan nya konkreta P1/P2-regressioner.

## Verifiering

Parent verifierade integrerad runtime-revision
`fd44b07330d94f992fc0a77d4b16d6b189441714` med Node 22.23.2 och exakt
`npm ci`-låsta beroenden (inklusive OpenAI 6.49.0 och input-otp 1.5.0):

- **270 tester passerade i 20 filer:** auth, migrationsordning/RLS-fel,
  schema-drift, konto-/chatlås, avbrott, faktisk engine-/provider-/planlivscykel
  och regression för #1320:s byggval.
- Hostens syntaxkontroll, releaseidentitetstest och 272 runtime-guard-
  kontroller passerade efter integration med #1324. Deploy-wrapperns dry-run
  identifierade samma committade SHA utan att kontakta Fly.
- `verify:pr -- --plan --base origin/preview` passerade. Full högriskprofil
  gäller i CI; ingen direkt control-plane-owner ändras. Påverkansroutern
  listar sju Backoffice-konsumenter, men deras datafält/UI-kontrakt ändras inte.
- `sync:derived` kördes. Genererade kontrakt, aktiva dokumentlänkar,
  planhistorik, bugbacklog, canvas och `knip:files` passerade.
- Full `npm run typecheck` och `npm run lint` passerade.
- Native PostgreSQL-test, produktionsbuild och övriga required checks körs
  av GitHub Actions på PR-head; detta lokala kvitto ersätter inte CI.

Housekeeping före PR: aktiv planrouter och ägarbeslut uppdaterade; buggarna
har stabila ID:n `SM-078`–`SM-081`, och canvas följer kanonisk backlog.
Döda landing-counters togs bort tillsammans med sina konsumenter. `tidy`
fann inga lokala branch-/worktree-/cache-/ignoreåtgärder; orphan-kontrollen
fann inget. Två temporära lokala auditloggar städades bort. `tidy` kunde inte
läsa remote-rapport via gh, så inga remote-brancher rördes. Inga loggar,
installationsfiler, credentials eller andra scratchartefakter ingår i diffen.

CI-uppföljning på PR #1325: första körningen passerade 10 085 vanliga tester
och 54 stabilitetskontrakt, build, lint, typecheck, Backoffice och host.
Databas-lanen passerade 67/68; det nya testets policyassertion fick `name[]`
som sträng från node-postgres. Frågan castar nu till `text[]`, som drivern
avkodar som array. Alla klient-DML-nekanden och backend-CRUD hade redan
passerat; migrationens innehåll ändras inte. Ny head inväntar grön CI.

## Driftbevis och releaseordning

1. **Gemensamt Redis:** verifiera att Vercel preview och production använder
   samma ioredis-backend (`REDIS_URL`/`KV_URL`) för samma databas. MCP visar
   inte dessa anslutningsvärden, så likheten är inte liveverifierad. Upstash
   REST för rate limiting är en separat anslutning. Saknat Redis ger avsiktligt
   503 för create/follow-up; olika Redis-backends ger inget gemensamt lås.
2. **Migration:** kör den nya filen via repots kanoniska migrationsrunner,
   först i isolerat test/dev och därefter i den delade produktionsdatabasen
   som separat releaseåtgärd. DDL tar ett kort tabellås. Kontrollera RLS=true,
   inga klient-DML-grants samt fungerande backend. CI på push till master
   applicerar normalt prod-migrationer enligt `docs/ENV.md`.
3. **Vercel:** deploya godkänd apprevision genom det ordinarie preview/promote-
   flödet. En grön PR-preview bevisar inte att SQL-migrationen är applicerad
   eller att Fly kör samma kod.
4. **Fly:** CLI v0.4.101 (2026-09-08) är installerat från den officiella
   [Fly-installationsanvisningen](https://fly.io/docs/flyctl/install/).
   `flyctl auth whoami` saknar access token; inga hoståtgärder utfördes.
   Efter separat godkänd release: använd wrappern och jämför health-SHA med
   avsedd commit. Se [hostens runbook](../../../../preview-host/README.md).
5. **Supabase live:** säkerhetsrådgivaren bekräftade 2026-09-09 fortfarande
   `wizard_runs` utan RLS. Fixen finns i PR, inte i levande databas.

Rollback: app-/hostrelease kan återställas till tidigare godkänd revision.
Det återinför motsvarande kodrisker. Återställ **inte** publika wizard-grants;
behövs SQL-korrigering, skapa en ny framåtriktad migration eftersom tillämpade
filnamn är ledgerförda. Ingen kunddata behöver skrivas om för denna migration.

## Kvar före öppen lansering

- **`SM-080`: verklig isolering mellan preview-projekt.** Eget filsystem,
  process-/nätgräns, privata hemligheter och resursgränser måste bevisas med
  syntetiska korsprojektprov. Acceptance finns i hostens README.
- **`SM-081`: verklig budgetreservation/kostnadstak.** En enskild körning,
  andra betalda endpoints (bl.a. repair), fristående verifieringsarbete och
  uppskjuten/misslyckad avräkning omfattas inte fullt av det nya kontolåset.
- **Historiska Google-kopplingar:** bedöm eventuell påverkan på redan
  verifierade blandkonton med kontohistorik och en beslutad återställningsväg.
  Ingen automatisk massnollning av legitima lösenord görs.
- **Vanlig kundresa:** registrering → gratisgenerering → ändring → creditköp
  → publicering, inklusive avbruten generation och återförsök. Använd ett
  vanligt konto; dokumentera minst 20 kontrollerade resor före liten pilot.
- **Återställning/support:** verifierad väg för förlorat lösenord/konto.
- **Företags-/integritetsuppgifter:** bekräfta juridiskt namn, org.nr, postadress,
  supportkontakt, leverantörsavtal, lagringstider och överföringsmekanismer.
- **Preview-stabilitet:** klassificera misslyckanden med blockeringsorsak,
  verifiera hostens faktiska revision och gör kontrollerat samtidighetsprov.

Delad preview-/produktionsdatabas är ett uttryckligt ägarbeslut och ingår
inte som en begäran om uppdelning i restlistan. Skrivande regressionstester
körs fortsatt isolerat, utan kunddata.

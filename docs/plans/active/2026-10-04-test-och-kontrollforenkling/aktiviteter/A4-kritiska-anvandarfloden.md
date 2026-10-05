# A4 — kritiska användarflöden

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Blockerad för implementation. Beroende: A1; integreras efter A2.

## Verifierat hinder och nästa owner

Read-only genomgång av `a1_highrisk`: befintlig deploy-smoke-discovery och
frivilliga skips bevisar inte skapa/spara/reload. Checkouten saknar isolerad
Postgres-harness och deterministisk providergräns för hela generationsflödet;
delad DB eller live provider får inte användas som genväg. En seedad version
skulle endast bevisa CRUD, inte generation eller senare uppföljning.

Chatten **Dokumentera Master-promotion** äger parallellt dossierkärnans
quality-gate, server-verify, verify-run, F3-readiness och borttagning/ersättning.
Även `useVersionStatus`, `useResumePendingVerification`, versionslistans
API-route och `settle-stale-verification` med tester är reserverade dit.
Nästa steg: invänta levererad core-preview och slutligt lease/CAS-kontrakt;
reservera därefter en isolerad flödesharness med uttryckliga körkrav. Inga
scenarier nedan är markerade som körda. Detta blockerar A6b:s slutliga
urvalsminskning, men inte fristående A3-/A5-paket.

## Uppdrag

Komplettera med ett litet antal verkligt användbara flödestester. Gå genom
appens normala gränssnitt och lokala tjänstegränser för att upptäcka fel som
isolerade funktionstester missar. Återanvänd `e2e/` och befintliga verktyg.

Kontrollerade svar från externa AI-/betalningstjänster gör körningen
reproducerbar. Mocka vid externa gränser, inte bort sparning, uppföljning eller
den appkod vars samspel testet påstår sig verifiera. Använd isolerade testdata;
anslut aldrig till delad utvecklings-/produktionsdatabas som testgenväg.

## Scenarier

- [ ] Skapa projekt, spara och ladda om: relevant innehåll och version finns kvar.
- [ ] Gör en lokal ändring: ändringen kvarstår efter omladdning och senare
      uppföljning, samtidigt som orelaterat innehåll och accepterat utseende består.
- [ ] Ta bort funktion A: gränssnitt, kod och relevanta integrationsval speglar
      borttagningen. Spara, ladda om och fortsätt med äldre brief/snapshot;
      A återinförs inte oavsiktligt.
- [ ] Ersätt A med B: explicit ny instruktion styr, B består efter återupptagande
      och gamla val tar inte över. Fall med sparad data eller extern migration
      ska ge ett ärligt avgränsat utfall, inte tyst radering för att göra testet grönt.
- [ ] Kontrollera representativt misslyckande/avbrott: appen visar relevant
      status, behåller användardata och rapporterar inte ett fel som framgång.

## Checklista

- [ ] Välj representativa scenarier och kravägare med A1. Antal scenarier är
      ett medel, inte ett katalogkrav; kombinera när samma flöde ger bra felbevis.
- [ ] Reservera app-/testharness-/fixturepaths och granska isoleringen före körning.
- [ ] Kontrollera faktisk appstart, session, sparning och reload i testmiljön.
      Beskriv vilken verklig infrastruktur som används respektive ersätts.
- [ ] Undvik beroende av exakta AI-formuleringar, godtyckliga delays och
      screenshotidentitet. Kontrollera relevant tillstånd och synligt beteende.
- [ ] Visa att minst ett fel i borttagning/ersättning upptäcks av flödet.
- [ ] Gör skillnaden tydlig mellan Playwright `--list`, ett överhoppat scenario
      och en faktiskt körd grön kontroll. Obligatoriska flöden ska falla när
      nödvändig harness saknas; frivilliga liveprov redovisar sin skip.
- [ ] Kör flöden deterministiskt med kontrollerade externa svar och oberoende review.
- [ ] Lämna exakta körkrav, bevis och rimlig kostnad till A6.

## Klart när och handoff

De valda scenarierna är faktiskt körda och visar sparning, omladdning och
uppföljning. Mockade bevis är tydligt avgränsade och påstås inte vara live
provideracceptans. Inga hemligheter eller kunddata finns i fixtures/loggar.

Mottagare: [A6](A6-korpolicy-och-ci.md) och
[A7](A7-slutverifiering-och-overlamning.md).

# A4 — kritiska användarflöden

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Smal persistensharness godkänd; implementation och körbevis återstår.
Beroende: A1; separat paket efter aktuell A3-leverans.

## Verifierat hinder och nästa owner

Read-only genomgång av `a1_highrisk`: befintlig deploy-smoke-discovery och
frivilliga skips bevisar inte skapa/spara/reload. Checkouten saknar isolerad
Postgres-harness och deterministisk providergräns för hela generationsflödet;
delad DB eller live provider får inte användas som genväg. En seedad version
skulle endast bevisa CRUD, inte generation eller senare uppföljning.

Dossier-/shared-runtime-reservationen frigavs efter #1558 på faktisk preview
`59a12080`, som ingår i integrationsbasen `e37e4d83`. Read-only deltarevalidering
visar att ingen isolerad Postgres, deterministisk providergräns eller lokal
Playwright-appsetup tillkom. Reservationhindret är borta, miljö-/harnesshindret
kvarstår. Inga scenarier nedan är markerade som körda. Det blockerar A6b:s
slutliga urvalsminskning, men inte fristående A3-/A5-paket.

Minsta nästa paket är en isolerad `project-persistence`-harness med riktig
Next/browser/Postgres och faktiska edit/save/reload-routes. Saknad eller otillåten
testdatabas ska ge hårdfel, aldrig skip. Seedad chat/version bevisar bara
persistens; generation, follow-up och remove/replace kräver dessutom en
deterministisk extern providergräns och relevant preview-runtime. Detta är
avgränsat nästa arbete, inte en byggd eller körd harness.

Samordnaren godkände 2026-10-06 en smal CI-implementation: tillfällig
GitHub Actions-runner med egen Postgres-container, verifierat exakt container-ID,
`network none` utan fallback och app/browser i samma nät-namespace med
privilegier borttagna. Positiv env-allowlist, inga dotenv-filer/hemligheter,
ingen delad DB eller lokal systeminstallation. Verklig fil-PATCH, Spara projekt,
reload och negativt cross-session-prov ska köras utan authändring.
Fyra fulla shards, befintliga säkerhetskontroller och GitHub-permissions består.
Oberoende granskning av isoleringsgränsen och faktisk grön runtime krävs;
discovery, mocks och denna förberedelse räknas inte som flödesbevis.

SCHAFFOLDS äger nu `src/lib/builder/build-intent.ts`,
`src/lib/api/engine/chats/create-chat-stream-post.ts`, `parse-chat-request-meta.ts`,
`chat-message-stream/{plan-mode-turn,codegen-turn}.ts`,
`follow-up-orchestration-input.ts` samt `src/lib/gen/orchestrate/{resolve-base,types}.ts`
och deras riktade tester/följdytor. De förkortade chat-pathsen hör till samma
`src/lib/api/engine/chats/`-katalog. TESTER skriver inte i dessa owners utan ny
samordning. Provider/restore/promotion/preservation-kontrakten ändras inte här.

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

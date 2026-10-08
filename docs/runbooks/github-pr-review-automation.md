# Buggpass: oberoende granskning, inte ett IDE-krav

**Buggpass** (även kallat Bugbots-pass) är proceduren. Cursor Bugbot är en
möjlig utförare, inte kravet. Codex kan köra samma typ av oberoende granskning.
Behåll externa checknamn oförändrade som bevis; döp inte om en Codex-review
till `Cursor Bugbot` och räkna inte en neutral/skippad körning som godkänd.

## Automatik som faktiskt finns

På PR #1586, head `40273c4524f84640fac26be1939a26d419f18fb1`, rapporterade
GitHub 2026-10-07 `Cursor Bugbot: success`. `Cursor Automation: Find critical
bugs` och `Cursor Automation: PR-mergare` blev neutral: båda stoppades före
start av `Free trial usage limit reached`. Detta är inte två genomförda eller
bevisat debiterade buggpass. `Cursor Automation: Untitled` lyckades, men dess
namn/resultat bevisar inte vilken granskning som gjordes. Inget aktivt GitHub Actions-
workflow är en AI-granskare. Cloudinställningar/prompt och faktisk debitering
måste kontrolleras hos Cursor; de har inte ändrats av detta repoarbete.

## Direkt till preview

1. Kör/redovisa relevanta riktade kontroller enligt PR-workflow och commit:a
   exakt uppgiftens filer. Arbetskopian ska vara ren.
2. `npm run preview:prepare` hämtar färsk preview, kräver fast-forward och kör
   befintlig path-impactmotor i **planläge**. Inga tester, `git diff --check`,
   sandboxprov eller modellgranskningar körs av prepare. Plankvittot attesterar
   inte sådana körningar. Full lokal `verify:pr` behövs bara enligt samma
   befintliga undantag som på PR-vägen (t.ex. ändrad CI-/verifieringsmotor).
3. Fråga Jakob **Är du säker på att du vill pusha?**, ange exakt head-SHA.
   Efter hans svar: `npm run preview:push -- --confirm <full SHA>`.
4. Wrappern kontrollerar granskarens sandbox en gång före push. Hooken kräver
   wrapper-signalen och aktuellt **plankvitto** för base/head; planen upprepas
   inte för preview. Ny kod eller flyttad preview stoppar pushen. Ingen force/delete.
5. **Efter lyckad push** sparas publiceringskvittot och ett fristående Buggpass
   startar automatiskt i samma kommandoflöde. Resultatet går tillbaka till
   författaragenten; huvudchattens innehåll skickas inte till granskaren.
6. Triagera/fixa enligt nedan. Kontrollera push-CI och Vercel READY. Dossier-acceptance körs även på
   preview-push; fyra fulla testshards och DB-skydden är kvar. Deploy/CI kan
   misslyckas **efter** push: lokala kontroller är inte ett server-side förhandslås.

Ägarbeslut 2026-10-08 tillåter Jakobs **befintliga adminundantag** för denna
direkta preview-väg efter SHA-bekräftelsen. Livekontrollen samma dag visade
`Protect preview` med `RepositoryRole: 5` (admin), `bypass_mode: always`, och
inloggat konto med `permissions.admin: true`. Kontrollera dessa fakta före
användning; ett gammalt kvitto ger inte aktuell behörighet. Det behövs ingen
ruleset-ändring som öppnar direktpush för alla. Adminundantaget kan kringgå
även serverns force/delete-skydd, så wrapperns/hookens fast-forward- och
deleteförbud får inte kringgås. CI och Buggpass följs efter push.
Masters ruleset, promote-PR och extra produktionsbekräftelse ändras inte.
Undantaget gäller inte `gh pr merge --admin`: vanlig PR-merge kräver native checks.

Om lokal granskarberedskap fallerar används **PR-vägen** med en fungerande
oberoende granskare och required checks, utan att stänga av sandboxen. Merge
sprider policy/kod men ändrar varken GitHubs rulesets eller Windows-runtime.
Direktpush räknas inte som driftverifierad förrän hela kedjan har körts.

Hook/kvitto är lokala arbetsflödesskydd, inte manipulationssäkra attesteringar.
`preview:push` är enda stödda direktvägen; sätt inte dess interna
`SAJTMASKIN_PREVIEW_WRAPPER_HEAD` manuellt för rå `git push`. Signalen sätts
efter sandboxprovet men är inte manipulationssäker. En annan klient kan sakna
hooken. Ingen garanti ges att en godtycklig
GitHub-API/UI-push startar denna lokala granskare. Flödet kräver att agenten
använder wrappern och följer resultatet; det är ingen ny moln-webhook eller
bakgrundsagent som fortsätter när datorn är avstängd. Använd PR-vägen om ett
server-side förhandslås behövs. Native required checks för master är oförändrade.

## Fristående Codex-pass

`npm run bugpass -- --base <full SHA>` startar `codex exec` med ny kontext,
`--ephemeral`, read-only-sandbox och explicit repo-modell/xhigh. Inget resume,
ingen föräldrachatt, ingen tyst modellfallback eller automatisk retry.
Körningen startar i en unik temporär katalog utan repo-/användarkonfiguration,
MCP-anslutningar eller projektets hemlighetsmiljö. Granskaren läser exakt Git-
diff och nödvändiga callers/tester via SHA; den får inte exekvera repokod.
Sandbox får aldrig stängas av för att få en review att fungera.
Windows-provet kräver både lyckad läsning och nekad skrivning/nätverksåtkomst.
Misslyckad sandbox stoppar före push och modellstart; ingen automatisk
fallback till svagare isolering görs. Se aktuell införandestatus i
[Codex-lagret](../../.codex/README.md#avgränsat-undantag-fristående-buggpass).

CLI-inloggningen återanvänds; kommandot kräver ingen extra API-nyckel.
Det är inte gratis: valt kontos modellkvot gäller. Ingen tokenbesparing är
mätt. En körning per oförändrat base/head/kontrakt/publicering i samma checkout; en lockfil
stoppar samtidig dubbelstart. Tidsgräns 20 minuter; fel/ofullständig review är
inte godkänt. JSON och triage finns i `node_modules/.cache/sajtmaskin-bugpass/`;
plan-/publiceringskvitton i `node_modules/.cache/sajtmaskin-preview/`.
Dessa lokala filer innehåller kodfynd, inte chathistorik eller credentials.
Efter avbruten process: verifiera att dess reviewer inte kör innan en kvarvarande
lockfil tas bort. Ingen automatisk processdödning eller låsrensning.
Fynd måste rättas/triageras; ett nytt pass krävs efter ändringar. En befintlig
PR-bot återanvänds på PR-vägen i stället för att också köra denna CLI automatiskt.

## Fynd → beslut → fix → uppföljning

Varje Codex-fynd har id, plats, kort kommentar, **confidencePercent** (bedömd
säkerhet att buggen är verklig, inte uppmätt sannolikhet) och **impactScore 1–5**:
1 lokal småsak, 2 begränsat besvär, 3 trasigt kärnflöde, 4 bred säkerhets-/datarisk,
5 kritiskt intrång/dataförlust/driftstopp. Poängen ersätter inte CI eller bevis.
Om en extern PR-bot saknar sådana poäng: redovisa "ej angivet", hitta inte på dem
och starta inte en extra modell enbart för att få siffror.

Författaragenten beslutar för varje fynd (citattecken runt skälet):

```text
npm run bugpass -- --base <base> --triage <head> F1 accept "Reproducerat med test X; rättning behövs."
npm run bugpass -- --base <base> --triage <head> F1 reject "Test X visar att den beskrivna vägen inte kan inträffa."
npm run bugpass -- --base <base> --triage <head> F1 defer "Liten känd konsekvens, separat uppföljning beslutad." "spårbar issue/backlog-referens"
```

`accept` betyder **needs-fix**, inte godkänd leverans. `reject` kräver konkret
skäl/evidens. `defer` tillåts endast för P2/impact ≤2 med uppföljning. Osäker
allvarlig risk utreds, filtreras inte bort med en procentspärr. Smak, hypotetiska
nits och krav på perfekt nollbuggprodukt ska inte skapa en ändlös loop.

Efter fix: relevanta tester, ny commit, sedan för direktpreview:

```text
npm run preview:prepare -- --previous <föregående-base>:<föregående-head>
npm run preview:push -- --confirm <ny-mänskligt-bekräftad-head>
```

Om föregående lokala publicering har olösta fynd länkas den automatiskt även
utan `--previous`. Saknad/ofullständig post-push-review måste slutföras först.
En ny vanlig prepare får inte nollställa olösta fynd eller rundräknaren. Ett
manuellt pass gjort före push ersätter inte passet efter den publiceringen;
det tidigare kvittot bevaras som underlag när post-push-resultatet sparas.
Ändrade beslut i en äldre runda gör efterföljande kvitton inaktuella även om
de tidigare var gröna. Slutför omgranskningen av den berörda kedjan innan ny
publicering. Ett kvitto med ny beslutsbakgrund ersätter inte gamla underlaget:
föregående kvitto bevaras i `supersededReview`. Aktuell kod behöver inte
checkas ut bakåt för att granska en äldre, fortfarande publicerad SHA.

På PR-vägen publiceras ny head till samma PR. Läs ordinarie bots uppföljning
för den nya headen. Om Codex är vald ersättare, kör
`npm run bugpass -- --base <PR-bas> --previous <föregående-base>:<föregående-head>`.
Granskaren får tidigare fynd/beslut och granskar delta + integration. Högst tre
länkade rundor; därefter ägarbeslut i samma chatt, inte tyst ny cykel. Detta är
arbetsflödeskontroll, inte skydd mot en författare som avsiktligt byter bas.
Tillåtet slutläge: inga kvarvarande accepterade blockerande buggar, alla fynd
triagerade, eventuell liten skuld synlig och relevanta CI-checks gröna.

Modellfel efter lyckad push lämnar status **publicerad men ogranskad**. Pusha
inte om samma commit. Återuppta med
`npm run preview:push -- --review-published <head>` när felet är löst. Om någon
annan flyttat preview: koordinera med den agenten före vidare fix/review.

## PR-vägen och pensionerad API-granskare

Den separata API-granskaren är pensionerad. `pr-ai-review.yml` tas bort;
workflowen var redan `disabled_manually` på GitHub vid kontroll 2026-10-02.
Den ska inte startas igen som en parallell, betald review av varje PR-event.
`workflow:contract` avvisar även en omdöpt workflow som anropar dess runner.

## Aktivt arbetssätt

1. Författaren kör plan och riktade tester, pushar och öppnar PR mot preview.
2. En oberoende agent granskar exakt aktuell head mot basen. Konkreta fynd
   åtgärdas eller triageras; aktuell GitHub-CI och externa botytor läses också.
3. Merge följer [PR-skillen](../../.agents/skills/pr-workflow/SKILL.md) och
   [merge-regeln](../../.cursor/rules/pr-merge.mdc), bara efter Jakobs mandat.

Vanligt PR-arbete kräver ingen extra `OPENAI_API_KEY`, ingen kontofallback
och inget coach-/Codex-ping. Befintlig Cursor Bugbot är extern review, inte
en andra mergecontroller. Cursor-cloudautomationers inställningar ägs i
Cursor; ett checknamn på GitHub är inte bevis att deras prompt är rätt.

GitHubs required checks bevisar verifiering, inte oberoende review. Ett saknat
modellkvitto är inte en blockerande bugg och ger heller ingen review eller
mergebehörighet. Författaren och den som godkänner merge verifierar reviewn i
PR:ns vanliga reviews, kommentarer och trådar.

## Historiska kvitton

`scripts/pr-review/` innehåller äldre API-/kvittomoduler och deras tester;
den är inte bara en parserkatalog. Runnerns entrypoint är nu ovillkorligt
spärrad, även vid manuell CLI-start/importerat `main`; ingen envflagga kan
aktivera den. Ingen automatisk eventväg finns. Helpermoduler ligger kvar för
historik-/kontraktskompatibilitet, inte som en parallell obligatorisk granskare.
Kvitto-/state-kompatibiliteten behålls för redan publicerad review-data.
Inget workflow anropar API-runnern eller kvittopubliceraren automatiskt. Gamla
kvitton är historiska data och ingår inte i dagens mergegrind.

Gamla kontoöverlämningar är historik, inte instruktion att skapa nya.
Radera inte GitHub-reviewer eller state-kommentarer som städning.

Återinförande av automatisk API-review kräver ett nytt uttryckligt ägarbeslut,
synlig kontrakts-/teständring och kostnads- samt säkerhetsgranskning.

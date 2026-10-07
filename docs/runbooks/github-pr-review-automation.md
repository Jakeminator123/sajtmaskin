# Buggpass: oberoende granskning, inte ett IDE-krav

**Buggpass** (även kallat Bugbots-pass) är proceduren. Cursor Bugbot är en
möjlig utförare, inte kravet. Codex kan köra samma typ av oberoende granskning.
Behåll externa checknamn oförändrade som bevis; döp inte om en Codex-review
till `Cursor Bugbot` och räkna inte en neutral/skippad körning som godkänd.

## Automatik som faktiskt finns

På PR #1586, head `40273c4524f84640fac26be1939a26d419f18fb1`, rapporterade
GitHub 2026-10-07 `Cursor Bugbot: success`, `Cursor Automation: Find critical
bugs: neutral` och ytterligare Cursor-automationer. Detta visar PR-automatik,
inte att alla automationer utförde en full review. Inget aktivt GitHub Actions-
workflow är en AI-granskare. Cloudinställningar/prompt och faktisk debitering
måste kontrolleras hos Cursor; de har inte ändrats av detta repoarbete.

## Direkt till preview

1. Commit:a exakt uppgiftens filer. Arbetskopian ska vara ren.
2. `npm run preview:prepare` hämtar färsk preview, kräver fast-forward och kör
   först ett modellfritt sandboxprov. Sedan används befintlig path-impactmotor:
   först plan, sedan dess diffvalda kontroller.
   Därefter körs **ett** fristående Buggpass. Ingen extra API-review startas.
3. Fråga Jakob **Är du säker på att du vill pusha?**, ange exakt head-SHA.
   Efter hans svar: `npm run preview:push -- --confirm <full SHA>`.
4. Kommandot och pre-push-hooken kräver aktuellt base/head-kvitto och
   bekräftelse. Ny kod eller flyttad preview stoppar pushen. Ingen force/delete.
5. Kontrollera push-CI och Vercel READY. Dossier-acceptance körs även på
   preview-push; fyra fulla testshards och DB-skydden är kvar. Deploy/CI kan
   misslyckas **efter** push: lokala kontroller är inte ett server-side förhandslås.

Den nya direktpolicyn kräver en separat ändring av GitHubs **preview**-ruleset:
PR-kravet och statuskraven före push ersätts där av lokalt förberedelsekrav
och CI efter push. Behåll server-side deletion/non-fast-forward-skydd.
Masters ruleset, promote-PR och extra produktionsbekräftelse ändras inte.
Vid införandet är detta en plan tills live ruleset verifierats; använd aldrig
admin-bypass för att låtsas att direktvägen redan är aktiverad.

Hook/kvitto är lokala arbetsflödesskydd, inte manipulationssäkra attesteringar.
En annan klient kan sakna hooken. Ingen garanti ges att en godtycklig
GitHub-API/UI-push har granskats före publicering. Använd PR-vägen om ett
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
Misslyckad sandbox stoppar före tester och modellstart; ingen automatisk
fallback till svagare isolering görs. Se aktuell införandestatus i
[Codex-lagret](../../.codex/README.md#avgränsat-undantag-fristående-buggpass).

CLI-inloggningen återanvänds; kommandot kräver ingen extra API-nyckel.
Det är inte gratis: valt kontos modellkvot gäller. Ingen tokenbesparing är
mätt. Högst en körning per prepare; tidsgräns 20 minuter, fel/ofullständig
review stoppar. JSON-resultatet finns i den utskrivna temporära katalogen;
godkänt förberedelsekvitto i `node_modules/.cache/sajtmaskin-preview/`.
Dessa lokala filer innehåller kodfynd, inte chathistorik eller credentials.
Fynd måste rättas/triageras; ett nytt pass krävs efter ändringar. En befintlig
PR-bot återanvänds på PR-vägen i stället för att också köra denna CLI automatiskt.

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

`scripts/pr-review/` innehåller även en körbar API-runner och dess tester;
den är inte bara en parserkatalog. Runnern har ingen automatisk eventväg.
Kvitto-/state-kompatibiliteten behålls för redan publicerad review-data.
Inget workflow anropar API-runnern eller kvittopubliceraren automatiskt. Gamla
kvitton är historiska data och ingår inte i dagens mergegrind.

Gamla kontoöverlämningar är historik, inte instruktion att skapa nya.
Radera inte GitHub-reviewer eller state-kommentarer som städning.

Återinförande av automatisk API-review kräver ett nytt uttryckligt ägarbeslut,
synlig kontrakts-/teständring och kostnads- samt säkerhetsgranskning.

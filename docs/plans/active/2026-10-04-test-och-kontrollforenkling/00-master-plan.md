---
status: active
owner: Jakob; samordnande agent vid genomförande
created: 2026-10-04
---

# Test- och kontrollförenkling

## Mål

Förenkla tester och övriga kontroller så att de skyddar dagens produktkrav,
upptäcker relevanta fel och låter avsiktliga produktförändringar genomföras.
Minska dubbelarbete, väntetid och underhåll utan att förlora skydd för pengar,
data, behörighet, projektisolering eller fungerande användarflöden.

Arbetet omfattar tester, testmiljöer, CI, kontrollscripts, hooks, agentregler,
scheman, konfiguration, genererade dokument och begränsningar i generationen.
Bedöm både själva kontrollen och det aktuella krav som den är tänkt att skydda.

## Mandat och start

Jakob beställde genomförande 2026-10-05 och återupptog restarbetet
2026-10-06 i samordningschatten `Dokumentera Master-promotion`. #1553 är
mergad till preview `c4f4b188`, fyrfilspaketet #1562 till `cca962c6` och
planstatus #1564 till `04b246ab`. Dessa paket återlevereras inte.
Den tidigare checkouten `e1e8` är avvecklad. Ensam TESTER-skrivare arbetar nu
i `sajtmaskin-tester-restarbete`, branch `codex/project-persistence-e2e`, från
preview `410d933c9b5f8ac3f1e56dc76bf3c46326c930ba`. Två A5-docstesters
Node-miljö och A6b:s avgränsade dubbelkörning är nu levererade via #1574,
utan smalare testurval. A3-paketet #1576 tog bort registrytestets historiska
sidantal och ersätter rubriklås med explicit icke-tom beslutsinventering.
Faktisk medlemskap-/radvalidering och befintlig länkvalidator bevaras.
Mandatet omfattar scoped implementation, commit, push och PR mot `preview`;
samordnaren eller utsedd merge-agent äger mergeordningen. Ingen mastermerge
eller extra DB-/provideråtgärd ingår. Andra agenters checkouter är inte skrivytor.
Leveransbevis och begränsningar finns i [A7](aktiviteter/A7-slutverifiering-och-overlamning.md).
A3:s återstående bestånd, A4:s riktiga flödesharness och A6b:s slutliga
optimering är inte färdiga. Registry-paketet är levererat med oberoende CLEAN,
full native CI och exakt deployment. A4:s godkända smala disposabla CI-harness
är lokalt implementerad utan lokal installation, authändring eller delad DB.
Oberoende review är CLEAN efter rättad skip/false-green-lucka och bassynk.
Full lokal kontroll hade 21/22 PASS; Backoffices Git-vakt stoppade samtidiga
externa refs och gav därefter grönt i samordnad omkörning. Verklig grön
browser-/DB-runtime återstår. A3:s ändliga
restlista finns i dess befintliga områdesmatris; inget nytt testregister införs.
Hela planen förblir aktiv.

När Jakob tilldelar en agent att genomföra planen kan den agenten fördela och
driva aktiviteterna inom uppdraget; varje rutinmässig delpunkt behöver inte ett
nytt godkännande. Branch, commit, push, PR och merge följer uppdragets faktiska
mandat och [git-reglerna](../../../../.cursor/rules/git.mdc).

Planen beställer ingen live DB-åtgärd, ändring av miljövariabler, extern
provideroperation eller produktionsrelease. Databastester använder avgränsade
testfixturer eller en uttryckligen isolerad testdatabas, aldrig en delad
utvecklings-/produktionsdatabas. Liveprov med kostnad eller externa writes
kräver ett separat konkret uppdrag.

## Grundprinciper

- Det aktuella produktbeslutet äger beteendet. Testet kontrollerar beslutet.
  Vid ett avsiktligt byte ändras kod, berörda tester och regler tillsammans.
- Välj **behåll, skriv om, slå ihop, ta bort eller utred** utifrån relevant
  felbevis. Ålder, filnamn, testantal och ordet `legacy` är inte raderingsbevis.
- Kontroller som blockerar idag förblir blockerande tills en granskad ändring
  motiverar annat. Flytta inte ogranskade tester till en permanent varningskö.
- Använd befintliga owners i `package.json`, Vitest-konfigurationerna och
  `config/agent-workflow.json` / `scripts/workflow/path-impact.mjs`. En
  genererad inventering är en rapport, inte ett nytt manuellt testregister.
- Behåll skydd för uttrycklig borttagning och ersättning: gamla briefs,
  snapshots och integrationsval får inte återinföra det användaren tagit bort.
- Mät testrelevans och prestanda separat. Ett långsamt relevant test behöver
  rätt miljö eller bättre setup; det blir inte irrelevant genom sin tidskostnad.
- Små funktionstester kan ligga nära koden. Skilda miljöer kan motivera egna
  mappar. Ingen stor mappflytt eller totalradering som första steg.

## Startkandidater, att verifiera på nytt

Tidigare granskning visade syntaxlås i `run-website-audit.tier.test.ts`, en
egenkonstruerad sammansättningskontroll i `static-core-visual-design.test.ts`,
historiskt låsta reservlistor i `shadcn-recipe-search.snapshot.test.ts`, exakta
modellnamn i `public-analys.test.ts` och ett antalskrav i
`style-choice-variants.test.ts`. Exakta modellval kan vara ett aktuellt
kostnads-/routingbeslut; de får inte avfärdas utan att hitta ägaren.

Även `scripts/dev/check-systemprompt.mjs` behöver jämföras med den riktiga
`src/lib/gen/static-core-loader.ts`: kontrollen accepterade äldre fallbackar
som runtime-loadern inte längre använder. Bekräfta skillnaden före ändring.

Tidigare observerade dubbelkörningar omfattade schema-drift, stabilitet och
riktade workflow-/scaffoldtester. Repetition på isolerade CI-runners kan vara
nödvändig för setup. A0 ska skilja detta från dubblerat felbevis.

Testantal och CI-tider från samtalet är daterade observationer. A0 mäter en ny
baslinje; de tidigare siffrorna är varken mål eller bevis för en ny leverans.

## Aktiviteter och beroenden

Läs [genomförande och agentuppdrag](01-genomforande.md) före tilldelning.
Aktivitetsfilens status och checklista äger detaljstatus; tabellen äger ordning.

| Id                                                      | Aktivitet                                       | Beroende                 | Primär leverans                                        |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------ | ------------------------------------------------------ |
| [A0](aktiviteter/A0-inventering-och-baslinje.md)        | Inventera faktisk körning och mät nuläget       | Uppdrag att börja        | Återskapbar inventering och jämförbar baslinje         |
| [A1](aktiviteter/A1-aktuella-krav-och-prioritering.md)  | Fastställ aktuella krav, skydd och disposition  | A0                       | Prioriterade arbetsområden och vald pilot              |
| [A6a](aktiviteter/A6-korpolicy-och-ci.md)               | Säkra discovery och bred fallback före rensning | A1                       | Verifierat skydd mot tyst bortfall, utan smalare urval |
| [A2](aktiviteter/A2-pilot-och-kanda-lasningar.md)       | Genomför en avgränsad pilot                     | A1, A6a                  | Granskad förenkling med felbevis                       |
| [A3](aktiviteter/A3-omradesvis-rensning.md)             | Rensa test- och kontrollytor område för område  | A2                       | Genomgånget bestånd och motiverade ändringar           |
| [A4](aktiviteter/A4-kritiska-anvandarfloden.md)         | Kontrollera skapa, ändra, ta bort och ersätta   | A1; integration efter A2 | Körda användarflöden med kontrollerade tjänstesvar     |
| [A5](aktiviteter/A5-testmiljoer-och-prestanda.md)       | Förenkla miljöer och dyra verktygssteg          | A2; baslinje från A0     | Uppmätt vinst utan ändrad felbevakning                 |
| [A6b](aktiviteter/A6-korpolicy-och-ci.md)               | Samla körpolicy och minska dubbelkörning        | A3, A4, A5               | Verifierat urval och tydliga obligatoriska checks      |
| [A7](aktiviteter/A7-slutverifiering-och-overlamning.md) | Verifiera helheten och överlämna                | A3–A6                    | Före/efter, kvarvarande risker och leveransstatus      |

A3, A4 och A5 kan undersökas parallellt. Skrivningar integreras sekventiellt
i den öppna checkouten. A3 är en återkommande aktivitet: dela den i namngivna
områdespaket med egna paths och bevis, inte en enda massändring.
A6 har två separata grindar: säkerhetsdelen före piloten, optimeringen sist.

## Angränsande aktiva initiativ

- Dossier-förenklingen är levererad via #1551, #1555 och #1558; terminalstatus
  finns i [avklarat-indexet](../../avklarat/README.md) och stabil semantik i
  [dossierkontraktet](../../../contracts/dossier-system.md). Runtimeowners
  frigavs efter verifierad preview `59a12080`. SCHAFFOLDS intent-/scaffoldarbete
  är levererat via #1575; TESTER:s aktuella paket ändrar inte dess produktowners.
- [Källkvitto, Quality Bar och addenda](../2026-09-17-inspiration-kvitto-och-komposition/00-master-plan.md)
  äger sina produktbeslut. Samordna förändringar i källkvitto, designråd,
  varianter och addenda; starta inte om redan levererade delar.
- [Verifieringsflöde och inspector](../2026-09-01-verifieringsflode-och-inspector/00-master-plan.md)
  kan äga kvarvarande livebevis. Denna plan ersätter inte sådana bevis med
  mockade tester eller ger dem status som körda.

## Klart när

- [ ] Alla faktiskt upptäckta test- och kontrollytor har bedömts. Kvarvarande
      oklarheter har ett namngivet nästa steg och redovisad leveranspåverkan.
- [ ] Varje testfil som ska köras är kopplad till en avsiktlig körning;
      okända eller övergivna filer kan inte ge ett tyst grönt resultat.
- [ ] Omskrivningar, sammanslagningar och raderingar har ett aktuellt krav,
      tydligt skäl och vid behov ett verifierat ersättningsbevis.
- [ ] Pengar, data, åtkomst, projektisolering och migrationssäkerhet har
      fortsatt relevanta felbevis. Ingen delad DB eller extern tjänst ändrades.
- [ ] Skapa/ändra och borttagning/ersättning är verifierade genom sparning,
      omladdning och senare uppföljning; gamla projektdata återinför inte A.
- [ ] Centrala tester och körurval har visats reagera på kontrollerade fel.
- [ ] Bekräftade dubbelkörningar har tydliga owners eller motiverade undantag.
      Prestanda redovisas från flera jämförbara körningar, inklusive väntetid.
- [ ] Dokumentation och agentregler beskriver den slutliga körpolicyn utan
      parallella manuella register, stale krav eller oanvänd konfiguration.
- [ ] Aktuell kod, relevanta checks och eventuell deployment hör till den
      faktiskt granskade leveransen. Lokalt verifierad, PR-klar och mergad
      skiljs åt; äldre gröna resultat räcker inte ensamma.
- [ ] Verkliga residualer har en mottagare. Planen avslutas enligt
      [planlivscykeln](../../../../.cursor/rules/plan-lifecycle.mdc) först när
      leveransen är genomförd; inget produktionsmandat antas.

## Startmeddelande till samordnande agent

> Genomför test- och kontrollförenklingen enligt denna masterplan och det
> mandat som ges tillsammans med uppdraget. Börja med A0 och A1. Använd
> read-only-agenter för oberoende kartläggning och review. Tilldela en enda
> skrivande agent åt gången exakta paths i den öppna checkouten. Driv sedan
> A6a före piloten och därefter beroendena, checklistorna och verifieringen
> till det avtalade leveransläget.
> Uppdatera aktivitetsstatus med bevis, bevara andras arbete och överför inte
> mandat från dossierplanen. Stoppa bara berörd del vid en verklig blockerare;
> fortsätt oberoende arbete som ryms i uppdraget.

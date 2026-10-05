# A2 — pilot och kända låsningar

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Verifierad lokalt 2026-10-05. Beroende: A1 och verifierad A6a.
Arbetssätt: ett avgränsat skrivpaket.

Pilot: slå ihop tier-filens två källtexttester med verkliga
`runWebsiteAudit`-prov i responses-testfilen. Behåll alla befintliga
retry-/tidsbudget-/kostnads-/providerfelprov; komplettera tierns scrape depth,
schema, web-search, avancerade resultatfält och observerad kostnadslogg.
Intern promptbyggare ska köras på riktigt. Temporära runtimeprov är
samordnade; slutdiffen får ingen runtimeändring. Bas `ff2ac650`, head
`9d71cd34`; runtimeoriginal `d60342da939d56942516275a8b088d48b99c56c9`,
rå SHA256 `9928E10F2B2C9063CD96CDB89160FB28712DD1E32C6484A967E35E660B21F3BC`
(23 515 bytes).

Resultat: den gamla tvåfallsfilen är borttagen och fyra tierfall ligger i
befintlig responsesfil. Legitima omordnade objektfält gav gamla testet rött
men nya filens 41 tester gröna. Felaktigt `maxPages: 99` gav fyra relevanta
fel. Runtimeblob, råhash och bytes återställdes exakt efter båda proven.
Hela auditgruppen: 7 filer, 92 tester, exit 0. Discovery: 1 078/1 078,
exit 0; riktad lint, typecheck och diff-check: exit 0. Oberoende review CLEAN.
Nettot är en färre testfil och två fler beteendefall, inte en påstådd
prestandavinst. Nästa paket använder samma metod: verklig owner, externa
gränser som fixtures och observerbar felrespons.

## Uppdrag och kandidater

Genomför A1:s valda pilot och visa att förenklingen förbättrar kontrollens
träffsäkerhet. Börja med ett område, inte alla kandidatfiler i samma diff.

- `run-website-audit.tier.test.ts`: kontrollera att rätt inställningar når
  analys/skrapning genom det riktiga beteendet; tåla semantiskt likvärdig syntax.
- `static-core-visual-design.test.ts`: ersätt den egenkonstruerade
  sammansättningskontrollen med faktisk produktionssammansättning. Bedöm övriga
  promptkontrakt var för sig; kasta inte hela filen genom samma beslut.
- `shadcn-recipe-search.snapshot.test.ts`: en aktuell reservväg ska inte behöva
  behålla en dokumenterat ogiltig kandidat. Separera historisk jämförelsedata
  från krav på det som runtime ska välja; aktuell upstream-status är en egen fråga.
- `public-analys.test.ts` och `style-choice-variants.test.ts`: skilj gällande
  routing-/produktval från duplicerade modellnamn och godtycklig katalogstorlek.
- `check-systemprompt.mjs`: jämför med den riktiga loadern och låt kontrollen
  avvisa konfiguration som produkten inte kan använda.

## Checklista

- [ ] Bekräfta A6a:s discovery-/bortfallsskydd och breda fallback innan
      befintliga kontroller skrivs om eller tas bort.
- [ ] Läs dagens owner, callers och tester; bekräfta kandidatfyndet på aktuell kod.
- [ ] Reservera pilotens exakta paths och dokumentera vilka skydd som ska bestå.
- [ ] Visa både en legitim ändring som kontrollen ska tåla och ett relevant fel
      som den fortfarande ska upptäcka. Ett avsiktligt ändrat gammalt krav är
      inte i sig en regression.
- [ ] Ändra owner vid behov, därefter test/validator och faktiskt berörda
      referenser. Återanvänd befintlig logik i stället för en ny kopia i testet.
- [ ] Behåll testisolation och felvägar; ett mockat returnvärde får inte ersätta
      den produktionsfunktion vars beteende piloten påstår sig kontrollera.
- [ ] Kör riktade kontroller med rätt Node och högst fyra lokala workers.
      Kör inga externa tjänster eller delade DB-steg för att få testet grönt.
- [ ] Visa ett kontrollerat rött felbevis och återställd grön kontroll på kod
      som hör till paketet. Gör provet lokalt och återställ bara egna provbytes;
      inget hårt git-reset eller provfel i en leveranscommit.
- [ ] Låt en oberoende read-only-agent granska beteende, diff och bevis.
- [ ] Rätta konkreta fynd och redovisa skillnaden i felträff, omfattning och
      underhåll. En snabbare körning ensam räcker inte som godkännande.
- [ ] Lämna användbart upplägg och fallgropar till nästa områdespaket.

## Klart när och handoff

Piloten skyddar det aktuella kravet, tolererar den legitima förändringen och
fångar det avsedda felet. Relevanta riktade kontroller är gröna och review är
hanterad. Lokalt verifierad ändring skiljs från eventuell senare PR-leverans.

Mottagare: [A3](A3-omradesvis-rensning.md),
[A4](A4-kritiska-anvandarfloden.md) och [A5](A5-testmiljoer-och-prestanda.md).

# Genomförande och agentuppdrag

Styrdokument: [masterplanen](00-master-plan.md).

## Samordnarens ansvar

Samordnaren väljer område, fryser jämförelseunderlag, tilldelar exakta paths,
integrerar resultat och uppdaterar status. Befintliga runtime-/policyowners
bestämmer beteendet; planen är arbetsunderlag och tillför ingen ny körpolicy.

Läs `AGENTS.md` och relevant repo-skill för den aktuella handlingen. Följ
[arbetsregeln](../../../../.cursor/rules/workflow.mdc) och
[dokumentationslivscykeln](../../../documentation-lifecycle.md).

## Fördelning och skrivning

- Utredare lämnar aktuell kodobservation, kravkälla, osäkerhet och förslag.
  Granskare granskar oberoende ändrat beteende, diff och verifieringsbevis.
- En implementerare har den enda skrivande sessionen i checkouten under sitt
  paket. Samordnaren och andra agenter läser då; status skrivs efter handoff.
- Reservera paths före skrivning. Gemensamma configs, package-scripts och
  workflows får aldrig parallella skrivare, även om aktiviteterna skiljer sig.
- Bevara orelaterade ändringar. En smutsig checkout behöver inte vara ett
  stopp om paths inte överlappar och bevisen kan avgränsas; ändra inte andras
  filer eller använd deras pågående ändringar som levererat bevis.
- Worktree skapas endast på Jakobs begäran. När en separat checkout inte har
  beställts används sekventiell implementation i den öppna checkouten.
- Återanvänd read-only-agenter för relaterade frågor. Kör inte dubbla tunga
  byggen. Kontrollera engines/Volta och `process.version` före repo-kommandon;
  använd högst fyra lokala testworkers där verktyget stöder det.

## Uppdragsmall

Kopiera och fyll i för varje områdespaket. Mallen är tilldelning, inte ett
permanent register över varje test eller fil.

```text
Aktivitet och paket:
Mål / aktuellt krav:
Underlag: checkout, head-SHA, jämförelsebas-SHA, berörda orelaterade ändringar
Roll: read-only utredare / ensam implementerare / read-only granskare
Tillåtna skrivpaths: exakta filer eller avgränsat modulområde
Läsberoenden och förbjudna överlapp:
Leverans och kontroller:
Nästa mottagare:

Du är inte ensam i repot. Bevara andras ändringar och anpassa arbetet till dem.
Rör bara tilldelade paths och motiverade följdytor. Följ masterplanens mandat.
Om följdytan krockar med annan skrivare, lämna bevis och vänta på omfördelning.
```

## Status och bevis

För den enda aktiva skrivreservationen används tabellen nedan. Samordnaren
fyller i den före tilldelning och frigör den efter handoff. Tidigare paket och
deras bevis finns i respektive aktivitet, inte i en växande reservationslogg.

| Aktivitet/paket | Ensam skrivande agent | Reserverade exakta paths | Underlag: bas/head och eventuell arbetsdiff | Status |
| --------------- | --------------------- | ------------------------ | ------------------------------------------- | ------ |
| Ingen           | Ingen                 | Inga                     | Ej tilldelat                                | Ledig  |

Varje aktivitetsfil har `Ej startad`, `Pågår`, `Blockerad` eller `Verifierad`.
Samordnaren fyller i ansvarig/paket, bas/head och senaste kontroll när arbetet
börjar. A3:s paketmatris bevarar den aktuella områdesstatusen vid flera
överlämningar; A6 har separat status för sin tidiga och sena del.
Checkpunkter bockas bara av med relevant resultat, inte med en plan.

Vid handoff lämnas: ändrade paths, disposition och aktuellt krav, utförda
kontroller med resultat, kontrollerat felbevis där det behövs, osäkerheter,
head-SHA, avgränsad arbetsdiff om ändringen inte är committad, och nästa steg.
Samla reviewfynd före rättningsrundan; granska därefter
ändringsdelta och integration. Identisk kod kan återanvända tidigare sakbevis,
men leveransgrindar måste vara giltiga för aktuell kod och integrationsbas.

Detaljerade filinventarier, loggar och tidsmätningar är återskapbara rapporter
eller CI-/PR-bevis. Lägg inte till permanenta backupdocs eller en historikfil
per körning i denna planmapp. Här räcker aktuellt beslut, resultat och pekare.

## Stopp och avgränsning

Stoppa berört paket vid oklar kravägare, risk för pengar/data/isolering,
otillåten extern operation, konflikt med reserverade paths eller oväntat scope
över cirka 40 filer. Dela om arbetet; en sådan stoppunkt blockerar inte andra
oberoende undersökningar. Nya produktbeslut tas upp konkret med Jakob.

Test- eller scriptstädning är inte mandat att avveckla en aktiv API-route.
Externa eller sällsynta callers hanteras enligt dokumentationslivscykelns
befintliga regler. Även deklarationer utan appkonsument kan användas av
Backoffice, loggläsare eller export; kontrollera dessa före radering.

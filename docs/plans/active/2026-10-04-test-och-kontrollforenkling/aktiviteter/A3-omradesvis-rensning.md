# A3 — områdesvis rensning av hela kontrollytan

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Ej startad. Beroende: A2. Arbetssätt: återkommande små områdespaket.

## Uppdrag

Gå igenom återstående bestånd från A0 med A1:s kriterier och A2:s erfarenhet.
Ta med tests, validators, scripts, hooks, regler, scheman och dokumentation
som hör till ett område. En kontroll tas inte bort bara för att dess fil
ser gammal ut; varje disposition ska förklara dagens ansvar.

## Områden att fördela

- [ ] Pengar, kreditdebitering, generationstillträde och betalningskontrakt.
- [ ] Data, migrationssäkerhet, auth, SSRF och projekt-/kundisolering.
- [ ] Generation, prompt, follow-up, borttagning/ersättning, repair och versionsstatus.
- [ ] Builder/UI, preview, export och publicering.
- [ ] Scaffolds, dossiers, varianter och integrationsval; samordna aktiva planer.
- [ ] Backoffice, curator, observability och egna Node-/Python-/preview-hosttester.
- [ ] Dokumentations-/schema-/registrykontroller, scripts, hooks och agentregler.

Listan beskriver arbetsfördelning, inte nya obligatoriska körprofiler. A0:s
inventering avgör vilka konkreta grupper som ingår och om ytterligare område behövs.

## Aktuell paketstatus

Samordnaren lägger till en rad per avgränsat områdespaket från A0/A1 och
uppdaterar samma rad vid handoff. Ange exakta paths, ansvarig, bas/head,
arbetsdiff vid behov och pekare till senaste verifiering. Matrisen är
operativ paketstatus, inte en lista över varje test eller en historik per körning.
Aktiv skrivreservation finns i genomförandeguiden; flera paket får inte
ha skrivstatus samtidigt.

| Paket och aktuellt krav | Scope / exakta paths | Status och ansvarig agent | Bas/head och eventuell arbetsdiff | Bevis och nästa mottagare |
| ----------------------- | -------------------- | ------------------------- | --------------------------------- | ------------------------- |
| Ej tilldelat            | Fylls efter A1       | Ej startad; ingen         | Ej fastställt                     | Ej verifierat             |

## Checklista per paket

- [ ] Koppla paketet till A0:s upptäckta bestånd och uppdatera paketmatrisen.
- [ ] Reservera owner och exakta paths; ange aktuellt krav och disposition.
- [ ] Sök faktiska konsumenter i kod, package-scripts, CI, hooks, configs,
      Backoffice, export och dokumentation. Saknad appkonsument ensam är
      inte bevis för att ett schema eller en deklaration är oanvänt.
- [ ] Skilj driftkontroll av ett verkligt kontrakt från test av kopierad
      implementation, historisk formulering eller godtyckligt antal.
- [ ] Slå ihop överlappande tester bara när ett kvarvarande test fångar samma
      fel och felvägar. Många case i en parameteriserad grupp kan vara relevanta.
- [ ] Ta bort beslutade, övergivna ytor med deras callers/referenser och
      kontroller. Spara inte backupkopior eller oanvända configfält.
- [ ] Samordna prompt-/designbegränsningar med aktuell produktägare. Läsbarhet,
      tillgänglighet och fungerande kod skiljs från fasta estetiska recept;
      detta steg ger inget mandat att återöppna andra planers produktbeslut.
- [ ] Behåll eller ersätt högriskskydd med relevant felbevis. Dokumentera
      kvarstående osäkerhet; tyst bortkoppling eller evig karantän är inte klarstatus.
- [ ] Kör paketets riktade kontroller och oberoende review; bekräfta relevant
      felrespons vid väsentligt ändrade skydd, inte för varje kosmetisk ändring.
- [ ] Kör A6a:s bortfallsskydd efter ändrad discovery, konfiguration eller
      borttagning; inga kvarvarande testfiler får tappa sin avsiktliga körning.
- [ ] Uppdatera faktisk owner, schema/validator och nödvändiga projektioner
      tillsammans. Ändra inte genererade filer manuellt.
- [ ] Rapportera bedömda och kvarstående grupper till samordnaren. Bocka ett
      område ovan först när hela dess upptäckta bestånd är bedömt och dess
      paketmatris har aktuella bevis och nästa mottagare.

## Klart när och handoff

Alla upptäckta områden har genomgåtts. Varje förändring har skäl och relevant
verifiering; kvarstående frågor har owner och leveranspåverkan. Full körtäckning
minskar inte genom att filer oavsiktligt faller ur discovery.

Mottagare: [A6](A6-korpolicy-och-ci.md) och
[A7](A7-slutverifiering-och-overlamning.md).

# A1 — aktuella krav och prioritering

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Ej startad. Beroende: A0. Arbetssätt: utredning och arbetsfördelning.

## Uppdrag

Bestäm vad som behöver skyddas idag och vilka kontroller som kan ändras.
Ett aktuellt användar-/produktbeslut ska kunna ersätta ett äldre krav. Ett
test som skyddar från oavsiktlig återinföring av borttagen funktion kan däremot
vara centralt för just denna förenkling.

## Checklista

- [ ] Beskriv de centrala kraven på begriplig svenska: skapa, ändra, ta bort,
      ersätta, spara, återuppta, debitera rätt och skydda data/åtkomst.
- [ ] Identifiera den befintliga kod-, manifest- eller policyägaren per krav.
      Skilj faktisk implementation, gällande beslut och öppet produktval.
- [ ] Reservera skydd för pengar, data, auth, projektisolering, migrationsledger
      och kritiska externa kontrakt. Lista vilka verkliga fel testerna fångar.
- [ ] Bedöm varje grupp som behåll, skriv om, slå ihop, ta bort eller utred.
      Börja med A0:s kandidater; granska resten genom områdespaket i A3.
- [ ] För omskrivning: ange vilket aktuellt krav som består och vilket
      implementations-, syntax-, antals- eller formuleringstvång som tas bort.
- [ ] För radering: ange avvecklat krav eller ett starkare ersättningsbevis.
      Kontrollera callers och följdytor; aktiva produktfunktioner kräver ett
      aktuellt ägarbeslut enligt repots policy.
- [ ] För modell-/routinglås: kontrollera om värdet är ett beslutat kostnadsval
      eller en kopia av manifestet. Ändra inte produktval under etiketten teststädning.
- [ ] Samordna dossier-, källkvitto-/design- och verifieringsplanernas berörda
      owners. Övertag inte deras mandat eller pågående skrivpaths.
- [ ] Välj en liten pilot utan sådan konflikt. Definiera tillåtna paths,
      förväntad ändring, befintliga skydd och ett relevant felbevis.
- [ ] Prioritera övriga paket efter användarnytta, felrisk, underhåll och
      faktisk tidskostnad. Sätt inte ett godtyckligt mål för färre testfiler.

## Dispositionsmall för ett paket

```text
Område / aktuellt krav / befintlig owner:
Disposition: behåll / skriv om / slå ihop / ta bort / utred
Skäl och kod-/callerbevis:
Tillåtna paths och motiverade följdytor:
Fel som fortsatt ska upptäckas:
Ersättningsbevis eller beslutad avveckling:
Konflikt, osäkerhet eller produktbeslut:
```

Mallen används i uppdrag/review. Inför ingen separat rad per `it(...)` och
ingen ny permanent beslutsdatabas. Ratificerade produktbeslut och verkliga
öppna frågor använder befintliga ägare i repo, enligt planlivscykeln.

## Klart när och handoff

Piloten är konkret och genomförbar. Högriskskydd och andra initiativs gränser
är identifierade. Övrigt bestånd har en plan för full områdesvis genomgång;
utred betyder inte att befintliga blockerande tester kopplas bort.

Mottagare: [A6a](A6-korpolicy-och-ci.md) före piloten,
[A2](A2-pilot-och-kanda-lasningar.md) efter verifierad säkerhetsdel och
[A4](A4-kritiska-anvandarfloden.md) för flödesundersökning.

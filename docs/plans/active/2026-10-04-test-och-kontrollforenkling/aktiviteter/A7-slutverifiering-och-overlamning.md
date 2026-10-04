# A7 — slutverifiering och överlämning

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Ej startad. Beroende: A3–A6.

## Uppdrag

Visa att den samlade förenklingen uppfyller målet på aktuell kod och kan
överlämnas utan gömda luckor. Skilj lokal verifiering, PR-leverans, staging
och produktion. Aktivitetens avslut styrs av avtalat mandat, inte av antagen merge.

## Checklista

- [ ] Frys aktuell head och integrationsbas. Granska ändringsdelta efter
      eventuella synkar och bevara andras nya ändringar.
- [ ] Återskapa A0:s inventering: vilka grupper bedömdes, behölls, skrevs om,
      slogs ihop eller togs bort? Kvarvarande okända/orphan-tester ska vara noll.
- [ ] Kontrollera masterplanens klarkriterier mot faktiskt bevis. En öppen
      fråga som påverkar ett nödvändigt skydd får inte döljas som lågprioriterad residual.
- [ ] Visa fortsatt skydd för pengar/data/auth/isolering/migrationssäkerhet
      och faktiskt körda borttagnings-/ersättningsflöden efter sparning/reload.
- [ ] Sammanställ centrala negativa felbevis och återställd grön kontroll.
      Visa att den obligatoriska körningen reagerar, inte bara ett lokalt testnamn.
- [ ] Kör relevanta samlade kontroller på aktuell leverans. Återanvänd bara
      äldre sakbevis för verifierat identiska bytes; redovisa det tydligt.
- [ ] Jämför flera före/efter-körningar med A0. Redovisa testmängd, verkliga
      körningar, flakighet, kö/setup och kritisk CI-/leveranstid var för sig.
      Skriv vad som förbättrades, vad som inte gjorde det och underlagets gränser.
- [ ] Kontrollera aktuella regler, scripts, scheman, dokumentation och länkar;
      inga dubbla körowners, oanvända configfält eller stora backupinventarier.
- [ ] Låt oberoende agent granska hela förändringens kvarvarande risker och
      integrationsbevis. Rätta trovärdiga fynd och granska därefter deltat.
- [ ] Redovisa PR/check/deployment och terminalt fjärrläge när detta ingår i
      mandatet. Ett lokalt grönt paket är inte ett bevis på merge eller production.
- [ ] Lämna kvarvarande verkliga frågor till rätt befintlig owner/backlog;
      skriv en kort handoff med resultat, begränsningar och nästa mottagare.
- [ ] När leveransen är genomförd och mergad: uppdatera active/avklarat-router
      enligt planlivscykeln. Behåll detaljer bara om en aktuell konsument behöver
      dem; git bevarar historiken. Planpaketet stannar aktivt tills dess.

## Slutkvitto

```text
Avtalat leveransläge och uppnått läge:
Granskad head / integrationsbas / eventuell PR och merge:
Aktuella krav och skydd som består:
Ändrade eller borttagna grupper med skäl:
Faktiskt körda kontroller och centrala negativa bevis:
Före/efter-tid, testmängd, flakighet och mätbegränsningar:
Kvarvarande risker / owner / nästa steg:
Planstatus och mottagare:
```

Mottagare: Jakob eller den agent som ansvarar för avtalad leverans. Denna
checklista ger inget extra merge-, produktions-, DB- eller providermandat.

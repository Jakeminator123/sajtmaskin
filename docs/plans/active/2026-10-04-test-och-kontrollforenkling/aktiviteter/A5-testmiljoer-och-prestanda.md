# A5 — testmiljöer och prestanda

Styrdokument: [masterplan](../00-master-plan.md) och
[genomförande](../01-genomforande.md).
Status: Ej startad. Beroende: A2; baslinje från A0.

## Uppdrag

Minska faktisk väntetid och setupkostnad utan att försvaga kontrollerna.
Optimera uppmätta flaskhalsar. Teststädning, lint, typkontroll, installationer,
byggen och kötid bedöms var för sig och genom hela leveransens kritiska väg.

Primära owners: Vitest-configs/setup, `package.json` och träffade CI-steg.
Gemensamma config-/workflowpaths reserveras tillsammans med A6; parallella
undersökningar är tillåtna men inte parallella ändringar i dessa filer.

## Checklista

- [ ] Utgå från jämförbara A0-körningar och välj ett mätbart delproblem.
- [ ] Identifiera server-/verktygstester som kan köra i Node och DOM-beroende
      tester som behöver `jsdom`. Pröva en liten grupp före bred miljöändring.
- [ ] Kontrollera att flytten inte förändrar globals, importresolution,
      miljövariabler, isolation eller felvägar och därmed ger falskt gröna tester.
- [ ] Förenkla gemensam mock/setup och upprepade fixtures när det ger konkret
      vinst. Ersätt inte riktiga felvägar med ett generiskt lyckat mockresultat.
- [ ] Mät discovery, startup, transformation och testtid före/efter för samma
      filer och workergräns. Lokalt används högst fyra workers där det stöds.
- [ ] Bedöm lint/typkontroll/bygge och möjlig parallellisering utifrån critical
      path. Cache måste reagera även på ändrade beroenden och konfiguration;
      bygg inte snabbhet på stale typinformation eller ett äldre grönt resultat.
- [ ] Skilj nödvändig installation/materialisering per isolerad runner från
      samma setup som upprepas i samma miljö. Tysta inte embeddings-/manifestfel.
- [ ] Ändra en optimering åt gången i avgränsade paket. Skapa inga extra tunga
      lokala byggen när samma verifiering redan pågår i checkouten.
- [ ] Visa oförändrad avsiktlig testmängd och felrespons efter miljö-/setupändring.
- [ ] Redovisa flera före/efter-körningar, spridning och faktisk tidsvinst.
      Särredovisa mindre bestånd från A3 och snabbare exekvering här.

## Klart när och handoff

Rätt miljö används för de bedömda grupperna. Genomförda optimeringar har en
uppmätt vinst eller tydligt minskat underhåll, med bibehållen felbevakning.
Osäker statistik redovisas som osäker; inget procentlöfte uppfinns i efterhand.

Mottagare: [A6](A6-korpolicy-och-ci.md) och
[A7](A7-slutverifiering-och-overlamning.md).

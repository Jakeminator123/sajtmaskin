# Chatt 3 — oberoende arkitektur och Buggpass

Owner: chatt 3, readonly. Disposition: [master](00-master-plan.md).

Du får inga skrivpaket. Chatt 1 implementerar
[C1](aktiviteter/C1-serveragd-efterkontroll.md); du bedömer dess avgränsade
genomförbarhet eller diff endast när samordnaren ber om det. Ingen generell
säkerhetsrevision eller omgranskning av hela repo behövs.

Slutlig integration ägs av [D1](aktiviteter/D1-integration-och-leverans.md).
Din nya chatt har ingen föräldrahistorik och ska förbli oberoende av författandet.
Författaren producerar ändringen; du rapporterar faktiskt observerade fynd.
Skriv inte planstatus, runtimekod, tester eller fabricerade reviewkvitton.

Granska främst felaktig semantik, tappade kontrakt, inaktuella revisionsbevis,
kvarvarande parallell väg och verkliga luckor i relevanta tester. Rapporter ska
vara korta: säkerhet %, impact 1–5, fil/rad, konsekvens, motivering.
Avstå från nits och hypotetiska förbättringar som blockerare.

Normalt räcker ett samlat Buggpass före leverans och delta efter rättning.
Ett litet arkitekturbeslut inför C1 är inte ett extra obligatoriskt buggranskningsvarv.
Följ befintligt Buggpass-format när dess exakta bas/head/schema tilldelas.
Om din kontext blivit olämplig för oberoende granskning, säg det innan passet;
samordnaren väljer en tillåten färsk reviewväg, aldrig självattestering.

# P2 — shadow planner

## Mål

Mäta om OpenClaw gör bättre planer än den implicit one-shot-orienterade
exekveringen utan att planen får ändra kod eller användarupplevelse.

## Leveranser

- planner-prompt som tar frusen `GenerationInputPackage`
- strukturerat planresultat: mål, filer, kontrakt, risker, checkplan
- plan receipt med package hash och model lane
- intern jämförelse mot classic-output
- blind bedömningsmall

## Arbetssteg

1. Kör planner parallellt med classic efter fruset package.
2. Lagra bara scrubbed planartifact och mätdata.
3. Jämför planens predicted files/routes/contracts med faktisk classic-diff.
4. Låt mänsklig blind reviewer bedöma om planen hade förebyggt fel.
5. Testa prompt injection i README, kod och loggar.
6. Justera verktygsbudget och planformat, inte de kanoniska registren.

## Acceptans

- noll påverkan på producerad version
- planer är versions- och packagebundna
- planen refererar till befintliga canonical owners, inte påhittade kontrakt
- mätningen visar separat utfall per projectkategori
- det går att stänga shadow lane utan sidoeffekter

## Stoppskäl

- planlagring blir en parallell orchestration snapshot
- planner väljer om scaffold/variant/dossiers
- planresultat exponeras som om agenten redan gjort ändringen

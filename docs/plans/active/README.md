# Aktiva planer (`docs/plans/active/`)

Kort orientering för vem som plockar upp arbetet härnäst.

## Filer

| Fil | Syfte |
|-----|--------|
| [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) | Kanonisk checklista för öppna spår utan egen P-fil. |
| [`P17-unsplash-image-materialization.md`](./P17-unsplash-image-materialization.md) | Bildmaterialisering / env / diagnostics. |
| [`P18-preview-runtime-stability.md`](./P18-preview-runtime-stability.md) | WSS/HMR mot Fly + hydration på landning. |
| [`P19-old-content-ingress.md`](./P19-old-content-ingress.md) | Konservativ hardening av “gammalt innehåll”-ingress. |
| [`P20-shadcn-ecosystem-next.md`](./P20-shadcn-ecosystem-next.md) | shadcn: inkrementella nivåer vs enhetlig manifest/verify-pipeline. |

## Tankar (kort)

- **P17–P19** är avgränsade produktions-/driftspår; de ska inte växa in i varandra utan tydlig repro.
- **P20** svarar på frågan om tre små shadcn-faser räcker eller om repot behöver ett **tyngre kontrakt** (manifest + verify) så generatorn och UI-ytan inte divergerar över tid.
- Checklistan i `Kvarvarande-uppgifter.md` är medvetet **platt**: saker som hör till P17/P18 ska bockas av där när de är klara, inte dupliceras i evighet.

## Session-overlay (osäkerhet och samspel)

*Ungefärlig ärlighet: mycket här är “troligen rätt riktning men inte verifierat till 100%” — särskilt när flera agenter eller parallella brancher rört samma yta.*

- **P17:** Jag skulle säga ~40–70% att rotorsaken fortfarande är ren env/proc-läsning vs upstream; delar av det kan redan ha förbättrats av annat arbete — då bidrar P17 mest som **diagnostiklista** och minskad falsk “saknad nyckel”.
- **P18:** WSS och hydration kan ha **delvis** andra orsaker (proxy, app-shell); P18 är fortfarande rätt spår för *symptom* även om en fix i P19 eller deploy-lager plötsligt minskar bruset.
- **P19:** Konservativ avsikt — ~60% att inte allt i filen är “genomfört” i kod ännu, men resonemanget om ingresspunkter kan fortfarande **förklara** beteenden som andra fixar maskerar; uppdatera status i filen när något bevisats fixat.
- **P20:** De tre shadcn-nivåerna kan levereras fristående; den “större” vägen är **komplement** (kontrakt/verify), inte en annan produkt. Om någon redan börjat på blocks eller fonts i en branch: **integrera** checklistan där i stället för att starta om.

# Aktiva planer (`docs/plans/active/`)

Kort orientering for vem som plockar upp arbetet härnäst.

## Filer

| Fil | Syfte |
|-----|--------|
| [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) | Kanonisk checklista för öppna spår utan egen P-fil. |
| [`P17-unsplash-image-materialization.md`](./P17-unsplash-image-materialization.md) | Bildmaterialisering — felklassning implementerad (`e75325c9d`), end-to-end repro kvar. |
| [`P18-preview-runtime-stability.md`](./P18-preview-runtime-stability.md) | ~~WSS/Fly~~ löst; kvar: hydration-varning (troligen 3D-lib). Låg prio. |
| [`P19-old-content-ingress.md`](./P19-old-content-ingress.md) | Konservativ hardening av "gammalt innehåll"-ingress. |
| [`P20-shadcn-ecosystem-next.md`](./P20-shadcn-ecosystem-next.md) | shadcn: inkrementella nivåer vs enhetlig manifest/verify-pipeline. |

## Tankar (kort)

- **P17-P19** är avgränsade produktions-/driftspår; de ska inte växa in i varandra utan tydlig repro.
- **P20** svarar på frågan om tre små shadcn-faser räcker eller om repot behöver ett tyngre kontrakt (manifest + verify) så generatorn och UI-ytan inte divergerar över tid.
- Checklistan i `Kvarvarande-uppgifter.md` är medvetet platt: saker som hör till P17/P18 bockas av där, inte dupliceras.

## Session-overlay (uppdaterad 2026-04-15)

- **P17:** Felklassning implementerad (`e75325c9d`) — 401/429/network skiljs åt. Kvar: end-to-end repro med riktig env.
- **P18:** WSS/Fly löst i drift. Kvar: gul hydration-varning, troligen 3D-bibliotek. Låg prio.
- **P19:** Konservativ avsikt — resonemanget om ingresspunkter kan fortfarande förklara beteenden; uppdatera status i filen när något bevisats fixat.
- **P20:** shadcn har fått 6 commits senaste dygnet (radix-vega, community registries, example cache). Upstream stöder nu `registry:block` och `registry:font` med rika fält. De tre nivåerna kan levereras fristående; den "större" vägen (manifest/verify) är komplement.

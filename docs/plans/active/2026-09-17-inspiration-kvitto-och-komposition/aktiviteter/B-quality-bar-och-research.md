# B — Quality Bar och research, inte 03

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: väntar A.

## Problemet

Den **dynamiska** Quality Bar föreskriver samma utseendepaket som den
statiska 03 nyss slutade kräva:

```ts
// src/lib/gen/guidance-resolvers.ts — QUALITY_BAR_GUIDANCE.detailed
"Aim for a premium, layered look: cards with borders, soft shadows, glassy panels, depth."
"Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel, …"
```

Scaffold-research gör samma sak som checklista. Landing-page kräver
testimonials och föreslår statsrad + sticky CTA även när briefen saknar
siffror och citat (`landing-page/manifest.ts` `qualityChecklist` /
`upgradeTargets`). Portfolio föreslår social proof i upgrade-listan.

03-ändringen i #1444 rör inte dessa lager. En första jämförelse av 03
ensam är avsiktlig; den här aktiviteten tar nästa lager.

## Undersök

1. När `detailed` vs `compact` Quality Bar väljs, och om briefens
   `qualityBar` bara byter längd — inte recept.
2. Vilka scaffolds `qualityChecklist` / `upgradeTargets` tvingar
   sektioner som briefen inte nämner.
3. Hur ofta A:s kvitto visar att utdrag saknades — då är B:s recept
   den troliga slagsidan.

## Möjlig fix (bara efter belägg)

Behåll krav på läsbarhet, responsivitet, kontrast och konsekvens.
Gör kort, skuggor, glas, split-hero, statistik, logovägg och
testimonials **valbara**. Research-råd: lägg bara stats/citat/CTA-flyt
när innehållet finns (brief, användartext eller faktiska siffror).

Inte 03. Inte Custom Instructions i `defaults.ts` (legacy scaffold-off).

## Inte detta steg

- Rör inte `config/prompt-core/03-visual-design.md`.
- Ändra inte variant-`layouts` (det är C).
- Ändra inte extractorn (det är D).
- Inför inte ett nytt promptlager eller en ny agent.

## Klart när

Quality Bar och berörda `upgradeTargets` kräver inte längre ett fast
sektionspaket för att sajten ska räknas som «färdig». Befintliga
guidance-tester uppdateras. A:s kvitto används i före/efter-jämförelsen.

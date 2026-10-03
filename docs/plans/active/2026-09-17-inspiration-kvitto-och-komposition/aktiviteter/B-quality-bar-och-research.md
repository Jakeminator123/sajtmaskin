# B — dynamisk Quality Bar och research, inte 03

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: väntar A.
Typ: **kvarvarande dynamisk designbias**.

## Problemet (observation)

Den **dynamiska** Quality Bar föreskriver fortfarande samma
utseendepaket som den statiska 03 *tidigare* krävde. #1464 är **landad**
på preview — 03 är inte längre den universella receptkällan. B är nästa
lager, inte en dubblett av 03.

```ts
// src/lib/gen/guidance-resolvers.ts — QUALITY_BAR_GUIDANCE.detailed
"Aim for a premium, layered look: cards with borders, soft shadows, glassy panels, depth."
"Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel, …"
```

Samma paket finns i `compact`. Scaffold-research gör det till checklista:

- Landing-page `qualityChecklist` kräver testimonials-sektion.
- Landing-page `upgradeTargets` föreslår stats/social-proof-rad och
  sticky/floating CTA (`landing-page/manifest.ts`).
- Portfolio föreslår social proof i upgrade-listan.

Det är en verklig likformighetskälla i dynamiska lager. #1464 är redan
landad; B tar nästa lager — inte 03.

## Undersök

1. När `detailed` vs `compact` Quality Bar väljs, och om briefens
   `qualityBar` bara byter längd — inte recept.
2. Vilka scaffolds `qualityChecklist` / `upgradeTargets` tvingar
   sektioner som briefen inte nämner.
3. Hur ofta A:s kvitto visar att utdrag saknades — då är B:s recept
   den troliga slagsidan. *(hypotes tills A mätts)*

## Möjlig fix (bara efter belägg)

Behåll krav på läsbarhet, responsivitet, kontrast och konsekvens.
Gör kort, skuggor, glas, split-hero, statistik, logovägg och
testimonials **valbara**. Research-råd: lägg bara stats/citat/CTA-flyt
när innehållet finns (brief, användartext eller faktiska siffror).

Inte 03. Inte Custom Instructions i `defaults.ts` (legacy scaffold-off).

## Inte detta steg

- Rör inte `config/prompt-core/03-visual-design.md` (landad i #1464).
- Ändra inte variant-`layouts` (det är C).
- Ändra inte extractorn (det är D).
- Inför inte ett nytt promptlager eller en ny agent.

## Klart när

Quality Bar och berörda `upgradeTargets` kräver inte längre ett fast
sektionspaket för att sajten ska räknas som «färdig». Befintliga
guidance-tester uppdateras. A:s kvitto används i före/efter-jämförelsen.

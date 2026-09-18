# C — komposition inom variantens identitet

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: väntar A+B.
Typ: **kvarvarande variant-layoutbias**.

## Problemet (observation)

Varianten ska bära **identitet** (ton, täthet, bevisform, färg/font)
utan att alltid låsa en enda komposition. `corporate-grid` gör båda:

```json
// config/scaffold-variants/landing-page/corporate-grid.json — layouts
"Use a 60/40 hero split …"
"Place a single-row logo strip directly under the hero …"
"Build services as a strict three-card grid …"
```

Samma fil låser även alternating case-study och tre-kolumns pricing.
Motifs nämner white cards, soft shadow och medium rounded corners.

En tydligt vald full-bleed-variant ska fortfarande vara full-bleed.
Målet är inte att slumpa bort identitet.

## Skilj

| Behåll (identitet) | Luckra (recept) |
|---|---|
| Trust, formalitet, proof-first | Obligatorisk 60/40-hero |
| Färg / font / `colorMode` | Logorad *direkt* under hero |
| Ton, densitet, gridkänsla | Strict three-card service grid |
| Anti-patterns mot lekfull collage | Ett enda pricing-/case-upplägg |

## Undersök

1. Vilka variants `signaturePatterns.layouts` är recept (60/40, tre
   kort, logorad) vs identitet (sakligt, grid, bevis först).
2. Var `layouts` / `promptHints` / `antiPatterns` faktiskt renderas
   (full vs compact follow-up-block i `scaffold-stack.ts`).
3. Om briefen redan kan välja bland flera layout-meningar, eller om
   första raden alltid vinner. *(hypotes tills läst)*
4. Vilka variants ska **inte** luckras: explicit full-bleed, app-shell,
   dashboard-komposition.

## Möjlig fix (bara efter belägg)

Erbjud 2–3 kompositionsalternativ **inom** samma identitet och låt
brief/innehåll välja. Exempel corporate-grid: sakligt + grid + bevis
kan vara centrerad hero, 60/40 **eller** text-först — inte bara 60/40
+ tre tjänstekort.

Ändra JSON-copy, inte scaffold-filer, inte matcherns urvalslogik, inte
03.

## Inte detta steg

- Öppna inte disabled addenda.
- Byt inte variantens tokens, fonter eller `colorMode`.
- Bygg inga nya scaffolds eller variants.
- Slumpa inte bort en medvetet vald komposition.

## Klart när

Minst en högtrafikerad variant (börja `corporate-grid`) har
identitetsregler plus likvärdiga kompositionsval, och en full-bleed-
kontrollvariant är oförändrad. Tester för compact follow-up
(anti-patterns) förblir gröna.

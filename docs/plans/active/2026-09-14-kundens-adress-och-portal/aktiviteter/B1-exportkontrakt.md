# B1 — Användbar export och ärligt äganderättsbesked

## Genomförandestatus 2026-09-14

PR #1367 är fortfarande draft. Tre följdfynd är rättade och har fått oberoende Sol/high PASS, 45 fokuserade tester och typecheck lokalt. Slutlig integration/CI och GitGuardian-incident 37094000 återstår. Fyndet är `URL.password`-egenskapsåtkomst utan hemlig literal, men incidenten är inte markerad som false positive.

Område: [02](../02-agandeskap-och-exit.md). Efter [C1](C1-sajtvy.md).
Sajtvy-integration körs i följd med C2 så att samma sida inte skrivs parallellt.

## Gör

1. Gör befintlig GitHub-export nåbar från sajtvyn. Återanvänd implementationen.
2. Ge åtkomst till kundens uppladdade media genom filuttag eller länklista.
   En lista med utgångna/signerade URL:er räcker inte som varaktig medieexport.
3. Bifoga instruktioner för installation, build och nödvändiga externa tjänster.
   Exportera env-namn men inga plattformshemligheter. Markera tydligt sådant
   som saknas: extern databas, tredjepartskonton, nycklar eller licensrättigheter.
4. Låt kundens egen domän/nya URL ersätta gammal `sites.sajtmaskin.se`-canonical
   vid utflytt. Exporterade redirects får inte tvinga sajten tillbaka till oss.
5. Skriv kort kundtext som motsvarar faktiskt exporterad kod och data. Kunden
   får använda koden enligt tillämpliga licenser; utlova inte exklusivitet för
   tredjepartsbibliotek eller AI-output.

## Verifiering

Installera och bygg en representativ export med projektets aktuella baseline,
inklusive ett tillagt mediaobjekt. Pinnad Next-version hämtas från kodägaren,
inte från ett versionsnummer i detta dokument. Kontrollera att inga interna
nycklar eller tvingande plattformsredirects följt med.

Ägarkontroll krävs även på export-/medie-endpoints. Export ska fungera under
betalningspaus utan nytt köp. Full databas- eller registraröverföring ingår inte.

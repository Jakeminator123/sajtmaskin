# Governance för `builder-branch`

## Status

`builder-branch` är en av Jakob uttryckligen beställd, långlivad
arkitekturbranch. Den innehåller planeringsunderlag och ska inte betraktas som
produktionskod eller mergeas mekaniskt till `master`.

## Viktig konflikt med nuvarande repopolicy

`config/agent-workflow.json` tillåter normalt endast kortlivade brancher med
prefixen `fix/`, `feat/`, `docs/` och `chore/`. `builder-branch` är alltså ett
uttryckligt ägarundantag, inte en normal agentleveransbranch.

Dessutom är nuvarande trusted review-/CI-flöde byggt för PR med base `master`.
En långlivad integrationsbranch blir därför inte korrekt skyddad bara genom att
skapa Git-refen eller kopiera masterregler i dokumentation.

Framtida implementation ska ske på kortlivade, policykompatibla brancher från
färsk `master`, exempelvis `feat/openclaw-builder-read-tools`. Verifierade
förslag kan länkas tillbaka hit, men `builder-branch` ska inte bli en parallell
trunk.

## Önskat GitHub-ruleset

Ett separat ruleset som träffar exakt `builder-branch` bör:

- blockera deletion
- blockera force push
- kräva linear history
- kräva conversation resolution
- kräva PR före ändring när ett fungerande builder-branch-CI finns
- gälla admins också, utan bred bypass
- använda 0 approvals så länge Jakob är ensam reviewer; höj till 1 när en
  oberoende betrodd reviewer finns

Kräv inte statuscheckar som inget workflow rapporterar på denna branch. Det
skapar ett permanent deadlock, inte ett skydd.

GitHub-kopplingen som skapade denna branch kan läsa skyddsstatus men exponerar
ingen mutation för branch protection/rulesets. Repoets prose- eller
CODEOWNERS-filer kan inte ersätta GitHubs server-side protection.

## Permanent policy om branchen ska användas aktivt

Innan branchen tar emot återkommande PR:er bör en separat, smal
`chore/...`-PR till `master`:

1. lägga till ett strikt schemafält för exakt tillåtna långlivade brancher
2. deklarera `builder-branch` där och i protected branch patterns
3. lägga ett separat CI/reviewkontrakt för PR med base `builder-branch`
4. testa att unknown/stale checks failar stängt
5. uppdatera Backoffice/generated policy från canonical owner

Lägg inte till Jakob som allmän branch-prefix-exempt actor och öppna inte ett
brett `builder-*`-prefix.

## Arbetsregler tills dess

- append-only commits; aldrig force push
- inga hemligheter, credentials eller produktionsdata
- ingen produktionsdeploy från branchen
- uppdatera base-SHA i dokumenten när en medveten rebase/synk görs
- jämför alltid slutsatser mot aktuell `master` före implementation
- bevara branchens tip-SHA som recovery evidence
- öppna ingen PR mot `master` enbart för att ”parkera” branchinnehållet

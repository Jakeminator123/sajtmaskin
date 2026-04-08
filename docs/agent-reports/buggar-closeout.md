# Buggar closeout

Datum: 2026-04-08

## Syfte

Stänga kvarvarande punkter från den tillfälliga bugglistan: scope-säker import-conflict-autofix, och dokumenterad linje för `.cursorignore` / `.gitignore` / docs.

`docs/agent-reports/buggar.txt` finns inte längre som separat fil; innehållet är här och i tester/kod.

## Kodändringar

### `fixImportedDeclarationConflicts` (scope-säker)

- **Fil:** [`src/lib/gen/autofix/common-import-fixer.ts`](../../src/lib/gen/autofix/common-import-fixer.ts)
- **Beteende:** En import-binding tas bara bort om det finns en tydlig skugga senare i filen *och* namnet inte används i texten mellan importens slut och skuggan (så vi inte bryter JSX/anrop före en senare `function X()`-deklaration).
- **Destructuring:** `foo: bar` i parametrar räknas som skugga via `findFirstDestructuredAliasBindingIndex`.
- **Tester:** [`src/lib/gen/autofix/common-import-fixer.test.ts`](../../src/lib/gen/autofix/common-import-fixer.test.ts)

### Route / preflight / övrigt (redan täckt i trädet)

- Dynamiska App Router-vägar vs planerade statiska vägar: [`src/lib/gen/route-plan.ts`](../../src/lib/gen/route-plan.ts) (`findMissingPlannedRoutes` + `dynamicPrefixCoversPath`).
- Tidigare pass: `route-plan` / `build-spec` / `react-hook-import-fixer` — se tester under `src/lib/gen/`.

## Ignore- och docs-städning

- **[`.cursorignore`](../../.cursorignore):** `data/prompt-dumps/*` aktiv (i linje med `.gitignore`), `output/generations/` i stället för hela `output/`, `templates_v0/downloads/ecommerce/`, samt tydlig kommentar för arkiv-labb.
- **[`docs/architecture/repo-tree.md`](../architecture/repo-tree.md):** kort stycke om `docs/plans/avklarat/`, prompt-dumps och `output/generations/`.
- **`.gitignore`:** `docs/plans/avklarat/` ignoreras inte (samma som avsikten i `.cursorignore` rad 2).
- **[`.cursor/rules/repo-env-indexing.mdc`](../../.cursor/rules/repo-env-indexing.mdc):** inget felaktigt påstående om att `docs/plans/avklarat/` skulle vara cursorignorerad.

## Verifiering

```text
npx vitest run src/lib/gen/autofix/common-import-fixer.test.ts src/lib/gen/route-plan.test.ts
npm run typecheck
```

(Utvidga vid behov med `build-spec` / `react-hook-import-fixer` om du rör de filerna i samma batch.)

## Medvetet utanför scope

- Ingen bred omorganisation av scaffolds, template-pipeline eller `templates_v0/`.
- Ingen ändring av env-policy eller secrets.

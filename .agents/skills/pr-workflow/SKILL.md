---
name: pr-workflow
description: "Sajtmaskins lokala agent→branch→PR→review→merge-flöde. Använd vid skrivarbete, commit, push, PR, CI-fix, merge eller städning efter PR."
---

# PR-workflow

Värden ägs av `config/agent-workflow.json`. Default: vanlig repo-agent i den
öppna checkouten. Ingen tvingad worktree, inget branchnamnsprefix, ingen roll
om inte Jakob nämner en.

## 1. Starta

1. `npm run hooks:install` vid ny clone eller hookändring.
2. `git fetch origin master` när du behöver färsk bas.
3. Jobba i den öppna checkouten, eller skapa en valfri branch. Worktree bara
   vid parallellt arbete — se `agent-worktree.mdc`.
4. Kontrollera öppna PR:er för samma owner om ändringen kan krocka.

Skyddade sökvägar är inte förbjudna. De ska inkludera rätt owner och följdytor
(schema, Backoffice, test, docs) och får full verifieringsprofil.

## 2. Ändra owner först

Ändra körbar/deklarativ owner före schema, genererad projektion och prosa. Kör
`npm run verify:pr -- --plan` tidigt.

`strict` är formatkontrakt, inte automatisk runtime-enforcement. Läs
rapportens `runtimeStatus`.

## 3. Synka och verifiera

- `npm run sync:derived` när owners ändrats.
- `npm run verify:pr` före push. Protected diff väljer full lokal profil.
- Fixa eller avfärda riktiga reviewfynd; kör om verifieringen.

## 4. PR

1. Commit:a exakta paths och push utan force mot master.
2. Öppna PR med repots template när Jakob ber om det.
3. Efter ny head-SHA: kör lokal verifiering igen. `review-window` väntar minst
   sju minuter från den nya SHA-körningen.
4. Läs checks, reviews och kommentarer. Varje konkret fynd ska vara fixat,
   loggat eller avfärdat.

## 5. Merge och städ

När Jakob ger ett uttryckligt mergeuppdrag: följ `pr-merge.mdc` och den
befintliga `merge:ready` / `merge:execute`-grinden. Merga inte på eget bevåg.

Efter merge: kör först `npm run tidy` och kräv att ytan rapporteras som `FRI`.
Först då: `npm run worktree:remove -- <sökväg>`. Rör aldrig `BRA` eller
`rescue/*`.

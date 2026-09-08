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
(schema, Backoffice, test, docs) och får full verifieringsprofil i CI.

## 2. Ändra owner först

Ändra körbar/deklarativ owner före schema, genererad projektion och prosa. Kör
`npm run verify:pr -- --plan` tidigt.

`strict` är formatkontrakt, inte automatisk runtime-enforcement. Läs
rapportens `runtimeStatus`.

## 3. Synka och verifiera

- `npm run sync:derived` när owners ändrats.
- `npm run verify:pr -- --plan` när diffen fått form och före push; hooken
  upprepar planen.
- Kör relevanta riktade kontroller och redovisa dem i PR:n. GitHub Actions
  publicerar required checks på varje head: tung profil för ready runtime,
  högrisk och `master`, explicit light-kvitto för safe docs och vanliga drafts.
  Bare `npm run verify:pr` är frivillig felsökning/reproduktion, eller ett
  uttryckligt krav när själva CI-/verifieringsmotorn ändras.
- Fixa eller avfärda riktiga reviewfynd; kör om berörda riktade kontroller.

## 4. PR

1. Commit:a exakta paths och push utan force. Nya PR:ar mot `preview`.
2. Öppna PR med repots template när Jakob ber om det.
3. Efter ny head-SHA: vänta in required GitHub-checks för exakt den SHA:n och
   kör om berörda riktade kontroller vid behov. `review-window` väntar minst
   sju minuter från den nya SHA-körningen.
4. Läs checks, reviews och kommentarer. Varje konkret fynd ska vara fixat,
   loggat eller avfärdat.

## 4b. Promote till produktion

Allt arbete går till `preview`. Produktion uppdateras genom en separat
promote-PR — inklusive Dependabot, som numera riktar sina PR:ar mot `preview`
via `target-branch` i `.github/dependabot.yml`.

Kör `npm run promote` när Jakob ber om att släppa till produktion («merga
preview till master», «promota», «släpp skarpt»). Kommandot hämtar origin,
listar vad som skiljer, skapar en kortlivad `promote/<datum>`-gren vid previews
tip via GitHubs refs-API (rör inte din checkout) och öppnar PR:en mot `master`
med commitlista, båda SHA:na och produktionsvarningen. `npm run promote:dry`
visar vad som skulle hända.

Head-grenen får **aldrig** vara `preview`: repot har `delete_branch_on_merge`,
så en promote med staging som head raderar staging vid merge. Det hände
2026-09-08 och grenen fick återskapas manuellt.

Kommandot mergar aldrig till `master`. Efter PR:en gäller `pr-merge.mdc` som
vanligt: gröna required checks på promote-headen, bugkoll och triage, sign-off
före label, och uttrycklig ägarbekräftelse efter produktionsvarningen.

Controllern squash-mergar, så masters nya commit finns inte i `preview`
efteråt. Saknar `preview` masters tip mergar `npm run promote` därför först
`master → preview` serverside (innehållsneutralt efter en squash-promote) innan
den räknar commits — annars listas redan släppta ändringar igen och nästa
promote-PR stoppas av kravet att head innehåller aktuell `master`. Kör
kommandot en gång efter varje promote-merge för att stänga hålet direkt.

## 5. Merge och städ

När Jakob ger ett uttryckligt mergeuppdrag: följ `pr-merge.mdc` och den
befintliga `merge:ready` / `merge:execute`-grinden. Innan `merge:execute` till
master: varna att det går till produktion och vänta på extra bekräftelse i
samma chatt. Merga inte på eget bevåg. `preview` är en delad remote-gren, inte
trunk och inte builder-ytan.

Efter merge: kör först `npm run tidy` och kräv att ytan rapporteras som `FRI`.
Först då: `npm run worktree:remove -- <sökväg>`. Rör aldrig `BRA` eller
`rescue/*`.

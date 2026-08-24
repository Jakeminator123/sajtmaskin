# PR-herde

Steward-loop för flera öppna PR:er. Körordningen ägs av
`.agents/skills/pr-workflow/SKILL.md`, värden av `config/agent-workflow.json`
och grinden av [`pr-merge.mdc`](../rules/pr-merge.mdc). Kommandot äger bara kön.

1. Lista öppna PR:er och sortera bort drafts, blockerande labels,
   adminspärrade Godnatt-PR:er och EmaCodeHero mot `master`.
2. Saknas giltig `merge:ready` från författaren: rapportera exakt vad som
   fattas och gå vidare. Steward sätter aldrig signalen åt någon annan.
3. För aktuell head-SHA, läs samtliga ytor: PR-comments, inline comments,
   reviews, check-run summary/text och check-run annotations. Med `gh api`
   betyder det `pulls/<n>/comments`, `pulls/<n>/reviews`, `issues/<n>/comments`,
   `commits/<sha>/check-runs` och `check-runs/<id>/annotations`.
   Använd alltid `--method GET --paginate -F per_page=100` och läs hela
   fyndlistan; tidsfilter får aldrig ersätta full hämtning.
4. Verifiera att varje fynd är fixat, loggat eller konkret avfärdat och att
   sign-off fortfarande gäller samma SHA.
5. Jämför changed filenames mellan mergekandidater. Överlapp i backlogg,
   canvas eller planrouter ska tillbaka till respektive författare.
6. Släpp fram högst en PR i taget till det mänskliga, SHA-exakta
   `merge:execute`-kommandot. Den betrodda controllern mergar; fetch:a därefter
   färsk `master` och omvärdera övriga PR:er.
7. Rapportera `mergad`, `väntar` eller `NEEDS_HUMAN` och det exakta villkoret.

Skriv aldrig på en annan agents branch, rebasa inte åt den och använd aldrig
`--admin` för att passera röd/väntande grind. Posta aldrig `merge:execute` utan
ett separat, uttryckligt mergeuppdrag. Blockera inte chatten med watch-loopar.
Bakgrund: [`docs/runbooks/pr-merge-gate.md`](../../docs/runbooks/pr-merge-gate.md).

# PR-merge-grinden

Operativ owner är [pr-merge.mdc](../../.cursor/rules/pr-merge.mdc).
Körordning: [PR-workflow](../../.agents/skills/pr-workflow/SKILL.md).
Checks, tidsgolv och trust roots: [agent-workflow.json](../../config/agent-workflow.json).

## Kontroll, review och mandat

`review-window` observerar required CI, säkerhet, deployment, live head/base
och proveniens. Den kan bli grön utan ready-label och bevisar inte oberoende
bugggranskning. Alla konkreta reviewfynd måste triageras. Egen attest ersätter
inte en separat granskare. Betald automatisk API-review är pensionerad.

Ready-kommentaren binder sign-off till aktuell head och base och skrivs före
labeln `merge:ready`. Ny head/base eller senare fynd kräver ny verifiering.
En gammal label eller grön check är inget mergeuppdrag.

## Manuell merge

GitHub Actions utför inga PR-merges. Efter ett separat uttryckligt
mergeuppdrag återläser mergaren refs, checks, reviews, inline comments,
PR-kommentarer och check-run summary/text/annotations. Normal preview-merge
är squash med `--match-head-commit <40 hex>`, utan `--auto` eller `--admin`.
Serialisera merges och verifiera PR-status samt CI/deployment på mergecommiten.

Native rulesets och merge methods måste läsas live. GitHub kräver enligt den
versionerade master-policyn quality, backoffice-tests, schema-drift, build
och GitGuardian. `review-window` och `dossier-acceptance` är ytterligare
agentkrav; GitHubs mergeknapp bevisar inte att de är uppfyllda.

Trust-root-ändringar fortsätter ge `review-window: action_required` och
kräver separat dokumenterad ägarbootstrap och oberoende review. Bootstrap
ersätter endast denna förväntade spärr, aldrig andra röda/pending checks
eller blockerande fynd.

## Produktion och synk

Master kräver promote-PR, produktionsvarning och en ny uttrycklig bekräftelse.
Ancestry-synk efter release använder dedikerad preview-PR och manuell
expected-head merge-commit; squash skulle tappa ancestry. Preview delar
produktions-DB, men startup, Git-posthooks och CI applicerar inte schema.
DB-apply kräver ett eget uttryckligt mandat.

Expected head låser head; GitHub har inget atomiskt base-SHA-lås. Läs därför
base igen omedelbart före merge och verifiera resultatet efteråt. En kodrevert
återställer inte databasändringar. En misslyckad efterkontroll återkörs;
en redan terminal PR mergas aldrig igen.

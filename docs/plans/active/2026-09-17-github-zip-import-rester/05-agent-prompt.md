# Agentprompt – kvarvarande GitHub/ZIP-import

Uppdraget gäller **endast** kvarvarande arbete från importspåret efter mergade
PR #1433.

## Arbetsregler

- fetch live GitHub först
- branch från färsk `origin/preview`
- egen branch
- PR mot `preview`
- ingen direktpush till `preview`
- ingen `master`
- ingen merge utan separat uppdrag
- ingen rebase/force-push av publicerad branch

## Leveransordning

1. PR2: binary images/fonts enligt `01-pr2-binary-assets-fonts.md`.
2. Efter att PR2 är färdig/omeragad: separat PR för server-side
   import-idempotens enligt `02-server-side-import-idempotency.md`.
3. Om säkra GitHub-testcredentials finns: privat-repo smoke enligt
   `03-private-repo-smoke.md`. PASS = ingen kod. FAIL = smal separat PR.

## Viktigt

- #1433:s mergade identitets-/handoff-/GitHub-ref-/previewfixar öppnas inte
  igen utan ny repro.
- Skapa inte ett nytt asset/media-system; återanvänd CodeFile + `base64:` /
  binary-kontraktet.
- Om idempotens kräver ny DB-migration: stoppa den delen och be om
  ägarbeslut innan migration skapas/appliceras.

För varje PR: base SHA, exact head SHA, changed owners, targeted tests,
`verify:pr --plan`, required CI, exact-head readonly review, P0/P1-status,
residualer. Lämna PR omergad.

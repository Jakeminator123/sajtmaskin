# Current state note — ankare för denna omskrivning

Det här paketet utgår från den state du själv gav i chatten, inte från en gammal lokal snapshot.

## Antagen aktuell master-state

- `master` och `origin/master` är synkade
- `c7798dce5` var senaste tydliga låsning du gav innan cleanup-vågen
- därefter kom fyra commit-effekter som påverkar planerna:
  - F2/design-preview-lane slimad
  - preview-host HMR retry-loop åtgärdad i kod
  - docs/schema/backoffice-planer synkade mot ny F2/F3-beskrivning
  - äldre pending-rad om HMR-stub bortstädad

## Kvarytor som fortfarande väger tungt

1. versionsmodal / runtime truth / falska fel
2. `followup_technical` skip-reason eller verifieringssignalering
3. 3D-dossier-injection och rich visual capability i follow-up
4. fixer-ytan och trigger-lägena känns fortfarande för breda
5. fas 1 är fortfarande mentalt otydlig kring Deep Brief och delta-semantik
6. kärnan kan troligen förenklas mer när de akuta spåren är lugnare

## Viktig princip

Denna gång ska planerna **inte** anta att allt måste byggas om. De ska först avgöra vad som redan är löst i HEAD och sedan bara köra den minsta men tydligaste förbättringsserien.

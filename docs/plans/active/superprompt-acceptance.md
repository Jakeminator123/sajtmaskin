# Superprompt: avgränsad acceptans

Status: Active
Ägare: N2-04. Leveransbas: `28375f1430d4279139364e9a84aca1ed8989ba47`.

Denna leveransplan följer områdespaketets E01–E06. Den tillför ingen ny
workflowmotor, scheduler eller runtimepolicy. N1 äger samlad status och merge.

| Aktivitet | Leverans och kvarvarande acceptans |
| --- | --- |
| E01 | Korrelera miljö/deploy separat från DB. `dump-logs` behåller alla telemetrirader; `latest-site` är bara senaste sammanfattningen per version. Okänd miljö/runrelation redovisas okänd. |
| E02 | [Syntetiska lounge- och kampanjfall](../../../src/lib/gen/eval/fixtures/README.md), tre separata runs per version. Ingen historisk design används som kvalitetsfacit. |
| E03 | [Usage-exporten](../../../scripts/db/dump-logs.mjs) behåller bara uttryckligen registrerade modell-/effortfält. Inga råprompter eller gissade effective-värden. Callers ägs av respektive område. |
| E04 | Fryst head och aktuell bas krävs för oberoende diffreview. GPT-Pro-browserpass är blockerat av verktygsruntime och har inte utförts; merge hålls. |
| E05 | Providerfria negativa prov för Clerk-callback, kampanjprojektion och CI-basbyte. Keyless demo passerar middleware avsiktligt; verkliga genererade dataroutes kräver eget serverguard-kvitto. |
| E06 | Gitignorerade lokala `source-command-818`/`source-command-kedja` pekar på borttagna owners. Inga matching automationanrop hittades i den lästa lokala katalogen; inget raderas eller återinförs. |

Enda eval-ingången är `npm run eval`; betald codegen, DB-apply och promotion
ingår inte. Gratislane, enhetsprov och CI-kvitto är skilda bevis och får inte
presenteras som ett kört visuellt modell-/browserprov.

Efter terminal leverans tas den här tillfälliga planen bort eller flyttas enligt
[dokumentationslivscykeln](../../documentation-lifecycle.md). Körningskvitton och
exakta PR-/SHA-resultat lämnas till N1; de skapar ingen ny permanent state-ägare.

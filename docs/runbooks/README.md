# Runbooks — välj uppgift

Operativa instruktioner för repo, utveckling och drift. Läs den berörda guiden,
inte hela katalogen. Arkitektur och kontrakt finns via [docs-routern](../README.md).

## Utveckla och leverera

| Uppgift | Guide |
| --- | --- |
| Agentarbete, direktpreview, PR och separat produktionsbeslut | [Agent-workflow](agent-workflow.md) |
| Oberoende buggranskning, triage och lätt pre-push-hook | [Buggpass](buggpass.md) |
| Lokal utveckling och valfri lokal preview-host | [Lokal generation](local-dev-generation.md) |
| Pod-specifik setup och injicerad miljö | [Cursor Cloud Agent](cursor-cloud-agent.md) |
| Explicit beställd isolerad checkout och säker städning | [Git worktree](git-worktree.md) |
| Lokala cache-/skräpfiler och dokumentkontroller | [Hygien](hygiene.md) |

## Felsöka och verifiera

| Symptom eller uppgift | Guide |
| --- | --- |
| Vit/stillastående builder-preview | [Preview](preview-white-screen.md) |
| Livebevis som inte kan ersättas av unit-tester | [Liveverifiering](live-verifiering.md) |
| Integrationsfel i genererad sajt | [Genererade integrationer](generated-site-integrations.md) |
| OpenClaw-gateway, dashboard och anslutning | [OpenClaw](openclaw-gateway.md) |
| Appens produktionsloggar | [Vercel log drain](vercel-log-drain.md) |
| Kall/saknad verify-cache | [Warm-cache](warm-cache-setup.md) |

## Avgränsad drift och produktkonfiguration

| Uppgift | Guide |
| --- | --- |
| DB-mål, schema, granskad migration och separat apply-mandat | [DB-migrationer](db-migrations.md) |
| Aktivering och verifiering av användardomäner | [Branded URL:er](branded-user-urls.md) |
| Publika exempel och deras livebevis | [Showcase](showcase-exempel.md) |
| Avgränsat Search Ads-test | [Google Ads](google-ads-search-test.md) |

En runbook ger inte i sig mandat att pusha, promota, ändra databaser eller
leverantörskonton. Kommandon ägs av [package.json](../../package.json), miljöpolicy
av [ENV](../ENV.md) och aktuella ägarbeslut av [beslutsindexet](../decisions/README.md).
Körningsstatus och gamla kvitton hör i Git/GitHub eller lokal ignorerad evidens,
inte i en ny permanent handoff-/statusfil.

# Verktygskontrakt

## Integrationssöm

Den säkraste integrationspunkten ligger efter att huvudappen har byggt en
frusen `GenerationInputPackage`, men före att
`createOwnEnginePipelineAndGenerationStream` startar nuvarande generator.

OpenClaw blir då en alternativ exekveringsmotor bakom feature flag. Den får
inte bygga om brief, BuildSpec, scaffold-, variant- eller dossierval.

## BuilderJobSpec

Jobbet bör minst binda följande serverägda fält:

```json
{
  "jobId": "opaque-id",
  "tenantId": "server-owned",
  "projectId": "server-owned",
  "chatId": "server-owned",
  "baseVersionId": "version-id",
  "baseFilesRevision": "revision",
  "lineageHash": "generation-input-lineage",
  "generationInputPackageHash": "sha256",
  "mode": "shadow|candidate",
  "allowedTools": [],
  "budgets": {
    "maxModelTurns": 3,
    "maxPreviewLoops": 2,
    "maxWallTimeMs": 900000,
    "maxChangedFiles": 80,
    "maxCandidateBytes": 2000000
  },
  "leaseExpiresAt": "ISO-8601",
  "idempotencyKey": "opaque-id"
}
```

Värdena ovan är ett planförslag, inte ett nytt runtime-schema. Vid
implementation ska kontraktet få en kanonisk TypeScript-owner och strikt schema
i repots befintliga kontrollplan.

## Read-only-verktyg

| Verktyg | Returnerar | Hård gräns |
| --- | --- | --- |
| `job.get` | fruset JobSpec och GenerationInputPackage | endast eget aktiva jobb |
| `project.snapshot` | base version/revision och manifest | exakt CAS-bas |
| `project.list_files` | paths, storlek, språk, hash | paginerat och bounded |
| `project.read_file` | en fil från snapshot/workspace | safe path, bytegräns |
| `project.search` | träffar i aktuellt projekt | max träffar/kontext |
| `project.diff` | workspace mot base | inga hemligheter/binaries i modelltext |
| `orchestration.explain` | BuildSpec, kontrakt och source receipt | läsning, inte omval |
| `preview.status` | readiness, version och revision | ingen rå hostcredential |
| `preview.logs` | redigerade, avgränsade events | ingen secretsdump |
| `preview.screenshot` | servergenererad artifactreferens | versions- och URL-pinnad |

Read-only-fasen ska implementeras och utvärderas innan ett enda skrivverktyg
släpps.

## Kandidatverktyg

| Verktyg | Handling | Sista ordet |
| --- | --- | --- |
| `candidate.apply_patch` | ändrar sandboxens kandidat | broker path/size/policy |
| `candidate.replace_files` | ersätter namngivna kandidatfiler | endast workspace |
| `candidate.run_checks` | syntax/typecheck/policygodkänd build | diagnostiskt receipt |
| `candidate.preview` | skapar isolerad kandidatpreview | flyttar aldrig live pointer |
| `candidate.evidence` | status/loggar/screenshot från kandidaten | scrubbed och bounded |
| `candidate.submit` | lämnar komplett snapshot + manifest | huvudappens CAS/finalize |
| `job.heartbeat` | förlänger en bounded lease | serverbudget och expiry |
| `job.cancel` | stoppar modellen och sandboxen | idempotent och terminalt |

## Verktyg som inte ska finnas

- `db.query`
- `db.write`
- `fly.shell`
- `render.admin`
- `vercel.admin`
- `github.platform.write`
- generellt `shell` i credentialbärande controller
- generellt `fetch_any_url`
- `promote_version`
- `deploy_live`
- `set_release_gate`

Användarens eventuellt kopplade GitHub-repo är en separat framtida capability.
Den får inte blandas ihop med Sajtmaskins plattformsrepo eller användarprojektet
i `files_json`.

## CAS och idempotency

`candidate.submit` måste bära:

- `jobId`
- `idempotencyKey`
- `baseVersionId`
- `baseFilesRevision`
- `lineageHash`
- `workspaceRevision`
- hash av komplett kandidat
- check receipts

Huvudappen läser aktuell revision igen. Om basen ändrats returneras ett
terminalt `stale_base`; agenten får inte själv rebasea mot en ny användarversion
utan ett nytt JobSpec.

Samma submit med samma idempotency key får aldrig skapa två versioner.

## Durable lease

Nuvarande generationslås är knutet till SSE-körningen. En extern agent behöver
en separat durable lease med heartbeat. Leasen ska:

- ägas av jobId, inte av Render-processen
- ha absolut maxlivslängd
- bli terminal vid cancel/supersede
- förhindra två skrivande jobb mot samma base
- inte kunna återupplivas efter expiry utan nytt serverbeslut

## Tool receipt

Varje anrop loggar minst:

```text
jobId · tenantHash · chatId · baseVersionId · baseFilesRevision
tool · requestHash · policyDecision · startedAt · durationMs
resultClass · workspaceRevision · token/cost-delta · artifactRefs
```

Rå prompt, hemligheter och fulla filer ska inte hamna i vanliga driftloggar.

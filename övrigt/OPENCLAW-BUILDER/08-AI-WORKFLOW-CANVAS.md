# AI Workflow Canvas

Granskad URL:
`https://ai-workflow-canvas.v0.build/builder?prompt=grgre&mode=analyserad`

Den publika navigeringen ledde den 24 augusti 2026 till Vercel/v0-inloggning.
Ingen funktionell eller kodmässig audit av själva canvasen kunde därför göras.
Planen gör den uttryckligen optional.

## Bra möjlig roll

Canvasen kan bli en operator-/observationsyta för:

- fruset inputpaket
- plansteg
- verktygsanrop
- kandidatens filändringar
- check receipts
- previewvarv
- policy denies
- kostnad och tidsbudget
- submit/finalize/gateutfall

Den ska läsa ett serverägt jobb-eventflöde och skicka avgränsade kommandon som
`cancel`, `approve` eller `retry`. Den ska inte själv lagra projektfiler eller
beräkna vad som är promoted.

## Dålig möjlig roll

Canvasen bör inte:

- vara job queue
- bära Supabase/Render/Vercel-credentials
- få rå shellaccess
- vara canonical BuildSpec-owner
- lagra hemligheter eller full kod i query params
- direkt skriva Fly-workspace eller Postgres
- ersätta builderns auth/grants

## Föreslagen eventmodell

```text
job.created
input.frozen
plan.proposed
tool.started / tool.completed / tool.denied
candidate.changed
check.completed
preview.ready / preview.failed
repair.started
candidate.submitted
finalize.completed
gate.completed
job.completed / job.cancelled / job.superseded
```

Varje event ska vara bundet till `jobId`, sekvensnummer, tidsstämpel,
baseversion/revision och scrubbed metadata.

## Integrationsbeslut senare

Ta ställning först efter P1 read-only-agent. Då går det att jämföra canvasens
faktiska datamodell med jobb-eventmodellen utan att låsa Builder-arkitekturen
till en UI-prototyp.

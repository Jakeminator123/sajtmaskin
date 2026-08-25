# Genomförandeplan

## Översikt

| Fas | Resultat | Skrivmakt | Planfil |
| --- | --- | --- | --- |
| P0 | kontrakt, baseline och observability | ingen | [P0](plans/P0-KONTRAKT-OCH-BASELINE.md) |
| P1 | read-only projektagent | ingen | [P1](plans/P1-READ-ONLY-PROJEKTAGENT.md) |
| P2 | shadow planner | ingen | [P2](plans/P2-SHADOW-PLANNER.md) |
| P3 | kandidat i sandbox | endast sandbox | [P3](plans/P3-KANDIDAT-SANDBOX.md) |
| P4 | preview-/repairloop | endast sandbox | [P4](plans/P4-PREVIEW-OCH-REPAIR.md) |
| P5 | opt-in A/B och rollout | via befintlig persist | [P5](plans/P5-OPT-IN-ROLLOUT.md) |

## Kodmässiga sömmar

### Före agenten

Behåll nuvarande owners för:

- `src/lib/builder/prompt-orchestration.ts`
- `src/lib/builder/site-brief-generation.ts`
- `src/lib/gen/orchestrate/resolve-base.ts`
- `src/lib/gen/orchestrate/finalize-prompts.ts`
- `src/lib/gen/orchestrate/generation-package.ts`
- `src/lib/gen/generation-input-package.ts`

### Utbytbar exekveringsdel

Feature flag väljer mellan:

- `classic`: befintlig own-engine/codegen
- `openclaw_shadow`: agentplan körs men påverkar inget
- `openclaw_candidate`: agenten producerar kandidat som går tillbaka till
  befintlig finalize

Integrationssömmen bör ligga mellan `buildGenerationInputPackage(...)` och
`createOwnEnginePipelineAndGenerationStream(...)` i både init och follow-up.

### Efter agenten

Behåll nuvarande owners för:

- parser och normalisering
- `src/lib/gen/stream/finalize-version/runner.ts`
- `src/lib/gen/stream/finalize-merge.ts`
- `src/lib/db/chat-repository/versions.ts`
- `src/lib/gen/preview/preview-session.ts`
- `src/lib/gen/verify/`
- lifecycle/release/deploy

## Ordning som minimerar ombyggnad

1. Återanvänd `GenerationInputPackage`; skapa inte ett andra orchestrationformat.
2. Lägg ett tunt jobb-envelope runt paketet.
3. Bygg broker och read-only tools innan agentmodellen kopplas till writes.
4. Låt agenten anropa befintlig codegen som ett möjligt första verktyg. Den kan
   därefter granska och reparera kandidaten i stället för att allt måste
   genereras fil för fil av OpenClaw.
5. Skapa en kandidatpreview som aldrig ersätter officiell previewpekare.
6. Skicka komplett kandidat genom nuvarande finalize.
7. Gör varje fas permanent fallbackbar till `classic`.

## Vad som inte ska tas bort

- Deep/Snapshot/Delta Brief-regler
- BuildSpec och generation contract
- scaffold/variant freeze och skyddade paths
- dossier selection/verbatim/env policy
- source receipt och lineage
- deterministic autofix/import repair
- versionstransaktioner
- RenderGate/ReleaseGate
- repair acceptance
- release/deploy-grindar

Agenten ska avlasta kodbyggaren genom planering, navigation och iteration — inte
ersätta de delar som förhindrar att ett bra demoresultat blir en dålig eller
osäker version.

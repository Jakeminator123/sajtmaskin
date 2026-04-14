# Builder — LLM-pipeline (nav)

**Senast uppdaterad:** 2026-04-15

Detta dokument ar ett kort nav. Detaljerad runtime-sanning ligger i fasdokumenten.

---

## Kanonisk lasordning

| Del | Dokument | Fokus |
|---|---|---|
| Fas 1 | `docs/architecture/fas1-startprompt-flow.md` | Prompt in, assist, brief, init/follow-up-ingang |
| Fas 2 | `docs/architecture/fas2-orchestration-and-build.md` | Orkestrering, LLM-input, finalize/autofix/verifier/persist |
| Fas 3 | `docs/architecture/fas3-preview-and-deploy.md` | Preview-host/VM, lifecycle, quality-gate/deploy |
| Signallager | `docs/architecture/llm-signal-flow.md` | Hur brief, scaffold, contracts och post-checks samspelar |
| Kontrakt | `docs/schemas/orchestration-signal-contract.md` | Canonical source per signal |
| Roller | `docs/schemas/llm-role-matrix.md` | Planner/generator/fixer/verifier/assist-lanes |

---

## Modellbanor i buildern

| Bana | Vad den styr |
|---|---|
| **Byggmodell** (`fast/pro/max/codex/anthropic`) | Själva generation/refine-streamen |
| **Prompt assist** | Deep brief, rewrite och relaterade promptverktyg |
| **Polish** | "Skriv om"-lanen (latt omskrivning av prompttext) |
| **Thinking** | Resonemangsflagga, inte en separat modellbana |

Kanonisk modellkarta: `docs/schemas/model-build-profiles.md` och
`config/ai_models/manifest.json`.

---

## Builder-entry (fore modellen)

`src/app/builder/builder-entry.ts` normaliserar URL-ingang till intern
`entryKind`/`entryState`.

Viktiga begrepp:

- `appProjectId` = builderns kanoniska projekt-id
- `externalProjectId` = extern/legacy identitet
- `source=audit` = transport/compat-signal; intern kod bor lasa `entryKind`

Kontrakt: `docs/schemas/builder-entry-contract.md`.

---

## Stream och handoff mellan faser

- `done` betyder: versionen ar finaliserad och sparad.
- `done` betyder inte: preview ar klar.
- Efter `done` kan servern fortfarande skicka `preview-ready` eller `build-error`.
- `done.previewPending` betyder att Fas 3 kan fortsatta direkt efter Fas 2.

---

## OpenClaw ligger bredvid

OpenClaw/Sajtagenten ar inte en lane i builderns own-engine pipeline.
Den lever i separata ytor (`src/components/openclaw/`, `/api/openclaw/*`,
`/avatar`, `/api/did/chat`).

---

## Observability och docs-sync

- Prompt-dumps: `data/prompt-dumps/`
- Prompt logs: `prompt_logs` (DB/admin)
- Runtime/devlog: stream/generation-event

Vid pipelineandringar: uppdatera denna fil + fasdokumenten + relevanta schemafiler
enligt `.cursor/rules/llm-pipeline-docs-sync.mdc`.

Kod ar alltid source of truth.

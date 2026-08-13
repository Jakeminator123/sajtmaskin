# Schemas

`docs/schemas/` äger **form** (fält, ägare, gränser). `docs/contracts/` äger
**flöde**. `docs/generated/` är projektion och redigeras aldrig för hand.
Canonical owners ligger i runtime eller deklarativ källa; dessa filer förklarar
eller speglar ytorna.

Handskriven prosa här har ingen driftcheck i CI. Påståenden ska spegla koden.

## Two Layers

| Layer                | Path                                  | Role                                                                                            |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Human contracts      | `docs/schemas/*.md`                   | Stable explanations: fields, ownership, boundaries, intent.                                     |
| Strict contracts     | `docs/schemas/strict/*.schema.json`   | Machine-readable mirrors for tooling, parity tests, dashboards and editor validation.           |
| Generated projection | `docs/generated/schemas.generated.md` | Deterministic index of strict schema paths, validators, enums and declared runtime/type owners. |

Generated policy ownership and validation are indexed separately in
[`docs/generated/policies.generated.md`](../generated/policies.generated.md).

Do not add a `human/` subfolder unless there is a clear migration reason and
all references move in the same change.

## Human Contract Docs

| File                               | Domain                                                                                                                     | Canonical owner (form) |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `model-build-profiles.md`          | Build profiles, model selection, phase routing. Inte LLM-roller.                                                           | `config/ai_models/manifest.json` |
| `builder-entry-contract.md`        | Builder entry URL/state: `buildMethod`, `buildIntent`, `appProjectId`, prompt handoff, template path.                      | `src/app/builder/builder-entry.ts` |
| `scaffold-contract.md`             | `ScaffoldManifest`-fält och serialiseringspolicy. Inventarier och pick: `docs/contracts/scaffold-system.md`.               | `src/lib/gen/scaffolds/types.ts` |
| `quality-gate.md`                  | RenderGate/ReleaseGate-fält, check-id:n, repair-outcome, telemetrikolumner. Flöde: `docs/architecture/quality-gate-flow.md`. | `src/lib/gen/verify/quality-gate-checks.ts` |
| `preview-session-contract.md`      | Preview/session identifiers, preview URLs, verify-lane boundary.                                                           | `src/lib/gen/preview/preview-contract.ts` |
| `orchestration-signal-contract.md` | Signal layers before/during/after generation.                                                                              | `src/lib/gen/orchestrate.ts` |
| `llm-role-matrix.md`               | Live LLM-steg (brief, planner, generator, fixer). Modellval: `model-build-profiles.md`.                                    | `src/lib/models/phase-routing.ts` + brief-owners |
| `integrations-and-data.md`         | DB-tabeller och requestvalidering som schema-ytor. Drift: `docs/contracts/data-layer.md`.                                  | `src/lib/db/schema.ts` |
| `chat-message-ui-parts.md`         | Structured builder message parts in own-engine chat storage.                                                               | `engine_messages.ui_parts` |
| `strict/`                          | Machine-oriented schemas. See [`strict/README.md`](strict/README.md).                                                      | per-schema sourceOfTruth |

> **Pensionerat:** `plan-file.schema.json` är **borttaget** (grandmaster-område 8) —
> planering är en regel, inte ett schema. Se
> [`.cursor/rules/plan-lifecycle.mdc`](../../.cursor/rules/plan-lifecycle.mdc).
> `external-template-pipeline-contract.md` (legacy extern mall-research) togs bort
> 2026-07-09 tillsammans med pipelinens sista spår — arkivkopia med skripten finns
> i syskonmappen `../gamla-skript-till-scaffolds/` utanför repot samt i git-historiken.

Only stable, canonical schema docs belong in this folder. Exploratory schema
notes belong in `docs/plans/active/` until they are promoted here or
superseded; **historical** notes may exist in git under `docs/plans/avklarat/`
(see [`../plans/avklarat/README.md`](../plans/avklarat/README.md)).

## Not Schema Definitions

The own-engine system prompt lives in Core Rules
(`config/codegen-core-manifest.json` + `config/prompt-core/*.md`), not here.
Pipeline behavior is documented in
[`docs/architecture/llm-pipeline.md`](../architecture/llm-pipeline.md) § FAS 2.

For runtime scaffold **fields**, read `scaffold-contract.md`. For pick/pipeline,
read [`../contracts/scaffold-system.md`](../contracts/scaffold-system.md).

For signal flow in init/follow-up/repair, also read
`docs/architecture/runtime-contracts.md`.

## Code Sources Of Truth

Runtime truth: same core files as [`docs/README.md`](../README.md) § Source
of truth. Schema-specific extras include `src/lib/gen/plan/schema.ts` and the
runtime validators that import strict schemas, e.g.
`src/lib/gen/dossiers/validate-manifest.ts`.

Strict schemas are still mirrors of code-backed contracts, not replacements for
the runtime source of truth.

## Archive note

Older overlapping schema notes may exist in git under `docs/plans/avklarat/`. Keep them
only for historical reference, not as the current source of truth.

# Plan 6: World-Class Builder Roadmap

## Goal
Translate the strategic `World Class Builder` plan into active repository
documentation that can be implemented in phases without losing focus.

This roadmap assumes that the current own-engine stack, scaffold system,
project-settings work, and post-check pipeline remain the base. The next leap is
not "more raw generation", but a tighter product loop from prompt to trusted,
launch-ready company site.

## Why this plan exists
The repository now has:

- strong scaffold coverage in `src/lib/gen/scaffolds/`
- prompt assist, plan execution, and clarification infrastructure
- env-var and integration visibility in the builder
- provisional-state and post-check plumbing

The biggest remaining gaps are trust, preview fidelity, site planning,
launch-readiness, and long-term learning from generation outcomes.

## Completed groundwork from archived plans

Archived plans `11` through `13` already delivered useful baseline work:

- leaner Next.js/icon bundling and general config hygiene
- faster deploy and analytics request paths
- cheaper shared message-row rendering in builder surfaces

Those items reduce execution risk for the roadmap below, but they do not replace
the core Phase `1` to `4` work. The roadmap sequence remains:

`07` -> `08` -> `09` -> `10`

## Phase documents

- `07-world-class-builder-phase-1-trust-launch.md`
- `08-world-class-builder-phase-2-site-planning.md`
- `09-world-class-builder-phase-3-smb-growth.md`
- `10-world-class-builder-phase-4-learning-moat.md`

## Recommended execution order

1. Build Phase 1 first.
2. Start only the planning-related subset of Phase 2 next.
3. Treat Phase 3 as the first major expansion toward "real SMB website builder".
4. Treat Phase 4 as the moat layer once the core product loop is trustworthy.

## Product sequence
```mermaid
flowchart TD
  userPrompt[UserPrompt] --> planning[PlanningAndContracts]
  planning --> scaffoldPlan[ScaffoldAndModelPlan]
  scaffoldPlan --> generation[GenerationAndPreview]
  generation --> draft[DraftVersion]
  draft --> verify[VerifyRepairPromote]
  verify -->|pass| launchReady[LaunchReadyVersion]
  verify -->|fail| recovery[DiagnosticsAndRecovery]
  launchReady --> publish[PublishAndOperate]
  publish --> learn[TelemetryAndLearning]
  recovery --> learn
```

## Success criteria

- The builder becomes a place where users can trust what they see.
- The generation engine becomes more guided before code exists, not only after.
- Generated company sites become easier to publish, measure, edit, and improve.
- The platform starts learning from actual outcomes instead of treating each run
  as isolated.

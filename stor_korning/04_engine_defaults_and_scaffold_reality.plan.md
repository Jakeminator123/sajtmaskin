# Plan 04: Engine Defaults And Scaffold Reality

## Goal

Align build-model defaults, token/time budgets, and scaffold documentation with
the actual own-engine implementation that exists today.

## Tasks

- Audit where build/default models are selected in builder and server routes.
- Centralize own-engine token budgets and timeout defaults for longer builds.
- Remove unused or duplicated model-selection helpers where they drift from the
  real source of truth.
- Normalize the internal runtime scaffolds so they share a predictable blue
  visual baseline.
- Clarify docs so runtime scaffolds, download scaffold, and `_template_refs/`
  are not mixed together.
- Verify whether `UI1` exists in code or only as user terminology.

## Validation

- Read/lint changed engine, builder, and scaffold files
- Confirm route fallback model matches builder default
- Confirm scaffold docs list 10 runtime scaffolds

## Status

- [x] Audit build-model and timeout placement
- [x] Centralize own-engine generation defaults
- [x] Remove duplicate unused model helper surface
- [x] Normalize runtime scaffold accent/default background behavior
- [x] Clarify scaffold reality in docs
- [x] Confirm `UI1` is not present as a code concept

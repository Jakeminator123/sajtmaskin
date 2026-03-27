# Byggflöden (ersatt kortversion)

**Tidigare innehåll:** Detta dokument var en lång svensk genomgång (MeritMind) med
mermaid över planläge, own-engine och v0-fallback. Den **duplicerade** flera andra
arkitekturfiler och riskerade att drifta.

## Var du läser i stället

| Ämne | Canonical doc |
|------|----------------|
| Motorstatus, scaffold, generation | `docs/architecture/engine-status.md` |
| Ingångar till buildern (`wizard`, `freeform`, …) | `docs/architecture/builder-entry-flow.md` |
| Loop: stream, felminne, autofix | `docs/architecture/generation-loop-and-error-memory.md` |
| v0 endast som opt-in | `docs/architecture/v0-soft-deprecation.md` + `.cursor/rules/terminology.mdc` |

## v0 och preview-flagga (kort)

Standardvägen för **kodgenerering** är **own-engine**. v0 Platform API används i
andra ytor (mall, registry, zip, m.m.) via `v0-sdk` när de anropas. `V0_FALLBACK_BUILDER`
är **inte** codegen-växel: vid affirmative värden kan byggaren föredra v0-hostad
`demoUrl` i iframe när både den och sandbox finns — se `docs/ENV.md` och `v0-soft-deprecation.md`.

## Historik

Den utförliga mermaid-versionen finns kvar i **git-historik** för filen
`docs/architecture/meritmind-build-flows.md` (före 2026-03-24) om du behöver
exakt gammal text.

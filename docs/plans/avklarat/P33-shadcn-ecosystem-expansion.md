---
id: P33
status: done
created: 2026-04-21
completed: 2026-05-02
linear: null
---

# P33 — shadcn-ekosystem-expansion

Avklarad genom shadcn-dossier-boost-pass 2026-05-02.

## Levererat

- `data/shadcn-examples/` och de gamla `Component References`-modulerna togs bort som primär källa.
- `src/lib/gen/data/shadcn-ui-recipes.ts` är ny samlad retrieval-yta för shadcn registry items och community registries.
- Dynamic Context renderar `## UI Recipes` i stället för `## Component References`.
- `SHADCN_COMPONENTS` + `npm run shadcn:sync` är kvar som primitiv-importguard för `## Your Toolkit`.
- Dossier-verbatim-policy får canonical `selectedDossierIds` från orchestration meta innan fallback till äldre capability-replay.

## Ej infört

- Ingen live-MCP i codegen-runtime.
- Ingen `npx shadcn add` i genereringsloopen.
- Ingen scaffold-rewrite.

## Uppföljning

Fortsatt förbättring bör ske i `shadcn-ui-recipes.ts`: ranking, fler allowlistade registry-items, bättre promptbudget och ev. build-time coverage-rapport mot `llms.txt`.

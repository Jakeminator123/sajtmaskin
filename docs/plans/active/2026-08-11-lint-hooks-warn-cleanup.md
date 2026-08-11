# Plan: städa 22 react-hooks-varningar i Sajtmaskin

**Scope:** vår builder-app (`npm run lint`), inte användarsajter.
**Branch/worktree:** `chore/lint-hooks-set-state-in-effect` / `sajtmaskin-lint-hooks`
**Mål:** 0 varningar från `react-hooks/*` utan att ändra runtime-beteende.

## Bakgrund

`eslint-plugin-react-hooks@7` (React Compiler-regler) är medvetet `warn` i
`eslint.config.mjs`. De 22 träffarna finns redan på `master` — inte introducerade
av plan05.

| Regel | Antal | Strategi |
|---|---|---|
| `exhaustive-deps` | 7 | Lägg till saknade (stabila) deps |
| `preserve-manual-memoization` | 4 | Följer oftast med deps-fix |
| `set-state-in-effect` | 5 | Riktad disable + kommentar (repo-mönster) där reset/abort är avsiktlig; `useSyncExternalStore` för klientflagga om det är rent |
| `refs` | 6 | Riktad disable + kommentar (ref-sync för callbacks / scroll-ankare) |

## Filer

1. `use-preview-layout.ts` — deps
2. `usePreviewPanelInspectorActions.ts` — deps
3. `PreviewPanel.tsx` — set-state-in-effect
4. `useBuilderActiveVersionInfo.ts`, `useBuilderPageController.ts`, `conversation.tsx` — refs

## Verifiering

`npm run lint` → 0 problems · `npm run typecheck` · bugbot på diff · PR mot master.

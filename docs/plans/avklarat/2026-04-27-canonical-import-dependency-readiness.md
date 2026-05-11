---
id: 2026-04-27-canonical-import-dependency-readiness
status: done
created: 2026-04-27
completed: 2026-04-27
linear: null
---

# P1 — Canonical import/dependency readiness

## Scope

Fixa canonical `project-sanity` / `tier2-readiness`-fel som återstod efter P0. Ingen ny scaffold, ingen dossier, ingen prompt-omskrivning, ingen generell dependency-materializer.

## Resultat

| Issue | Fix |
|---|---|
| `@/components/icon` | Deterministisk helper materialiseras i `checkCrossFileImports` med lucide-baserad synlig fallback (inte null-stub). |
| `@/components/date` | Deterministisk helper materialiseras i `checkCrossFileImports` med enkel datumvisning (inte null-stub). |
| `@vercel/analytics` saknas i generated `package.json` | `@vercel/analytics` tillagd i kuraterad `KNOWN_PACKAGES` i `dep-completer.ts`. |
| `@/lib/hooks/use-mobile` | `project-sanity` delar runtime-provided policyn (`isRuntimeProvidedImport`) med cross-file-import-checker/preview. |
| `next-mdx-remote` saknas i generated `package.json` | `next-mdx-remote` tillagd i kuraterad `KNOWN_PACKAGES`. |
| Eval-runner såg inte deterministic helper-materialisering | Eval går nu via `mergeGeneratedProjectFiles` innan `runFinalizePreflight`, så cross-file materialization ingår i canonical readiness. |

## Verifiering

| Check | Resultat |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| Riktade vitest | 50/50 passerar |
| Smal P1-eval | 5/5 PASS, gate `WARNING`, 0 blocking failures |

Rapport: [`docs/evals/2026-04-27-p1-import-dependency-readiness.md`](../../evals/2026-04-27-p1-import-dependency-readiness.md)

## Ej gjort här

- Ingen full eval.
- Ingen generell dependency-materializer.
- Ingen app/page.tsx recovery.
- Ingen ny scaffold/dossier/prompt-omskrivning.

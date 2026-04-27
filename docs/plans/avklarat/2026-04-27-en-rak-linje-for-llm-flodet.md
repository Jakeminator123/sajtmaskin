---
id: 2026-04-27-en-rak-linje-for-llm-flodet
status: done
created: 2026-04-27
completed: 2026-04-27
linear: null
commits:
  - f5dd1fd5b
  - 7d57fc13c
---

# En rak linje för LLM-flödet — P0 stängd

## Vad P0 var

P0 handlade inte om bred repo-städning. Det var teknisk städning av pipeline/eval-mätningen:

```
LLM raw output kan innehålla trasig app/api/placeholder/route.ts
↓
canonical merge/preflight ska droppa protected paths
↓
eval-runner ska mäta canonical payload, inte raw/autofixed output
```

## Resultat

| Sak | Status |
|---|---|
| `app/api/placeholder/route.ts` droppas av `SCAFFOLD_PROTECTED_PATHS` | Klart |
| Protected-path-logik delad mellan runtime, preflight, auto-repair och manual repair | Klart |
| Eval-runner mäter canonical payload för blockerande checks | Klart |
| Raw protected-path-output fäller inte längre eval-gate | Klart |
| Syntaxfel i LLM-owned filer som `app/page.tsx` kan fortfarande fälla eval | Klart/testat |

## Commits

| Commit | Vad |
|---|---|
| `f5dd1fd5b` | `fix(gen): SCAFFOLD_PROTECTED_PATHS bypass in repair + preflight pipelines` |
| `7d57fc13c` | `fix(eval): mat gate-checks pa canonical persist-payload, ej raw stream` |

## Verifiering

| Check | Resultat |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `vitest run src/lib/gen` | 1056/1056 passerar |
| Smal P0-eval v4 | 3/4 PASS, gate `WARNING`, avg score 91% |

Rapport: [`docs/evals/2026-04-27-p0-protected-path-v4.md`](../../evals/2026-04-27-p0-protected-path-v4.md)

## Kvar utanför P0

`booking-service` failar fortfarande, men inte på protected route:

- `@/components/date` saknas
- `@/components/icon` saknas
- `@vercel/analytics` används men är inte pinnat i `package.json`

Detta är ett separat P1-spår: [`2026-04-27-canonical-import-dependency-readiness.md`](../active/2026-04-27-canonical-import-dependency-readiness.md)

## Ej gjort här

- Ingen upstream-quality-check lades till; `console.info` för `droppedProtectedPaths` räcker.
- Ingen full eval kördes efter P0.
- Ingen import-validator, dependency-materializer, app/page.tsx-recovery eller bred cleanup gjordes i detta spår.

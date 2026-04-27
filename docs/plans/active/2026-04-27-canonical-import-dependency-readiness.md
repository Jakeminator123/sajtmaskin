---
id: 2026-04-27-canonical-import-dependency-readiness
status: active
created: 2026-04-27
linear: null
trigger: Smal P0-eval v4 efter canonical eval-runner visade att `booking-service` fortfarande failar på verkliga canonical issues: okända `@/components/*`-imports och `@vercel/analytics` som används men saknas i generated `package.json`.
---

# P1 — Canonical import/dependency readiness

## Scope

Fixa canonical `project-sanity` / `tier2-readiness`-fel som återstår efter P0. Detta är **inte** en bred städning och inte en prompt-/scaffold-/dossier-omtagning.

## Kända fel från P0 v4

| Prompt | Canonical issue | Varför P1 |
|---|---|---|
| `booking-service` | `components/booking-flow.tsx`: unresolved local import `@/components/date` | Okänd lokal component-import överlever canonical payload |
| `booking-service` | `components/booking-flow.tsx`: unresolved local import `@/components/icon` | Okänd lokal component-import överlever canonical payload |
| `booking-service` | `app/layout.tsx`: `@vercel/analytics` används men är inte pinnat i `package.json` | Dependency-kontrakt saknar kuraterad hantering |

## Regler

- Ingen full refactor.
- Ingen ny scaffold.
- Ingen ny dossier.
- Ingen prompt-omskrivning.
- Ingen generell dependency-materializer.
- Minimal allowlist/kontrakt först.
- Test först.
- En commit för P1.

## Kandidatstrategi

| Problem | Minimal riktning |
|---|---|
| Okända `@/components/*` imports | Canonical import-validator: droppa import + användning om component saknas och ingen scaffold/dossier äger symbolen. Inte skapa tomma stubs som döljer visuell brist. |
| `@vercel/analytics` saknas i generated `package.json` | Lägg till explicit kuraterad dependency-hantering för just `@vercel/analytics` om LLM importerar den, eller deterministiskt droppa importen från generated layout om analytics inte är en del av F2-kontraktet. Välj en riktning efter kodläsning. |

## Smal eval efter P1

Kör inte full eval. Kör smalt:

```powershell
npm run eval:gate -- --prompts booking-service,dashboard,saas-dashboard,content-heavy-blog,pricing
```

## Definition of done

- `booking-service` har inga `project-sanity` / `tier2-readiness` blockers från `@/components/date`, `@/components/icon` eller `@vercel/analytics`.
- Inga tomma stubs introduceras för att dölja importfelet.
- `npx tsc --noEmit` passerar.
- Riktade vitest-tester passerar.
- Smal P1-eval visar att canonical import/dependency blockers är borta eller tydligt reducerade.

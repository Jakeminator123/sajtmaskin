---
id: P23
title: Verifier & capability hardening — motion-safe, physics, dup-routes
status: done
created: 2026-04-20
priority: high
wave: 2
parallel_safe_with: [P26]
blocked_by: [P22]
owner_files:
  - src/lib/gen/verify/verifier-pass.ts
  - src/lib/gen/capability-inference.ts
  - src/lib/gen/capability-inference.test.ts
  - src/lib/gen/system-prompt.ts
  - src/lib/gen/route-plan.ts
  - src/lib/gen/route-plan.test.ts
read_only_files:
  - src/lib/gen/orchestrate.ts
  - src/lib/gen/dossiers/registry.ts
validator_hooks:
  - { kind: file-contains, target: src/lib/gen/verify/verifier-pass.ts, expect: "checkMotionReduceTrap" }
  - { kind: file-contains, target: src/lib/gen/capability-inference.ts, expect: "needsPhysics" }
  - { kind: file-contains, target: src/lib/gen/capability-inference.ts, expect: "motion-safe:" }
  - { kind: file-not-contains, target: src/lib/gen/capability-inference.ts, expect: "motion-reduce:hidden" }
  - { kind: file-contains, target: src/lib/gen/route-plan.ts, expect: "deduplicateLocaleAlternateRoutes" }
  - { kind: npm-script, target: typecheck }
  - { kind: test-name, target: "verifier flags motion-reduce:hidden on Canvas" }
  - { kind: test-name, target: "capability-inference detects physics keywords" }
  - { kind: test-name, target: "route-plan deduplicates /contact + /kontakt" }
---

# P23 — Verifier & capability hardening

## Roll & uppgift

Du är en Cursor-agent. Tre konkreta buggar från sessionen 2026-04-20 ska åtgärdas:

| Bugg | Symtom |
|---|---|
| Generator använder `motion-reduce:hidden` på `<Canvas>` | Hela 3D-lagret blir `display:none` när prefers-reduced-motion är på |
| Verifier missar `motion-reduce:hidden`-fällan | Versionen accepteras trots osynlig 3D |
| Capability-inferens fångar `needs3D` men inte physics | "åker omkring och studsar" → ingen rapier-instruktion till generatorn |
| Generator emitterar både `/contact` och `/kontakt` | Duplicate locale-routes |

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `src/lib/gen/verify/verifier-pass.ts` | `src/lib/gen/orchestrate.ts` |
| `src/lib/gen/capability-inference.ts` (+ `.test.ts`) | `src/lib/gen/dossiers/registry.ts` |
| `src/lib/gen/system-prompt.ts` (endast sektionen som listar route-rules) | |
| `src/lib/gen/route-plan.ts` (+ `.test.ts`) | |

## Steg

1. **Verifier-check** (`verifier-pass.ts`): ny intern fn `checkMotionReduceTrap(files)`. Letar efter `motion-reduce:hidden` på `<Canvas …>` eller på fixed-overlay-wrapper (`fixed inset-0` + `pointer-events-none`). Lägg till finding med `severity: blocking` när träff finns UTAN `motion-safe:`-fallback i samma element-tree.
2. **Physics-keywords** (`capability-inference.ts` + test): ny boolean `needsPhysics` (ärver `needs3D`). Mönster: `/\b(åker omkring|svävar|flyger|drivs av gravity|bouncing|kolliderar|fysik|gravitation)\b/i`. När true, uppgradera instruction-strängen för `needs3D` till att kräva `@react-three/rapier` med `<Physics>` + `<RigidBody>`.
3. **Motion-safe-instruction** (`capability-inference.ts`): skriv om `needs3D`-instruction-blocket. Det MÅSTE explicit säga: `"NEVER apply 'motion-reduce:hidden' on the entire Canvas — that hides the 3D layer for users with reduced-motion preference. Use 'motion-safe:'-prefixed animation classes on the inner mesh so the static scene still renders."`
4. **Route-plan dedup** (`route-plan.ts` + test): ny helper `deduplicateLocaleAlternateRoutes(routes, locale)`. Detekterar par `/contact↔/kontakt`, `/about↔/om`, `/services↔/tjanster`. Behåller den som matchar projektets resolved locale (default `sv`). Loggar dropped routes via befintlig logger.
5. **System-prompt-mening** (`system-prompt.ts`): i sektionen som listar route-rules, lägg till EXAKT en mening: `"Generate routes in the project's primary language only. Do not emit both '/contact' and '/kontakt' — pick one based on the brief locale."`. Inga andra ändringar i filen.

## Icke-scope

- Ingen ändring av scaffold-pickern.
- Inga ändringar i `dossiers/registry.ts` eller `dossiers/select.ts`.
- Inga ändringar i autofix-rules.

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | Nytt snapshot-test: fil med `<Canvas className="motion-reduce:hidden">` | Verifier returnerar finding med `severity: blocking` + text som nämner `motion-reduce trap` |
| 2 | Nytt capability-test: prompt "en figur som åker omkring och studsar" | `needs3D: true`, `needsPhysics: true` |
| 3 | Nytt capability-test: prompt "en 3d-bild i hörnet" | `needs3D: true`, `needsPhysics: false` |
| 4 | Nytt route-plan-test: `["/", "/contact", "/kontakt", "/meny"]` + locale `sv` | `["/", "/kontakt", "/meny"]` |
| 5 | Nytt route-plan-test: samma input + locale `en` | `["/", "/contact", "/meny"]` |
| 6 | `rg "motion-reduce:hidden" src/lib/gen/capability-inference.ts` | Noll träffar |
| 7 | `npm run typecheck` + `npm run test:ci` | exit 0 |

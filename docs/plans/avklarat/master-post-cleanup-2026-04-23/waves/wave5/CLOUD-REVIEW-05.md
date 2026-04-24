# CLOUD-REVIEW-05 — Code-quality scan

**Du är cloud-review-agent #05.** READ-ONLY. Producera audit-rapport.

## Din uppgift

Skanna wave-5-koden för code-smells, dead code, debug-rester, type-svaghet.

## Förläs

- `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/README.md` (output-konvention)

## Scan-kategorier

### A. Comment-tags (sök i wave-5-modifierade filer)
```
TODO|FIXME|XXX|HACK|BUG|TEMP|REMOVE
```
- För varje träff: är den NY i wave 5? Är den motiverad? Eller en glömsk hack?

### B. Debug/log-rester
```
console\.(log|warn|error|debug|info)
debugger;?
\.only\(
\.skip\(
```
- `console.log` i prod-kod är BUG (ska vara `devLog` eller logger)
- `debugger` är NEVER OK
- `.only` / `.skip` i tester = oavsiktligt commiterad

### C. Type-svaghet
```
:\s*any\b
\sas\sany
as\sunknown\sas
@ts-ignore
@ts-nocheck
@ts-expect-error  (utan motivering)
```
- Räkna antal nya `any`-typer plan-10/11 introducerade
- Varje träff: kan den smalas (concrete type) eller är `any` motiverad?

### D. Magic numbers
- Sök för numeriska literals > 100 utan named constant: `[^\w_]\d{3,}\b`
- Speciellt i timer/timeout/budget-kod
- Bör vara `const FOO_TIMEOUT_MS = 5000` istället för rå `5000`

### E. Dead code
- `function` exports som inte importeras någonstans
- Imports som inte används
- Variables assigned but never read

### F. Inconsistent naming
- `camelCase` vs `snake_case` blandning?
- `Nyligen-tillagd-fil` borde matcha existing conventions
- Filnamn: kebab-case för components, camelCase för helpers, etc

### G. Long functions
- Funktion > 80 rader = svår att granska
- Kan splittas?

## Specifika filer prio-1

Wave 5 modifierade dessa kärn-filer:
- `src/lib/gen/stream/finalize-preflight.ts` (+132 rader)
- `src/lib/logging/generation-log-writer.ts` (+~140)
- `src/lib/gen/orchestrate.ts` (+47)
- `src/lib/builder/follow-up-capability-detection.ts` (modifierad)
- `src/lib/gen/scaffold-variants/registry.ts` (+26)
- `src/lib/gen/system-prompt/sections/dossiers.ts` (+66)

Skanna dessa med extra prio.

## Output

Skriv `docs/plans/active/master-post-cleanup-2026-04-23/audit-reports/AUDIT-05-code-quality-<agent-id>.md`.

Innehåll:
- Tabell per kategori (A-G): fil + rad + utdrag + severity (info/warning/error)
- Lista över FIX-NEEDED (concrete suggestions)
- Sammanfattning: ren kod / behöver städning innan plan 12

## Klart = PR öppnad.

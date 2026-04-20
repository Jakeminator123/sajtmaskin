---
id: P24
title: Preview-host robustness — AST patcher, version_mismatch UX, label fix
status: done
created: 2026-04-20
priority: medium
wave: 1
parallel_safe_with: [P21, P22, P25]
blocked_by: []
owner_files:
  - preview-host/src/runtime.js
  - preview-host/src/server.js
  - preview-host/README.md
  - src/lib/gen/preview/preview-host-client.ts
read_only_files:
  - preview-host/src/store.js
  - preview-host/Dockerfile
validator_hooks:
  - { kind: file-contains, target: preview-host/src/runtime.js, expect: "patchNextConfigViaAst" }
  - { kind: file-contains, target: preview-host/src/server.js, expect: "startOutcome === \"recreated\"" }
  - { kind: file-contains, target: preview-host/src/runtime.js, expect: "runIdResolverFromSession" }
  - { kind: file-contains, target: src/lib/gen/preview/preview-host-client.ts, expect: "version_mismatch_overlay_payload" }
  - { kind: npm-script, target: typecheck }
---

# P24 — Preview-host robustness

## Roll & uppgift

Du är en Cursor-agent. Tre observationer från sessionen 2026-04-20:

| Observation | Källa |
|---|---|
| `next.config`-patcher missar `export default {…}` och TS-typade former → HMR-spam i konsolen | `preview-host/src/runtime.js:449` (regex `/(const\s+\w+\s*(?::\s*\w+\s*)?=\s*\{)/`) |
| `startOutcome: 'resumed'` loggas trots att `restart: true` skickades | `preview-host/src/server.js:480` (hårdkodad sträng) |
| `version_mismatch`-status mellan version sparad och VM omstartad → vit iframe ≥10 s utan overlay | `src/lib/gen/preview/preview-host-client.ts` |

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `preview-host/src/runtime.js` | `preview-host/src/store.js` |
| `preview-host/src/server.js` | `preview-host/Dockerfile` |
| `preview-host/README.md` | |
| `src/lib/gen/preview/preview-host-client.ts` | |

## Steg

1. **AST-baserad patcher** (`runtime.js`): ny fn `patchNextConfigViaAst(workspaceDir)` som använder `acorn` (verifiera först att den finns i `preview-host/package.json`; om inte — `npm i acorn` i preview-host). Hanterar minst dessa fem next.config-shapes utan att korrumpera filen:
   - `const cfg = { … }`
   - `const cfg: NextConfig = { … }`
   - `module.exports = { … }`
   - `export default { … }`
   - `export default function() { return { … } }`
   Lägg in basePath + HMR-mutator i alla. Behåll gamla regex-implementationen som try/catch-fallback.
2. **Korrekt label** (`server.js`): i `/preview/session/update`-grenen, sätt `startOutcome` baserat på faktiskt outcome från `bootRuntimeForSession`-resultatet. `'recreated'` om dev-servern dödades + spawnades om, `'resumed'` om existing child levde vidare. Ta bort hårdkodningen.
3. **RunId-resolver** (`runtime.js` + `server.js`): lägg till optional `runId: string` i `validateStartPayload` + `validateUpdatePayload`. Lagra på session-objektet. Exponera helper `runIdResolverFromSession(session)`. Krävs av P26.
4. **Version-mismatch overlay** (`preview-host-client.ts`): exportera ny TS-typ `VersionMismatchOverlayPayload` med fälten `chatId`, `expectedVersionId`, `currentVersionId`, `msSinceMismatch`. Ingen UI-konsumtion här — den hör till P25.
5. **Doc** (`preview-host/README.md`): uppdatera "Kända begränsningar"-sektionen. Ta bort HMR-spam-paragrafen om AST-patchen täcker alla shapes. Lägg till en kort sektion om AST-fallback.

## Icke-scope

- Ingen ändring av Fly.io-konfiguration eller WS-proxy-policy.
- Ingen ändring av `spawnDevServer`-env-passing utöver `runIdResolverFromSession`-tillägget.
- Ingen UI-rendering av version-mismatch-overlayen (P25).

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | Nytt snapshot-test (Node-script i `preview-host/scripts/test-patch.mjs` eller befintlig testfil): patcher körs på alla 5 next.config-shapes | Filen genereras korrekt utan korruption, basePath + HMR-mutator finns inne |
| 2 | Manuell verifiering av `/preview/session/update`-svar | `startOutcome === "recreated"` när restart faktiskt skedde |
| 3 | curl mot `/preview/session/start` med `runId: "abc"` | Sessionen som returneras har `runId: "abc"` |
| 4 | Typecheck i sajtmaskin | `VersionMismatchOverlayPayload` är exportad och typad |
| 5 | `npm run typecheck` (sajtmaskin-roten) | exit 0 |
| 6 | `node preview-host/scripts/smoke.js` | exit 0 |

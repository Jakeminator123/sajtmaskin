---
id: gm-akt-S3
status: done
parent: gm-omrade-02-stabilitetstester
blocked_by: [gm-akt-S1]
note: "Klar. Område 6 (event-bus-status-cut-over) landade (6-1 #159, 6-2 #160, 6-3 punkt 1 #162), så den parallella DB-helpern hade noll app-konsumenter och togs bort i 6-3 punkt 2. S3-invarianten flippades då från warn/xfail till en hård import-/anrops-vakt. Levererad i draft-PR #163 (ej mergad)."
owner_files:
  - src/lib/builder/status-resolver-single-writer.stability.test.ts
risk: låg
pr: "#163 (draft)"
---

# S3 — statusresolver-invariant (klar — hård import-vakt)

## Mål
Lås att ingen kod under `src/**` läser legacy `resolveEngineVersionDisplayStatus`
(N#6). En grep-/import-invariant som dokumenterar single-writer-tillståndet på de
centrala builder-ytorna (`VersionHistory.tsx` + `BuilderShellContent.tsx`).

## Levererat (6-3 punkt 2)
Event-bus-status-cut-over är klar, så helpern hade noll app-konsumenter kvar och är
**borttagen** ur `src/lib/db/engine-version-lifecycle.ts` (funktionen + den enbart
av den använda typen `EngineVersionDisplayStatus` + det döda test-blocket). Tidigare
warn/xfail-planen är därför uppfylld och invarianten skrevs direkt som en **hård
assert**:

- Ny stabilitetstest `src/lib/builder/status-resolver-single-writer.stability.test.ts`
  (`*.stability.test.ts`-glob → körs av `npm run test:stability`, exkluderas från
  `test:ci`). Rekursiv `fs`-skanning av `src/**/*.{ts,tsx}` (skippar `node_modules`,
  dot-kataloger och testfilen själv). Matchar BARA import-satser och faktiska anrop
  (`symbol(`) — robust mot backtick-omsluten prosa i kommentarer.
- Positiv sanity-assert: `BuilderShellContent.tsx` (via `useVersionStatus`) +
  `VersionHistory.tsx` (via server-enrichat `busStatus`) läser bus-vägen.

## Inte scope
- Själva UI-flippen (det var område 6, klart).
- Ändra statusprojektionen `selectVersionStatus`.

## Verifiering
- `npm run test:stability` grön (hård invariant + befintliga stabilitetstester).
- `npx vitest run -c vitest.stability.config.ts src/lib/builder/status-resolver-single-writer.stability.test.ts` grön.
- Grep: inga `resolveEngineVersionDisplayStatus`-import/-anrop kvar i `src/**` (endast prosa).

## Risk
Låg. Ren grep-/import-vakt (ingen runtime). Legacy-resolvern var redan död kod.

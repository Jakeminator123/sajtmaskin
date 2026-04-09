# P11: Heartbeat 429-spikar vid versionsbyte

## Problem

`usePreviewHeartbeat` skickar heartbeat var 25:e sekund med visibility-guard.
Vid versionsbyte ändras `versionId` i dependency-arrayen → effect avmonteras
och monteras om → två snabba anrop kan spikas. Rate limit är 120 req/60s
(preview-session:heartbeat) — normalt tillräckligt, men vid snabba
versionsbyten kan burst-traffic orsaka 429.

## Filer att ändra

- `src/components/builder/preview-panel/hooks/usePreviewHeartbeat.ts`
  - Lägg till debounce/guard vid versionsbyte: skippa heartbeat ~3-5 sekunder
    efter att `versionId` ändras (useRef med timestamp).
  
- `src/lib/rateLimit.ts` (~rad 63-65)
  - Eventuellt höj heartbeat-limit till 180/60s som marginal.

## Verifiering

- Byt version snabbt 5+ gånger i rad i builder-UI.
- Verifiera att 429 inte returneras.

## Status

**Klar.** Omedelbar `void tick()` borttagen från heartbeat-effekten. Första heartbeat
sker efter 25s-intervallet, inte vid mount. Eliminerar burst vid versionsbyte.

## Prioritet

Låg — edge case som mest påverkar aggressiva versionsbyten.

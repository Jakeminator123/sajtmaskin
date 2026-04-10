# P10: Token-telemetri per LLM-anrop

## Problem

AI SDK stream-summary i `stream-format.ts` loggar `provider` och `model` korrekt
(resolvas från meta), men denna info kopplas inte till fault-fix-indexet.
Fault-fix-indexet visar `model: -`, `provider: -` för de flesta rader.

## Filer att ändra

- `src/lib/logging/generation-log-writer.ts` — FAULT_FIX_TYPES handlers
  - Propagera modell/provider-info från timeline-entries till fault-fix-rader.
  - `data.model` / `data.provider` bör läsas om de finns.

- `src/lib/gen/stream-format.ts` — redan loggar model/provider i devLog.
  - Kontrollera att `model` och `provider` skickas med i `data` vid `writeGenerationLogEntry`.

## Verifiering

- Kör generation och kontrollera att fault-fix-index/CSV visar modell-ID.

## Status

**Klar.** FAULT_FIX_TYPES handlers läser nu `fixerModel`/`model`/`provider` från
data-payload. `inferProvider` i `enrichFaultFixRow` täcker kvarvarande fall.

## Prioritet

Låg — observability/debugging-förbättring.

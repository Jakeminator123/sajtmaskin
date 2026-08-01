/**
 * Fasad för generationsloggen — den publika ytan är oförändrad.
 *
 * Implementationen ligger i `./generation-log-writer/` uppdelad per ansvar:
 *  - `constants.ts` — rotkataloger, filnamn och retention-tak.
 *  - `flags.ts` — `GENERATIONSLOGG`-flaggan.
 *  - `types.ts` / `entry-fields.ts` — delade shapes och fältläsare.
 *  - `run-dirs.ts` / `timeline-store.ts` — filsystem: körmappar, chat→run-index,
 *    prune och timeline.ndjson.
 *  - `run-routing.ts` — vilken körmapp ett event hamnar i.
 *  - `status.ts` — statusprojektion (`resolveStatusDetails`, `meta.json`).
 *  - `fault-fix-index.ts` — fault/fix-rader, markdown-index och CSV.
 *  - `observability.ts` — observability.json, fix-patterns.json och
 *    site-observability-historiken.
 *  - `summaries.ts` — summary.md.
 *  - `writer.ts` — skrivvägen som binder ihop dem.
 *
 * Loggformat, filnamn och telemetrinycklar är observability-kontrakt som
 * backoffice och skript läser — ändra dem inte utan att uppdatera dem också.
 */
export { isGenerationLogEnabled } from "./generation-log-writer/flags";
export { readRecurringPatternsForChat } from "./generation-log-writer/observability";
export { resolveRunDirFromContext } from "./generation-log-writer/run-routing";
export { readRunStatusForChat } from "./generation-log-writer/status";
export { writeGenerationLogEntry } from "./generation-log-writer/writer";

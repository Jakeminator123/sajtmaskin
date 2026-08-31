import { writeSync } from "node:fs";

/**
 * Cursor's beforeShellExecution runner reads stdout until EOF. On Windows,
 * `process.stdout.write` is async; if the process then leaves the event loop
 * the last chunk can be discarded and Cursor reports "returned no output",
 * which fail-closed treats as a crash. `writeSync(1, …)` finishes before we
 * return. Never call `process.exit()` after this — exiting can still drop a
 * buffered pipe write on some Node/Windows combinations.
 */
export function writeHookResponse(payload) {
  try {
    writeSync(1, `${JSON.stringify(payload)}\n`);
  } catch (error) {
    if (error?.code !== "EPIPE") process.exitCode = 1;
  }
}

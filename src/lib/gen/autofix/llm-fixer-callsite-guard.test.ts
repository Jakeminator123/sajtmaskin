import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fas 3 (RepairGate) single-port guard: ALL LLM repair goes through ONE port.
 * `runLlmFixer` must have exactly ONE production callsite — inside
 * `llm-repair-gate.ts` — so every repair lane (finalize warm-tsc/warm-eslint/
 * syntax/verifier/partial-file/home-route/merged-syntax AND the post-finalize
 * repair loop for server-verify / manual repair) shares the same RepairLedger
 * dedupe and the same routing config. A new direct callsite would silently
 * bypass the ledger again (the exact regression Fas 3 removed).
 *
 * If this test fails: route the new call through `runLlmRepairGate` instead
 * of calling `runLlmFixer` directly.
 */

const SRC_ROOT = path.join(process.cwd(), "src");
const DEFINITION_FILE = path.join(SRC_ROOT, "lib", "gen", "autofix", "llm-fixer.ts");
const GATE_FILE = path.join(SRC_ROOT, "lib", "gen", "autofix", "llm-repair-gate.ts");

function* walkSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(fullPath);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    yield fullPath;
  }
}

describe("RepairGate single-port guard (Fas 3)", () => {
  it("runLlmFixer( has exactly one production callsite: inside llm-repair-gate.ts", () => {
    const offenders: string[] = [];
    let gateCallsites = 0;

    for (const filePath of walkSourceFiles(SRC_ROOT)) {
      if (filePath === DEFINITION_FILE) continue;
      const source = readFileSync(filePath, "utf8");
      const callsites = source.match(/runLlmFixer\(/g)?.length ?? 0;
      if (callsites === 0) continue;
      if (filePath === GATE_FILE) {
        gateCallsites += callsites;
        continue;
      }
      offenders.push(`${path.relative(SRC_ROOT, filePath)} (${callsites} callsite(s))`);
    }

    expect(offenders).toEqual([]);
    expect(gateCallsites).toBe(1);
  });
});

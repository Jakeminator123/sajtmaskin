#!/usr/bin/env node
/**
 * Canvas ↔ Aktiv kö-driftcheck.
 *
 * Den committade `docs/canvases/llm-flow.canvas.txt` måste matcha den
 * backlog-härledda snapshoten (totals, prioritet, top-risks, per-process
 * backlog-räkning) och får inte nämna ett `SM-###` som inte längre ligger i
 * `## Aktiv kö`. Churn/commit-stämpeln jämförs inte — den ändras varje commit.
 *
 *   node scripts/canvas/check-llm-flow-canvas.mjs
 *   npm run canvas:check
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildData,
  extractEmbeddedCanvasData,
  findCanvasBacklogDrift,
  findStaleCanvasBacklogIds,
} from "./build-llm-flow-canvas.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANVAS_REL = "docs/canvases/llm-flow.canvas.txt";
const BACKLOG_REL = "BUG-SWARM-BACKLOG.md";

function main() {
  const canvas = readFileSync(join(REPO_ROOT, CANVAS_REL), "utf8");
  const backlog = readFileSync(join(REPO_ROOT, BACKLOG_REL), "utf8");
  const stale = findStaleCanvasBacklogIds(canvas, backlog);
  if (stale.length > 0) {
    console.error(
      `[canvas:check] ${CANVAS_REL} nämner SM-ID som inte finns i ## Aktiv kö: ${stale.join(", ")}. ` +
        `Kör \`npm run canvas:build\` efter backlog-arkivering.`,
    );
    process.exit(1);
  }
  const painted = extractEmbeddedCanvasData(canvas);
  if (!painted) {
    console.error(`[canvas:check] kunde inte läsa inbäddad DATA i ${CANVAS_REL}.`);
    process.exit(1);
  }
  const drift = findCanvasBacklogDrift(painted, buildData());
  if (drift.length > 0) {
    console.error(
      `[canvas:check] ${CANVAS_REL} har stale backlog-härledd data: ${drift.join("; ")}. ` +
        `Kör \`npm run canvas:build\`.`,
    );
    process.exit(1);
  }
  console.log(
    `[canvas:check] ${CANVAS_REL} matchar backlog-totals/prio/processdata mot ${BACKLOG_REL}.`,
  );
}

main();

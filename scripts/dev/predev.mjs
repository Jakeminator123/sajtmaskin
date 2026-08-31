#!/usr/bin/env node
/**
 * predev wrapper (replaces the old inline `&&` chain in package.json).
 *
 * Why this exists:
 *  - SKIP_PREDEV=1 -> skip ALL preflight/db/token steps (fast iteration).
 *    npm always runs `predev` before `dev`, so the only reliable escape hatch
 *    is to short-circuit here.
 *  - Otherwise run the predev chain. `preflight:common` is the only HARD gate
 *    (a failing check should block `npm run dev`). The db/token steps are soft
 *    and must never block dev even when the DB is unreachable.
 *
 * Note: schema-drift was intentionally removed from dev start (run it via
 * `npm run db:schema-drift` in CI / pre-push) to drop the vitest startup cost
 * on every dev launch.
 */
import { spawnSync } from "node:child_process";

import { evaluateRepositoryNodeVersion } from "./check-node-version.mjs";

const nodeRuntime = evaluateRepositoryNodeVersion();
if (!nodeRuntime.valid) {
  console.error(`[predev] STOPP: ${nodeRuntime.reason}`);
  process.exit(1);
}

if (process.env.SKIP_PREDEV) {
  console.log("[predev] SKIP_PREDEV satt - hoppar over preflight/db/token (snabb iteration)");
  process.exit(0);
}

const chain = [
  "npm run preflight:common",
  "npm run shadcn:sync:soft",
  "node scripts/dev/refresh-token.mjs",
  // Installerar schema-synk-hookarna om de saknas. Tyst när de redan finns, så
  // en färsk clone/worktree får dem utan att någon behöver komma ihåg det.
  "npm run hooks:install:soft",
  "npm run db:init:soft",
  "npm run db:perf-indexes:soft",
].join(" && ");

const res = spawnSync(chain, { stdio: "inherit", shell: true });
process.exit(res.status ?? 1);

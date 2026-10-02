#!/usr/bin/env node
/**
 * predev wrapper (replaces the old inline `&&` chain in package.json).
 *
 * Why this exists:
 *  - SKIP_PREDEV=1 -> skip ALL preflight/token steps (fast iteration).
 *    npm always runs `predev` before `dev`, so the only reliable escape hatch
 *    is to short-circuit here.
 *  - Otherwise run the predev chain. `preflight:common` is the only HARD gate
 *    (a failing check should block `npm run dev`). Other setup is soft.
 *    Dev start never applies migrations or performance indexes. The existing
 *    next-runner background guard reports DB drift read-only.
 *
 * Note: schema-drift was intentionally removed from dev start (run it via
 * `npm run db:schema-drift` in CI / pre-push) to drop the vitest startup cost
 * on every dev launch.
 */
import { spawnSync } from "node:child_process";

if (process.env.SKIP_PREDEV) {
  console.log("[predev] SKIP_PREDEV satt - hoppar over preflight/token (snabb iteration)");
  process.exit(0);
}

const chain = [
  "npm run preflight:common",
  "npm run shadcn:sync:soft",
  "node scripts/dev/refresh-token.mjs",
  // Installerar read-only DB-hooks om de saknas. Tyst när de redan finns, så
  // en färsk clone/worktree får dem utan att någon behöver komma ihåg det.
  "npm run hooks:install:soft",
  // Samma princip för maskin-lokalt driv som CI aldrig kan se (RTK-hook,
  // mcp.json, dubblerade skill-rötter). Tyst när allt stämmer, aldrig blockerande.
  "npm run doctor:soft",
].join(" && ");

const res = spawnSync(chain, { stdio: "inherit", shell: true });
process.exit(res.status ?? 1);

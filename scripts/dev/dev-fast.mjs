#!/usr/bin/env node
/**
 * Cross-platform "fast dev".
 *
 * Runs `npm run dev` with SKIP_PREDEV=1 set in the environment, so you never
 * have to remember shell-specific env syntax:
 *   - PowerShell: $env:SKIP_PREDEV=1; npm run dev   (bash `SKIP_PREDEV=1 npm run dev` does NOT work in pwsh)
 *   - bash/zsh:   SKIP_PREDEV=1 npm run dev
 *
 * Instead just run, on any shell:
 *   npm run dev:fast
 */
import { spawnSync } from "node:child_process";

const res = spawnSync("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, SKIP_PREDEV: "1" },
});
process.exit(res.status ?? 1);

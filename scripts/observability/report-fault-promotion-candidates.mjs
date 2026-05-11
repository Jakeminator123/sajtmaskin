#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(ROOT, "src", "lib", "observability", "fault-promotion-report-cli.ts");
const IS_WINDOWS = process.platform === "win32";

const result = spawnSync("npx", ["tsx", CLI], {
  cwd: ROOT,
  encoding: "utf8",
  shell: IS_WINDOWS,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);

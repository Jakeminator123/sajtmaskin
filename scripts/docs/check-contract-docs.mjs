import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGeneratedDocs } from "./contract-docs-core.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function findContractDocDrift() {
  const expectedDocs = await buildGeneratedDocs();
  const drift = [];

  for (const [path, expected] of expectedDocs) {
    let actual;
    try {
      actual = await readFile(resolve(REPO_ROOT, path), "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        drift.push({ path, reason: "missing" });
        continue;
      }
      throw error;
    }

    if (actual !== expected) {
      drift.push({ path, reason: "out of date" });
    }
  }

  return drift;
}

const drift = await findContractDocDrift();
if (drift.length > 0) {
  for (const item of drift) {
    console.error(`[docs:check] ${item.path}: ${item.reason}`);
  }
  console.error("[docs:check] Run `npm run docs:generate` and commit the result.");
  process.exit(1);
}

console.log("[docs:check] Generated contract docs match canonical sources.");

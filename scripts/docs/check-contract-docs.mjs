import { findContractDocDrift } from "./contract-docs-core.mjs";

const drift = await findContractDocDrift();
if (drift.length > 0) {
  for (const item of drift) {
    console.error(`[docs:check] ${item.path}: ${item.reason}`);
  }
  console.error("[docs:check] Run `npm run docs:generate` and commit the result.");
  process.exit(1);
}

console.log("[docs:check] Generated contract docs match canonical sources.");

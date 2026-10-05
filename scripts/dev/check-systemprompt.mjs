/** Validate the canonical core with the production loader. Run with node --import tsx. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as staticCoreModule from "../../src/lib/gen/static-core-loader.ts";

const { getStaticCoreFromWorkspace } = staticCoreModule.default ?? staticCoreModule;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function checkSystemPrompt(root = REPO_ROOT) {
  try {
    const core = getStaticCoreFromWorkspace(root);
    console.log(
      `[check-systemprompt] OK: config/codegen-core-manifest.json (${core.length} chars)`,
    );
    return 0;
  } catch (error) {
    console.error(`[check-systemprompt] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = checkSystemPrompt();
}

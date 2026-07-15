import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const entryPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(entryPath), "../..");
if (process.cwd() !== repoRoot) {
  const child = spawnSync(
    process.execPath,
    [resolve(repoRoot, "node_modules/tsx/dist/cli.mjs"), entryPath],
    { cwd: repoRoot, env: process.env, stdio: "inherit" },
  );
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
process.chdir(repoRoot);

const { writeGeneratedDocs } = await import("./contract-docs-core.mjs");

await writeGeneratedDocs();

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { acceptanceCatalog, validateAcceptanceSelection } from "./list-acceptance-matrix.mjs";

// Materialize once with this run's locked repository install. Only source files
// travel between jobs: no node_modules, Next cache, credentials or build receipts.
const ids = validateAcceptanceSelection(process.env.ACCEPTANCE_DOSSIERS ?? "", acceptanceCatalog());
if (!process.env.ACCEPTANCE_ROOT) throw new Error("ACCEPTANCE_ROOT missing");
const root = resolve(process.env.ACCEPTANCE_ROOT);
if (root === process.cwd() || (existsSync(root) && readdirSync(root).length)) {
  throw new Error("Acceptance output must be empty and outside the repository root");
}
mkdirSync(root, { recursive: true });
for (const id of ids) {
  const result = spawnSync(process.execPath, [
    "--import", "tsx", "scripts/dossiers/materialize-acceptance-project.ts",
    `--id=${id}`, `--out=${resolve(root, id)}`,
  ], { stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Materialization failed for ${id}`);
}

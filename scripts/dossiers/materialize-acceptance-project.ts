/** Materialize one file-shipping dossier (hard or soft) into a standalone, keyless generated project. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

import { buildDossierAcceptanceProject } from "../../src/lib/gen/dossiers/acceptance-project";

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const dossierId = readArg("id")?.trim();
const outputArg = readArg("out")?.trim();
if (!dossierId || !outputArg) {
  throw new Error("Usage: materialize-acceptance-project.ts --id=<dossier-with-files> --out=<empty-dir>");
}

const outputRoot = resolve(outputArg);
const repoRoot = resolve(process.cwd());
if (outputRoot === repoRoot) throw new Error("Refusing to materialize over the repository root");
if (existsSync(outputRoot) && readdirSync(outputRoot).length > 0) {
  throw new Error(`Output directory must be empty: ${outputRoot}`);
}
mkdirSync(outputRoot, { recursive: true });

const project = buildDossierAcceptanceProject(dossierId);
for (const file of project.files) {
  const target = resolve(outputRoot, ...file.path.replace(/\\/g, "/").split("/"));
  if (target !== outputRoot && !target.startsWith(outputRoot + sep)) {
    throw new Error(`Refusing path outside output root: ${file.path}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content, "utf8");
}

console.log(
  `Materialized ${project.dossier.class}/${project.dossier.id}: ${project.files.length} files, keyless output ${outputRoot}`,
);

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Acceptance matrix = every dossier that ships files (hard AND soft). Soft
// dossiers with verbatim/rewritable component files rot the same way hard
// ones do when an upstream package bumps a major (maplibre-map, 2026-08-05),
// so they get the same keyless install+typecheck+build lane. File-less
// dossiers (instructions-only) have nothing to build and are skipped.
export function acceptanceCatalog(root = process.cwd()) {
  const entries = [];
  for (const dossierClass of ["hard", "soft"]) {
    const directory = resolve(root, "data", "dossiers", dossierClass);
    if (!existsSync(directory)) throw new Error(`Missing dossier class: ${dossierClass}`);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const manifestPath = join(directory, entry.name, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.id !== entry.name) {
        throw new Error(`Manifest id mismatch: ${dossierClass}/${entry.name}`);
      }
      if (!Array.isArray(manifest.files) || manifest.files.length === 0) continue;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) throw new Error(`Invalid dossier id: ${entry.name}`);
      entries.push({ id: entry.name, class: dossierClass });
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  if (entries.length === 0) throw new Error("No dossiers with files found");
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Duplicate dossier ids");
  return entries;
}

export function validateAcceptanceSelection(value, catalog) {
  const selected = JSON.parse(value);
  const valid = new Set(catalog.map(entry => entry.id));
  if (!Array.isArray(selected) || selected.length === 0 ||
      new Set(selected).size !== selected.length || selected.some(id => typeof id !== "string" || !valid.has(id))) {
    throw new Error("Missing, empty or invalid acceptance selection");
  }
  return selected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = acceptanceCatalog();
  const selected = process.env.ACCEPTANCE_DOSSIERS;
  if (process.env.GITHUB_ACTIONS === "true" && !selected) throw new Error("CI acceptance selection missing");
  process.stdout.write(JSON.stringify(selected === undefined ? catalog.map(entry => entry.id) : validateAcceptanceSelection(selected, catalog)));
}

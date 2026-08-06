import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Acceptance matrix = every dossier that ships files (hard AND soft). Soft
// dossiers with verbatim/rewritable component files rot the same way hard
// ones do when an upstream package bumps a major (maplibre-map, 2026-08-05),
// so they get the same keyless install+typecheck+build lane. File-less
// dossiers (instructions-only) have nothing to build and are skipped.
const ids = [];
for (const dossierClass of ["hard", "soft"]) {
  const root = resolve(process.cwd(), "data", "dossiers", dossierClass);
  if (!existsSync(root)) continue;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const manifestPath = join(root, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.id !== entry.name) {
      throw new Error(`Manifest id mismatch: ${dossierClass}/${entry.name}`);
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) continue;
    ids.push(entry.name);
  }
}
ids.sort();

if (ids.length === 0) throw new Error("No dossiers with files found");
process.stdout.write(JSON.stringify(ids));

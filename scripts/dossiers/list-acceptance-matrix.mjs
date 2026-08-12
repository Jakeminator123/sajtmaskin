import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd(), "data", "dossiers", "hard");
const ids = readdirSync(root, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith("_") &&
      existsSync(join(root, entry.name, "manifest.json")),
  )
  .map((entry) => {
    const manifest = JSON.parse(readFileSync(join(root, entry.name, "manifest.json"), "utf8"));
    if (manifest.id !== entry.name) {
      throw new Error(`Manifest id mismatch: hard/${entry.name}`);
    }
    return entry.name;
  })
  .sort();

if (ids.length === 0) throw new Error("No hard dossiers found");
process.stdout.write(JSON.stringify(ids));

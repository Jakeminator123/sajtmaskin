/**
 * Read-only inventory of a legacy dossier snapshot (pre-v2 archive).
 *
 * Scans <root>/dossiers/<id>/manifest.json shallowly and prints a compact
 * summary per dossier (category, qualityScore, env keys, deps, file counts)
 * plus category aggregates — WITHOUT reading component file contents. Used to
 * triage which legacy dossiers are worth hand-curating into the v2 pool
 * (data/dossiers/{hard,soft}/). Never writes anything.
 *
 * Usage:
 *   npm run dossiers:inventory-legacy [-- --root=/path/to/legacy] [-- --json]
 *   npm run dossiers:inventory-legacy -- --detail=<id-prefix>
 *
 * Default root: sibling folder `../dossiers-legacy-2026-04-20` next to the
 * repo root (same convention as DOSSIER_PROSPECT_ROOT/`../dossiers-prospect`);
 * override with DOSSIER_LEGACY_ROOT or --root=.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
};
// Platform-neutral default (backlog A#19–A#20, #419): the legacy snapshot
// lives OUTSIDE the repo as a sibling folder — same convention as the
// prospect root in normalize-legacy-prospect.ts (`../dossiers-prospect`).
// Override with DOSSIER_LEGACY_ROOT or --root=.
const DEFAULT_LEGACY_ROOT =
  process.env.DOSSIER_LEGACY_ROOT?.trim() ||
  resolve(process.cwd(), "..", "dossiers-legacy-2026-04-20");
const ROOT = getArg("root") ?? DEFAULT_LEGACY_ROOT;
const AS_JSON = args.includes("--json");
const DETAIL = getArg("detail");

const dossierRoot = join(ROOT, "dossiers");
if (!existsSync(dossierRoot)) {
  console.error(`Not found: ${dossierRoot}`);
  process.exit(1);
}

function countFiles(dir) {
  let n = 0;
  let bytes = 0;
  if (!existsSync(dir)) return { n, bytes };
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const p = join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else {
        n += 1;
        try {
          bytes += statSync(p).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return { n, bytes };
}

const rows = [];
for (const dirent of readdirSync(dossierRoot, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const id = dirent.name;
  const dir = join(dossierRoot, id);
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  } catch {
    rows.push({ id, error: "no/invalid manifest.json" });
    continue;
  }
  const comp = countFiles(join(dir, "components"));
  rows.push({
    id,
    category: manifest.category ?? "?",
    kind: manifest.kind ?? "?",
    quality: manifest.qualityScore ?? null,
    status: manifest._status ?? null,
    envKeys: (manifest.envVars ?? []).map((e) => (typeof e === "string" ? e : e.key)),
    deps: Object.keys(manifest.dependencies ?? {}).length
      ? Object.keys(manifest.dependencies)
      : (manifest.dependencies ?? []).map?.((d) => String(d)) ?? [],
    manifestFiles: (manifest.files ?? []).length,
    componentFiles: comp.n,
    componentKb: Math.round(comp.bytes / 1024),
    hasInstructions: existsSync(join(dir, "instructions.md")),
    summary: String(manifest.summary ?? manifest.description ?? "").slice(0, 140),
  });
}

if (DETAIL) {
  const hits = rows.filter((r) => r.id.startsWith(DETAIL));
  for (const hit of hits) {
    console.log(JSON.stringify(hit, null, 2));
    const dir = join(dossierRoot, hit.id);
    console.log("-- files under components/ --");
    const stack = [join(dir, "components")];
    while (stack.length) {
      const cur = stack.pop();
      if (!existsSync(cur)) continue;
      for (const entry of readdirSync(cur, { withFileTypes: true })) {
        const p = join(cur, entry.name);
        if (entry.isDirectory()) stack.push(p);
        else console.log("  " + p.slice(dir.length + 1));
      }
    }
  }
  process.exit(0);
}

if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

// Aggregate per category
const byCat = new Map();
for (const r of rows) {
  const cat = r.category ?? "?";
  if (!byCat.has(cat)) byCat.set(cat, []);
  byCat.get(cat).push(r);
}

console.log(`Legacy root: ${ROOT}`);
console.log(`Total dossiers: ${rows.length}\n`);
for (const [cat, list] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`## ${cat} (${list.length})`);
  for (const r of [...list].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))) {
    const env = r.envKeys?.length ? ` env:${r.envKeys.length}` : "";
    const deps = r.deps?.length ? ` deps:${r.deps.length}` : "";
    console.log(
      `  ${String(r.quality ?? "?").padStart(2)}  ${r.id}  [files:${r.componentFiles} ${r.componentKb}kb${env}${deps}]`,
    );
  }
  console.log("");
}

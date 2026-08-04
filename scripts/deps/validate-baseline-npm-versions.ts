/**
 * Verifies every dependency/devDependency pin in the generated-site export
 * baseline (`config/generated-site-dependencies.json` → `exportBaseline`)
 * resolves on the public npm registry (catches ETARGET / phantom versions).
 *
 * Runtime scaffolds under `gen/scaffolds/` ship no `package.json`; `buildCompleteProject` merges
 * this baseline — so one check covers all scaffold flows for npm install.
 *
 *   npm run baseline-deps:verify
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const CONCURRENCY = 6;

const CATALOG_PATH = "config/generated-site-dependencies.json";

function readExportBaseline(): Record<string, unknown> {
  const file = path.join(process.cwd(), CATALOG_PATH);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
    exportBaseline?: Record<string, unknown>;
  };
  if (!parsed.exportBaseline) {
    throw new Error(`Missing "exportBaseline" in ${CATALOG_PATH}`);
  }
  return parsed.exportBaseline;
}

function readBaselineFromCatalog(): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const baseline = readExportBaseline() as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return {
    dependencies: baseline.dependencies ?? {},
    devDependencies: baseline.devDependencies ?? {},
  };
}

async function npmResolves(pkg: string, range: string): Promise<boolean> {
  const spec = `${pkg}@${range}`;
  try {
    await execFileP("npm", ["view", spec, "version"], {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function poolMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  const baseline = readBaselineFromCatalog();
  const rows: { pkg: string; range: string; section: string }[] = [];
  for (const [pkg, range] of Object.entries(baseline.dependencies)) {
    rows.push({ pkg, range, section: "dependencies" });
  }
  for (const [pkg, range] of Object.entries(baseline.devDependencies)) {
    rows.push({ pkg, range, section: "devDependencies" });
  }

  const results = await poolMap(rows, CONCURRENCY, async (row) => {
    const ok = await npmResolves(row.pkg, row.range);
    return { row, ok };
  });

  const failures = results.filter((r) => !r.ok).map((r) => r.row);

  if (failures.length > 0) {
    console.error(
      "baseline-deps:verify — följande versioner finns inte (eller matchar inte) på npm:\n",
    );
    for (const f of failures) {
      console.error(`  - ${f.section} ${f.pkg}@${f.range}`);
    }
    process.exit(1);
  }

  console.log(
    `baseline-deps:verify — OK (${rows.length} poster i ${CATALOG_PATH} exportBaseline, npm registry).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

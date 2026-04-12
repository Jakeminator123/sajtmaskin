/**
 * Verifies the scaffold baseline `package.json` can be installed without
 * peer-dependency conflicts (ERESOLVE).  Catches bad version combos that
 * `validate-baseline-npm-versions.ts` (registry-only) would miss.
 *
 *   npm run baseline-deps:tree
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

function readBaselinePackageJson(): string {
  const file = path.join(process.cwd(), "src/lib/gen/export/project-scaffold.ts");
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/const PACKAGE_JSON = `([\s\S]*?)`;/);
  if (!m) {
    throw new Error("Could not find PACKAGE_JSON template in project-scaffold.ts");
  }
  return m[1];
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-tree-"));
  const pkgPath = path.join(tmpDir, "package.json");

  try {
    fs.writeFileSync(pkgPath, readBaselinePackageJson(), "utf8");

    await execFileP("npm", [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ], {
      cwd: tmpDir,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120_000,
    });

    console.log(
      "baseline-deps:tree — OK (npm install --package-lock-only --ignore-scripts succeeded, no peer conflicts).",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stdout = (err as { stdout?: string }).stdout ?? "";
    const stderr = (err as { stderr?: string }).stderr ?? "";
    console.error("baseline-deps:tree — FAILED\n");
    if (stderr.includes("ERESOLVE")) {
      console.error("Peer-dependency conflict detected in scaffold baseline:\n");
      console.error(stderr);
    } else {
      console.error(stderr || stdout || msg);
    }
    process.exit(1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

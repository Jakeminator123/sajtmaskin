/**
 * Dossier validator — CI entry point.
 *
 * Runs the canonical AJV validator (src/lib/gen/dossiers/validate-manifest.ts)
 * against every manifest under data/dossiers/{hard,soft}/ and the three
 * cross-dossier invariants:
 *
 *   1. defaultForCapability: true must be unique per capability
 *   2. instructions.md must have all 5 canonical H1 headings
 *   3. every file declared with injectionMode: "verbatim" must exist on disk
 *
 * Exits 1 on any failure. Keep output human-readable — backoffice tails this.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  findDuplicateDefaults,
  findMissingInstructionsHeadingsPartitioned,
  RECOMMENDED_INSTRUCTIONS_HEADINGS,
  REQUIRED_INSTRUCTIONS_HEADINGS,
  validateDossierImportClosure,
  validateDossierManifest,
} from "../../src/lib/gen/dossiers/validate-manifest";
import type { DossierClass, DossierFile } from "../../src/lib/gen/dossiers/types";
import { landingPageManifest } from "../../src/lib/gen/scaffolds/landing-page/manifest";

const ROOT = resolve(process.cwd(), "data", "dossiers");
const CLASSES: readonly DossierClass[] = ["hard", "soft"] as const;
const SCAFFOLD_FILE_SET = new Set(landingPageManifest.files.map((f) => f.path));

interface ValidRow {
  id: string;
  class: DossierClass;
  capability: string;
  defaultForCapability: boolean;
  dir: string;
  files: DossierFile[];
  defaultInjectionMode: "verbatim" | "rewritable";
}

function listDossierDirs(klass: DossierClass): Array<{ id: string; dir: string }> {
  const classRoot = join(ROOT, klass);
  if (!existsSync(classRoot)) return [];
  return readdirSync(classRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => ({ id: d.name, dir: join(classRoot, d.name) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function main(): void {
  const validRows: ValidRow[] = [];
  let schemaFailures = 0;
  let importClosureFailures = 0;

  for (const klass of CLASSES) {
    for (const { id, dir } of listDossierDirs(klass)) {
      const manifestPath = join(dir, "manifest.json");
      if (!existsSync(manifestPath)) {
        console.error(`✗ ${klass}/${id}: manifest.json missing`);
        schemaFailures++;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
      } catch (err) {
        console.error(
          `✗ ${klass}/${id}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
        );
        schemaFailures++;
        continue;
      }
      const result = validateDossierManifest(parsed, { expectedId: id, class: klass });
      if (!result.valid) {
        console.error(`✗ ${klass}/${id}`);
        for (const e of result.errors) console.error(`    ${e}`);
        schemaFailures++;
        continue;
      }
      const closureIssues = validateDossierImportClosure(result.data, dir, SCAFFOLD_FILE_SET);
      if (closureIssues.length > 0) {
        console.error(`✗ ${klass}/${id}: import closure`);
        for (const issue of closureIssues) {
          console.error(
            `    ${issue.dossierFile}: "${issue.missingImport}" (${issue.reason})`,
          );
        }
        importClosureFailures += closureIssues.length;
        // Hoppa över denna dossier helt — den ska inte räknas som "valid"
        // i nedströms cross-cutting-checks (defaults, instructions.md,
        // verbatim) eftersom dess imports inte är slutna.
        continue;
      }
      console.log(`✓ ${klass}/${id}`);
      validRows.push({
        id,
        class: klass,
        capability: result.data.capability,
        defaultForCapability: result.data.defaultForCapability === true,
        dir,
        files: result.data.files ?? [],
        defaultInjectionMode: result.data.codeFidelity,
      });
    }
  }

  console.log("");

  // Cross-cutting 1: defaultForCapability uniqueness
  const defaultErrors = findDuplicateDefaults(validRows);
  if (defaultErrors.length > 0) {
    console.error("✗ defaultForCapability uniqueness");
    for (const e of defaultErrors) console.error(`    ${e}`);
  } else {
    console.log("✓ defaultForCapability uniqueness (each capability has ≤1 default)");
  }

  // Cross-cutting 2: instructions.md rubriker — required (blocker) vs
  // recommended (warning). See validate-manifest.ts for rationale.
  const headingErrors: string[] = [];
  const headingWarnings: string[] = [];
  for (const row of validRows) {
    const instrPath = join(row.dir, "instructions.md");
    if (!existsSync(instrPath)) {
      headingErrors.push(`${row.class}/${row.id}: instructions.md missing`);
      continue;
    }
    const { missingRequired, missingRecommended } = findMissingInstructionsHeadingsPartitioned(
      readFileSync(instrPath, "utf-8"),
    );
    if (missingRequired.length > 0) {
      headingErrors.push(
        `${row.class}/${row.id}: saknar obligatoriska rubriker: ${missingRequired.join(", ")}`,
      );
    }
    if (missingRecommended.length > 0) {
      headingWarnings.push(
        `${row.class}/${row.id}: saknar rekommenderade rubriker: ${missingRecommended.join(", ")}`,
      );
    }
  }
  if (headingErrors.length > 0) {
    console.error(
      `✗ instructions.md rubriker (obligatoriska: ${REQUIRED_INSTRUCTIONS_HEADINGS.join(", ")})`,
    );
    for (const e of headingErrors) console.error(`    ${e}`);
  } else {
    console.log(
      `✓ instructions.md har alla ${REQUIRED_INSTRUCTIONS_HEADINGS.length} obligatoriska H1-rubriker`,
    );
  }
  if (headingWarnings.length > 0) {
    console.warn(
      `⚠ instructions.md saknar rekommenderade rubriker (${RECOMMENDED_INSTRUCTIONS_HEADINGS.join(
        ", ",
      )}) — ej blocker, curator-signal:`,
    );
    for (const w of headingWarnings) console.warn(`    ${w}`);
  }

  // Cross-cutting 3: verbatim files must exist on disk
  const verbatimErrors: string[] = [];
  for (const row of validRows) {
    for (const f of row.files) {
      const effectiveMode = f.injectionMode ?? row.defaultInjectionMode;
      if (effectiveMode !== "verbatim") continue;
      const filePath = join(row.dir, f.path);
      let isFile = false;
      try {
        isFile = statSync(filePath).isFile();
      } catch {
        // missing
      }
      if (!isFile) {
        verbatimErrors.push(
          `${row.class}/${row.id}: verbatim file not found on disk: ${f.path}`,
        );
      }
    }
  }
  if (verbatimErrors.length > 0) {
    console.error("✗ verbatim-filer som saknas på disk");
    for (const e of verbatimErrors) console.error(`    ${e}`);
  } else {
    console.log("✓ alla verbatim-filer finns på disk");
  }

  if (importClosureFailures === 0) {
    console.log("✓ import closure (dossierfiler refererar bara till kända filer/runtime)");
  }

  const totalFailures =
    schemaFailures +
    importClosureFailures +
    defaultErrors.length +
    headingErrors.length +
    verbatimErrors.length;
  if (validRows.length === 0 && totalFailures === 0) {
    console.error("✗ no dossiers found under data/dossiers/{hard,soft}");
    process.exit(1);
  }
  if (totalFailures > 0) {
    console.error(
      `\n${totalFailures} validation error(s) across ${validRows.length} valid + ${schemaFailures} rejected dossier(s).`,
    );
    process.exit(1);
  }
  console.log(
    `\nAll ${validRows.length} dossier(s) across ${CLASSES.length} classes validated successfully.`,
  );
}

main();

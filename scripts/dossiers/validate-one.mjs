#!/usr/bin/env node
/**
 * Backoffice single-manifest validator helper.
 *
 * Called as a subprocess from `backoffice/pages/dossiers.py` so that the
 * Streamlit editor shows the SAME error messages as CI and registry-runtime.
 * Before fas 2·D, backoffice ran a weaker handwritten Python check.
 *
 * Usage:
 *   node scripts/dossiers/validate-one.mjs <manifest-path> <expected-id> <hard|soft>
 *
 * Output (stdout):
 *   JSON: { valid: true, warnings: string[] }
 *        | { valid: false, errors: string[] }
 *
 * Exit code is always 0 — callers parse stdout. (Non-zero exits only on
 * unexpected errors like missing argv, unreadable file, etc.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const [, , manifestPathArg, expectedId, klassArg] = process.argv;
  if (!manifestPathArg || !expectedId || !klassArg) {
    console.error("usage: validate-one.mjs <manifest-path> <expected-id> <hard|soft>");
    process.exit(2);
  }
  if (klassArg !== "hard" && klassArg !== "soft") {
    console.error(`invalid class: ${klassArg} (expected "hard" or "soft")`);
    process.exit(2);
  }

  const abs = resolve(manifestPathArg);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf-8"));
  } catch (err) {
    const out = {
      valid: false,
      errors: [`invalid JSON: ${err instanceof Error ? err.message : String(err)}`],
    };
    process.stdout.write(JSON.stringify(out));
    return;
  }

  // Dynamically import the TS validator through tsx so backoffice doesn't
  // need a compiled dist output. Keeps the code path single-source.
  const validatorUrl = pathToFileURL(
    resolve(process.cwd(), "src/lib/gen/dossiers/validate-manifest.ts"),
  ).href;
  let mod;
  try {
    mod = await import(validatorUrl);
  } catch (err) {
    console.error(
      `failed to load validator: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(3);
  }
  const { validateDossierManifest } = mod;
  const result = validateDossierManifest(parsed, { expectedId, class: klassArg });

  if (result.valid) {
    process.stdout.write(JSON.stringify({ valid: true, warnings: result.warnings ?? [] }));
  } else {
    process.stdout.write(JSON.stringify({ valid: false, errors: result.errors }));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(4);
});

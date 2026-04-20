// Snapshot test for patchNextConfigViaAst (preview-host/src/runtime.js).
// Runs the AST-based next.config patcher against the five canonical shapes
// listed in P24 and verifies that:
//   1. The patch was applied via the AST path (not the regex fallback).
//   2. The patched file contains both SAJTMASKIN_PREVIEW_BASE_PATH and the
//      HotModuleReplacementPlugin webpack-mutator marker.
//   3. The patched output is still parseable as JS/TS-shaped source (no
//      structural corruption around the inserted spread).
//
// Run with: `node scripts/test-patch.mjs` from preview-host/.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { __testing } = require("../src/runtime.js");
const acorn = require("acorn");

const SHAPES = [
  {
    name: "const cfg = {…}",
    file: "next.config.js",
    source: [
      "const cfg = {",
      "  reactStrictMode: true,",
      "};",
      "module.exports = cfg;",
      "",
    ].join("\n"),
  },
  {
    name: "const cfg: NextConfig = {…}",
    file: "next.config.ts",
    source: [
      'import type { NextConfig } from "next";',
      "",
      "const cfg: NextConfig = {",
      "  reactStrictMode: true,",
      "};",
      "",
      "export default cfg;",
      "",
    ].join("\n"),
  },
  {
    name: "module.exports = {…}",
    file: "next.config.js",
    source: [
      "module.exports = {",
      "  reactStrictMode: true,",
      "};",
      "",
    ].join("\n"),
  },
  {
    name: "export default {…}",
    file: "next.config.mjs",
    source: [
      "export default {",
      "  reactStrictMode: true,",
      "};",
      "",
    ].join("\n"),
  },
  {
    name: "export default function() { return {…} }",
    file: "next.config.mjs",
    source: [
      "export default function nextConfigFactory() {",
      "  return {",
      "    reactStrictMode: true,",
      "  };",
      "}",
      "",
    ].join("\n"),
  },
];

let failures = 0;

for (const shape of SHAPES) {
  const dir = mkdtempSync(join(tmpdir(), "preview-host-patch-test-"));
  try {
    const cfgPath = join(dir, shape.file);
    writeFileSync(cfgPath, shape.source, "utf8");

    const result = __testing.patchNextConfigViaAst(dir);
    if (!result.applied) {
      console.error(`FAIL ${shape.name} — AST patcher rejected: ${result.reason}`);
      failures++;
      continue;
    }
    if (result.method !== "ast") {
      console.error(`FAIL ${shape.name} — expected method=ast, got ${result.method}`);
      failures++;
      continue;
    }

    const patched = readFileSync(cfgPath, "utf8");
    if (!patched.includes("SAJTMASKIN_PREVIEW_BASE_PATH")) {
      console.error(`FAIL ${shape.name} — basePath env marker missing from patched file`);
      failures++;
      continue;
    }
    if (!patched.includes("HotModuleReplacementPlugin")) {
      console.error(`FAIL ${shape.name} — HMR mutator marker missing from patched file`);
      failures++;
      continue;
    }

    // Structural sanity: the patched source must still parse as JS (after the
    // same TS-whitespace strip the runtime patcher uses) — catches any
    // unbalanced-brace corruption from a bad insertion point.
    const parseable = shape.file.endsWith(".ts")
      ? __testing.stripTsToWhitespace(patched)
      : patched;
    try {
      acorn.parse(parseable, { sourceType: "module", ecmaVersion: "latest" });
    } catch (err) {
      console.error(
        `FAIL ${shape.name} — patched output no longer parses: ${err instanceof Error ? err.message : err}`,
      );
      failures++;
      continue;
    }

    // Idempotency check: running the patcher again on the patched file must
    // not double-inject — the skip-rule (already_patched) is what protects
    // long-lived workspaces from accumulating duplicate spreads on every boot.
    const second = __testing.patchNextConfigViaAst(dir);
    if (second.applied) {
      console.error(`FAIL ${shape.name} — second patch applied (expected idempotent skip)`);
      failures++;
      continue;
    }

    console.log(`OK   ${shape.name}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\n${failures} shape(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${SHAPES.length} next.config shapes patched cleanly.`);

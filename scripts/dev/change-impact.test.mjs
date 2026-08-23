import assert from "node:assert/strict";
import test from "node:test";
import { analyze } from "./change-impact.mjs";

test("runtime and backoffice changes select both owners and checks", () => {
  const result = analyze(["src/lib/gen/example.ts", "backoffice/pages/example.py"]);
  assert.equal(result.risk, "medium");
  assert.deepEqual(result.owners, ["backoffice", "product"]);
  assert.ok(result.checks.includes("backoffice:test"));
  assert.ok(result.checks.includes("test:ci"));
});

test("protected paths are high risk", () => {
  const result = analyze([".github/workflows/ci.yml"]);
  assert.equal(result.risk, "high");
  assert.deepEqual(result.protectedFiles, [".github/workflows/ci.yml"]);
});

test("package and lockfile changes require the full dependency lane", () => {
  const result = analyze(["package.json", "package-lock.json"]);
  assert.equal(result.risk, "high");
  assert.ok(result.checks.includes("baseline-deps:tree"));
  assert.ok(result.checks.includes("test:ci"));
});

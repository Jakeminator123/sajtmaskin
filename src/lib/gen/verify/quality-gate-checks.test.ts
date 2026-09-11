import { describe, expect, it } from "vitest";

import {
  isAdvisorySafeTypecheckOutput,
  isTypecheckOnlyAdvisory,
  normalizeTypecheckResult,
  stripGeneratedNextTypeDiagnostics,
  typecheckFailsOnlyInGeneratedNextTypes,
} from "./quality-gate-checks";

/**
 * Verbatim prod output (defect signature `9bf13221eb3e`, 6 chats 2026-08/09):
 * the verify lane's `tsc --noEmit` choked on Next's own generated
 * `.next/dev/types/routes.d.ts`. Not user code, impossible on Vercel's fresh
 * `next build` — yet each hit advisory-promoted a clean site as "klar med
 * varningar".
 */
const NEXT_TYPES_NOISE = [
  ".next/dev/types/routes.d.ts(2,23): error TS1005: '(' expected.",
  ".next/dev/types/routes.d.ts(2,35): error TS1005: ',' expected.",
  ".next/dev/types/routes.d.ts(2,62): error TS1005: ';' expected.",
  ".next/dev/types/routes.d.ts(7,16): error TS1005: ',' expected.",
  ".next/dev/types/routes.d.ts(7,18): error TS1005: ',' expected.",
].join("\n");

const USER_SEMANTIC =
  "app/products/page.tsx(244,32): error TS2322: Type 'string | Element' is not assignable to type 'string'.";

const USER_RENDER_RISK =
  "app/page.tsx(2,24): error TS2307: Cannot find module '@/components/hero'.";

describe("stripGeneratedNextTypeDiagnostics", () => {
  it("removes .next/ diagnostics and their indented continuation lines, keeps user lines", () => {
    const output = [
      NEXT_TYPES_NOISE,
      "app/product/[id]/page.tsx(103,24): error TS2322: Type 'Element | \"anchor\"' is not assignable to type 'string'.",
      "  Type 'Element' is not assignable to type 'string'.",
      ".next/types/app/page.ts(4,1): error TS2344: Type 'X' does not satisfy the constraint.",
      "  Types of property 'params' are incompatible.",
      "Found 7 errors.",
    ].join("\n");
    const stripped = stripGeneratedNextTypeDiagnostics(output);
    expect(stripped).not.toContain(".next/");
    expect(stripped).not.toContain("Types of property 'params'");
    expect(stripped).toContain("app/product/[id]/page.tsx(103,24): error TS2322");
    expect(stripped).toContain("  Type 'Element' is not assignable to type 'string'.");
    expect(stripped).toContain("Found 7 errors.");
  });

  it("accepts ./.next/ and Windows separators", () => {
    const output = [
      "./.next/dev/types/routes.d.ts(2,23): error TS1005: '(' expected.",
      ".next\\dev\\types\\routes.d.ts(2,35): error TS1005: ',' expected.",
      USER_SEMANTIC,
    ].join("\n");
    expect(stripGeneratedNextTypeDiagnostics(output)).toBe(USER_SEMANTIC);
  });

  it("is a no-op when there is no .next/ diagnostic", () => {
    expect(stripGeneratedNextTypeDiagnostics(USER_SEMANTIC)).toBe(USER_SEMANTIC);
    expect(stripGeneratedNextTypeDiagnostics("")).toBe("");
  });
});

describe("typecheckFailsOnlyInGeneratedNextTypes", () => {
  it("is true for the verbatim prod noise", () => {
    expect(typecheckFailsOnlyInGeneratedNextTypes(NEXT_TYPES_NOISE)).toBe(true);
  });

  it("is false when any user diagnostic is present, and for empty/unparseable output", () => {
    expect(typecheckFailsOnlyInGeneratedNextTypes(`${NEXT_TYPES_NOISE}\n${USER_SEMANTIC}`)).toBe(false);
    expect(typecheckFailsOnlyInGeneratedNextTypes(USER_SEMANTIC)).toBe(false);
    expect(typecheckFailsOnlyInGeneratedNextTypes("")).toBe(false);
    expect(typecheckFailsOnlyInGeneratedNextTypes("npm exited with a weird error")).toBe(false);
  });
});

describe("normalizeTypecheckResult", () => {
  it("folds a .next/-only typecheck failure into a pass", () => {
    const normalized = normalizeTypecheckResult({
      check: "typecheck",
      passed: false,
      exitCode: 2,
      output: NEXT_TYPES_NOISE,
      repairable: true,
    });
    expect(normalized.passed).toBe(true);
    expect(normalized.exitCode).toBe(0);
    // Original output is preserved for the log row.
    expect(normalized.output).toBe(NEXT_TYPES_NOISE);
    expect(normalized.repairable).toBe(true);
  });

  it("leaves a failure with user diagnostics untouched (full output kept for repair)", () => {
    const input = {
      check: "typecheck",
      passed: false,
      exitCode: 2,
      output: `${NEXT_TYPES_NOISE}\n${USER_SEMANTIC}`,
    };
    expect(normalizeTypecheckResult(input)).toBe(input);
  });

  it("passes through non-typecheck rows and already-passed rows", () => {
    const build = { check: "build", passed: false, exitCode: 1, output: NEXT_TYPES_NOISE };
    expect(normalizeTypecheckResult(build)).toBe(build);
    const passed = { check: "typecheck", passed: true, exitCode: 0, output: "" };
    expect(normalizeTypecheckResult(passed)).toBe(passed);
  });
});

describe("isAdvisorySafeTypecheckOutput with .next/ noise", () => {
  it("ignores .next/ noise when classifying the remaining user diagnostics", () => {
    expect(isAdvisorySafeTypecheckOutput(`${NEXT_TYPES_NOISE}\n${USER_SEMANTIC}`)).toBe(true);
    expect(isAdvisorySafeTypecheckOutput(`${NEXT_TYPES_NOISE}\n${USER_RENDER_RISK}`)).toBe(false);
  });

  it("treats .next/-only output as advisory-safe and stays fail-closed on unparseable output", () => {
    expect(isAdvisorySafeTypecheckOutput(NEXT_TYPES_NOISE)).toBe(true);
    expect(isAdvisorySafeTypecheckOutput("")).toBe(false);
    expect(isAdvisorySafeTypecheckOutput("tsc crashed")).toBe(false);
  });

  it("keeps TS2604 (JSX element type has no construct signatures) advisory-safe: preview renders, publish gate blocks", () => {
    // Runtime takes the string branch / renders a custom element — not a dead
    // preview. The Vercel build risk is owned by the deploy typecheck gate
    // (`resolveDeployTypecheckAdvisoryGate`), not by hard-failing F2.
    expect(
      isAdvisorySafeTypecheckOutput(
        "app/products/page.tsx(244,89): error TS2604: JSX element type 'product.icon' does not have any construct or call signatures.",
      ),
    ).toBe(true);
  });
});

describe("isTypecheckOnlyAdvisory with normalized rows", () => {
  it("is not applicable once .next/-only noise has been normalized into a pass", () => {
    const normalized = normalizeTypecheckResult({
      check: "typecheck",
      passed: false,
      exitCode: 2,
      output: NEXT_TYPES_NOISE,
    });
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: true,
        gatePassed: true,
        buildOriginated: false,
        results: [normalized],
      }),
    ).toBe(false);
  });
});

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

/**
 * Next-generated route validator: wrong PageProps on a dynamic app route.
 * Lives under `.next/types/` but encodes a real app defect (reproduced after
 * #1329: normalizeTypecheckResult flipped this class to passed:true).
 */
const NEXT_ROUTE_PROPS_FAILURE = [
  ".next/types/app/products/[slug]/page.ts(34,13): error TS2344: Type '{ __tag__: \"page\"; __param_type__: { params: { slug: string; }; }; }' does not satisfy the constraint '{ __tag__: \"page\"; __param_type__: PageProps; }'.",
  "  Types of property '__param_type__' are incompatible.",
  "    Type '{ params: { slug: string; }; }' is not assignable to type 'PageProps'.",
].join("\n");

describe("stripGeneratedNextTypeDiagnostics", () => {
  it("removes proven-harmless routes.d.ts TS1005 noise and its continuation, keeps user and route-validator lines", () => {
    const output = [
      NEXT_TYPES_NOISE,
      "app/product/[id]/page.tsx(103,24): error TS2322: Type 'Element | \"anchor\"' is not assignable to type 'string'.",
      "  Type 'Element' is not assignable to type 'string'.",
      NEXT_ROUTE_PROPS_FAILURE,
      "Found 7 errors.",
    ].join("\n");
    const stripped = stripGeneratedNextTypeDiagnostics(output);
    expect(stripped).not.toContain("routes.d.ts");
    expect(stripped).not.toContain("TS1005");
    expect(stripped).toContain("app/product/[id]/page.tsx(103,24): error TS2322");
    expect(stripped).toContain("  Type 'Element' is not assignable to type 'string'.");
    expect(stripped).toContain(".next/types/app/products/[slug]/page.ts");
    expect(stripped).toContain("error TS2344");
    expect(stripped).toContain("  Types of property '__param_type__' are incompatible.");
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

  it("is false for a real Next-route/props diagnostic under .next/types", () => {
    expect(typecheckFailsOnlyInGeneratedNextTypes(NEXT_ROUTE_PROPS_FAILURE)).toBe(false);
    expect(typecheckFailsOnlyInGeneratedNextTypes(`${NEXT_TYPES_NOISE}\n${NEXT_ROUTE_PROPS_FAILURE}`)).toBe(false);
  });
});

describe("normalizeTypecheckResult", () => {
  it("folds proven-harmless routes.d.ts TS1005 noise into a pass", () => {
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

  it("keeps a real Next-route/props diagnostic under .next/types as a failure", () => {
    const input = {
      check: "typecheck" as const,
      passed: false,
      exitCode: 2,
      output: NEXT_ROUTE_PROPS_FAILURE,
    };
    expect(normalizeTypecheckResult(input)).toBe(input);
    expect(
      normalizeTypecheckResult({
        check: "typecheck",
        passed: false,
        exitCode: 2,
        output: `${NEXT_TYPES_NOISE}\n${NEXT_ROUTE_PROPS_FAILURE}`,
      }).passed,
    ).toBe(false);
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

  it("treats proven-harmless routes.d.ts-only output as advisory-safe and stays fail-closed on unparseable output", () => {
    expect(isAdvisorySafeTypecheckOutput(NEXT_TYPES_NOISE)).toBe(true);
    expect(isAdvisorySafeTypecheckOutput("")).toBe(false);
    expect(isAdvisorySafeTypecheckOutput("tsc crashed")).toBe(false);
  });

  it("classifies a .next/types route-validator TS2344 as remaining user-facing diagnostics", () => {
    expect(isAdvisorySafeTypecheckOutput(NEXT_ROUTE_PROPS_FAILURE)).toBe(true);
    expect(isAdvisorySafeTypecheckOutput(`${NEXT_TYPES_NOISE}\n${NEXT_ROUTE_PROPS_FAILURE}`)).toBe(true);
    expect(isAdvisorySafeTypecheckOutput(`${NEXT_ROUTE_PROPS_FAILURE}\n${USER_RENDER_RISK}`)).toBe(false);
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

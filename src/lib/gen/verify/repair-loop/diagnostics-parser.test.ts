import { describe, expect, it } from "vitest";
import {
  buildStructuredOriginDiagnostics,
  collapseCascadeDiagnostics,
} from "./diagnostics-parser";

const CASCADE_MESSAGE =
  "Type 'Control<ContactFormValues, any, TFieldValues>' is not assignable to type 'Control<ContactFormValues, any, ContactFormValues>'.";

/**
 * Minimized from prod chat fc0f053b (2026-08-11): one Zod 3 `errorMap` on
 * line 76 produced the identical TS2322 message at many lines, plus one
 * independent error in app/api/contact/route.ts. `next build` re-runs tsc, so
 * the build check repeats the same lines.
 */
const TSC_OUTPUT = [
  "app/api/contact/route.ts(143,12): error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
  "components/contact-form.tsx(76,20): error TS2769: No overload matches this call.",
  `components/contact-form.tsx(196,15): error TS2322: ${CASCADE_MESSAGE}`,
  `components/contact-form.tsx(210,15): error TS2322: ${CASCADE_MESSAGE}`,
  `components/contact-form.tsx(238,15): error TS2322: ${CASCADE_MESSAGE}`,
  `components/contact-form.tsx(252,15): error TS2322: ${CASCADE_MESSAGE}`,
  `components/contact-form.tsx(277,15): error TS2322: ${CASCADE_MESSAGE}`,
  `components/contact-form.tsx(292,13): error TS2322: ${CASCADE_MESSAGE}`,
  `components/contact-form.tsx(312,13): error TS2322: ${CASCADE_MESSAGE}`,
].join("\n");

describe("buildStructuredOriginDiagnostics cascade collapse", () => {
  it("collapses identical (file, code, message) repeats into the first occurrence", () => {
    const lines = buildStructuredOriginDiagnostics([
      { check: "typecheck", exitCode: 2, output: TSC_OUTPUT },
    ]);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("app/api/contact/route.ts:143:12");
    expect(lines[1]).toContain("components/contact-form.tsx:76:20 error TS2769");
    expect(lines[2]).toContain("components/contact-form.tsx:196:15 error TS2322");
    expect(lines[2]).toContain("repeats at lines 210, 238, 252, 277, 292, 312");
    expect(lines[2]).toContain("cascade");
  });

  it("flattens the typecheck/build overlap (build re-runs tsc)", () => {
    const lines = buildStructuredOriginDiagnostics([
      { check: "typecheck", exitCode: 2, output: TSC_OUTPUT },
      {
        check: "build",
        exitCode: 1,
        output:
          "app/api/contact/route.ts(143,12): error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
      },
    ]);

    const routeLines = lines.filter((line) => line.includes("app/api/contact/route.ts"));
    expect(routeLines).toHaveLength(1);
    // A same-line duplicate is not a cascade — no repeat note.
    expect(routeLines[0]).not.toContain("repeats");
  });

  it("caps the listed repeat locations", () => {
    const many = Array.from(
      { length: 10 },
      (_unused, i) => `components/big.tsx(${100 + i},1): error TS2322: Same message.`,
    ).join("\n");
    const lines = buildStructuredOriginDiagnostics([
      { check: "typecheck", exitCode: 2, output: many },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("101, 102, 103, 104, 105, 106, …");
  });

  it("never merges distinct messages or distinct files", () => {
    const lines = collapseCascadeDiagnostics([
      "a.tsx:1:1 error TS2322: Message one.",
      "a.tsx:2:1 error TS2322: Message two.",
      "b.tsx:1:1 error TS2322: Message one.",
      "not a tsc line at all",
    ]);
    expect(lines).toHaveLength(4);
    expect(lines.every((line) => !line.includes("repeats"))).toBe(true);
  });
});

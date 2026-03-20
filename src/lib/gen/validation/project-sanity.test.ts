import { describe, expect, it } from "vitest";

import { runProjectSanityChecks } from "./project-sanity";

describe("runProjectSanityChecks", () => {
  it("flags named import mismatches against default-only local modules", () => {
    const result = runProjectSanityChecks([
      {
        path: "app/page.tsx",
        language: "tsx",
        content: [
          'import { SectionHeading } from "@/components/section-heading";',
          "",
          "export default function Page() {",
          "  return <SectionHeading />;",
          "}",
        ].join("\n"),
      },
      {
        path: "components/section-heading.tsx",
        language: "tsx",
        content: [
          "export default function SectionHeading() {",
          "  return <h2>Hej</h2>;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "app/page.tsx",
          severity: "error",
          message: expect.stringContaining("target only exposes a default export"),
        }),
      ]),
    );
  });

  it("allows matching named exports", () => {
    const result = runProjectSanityChecks([
      {
        path: "app/page.tsx",
        language: "tsx",
        content: [
          'import { SectionHeading } from "@/components/section-heading";',
          "",
          "export default function Page() {",
          "  return <SectionHeading />;",
          "}",
        ].join("\n"),
      },
      {
        path: "components/section-heading.tsx",
        language: "tsx",
        content: [
          "export function SectionHeading() {",
          "  return <h2>Hej</h2>;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(
      result.issues.some((issue) => issue.message.includes("SectionHeading")),
    ).toBe(false);
  });
});

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

  it("flags package.json with missing scripts", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({ name: "test", dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" } }),
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "package.json",
          severity: "error",
          message: expect.stringContaining("missing required scripts"),
        }),
      ]),
    );
  });

  it("flags package.json with missing core dependencies", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({ scripts: { dev: "next dev", build: "next build" }, dependencies: {} }),
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "package.json",
          severity: "error",
          message: expect.stringContaining("missing core dependency: next"),
        }),
      ]),
    );
  });

  it("accepts a valid package.json", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          scripts: { dev: "next dev", build: "next build" },
          dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" },
        }),
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: 'export default function Page() { return <div>Hello</div>; }',
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: 'export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
      },
    ]);

    const pkgIssues = result.issues.filter((i) => i.file === "package.json");
    expect(pkgIssues.length).toBe(0);
  });

  it("warns when external imports are missing from package.json", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          scripts: { dev: "next dev", build: "next build" },
          dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: [
          'import { Analytics } from "@vercel/analytics/next";',
          'export default function Layout({ children }: { children: React.ReactNode }) {',
          "  return <html><body><Analytics />{children}</body></html>;",
          "}",
        ].join("\n"),
      },
    ]);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "package.json",
          severity: "warning",
          message: expect.stringContaining("@vercel/analytics"),
        }),
      ]),
    );
  });

  it("does not warn when external imports are present in package.json", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          scripts: { dev: "next dev", build: "next build" },
          dependencies: {
            next: "^16.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            "@vercel/analytics": "^1",
          },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: [
          'import { Analytics } from "@vercel/analytics/next";',
          'export default function Layout({ children }: { children: React.ReactNode }) {',
          "  return <html><body><Analytics />{children}</body></html>;",
          "}",
        ].join("\n"),
      },
    ]);

    const depWarnings = result.issues.filter(
      (i) => i.file === "package.json" && i.message.includes("@vercel/analytics"),
    );
    expect(depWarnings).toHaveLength(0);
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

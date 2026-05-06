import { afterEach, describe, expect, it } from "vitest";
import { runProjectSanityChecks } from "./project-sanity";
import type { CodeFile } from "@/lib/gen/parser";

describe("runProjectSanityChecks", () => {
  afterEach(() => {
    delete process.env.SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS;
  });

  it("treats runtime-provided imports as resolved", () => {
    const files: CodeFile[] = [
      {
        path: "components/ui/sidebar.tsx",
        language: "tsx",
        content: [
          '"use client";',
          'import { useIsMobile } from "@/lib/hooks/use-mobile";',
          "export function Sidebar() {",
          "  const mobile = useIsMobile();",
          "  return <aside data-mobile={mobile} />;",
          "}",
        ].join("\n"),
      },
      { path: "package.json", language: "json", content: '{"dependencies":{}}' },
    ];
    const result = runProjectSanityChecks(files);
    expect(result.issues.filter((issue) => issue.message.includes("use-mobile"))).toEqual([]);
  });

  it("flags files that look like partial repair snippets", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: {
            next: "16.2.3",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
          devDependencies: {
            typescript: "5.8.3",
          },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "components/trailer-dialog.tsx",
        language: "tsx",
        content: `import {
import { Button } from "@/components/ui/button"
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";`,
      },
    ]);

    expect(result.valid).toBe(false);
    const issue = result.issues.find((entry) => entry.file === "components/trailer-dialog.tsx");
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/partial repair snippet|overlapping import statements|nested import/i);
  });

  it("treats unresolved local imports as errors by default", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          'import Missing from "@/components/missing";\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);
    const issue = result.issues.find((entry) => entry.message.includes("Unresolved local import"));
    expect(issue?.severity).toBe("error");
    expect(result.valid).toBe(false);
  });

  it("flags generated DialogContent without DialogTitle", () => {
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: [
          'import { Dialog, DialogContent } from "@/components/ui/dialog";',
          "export default function Page() {",
          "  return <Dialog><DialogContent>Body only</DialogContent></Dialog>;",
          "}",
        ].join("\n"),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("missing DialogTitle"))).toBe(true);
  });

  it("allows warning severity for unresolved imports behind env flag", () => {
    process.env.SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS = "true";
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          'import Missing from "@/components/missing";\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }',
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);
    const issue = result.issues.find((entry) => entry.message.includes("Unresolved local import"));
    expect(issue?.severity).toBe("warning");
  });

  it("errors when package.json is missing", () => {
    const result = runProjectSanityChecks([
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
    ]);
    const issue = result.issues.find((entry) => entry.file === "package.json");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toMatch(/package\.json is missing/i);
    expect(result.valid).toBe(false);
  });

  it("flags a leading bare `ts` token as a leaked Markdown code-fence", () => {
    // Real repro from `Ny mapp (2)`: an LLM "fix" round wrote the language
    // tag from a Markdown ```ts fence as the first line of the file, which
    // the runtime evaluated as `ReferenceError: ts is not defined` on first
    // boot. Block at preflight so this never reaches the preview host.
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "hooks/use-reduced-motion.tsx",
        language: "tsx",
        content: [
          "ts",
          'import { useReducedMotion as useFramerReducedMotion } from "framer-motion";',
          "",
          "export function useReducedMotion() {",
          "  return useFramerReducedMotion();",
          "}",
        ].join("\n"),
      },
    ]);
    const fenceIssue = result.issues.find((entry) =>
      entry.message.includes("ReferenceError: ts is not defined"),
    );
    expect(fenceIssue?.severity).toBe("error");
    expect(fenceIssue?.file).toBe("hooks/use-reduced-motion.tsx");
    expect(result.valid).toBe(false);
  });

  it("errors on duplicate module stems with different source extensions", () => {
    // Bundler resolution is non-deterministic when both `.ts` and `.tsx`
    // exist for the same import specifier — the loser becomes silent dead
    // weight and the winner may be a stale stub. Block at preflight.
    const result = runProjectSanityChecks([
      {
        path: "package.json",
        language: "json",
        content: JSON.stringify({
          name: "test-project",
          private: true,
          dependencies: { next: "16.2.3", react: "19.2.4", "react-dom": "19.2.4" },
        }),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: "@theme inline { --color-background: black; }",
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
      },
      {
        path: "hooks/use-reduced-motion.ts",
        language: "ts",
        content: '"use client";\nexport function useReducedMotion(): boolean { return false; }',
      },
      {
        path: "hooks/use-reduced-motion.tsx",
        language: "tsx",
        content:
          '"use client";\nimport { useReducedMotion as useFramerReducedMotion } from "framer-motion";\nexport function useReducedMotion() { return useFramerReducedMotion(); }',
      },
    ]);
    const collisionIssues = result.issues.filter((entry) =>
      entry.message.includes("Duplicate module sources"),
    );
    expect(collisionIssues.length).toBeGreaterThanOrEqual(2);
    expect(collisionIssues.every((issue) => issue.severity === "error")).toBe(true);
    expect(
      collisionIssues.some((issue) => issue.file === "hooks/use-reduced-motion.ts"),
    ).toBe(true);
    expect(
      collisionIssues.some((issue) => issue.file === "hooks/use-reduced-motion.tsx"),
    ).toBe(true);
    expect(result.valid).toBe(false);
  });
});

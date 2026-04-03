import { describe, expect, it } from "vitest";
import type { CodeFile } from "../parser";
import {
  checkNoBracketPlaceholders,
  checkProjectSanity,
  checkTier2Readiness,
} from "./checks";

describe("checkProjectSanity", () => {
  it("passes for a minimal valid App Router project", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            next: "16.2.1",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
        }),
        language: "json",
      },
      {
        path: "app/layout.tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      },
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <main>Hello</main>; }",
        language: "tsx",
      },
      {
        path: "app/globals.css",
        content: "@theme inline { --color-background: 0 0% 100%; }",
        language: "css",
      },
    ];

    const result = checkProjectSanity(files);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when code imports an unpinned third-party package", () => {
    const files: CodeFile[] = [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: {
            next: "16.2.1",
            react: "19.2.4",
            "react-dom": "19.2.4",
          },
        }),
        language: "json",
      },
      {
        path: "app/layout.tsx",
        content: "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }",
        language: "tsx",
      },
      {
        path: "app/page.tsx",
        content:
          'import confetti from "canvas-confetti"; export default function Page() { return <button onClick={() => confetti()}>Celebrate</button>; }',
        language: "tsx",
      },
      {
        path: "app/globals.css",
        content: "@theme inline { --color-background: 0 0% 100%; }",
        language: "css",
      },
    ];

    const result = checkProjectSanity(files);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.message).toContain("canvas-confetti");
  });
});

describe("checkNoBracketPlaceholders", () => {
  it("passes when no known bracket placeholders remain", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <main>Acme Partners</main>; }",
        language: "tsx",
      },
    ];

    const result = checkNoBracketPlaceholders(files);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when known bracket placeholders remain in content", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return <main>[Company Name]</main>; }",
        language: "tsx",
      },
    ];

    const result = checkNoBracketPlaceholders(files);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("bracket placeholder");
  });
});

describe("checkTier2Readiness", () => {
  it("passes when tier-2 can start even if only warnings remain", () => {
    const result = checkTier2Readiness({
      sandbox: {
        canStartSandbox: true,
        blockingCategories: [],
      },
      previewBlockingReason: null,
      preflightIssues: [
        {
          file: "next-env.d.ts",
          severity: "warning",
          message: "Missing next-env.d.ts with TypeScript sources",
          category: "non_blocking_quality_warning",
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.message).toContain("non-blocking");
  });

  it("fails when preflight blocks tier-2 startup", () => {
    const result = checkTier2Readiness({
      sandbox: {
        canStartSandbox: false,
        blockingCategories: ["dependency_install_failure"],
      },
      previewBlockingReason: null,
      preflightIssues: [
        {
          file: "package.json",
          severity: "error",
          message: "Missing `next` in dependencies",
          category: "dependency_install_failure",
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain("Missing `next`");
    expect(result.message).toContain("dependency_install_failure");
  });
});

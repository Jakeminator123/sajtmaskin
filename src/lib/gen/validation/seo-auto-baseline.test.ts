import { describe, expect, it } from "vitest";
import { applyCriticalSeoBaseline } from "./seo-auto-baseline";

describe("applyCriticalSeoBaseline", () => {
  it("injects metadata when layout exists without export", () => {
    const { files, fixes } = applyCriticalSeoBaseline([
      {
        path: "app/layout.tsx",
        content: `import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
`,
        language: "tsx",
      },
    ]);
    expect(fixes.length).toBe(1);
    const layout = files.find((f) => f.path === "app/layout.tsx");
    expect(layout?.content).toContain("export const metadata");
    expect(layout?.content).toContain("title:");
    expect(layout?.content).toContain("description:");
  });

  it("adds title when metadata exists without title field", () => {
    const { files, fixes } = applyCriticalSeoBaseline([
      {
        path: "src/app/layout.tsx",
        content: `import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "Only desc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
        language: "tsx",
      },
    ]);
    expect(fixes.length).toBe(1);
    const layout = files.find((f) => f.path === "src/app/layout.tsx");
    expect(layout?.content).toMatch(/title:\s*"Webbplats"/);
  });

  it("creates root layout when missing", () => {
    const { files, fixes } = applyCriticalSeoBaseline([
      { path: "app/page.tsx", content: `export default function Page() { return null; }`, language: "tsx" },
      { path: "app/globals.css", content: "body {}", language: "css" },
    ]);
    expect(fixes.length).toBe(1);
    const layout = files.find((f) => f.path === "app/layout.tsx");
    expect(layout?.content).toContain("export const metadata");
    expect(layout?.content).toContain('import "./globals.css"');
  });

  it("does not modify client root layouts", () => {
    const { fixes } = applyCriticalSeoBaseline([
      {
        path: "app/layout.tsx",
        content: `"use client";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
        language: "tsx",
      },
    ]);
    expect(fixes.length).toBe(0);
  });
});

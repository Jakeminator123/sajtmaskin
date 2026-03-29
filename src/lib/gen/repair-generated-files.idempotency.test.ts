import { describe, expect, it } from "vitest";
import { repairGeneratedFiles } from "./repair-generated-files";
import type { CodeFile } from "./parser";

function stableStringify(files: CodeFile[]): string {
  return JSON.stringify(
    files.map((f) => ({ path: f.path, content: f.content, language: f.language })),
  );
}

describe("repairGeneratedFiles idempotency", () => {
  const fixtures: CodeFile[] = [
    {
      path: "app/page.tsx",
      language: "tsx",
      content: `"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

export default function Page() {
  const [open, setOpen] = useState(false);
  return (
    <Link href="/about" onClick={() => setOpen(!open)}>
      <Menu className="w-4 h-4" />
    </Link>
  );
}
`,
    },
    {
      path: "app/layout.tsx",
      language: "tsx",
      content: `import type { Metadata } from "next";

export const metadata: Metadata = { title: "X" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "README.md",
      language: "markdown",
      content: "# noop",
    },
    {
      path: "lib/store-data.tsx",
      language: "tsx",
      content: `export const siteConfig = { shortName: "Nordrost", name: "Nordrost Kafferosteri" };`,
    },
    {
      path: "components/site-header.tsx",
      language: "tsx",
      content: `"use client";
export function SiteHeader() {
  return <div>{siteConfig.shortName}</div>;
}
`,
    },
  ];

  it("second pass produces identical file contents as first pass", () => {
    const once = repairGeneratedFiles(fixtures);
    const twice = repairGeneratedFiles(once.files);
    expect(stableStringify(twice.files)).toBe(stableStringify(once.files));
    expect(twice.fixes.length).toBe(0);
  });

  it("adds missing local shared symbol imports during repair", () => {
    const repaired = repairGeneratedFiles(fixtures);
    const header = repaired.files.find((file) => file.path === "components/site-header.tsx");
    expect(header?.content).toContain('import { siteConfig } from "@/lib/store-data";');
  });

  it("rewires local default imports to named imports for scaffold components", () => {
    const repaired = repairGeneratedFiles([
      {
        path: "components/site-footer.tsx",
        language: "tsx",
        content: `export function SiteFooter() { return <footer>Hej</footer>; }`,
      },
      {
        path: "app/layout.tsx",
        language: "tsx",
        content: `import SiteFooter from "@/components/site-footer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
`,
      },
    ]);

    const layout = repaired.files.find((file) => file.path === "app/layout.tsx");
    expect(layout?.content).toContain('import { SiteFooter } from "@/components/site-footer";');
  });
});

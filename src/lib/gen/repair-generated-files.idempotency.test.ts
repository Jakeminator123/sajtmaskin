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
  ];

  it("second pass produces identical file contents as first pass", () => {
    const once = repairGeneratedFiles(fixtures);
    const twice = repairGeneratedFiles(once.files);
    expect(stableStringify(twice.files)).toBe(stableStringify(once.files));
    expect(twice.fixes.length).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { repairGeneratedFiles } from "./repair-generated-files";
import type { CodeFile } from "../parser";

/**
 * Regression for the downloaded-zip incident (fintech-i-tv-spel):
 *   app/page.tsx renders <Badge>, <Button> and <Link> WITHOUT importing them →
 *   `ReferenceError: Badge is not defined` at runtime, and app/tjanster/page.tsx
 *   renders <Reveal> (a LOCAL component) without importing it.
 *
 * `repairGeneratedFiles` is the canonical post-merge repair every export /
 * download / preview / verify surface runs (see build-exportable-project.ts),
 * so it MUST add:
 *   - shadcn components  → import { Badge|Button } from "@/components/ui/<file>"
 *   - next built-ins     → import Link from "next/link"
 *   - local components   → import { Reveal } from "@/components/reveal"
 */
describe("repairGeneratedFiles — missing component imports (downloaded-zip fix)", () => {
  it("adds shadcn + next/link + local-component imports for the home page", () => {
    const files: CodeFile[] = [
      {
        path: "components/reveal.tsx",
        language: "tsx",
        content: `"use client";
export function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
`,
      },
      {
        path: "app/page.tsx",
        language: "tsx",
        content: `import { Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      <div>
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Fintech-infrastruktur f\u00f6r gaming
        </Badge>
        <h1 className="mt-6">Rubrik</h1>
        <Button asChild>
          <Link href="/tjanster">Kom ig\u00e5ng</Link>
        </Button>
      </div>
    </main>
  );
}
`,
      },
      {
        path: "app/tjanster/page.tsx",
        language: "tsx",
        content: `export default function TjansterPage() {
  return (
    <main>
      <Reveal>
        <h1>Tj\u00e4nster</h1>
      </Reveal>
    </main>
  );
}
`,
      },
    ];

    const repaired = repairGeneratedFiles(files);
    const page = repaired.files.find((f) => f.path === "app/page.tsx");
    const tjanster = repaired.files.find((f) => f.path === "app/tjanster/page.tsx");

    expect(page?.content).toContain('import { Badge } from "@/components/ui/badge"');
    expect(page?.content).toContain('import { Button } from "@/components/ui/button"');
    expect(page?.content).toContain('import Link from "next/link"');
    // Local component: must be a NAMED import that matches the real export shape
    // (`export function Reveal`), not a default import or a phantom path.
    expect(tjanster?.content).toContain('import { Reveal } from "@/components/reveal"');
    expect(tjanster?.content).not.toContain('@/components/link');
    expect(tjanster?.content).not.toContain('import Reveal from');
  });

  it("is idempotent: a second repair pass adds nothing and reports no fixes", () => {
    const files: CodeFile[] = [
      {
        path: "components/reveal.tsx",
        language: "tsx",
        content: `"use client";
export function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
`,
      },
      {
        path: "app/tjanster/page.tsx",
        language: "tsx",
        content: `export default function TjansterPage() {
  return (
    <main>
      <Reveal>
        <h1>Tj\u00e4nster</h1>
      </Reveal>
    </main>
  );
}
`,
      },
    ];

    const once = repairGeneratedFiles(files);
    const twice = repairGeneratedFiles(once.files);

    const onceTjanster = once.files.find((f) => f.path === "app/tjanster/page.tsx")?.content;
    const twiceTjanster = twice.files.find((f) => f.path === "app/tjanster/page.tsx")?.content;

    expect(onceTjanster).toContain('import { Reveal } from "@/components/reveal"');
    expect(twiceTjanster).toBe(onceTjanster);
    expect(twice.fixes.length).toBe(0);
  });
});

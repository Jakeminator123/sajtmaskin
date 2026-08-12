import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { rebuildContent } from "./pipeline";

const STUB = "export default function Stub() { return null; }";
const FIXED = "export default function Stub() { return <div>fixed</div>; }";

describe("rebuildContent", () => {
  it("does not replace an earlier identical file when the target fence misses the path-aware regex", () => {
    const originalContent = [
      '```tsx file="components/a.tsx"',
      STUB,
      "```",
      "",
      "```tsx file='components/b.tsx'",
      STUB,
      "```",
    ].join("\n");

    const originalFiles: CodeFile[] = [
      { path: "components/a.tsx", content: STUB, language: "tsx" },
      { path: "components/b.tsx", content: STUB, language: "tsx" },
    ];
    const fixedFiles: CodeFile[] = [
      { path: "components/a.tsx", content: STUB, language: "tsx" },
      { path: "components/b.tsx", content: FIXED, language: "tsx" },
    ];

    const result = rebuildContent(originalContent, originalFiles, fixedFiles);

    const aBlock = result.match(/```tsx file="components\/a\.tsx"\n([\s\S]*?)\n```/);
    expect(aBlock?.[1]).toBe(STUB);

    // The trade-off this fix accepts: an unmatched fence means b keeps its
    // original content instead of the fix landing in the wrong file.
    expect(result).not.toContain(FIXED);
  });

  it("replaces the matching fence when two files share identical content", () => {
    const originalContent = [
      '```tsx file="components/a.tsx"',
      STUB,
      "```",
      "",
      '```tsx file="components/b.tsx"',
      STUB,
      "```",
    ].join("\n");

    const originalFiles: CodeFile[] = [
      { path: "components/a.tsx", content: STUB, language: "tsx" },
      { path: "components/b.tsx", content: STUB, language: "tsx" },
    ];
    const fixedFiles: CodeFile[] = [
      { path: "components/a.tsx", content: STUB, language: "tsx" },
      { path: "components/b.tsx", content: FIXED, language: "tsx" },
    ];

    const result = rebuildContent(originalContent, originalFiles, fixedFiles);

    const aBlock = result.match(/```tsx file="components\/a\.tsx"\n([\s\S]*?)\n```/);
    const bBlock = result.match(/```tsx file="components\/b\.tsx"\n([\s\S]*?)\n```/);
    expect(aBlock?.[1]).toBe(STUB);
    expect(bBlock?.[1]).toBe(FIXED);
  });
});

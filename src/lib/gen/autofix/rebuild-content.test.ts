import { describe, expect, it } from "vitest";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { rebuildContent } from "./pipeline";

const STUB = "export default function Stub() { return null; }";
const FIXED = "export default function Stub() { return <div>fixed</div>; }";

describe("rebuildContent", () => {
  it("preserves literal dollar replacement tokens in a changed file", () => {
    const body = 'export default function Page() { return <button>Pay $100 $$ $& $1 $3</button>; }';
    const content = `\`\`\`tsx file="app/page.tsx"\n${body}\n\`\`\``;
    const original = parseCodeProject(content).files;
    const fixed = original.map((file) => ({ ...file, content: `"use client";\n${file.content}` }));

    const result = rebuildContent(content, original, fixed);

    expect(parseCodeProject(result).files).toEqual(fixed);
    expect(result.match(/```tsx/g)).toHaveLength(1);
  });

  it("rebuilds the original fence after its absolute-looking path is normalized", () => {
    const content = `\`\`\`tsx file="/app/page.tsx"\n${STUB}\n\`\`\``;
    const original = parseCodeProject(content).files;
    expect(original[0].path).toBe("app/page.tsx");
    const fixed = [{ ...original[0], content: FIXED }];

    expect(parseCodeProject(rebuildContent(content, original, fixed)).files).toEqual(fixed);
  });

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

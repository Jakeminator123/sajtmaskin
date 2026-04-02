import { describe, expect, it } from "vitest";
import {
  extractCodeProjectSubsetForPaths,
  pickUnscopedPolishPaths,
  scorePathForPolishHeuristic,
} from "./verifier-pass";
import type { CodeFile } from "./parser";

describe("verifier-pass helpers", () => {
  it("scores marketing paths higher than random modules", () => {
    expect(scorePathForPolishHeuristic("app/page.tsx")).toBeGreaterThan(
      scorePathForPolishHeuristic("lib/utils.ts"),
    );
  });

  it("extractCodeProjectSubsetForPaths keeps only matching fences", () => {
    const full = [
      '```tsx file="app/page.tsx"',
      "export default function Page() { return null }",
      "```",
      "",
      '```tsx file="lib/x.ts"',
      "export const x = 1",
      "```",
    ].join("\n");
    const sub = extractCodeProjectSubsetForPaths(full, ["app/page.tsx"]);
    expect(sub).toContain("app/page.tsx");
    expect(sub).not.toContain("lib/x.ts");
  });

  it("pickUnscopedPolishPaths respects max count", () => {
    const files: CodeFile[] = [
      { path: "lib/a.ts", content: "a", language: "ts" },
      { path: "app/page.tsx", content: "p", language: "tsx" },
      { path: "app/layout.tsx", content: "l", language: "tsx" },
    ];
    const picked = pickUnscopedPolishPaths(files, 2);
    expect(picked).toHaveLength(2);
    expect(picked).toContain("app/page.tsx");
  });
});

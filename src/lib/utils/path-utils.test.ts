import { describe, expect, it } from "vitest";
import { hasTraversalSegment, sanitizeProjectPath } from "./path-utils";

describe("hasTraversalSegment", () => {
  it("flags real traversal segments", () => {
    expect(hasTraversalSegment("../etc/passwd")).toBe(true);
    expect(hasTraversalSegment("app/../secret.ts")).toBe(true);
    expect(hasTraversalSegment("app/./page.tsx")).toBe(true);
    expect(hasTraversalSegment("..")).toBe(true);
  });

  it("does NOT flag catch-all route directories (Codex P1 on PR #396)", () => {
    expect(hasTraversalSegment("app/docs/[...slug]/page.tsx")).toBe(false);
    expect(hasTraversalSegment("app/docs/[[...slug]]/page.tsx")).toBe(false);
    expect(hasTraversalSegment("app/blog/[slug]/page.tsx")).toBe(false);
  });
});

describe("sanitizeProjectPath", () => {
  it("keeps normal and dynamic-route paths", () => {
    expect(sanitizeProjectPath("src/app/page.tsx")).toBe("src/app/page.tsx");
    expect(sanitizeProjectPath("app/blog/[slug]/page.tsx")).toBe("app/blog/[slug]/page.tsx");
    // ZIP export / download previously DROPPED catch-all files via the
    // substring `..` check — they must survive now.
    expect(sanitizeProjectPath("app/docs/[...slug]/page.tsx")).toBe(
      "app/docs/[...slug]/page.tsx",
    );
  });

  it("still rejects traversal and absolute paths", () => {
    expect(sanitizeProjectPath("/etc/passwd")).toBe("etc/passwd");
    expect(sanitizeProjectPath("../../../etc/passwd")).toBeNull();
    expect(sanitizeProjectPath("src/../../../etc/passwd")).toBeNull();
    expect(sanitizeProjectPath("C:/windows/system32")).toBeNull();
    expect(sanitizeProjectPath("a\u0000b")).toBeNull();
  });

  it("normalizes redundant separators without harming route segments", () => {
    expect(sanitizeProjectPath("app//blog//[slug]/page.tsx")).toBe(
      "app/blog/[slug]/page.tsx",
    );
  });
});

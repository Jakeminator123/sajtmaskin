import { describe, expect, it } from "vitest";
import { validateFilePath, sanitizeFilePath } from "./path-validator";
import { parseCodeProject } from "../parser";
import { loadScaffoldFiles } from "../scaffolds/load-scaffold-files";

// Prod chat 7826fcda (blog scaffold): the old charset rejected Next.js route
// convention characters, and sanitizeFilePath then silently stripped the
// brackets — `app/blog/[slug]/page.tsx` became `app/blog/slug/page.tsx`, so
// every article link 404:ed while the version was promoted green.
describe("validateFilePath — Next.js route conventions", () => {
  it.each([
    "app/blog/[slug]/page.tsx",
    "app/product/[id]/page.tsx",
    "app/docs/[...slug]/page.tsx",
    "app/docs/[[...slug]]/page.tsx",
    "app/(marketing)/page.tsx",
    "app/@modal/default.tsx",
    "app/blog/[slug]/opengraph-image.tsx",
  ])("accepts dynamic route path %s", (path) => {
    expect(validateFilePath(path)).toEqual({ valid: true });
  });

  it.each([
    "app/page.tsx",
    "components/site-header.tsx",
    "lib/utils.ts",
    "public/media/hero.jpg",
  ])("still accepts plain path %s", (path) => {
    expect(validateFilePath(path)).toEqual({ valid: true });
  });

  it.each([
    "../etc/passwd",
    "app/../../etc/passwd",
    "app/../secret.ts",
    "app/./page.tsx",
    "..",
  ])("still rejects traversal path %s", (path) => {
    expect(validateFilePath(path).valid).toBe(false);
  });

  it("does NOT treat a catch-all segment as traversal", () => {
    // `[...slug]` contains the substring ".." (three dots) — the old
    // substring-based check would have rejected it as traversal.
    expect(validateFilePath("app/docs/[...slug]/page.tsx").valid).toBe(true);
  });

  it.each([
    "app/node_modules/x.ts",
    "app/.env",
    "app/.git/config",
    "app/.next/cache.ts",
  ])("still rejects blocked segment path %s", (path) => {
    expect(validateFilePath(path).valid).toBe(false);
  });

  it.each([
    "app\\page.tsx",
    "app/sida med mellanslag.tsx",
    "C:/app/page.tsx",
    "app/page.tsx\u0000",
  ])("still rejects invalid charset path %s", (path) => {
    expect(validateFilePath(path).valid).toBe(false);
  });

  it("still rejects paths outside allowed root directories", () => {
    expect(validateFilePath("secrets/creds.json").valid).toBe(false);
  });
});

describe("sanitizeFilePath — route characters survive", () => {
  it("preserves dynamic route brackets and groups", () => {
    expect(sanitizeFilePath("app/blog/[slug]/page.tsx")).toBe("app/blog/[slug]/page.tsx");
    expect(sanitizeFilePath("app/(marketing)/page.tsx")).toBe("app/(marketing)/page.tsx");
    expect(sanitizeFilePath("app/docs/[...slug]/page.tsx")).toBe(
      "app/docs/[...slug]/page.tsx",
    );
  });

  it("removes traversal segments instead of stripping .. substrings", () => {
    expect(sanitizeFilePath("app/../secret.ts")).toBe("app/secret.ts");
    expect(sanitizeFilePath("./app/page.tsx")).toBe("app/page.tsx");
    // A substring-based strip would have corrupted the catch-all to `[.slug]`.
    expect(sanitizeFilePath("app/[...slug]/page.tsx")).toBe("app/[...slug]/page.tsx");
  });

  it("still strips genuinely invalid characters", () => {
    expect(sanitizeFilePath("app/pa ge.tsx")).toBe("app/page.tsx");
  });
});

describe("parseCodeProject — dynamic route files survive end-to-end", () => {
  it("keeps the [slug] path from a generated code fence", () => {
    const content = [
      '```tsx file="app/blog/[slug]/page.tsx"',
      "export default function Post() { return null; }",
      "```",
    ].join("\n");

    const project = parseCodeProject(content);
    expect(project.files.map((f) => f.path)).toEqual(["app/blog/[slug]/page.tsx"]);
  });

  it("rescues a traversal path by removing the traversal segment (parser sanitize step)", () => {
    // Parser contract (unchanged by this fix): an invalid path is first
    // sanitized and re-validated — `../outside.ts` lands as `outside.ts`,
    // with no traversal remnant escaping the workspace root.
    const content = [
      '```ts file="../outside.ts"',
      "export {};",
      "```",
    ].join("\n");

    const project = parseCodeProject(content);
    expect(project.files.map((f) => f.path)).toEqual(["outside.ts"]);
  });
});

// Static regression sweep: every file path shipped by every scaffold must pass
// the validator unchanged. This is exactly the check that would have caught
// the blog/ecommerce dynamic-route mutation without generating a site.
describe("scaffold file paths pass the validator", () => {
  const SCAFFOLD_IDS = [
    "base-nextjs",
    "landing-page",
    "saas-landing",
    "portfolio",
    "blog",
    "dashboard",
    "auth-pages",
    "ecommerce",
    "app-shell",
  ];

  it.each(SCAFFOLD_IDS)("%s: all paths valid and sanitize-stable", (scaffoldId) => {
    const files = loadScaffoldFiles(scaffoldId);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const result = validateFilePath(file.path);
      expect(result, `${scaffoldId}: ${file.path} → ${result.reason ?? ""}`).toEqual({
        valid: true,
      });
      expect(sanitizeFilePath(file.path)).toBe(file.path);
    }
  });
});

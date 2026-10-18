import { describe, expect, it, vi } from "vitest";
import { mergePackageJsonContent, mergeVersionFilesWithWarnings } from "./version-file-merge";

vi.mock("@/lib/db/chat-repository-pg", () => {
  throw new Error("Pure file merge must not load the DB repository");
});

describe("pure version file merge", () => {
  it("merges dependencies and scripts without importing the DB owner", () => {
    const merged = mergePackageJsonContent(
      JSON.stringify({ dependencies: { react: "19" }, scripts: { build: "next build" } }),
      JSON.stringify({ dependencies: { three: "1" }, scripts: { dev: "next dev" } }),
    );
    expect(JSON.parse(merged)).toEqual({
      dependencies: { react: "19", three: "1" },
      scripts: { build: "next build", dev: "next dev" },
    });
  });

  it("retains omitted files and rejects significant shrink without DB work", () => {
    const previous = [
      { path: "app/page.tsx", content: "x".repeat(1000), language: "tsx" },
      { path: "lib/imported.ts", content: "export const imported = true;", language: "ts" },
    ];
    const result = mergeVersionFilesWithWarnings(
      previous,
      [{ path: "app/page.tsx", content: "short", language: "tsx" }],
      { rejectSignificantShrinks: true },
    );
    expect(result.files).toEqual(previous);
    expect(result.warnings).toEqual([
      { type: "significant-shrink", file: "app/page.tsx", previousSize: 1000, newSize: 5 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { buildGitHubExportPlan } from "./github-tree-plan";

describe("buildGitHubExportPlan", () => {
  it("keeps empty files instead of treating empty content as a missing file", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return null; }",
        language: "tsx",
      },
      { path: "public/.gitkeep", content: "", language: "text" },
    ];

    const plan = buildGitHubExportPlan(files);

    expect(plan.files).toContainEqual({ path: "public/.gitkeep", content: "" });
  });

  it("adds explicit deletions for every stale entry in the previous GitHub tree", () => {
    const files: CodeFile[] = [
      {
        path: "app/page.tsx",
        content: "export default function Page() { return null; }",
        language: "tsx",
      },
      { path: "public/.gitkeep", content: "", language: "text" },
    ];

    const plan = buildGitHubExportPlan(files, [
      "app/page.tsx",
      "public/.gitkeep",
      "app/removed-page.tsx",
      "stale.config.js",
    ]);

    expect(plan.deletionPaths).toEqual(["app/removed-page.tsx", "stale.config.js"]);
  });

  it("keeps the existing GitHub secret and traversal filters", () => {
    const files: CodeFile[] = [
      { path: ".env", content: "SECRET=do-not-export", language: "text" },
      { path: "../escape.txt", content: "nope", language: "text" },
      { path: "app/page.tsx", content: "ok", language: "tsx" },
    ];

    expect(buildGitHubExportPlan(files).files).toEqual([
      { path: "app/page.tsx", content: "ok" },
    ]);
  });
});

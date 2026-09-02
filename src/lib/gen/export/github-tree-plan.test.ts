import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  GITHUB_EXPORT_MANIFEST_PATH,
  GitHubExportPathConflictError,
  buildGitHubExportPlan,
  parseGitHubExportManifest,
} from "./github-tree-plan";

function file(path: string, content: string, language: string): CodeFile {
  return { path, content, language };
}

describe("buildGitHubExportPlan", () => {
  it("keeps empty files instead of treating empty content as a missing file", () => {
    const plan = buildGitHubExportPlan([
      file("app/page.tsx", "export default function Page() { return null; }", "tsx"),
      file("public/.gitkeep", "", "text"),
    ]);

    expect(plan.files).toContainEqual({ path: "public/.gitkeep", content: "" });
    expect(plan.files.some((entry) => entry.path === GITHUB_EXPORT_MANIFEST_PATH)).toBe(true);
    const manifest = parseGitHubExportManifest(
      plan.files.find((entry) => entry.path === GITHUB_EXPORT_MANIFEST_PATH)!.content,
    );
    expect(manifest).toEqual(
      expect.arrayContaining(["app/page.tsx", "public/.gitkeep", GITHUB_EXPORT_MANIFEST_PATH]),
    );
  });

  it("deletes only previous manifest paths that disappeared from this export", () => {
    const plan = buildGitHubExportPlan(
      [
        file("app/page.tsx", "export default function Page() { return null; }", "tsx"),
        file("public/.gitkeep", "", "text"),
      ],
      {
        previousManifestPaths: [
          "app/page.tsx",
          "public/.gitkeep",
          "app/removed-page.tsx",
          GITHUB_EXPORT_MANIFEST_PATH,
        ],
        existingBlobPaths: [
          "app/page.tsx",
          "public/.gitkeep",
          "app/removed-page.tsx",
          "README.md",
          "LICENSE",
          "stale.config.js",
          ".github/workflows/ci.yml",
          GITHUB_EXPORT_MANIFEST_PATH,
        ],
      },
    );

    expect(plan.deletionPaths).toEqual(["app/removed-page.tsx"]);
  });

  it("deletes nothing on first export when the target repo has no Sajtmaskin manifest", () => {
    const plan = buildGitHubExportPlan(
      [file("app/page.tsx", "ok", "tsx")],
      {
        existingBlobPaths: ["README.md", "LICENSE", "user-notes.md", ".github/workflows/ci.yml"],
      },
    );

    expect(plan.deletionPaths).toEqual([]);
    expect(plan.files.map((entry) => entry.path)).toEqual([
      GITHUB_EXPORT_MANIFEST_PATH,
      "app/page.tsx",
    ]);
  });

  it("never deletes README, LICENSE, or GitHub workflow files even if a stale manifest listed them", () => {
    const plan = buildGitHubExportPlan([file("app/page.tsx", "ok", "tsx")], {
      previousManifestPaths: [
        "app/page.tsx",
        "README.md",
        "LICENSE",
        ".github/workflows/ci.yml",
        "app/gone.tsx",
      ],
    });

    expect(plan.deletionPaths).toEqual(["app/gone.tsx"]);
  });

  it("deletes a previous manifest file so a directory can replace it", () => {
    const plan = buildGitHubExportPlan([file("docs/guide.md", "# Guide\n", "markdown")], {
      previousManifestPaths: ["docs", GITHUB_EXPORT_MANIFEST_PATH],
      existingBlobPaths: ["docs", GITHUB_EXPORT_MANIFEST_PATH],
    });

    expect(plan.deletionPaths).toEqual(["docs"]);
    expect(plan.files.map((entry) => entry.path)).toEqual([
      GITHUB_EXPORT_MANIFEST_PATH,
      "docs/guide.md",
    ]);
  });

  it("deletes previous manifest children so a file can replace a directory", () => {
    const plan = buildGitHubExportPlan([file("docs", "# Docs\n", "markdown")], {
      previousManifestPaths: ["docs/guide.md", "docs/setup.md", GITHUB_EXPORT_MANIFEST_PATH],
      existingBlobPaths: ["docs/guide.md", "docs/setup.md", GITHUB_EXPORT_MANIFEST_PATH],
    });

    expect(plan.deletionPaths).toEqual(["docs/guide.md", "docs/setup.md"]);
  });

  it("fails closed when a user-owned file would be replaced by a directory", () => {
    expect(() =>
      buildGitHubExportPlan([file("docs/guide.md", "# Guide\n", "markdown")], {
        existingBlobPaths: ["docs"],
      }),
    ).toThrow(GitHubExportPathConflictError);
  });

  it("fails closed when a user-owned directory would be replaced by a file", () => {
    expect(() =>
      buildGitHubExportPlan([file("docs", "# Docs\n", "markdown")], {
        existingBlobPaths: ["docs/guide.md"],
      }),
    ).toThrow(GitHubExportPathConflictError);
  });

  it("keeps the existing GitHub secret and traversal filters", () => {
    expect(
      buildGitHubExportPlan([
        file(".env", "SECRET=do-not-export", "text"),
        file("../escape.txt", "nope", "text"),
        file("app/page.tsx", "ok", "tsx"),
      ]).files.map((entry) => entry.path),
    ).toEqual([GITHUB_EXPORT_MANIFEST_PATH, "app/page.tsx"]);
  });
});

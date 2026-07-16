import { describe, expect, it } from "vitest";

import {
  checkActiveDocLinks,
  extractLocalLinkTargets,
  isActiveMarkdown,
  resolveLocalTarget,
} from "./check-active-doc-links.mjs";

describe("active documentation link checks", () => {
  it("extracts Markdown, reference and HTML links while ignoring code and external URLs", () => {
    const content = [
      "[local](./guide.md#start)",
      "[reference]: ../README.md",
      '<a href="/docs/README.md">Docs</a>',
      "[external](https://example.com)",
      "`[example](missing.md)`",
      "```md\n[fixture](missing.md)\n```",
    ].join("\n");

    expect(extractLocalLinkTargets(content)).toEqual([
      "../README.md",
      "./guide.md#start",
      "/docs/README.md",
    ]);
  });

  it("excludes historical Markdown surfaces from the blocking active set", () => {
    expect(isActiveMarkdown("docs/contracts/build-spec.md")).toBe(true);
    expect(isActiveMarkdown("README.md")).toBe(true);
    expect(isActiveMarkdown("docs/archive/old.md")).toBe(false);
    expect(isActiveMarkdown("docs/plans/avklarat/old.md")).toBe(false);
    expect(isActiveMarkdown("docs/audits/snapshot.md")).toBe(false);
  });

  it("resolves root-relative and document-relative targets", () => {
    expect(resolveLocalTarget("docs/contracts/example.md", "../README.md#top")).toEqual({
      path: "docs/README.md",
      target: "../README.md#top",
    });
    expect(resolveLocalTarget("docs/contracts/example.md", "/README.md")).toEqual({
      path: "README.md",
      target: "/README.md",
    });
  });

  it("reports missing active links but ignores missing links inside archives", async () => {
    const files = new Map([
      ["README.md", "[Docs](docs/README.md)"],
      ["docs/README.md", "[Missing](contracts/missing.md) [App route](/builder/demo)"],
      ["docs/archive/old.md", "[Historical missing](gone.md)"],
    ]);

    const failures = await checkActiveDocLinks({
      trackedPaths: [...files.keys()],
      readTrackedFile: async (path: string) => files.get(path) ?? "",
    });

    expect(failures).toEqual([
      {
        sourcePath: "docs/README.md",
        target: "contracts/missing.md",
        resolvedPath: "docs/contracts/missing.md",
        reason: "missing",
      },
    ]);
  });
});

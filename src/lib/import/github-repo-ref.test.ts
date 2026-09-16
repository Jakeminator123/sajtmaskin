import { describe, expect, it } from "vitest";
import { ImportInitError } from "./github-import-errors";
import { candidateRefPrefixes, parseGithubImportUrl, parseGithubRepo } from "./github-repo-ref";

describe("parseGithubImportUrl", () => {
  it("accepts a repo root, trailing slash and .git", () => {
    expect(parseGithubImportUrl("https://github.com/acme/site")).toEqual({
      ok: true,
      owner: "acme",
      repo: "site",
      kind: "root",
    });
    expect(parseGithubImportUrl("https://github.com/acme/site.git")).toEqual({
      ok: true,
      owner: "acme",
      repo: "site",
      kind: "root",
    });
    expect(parseGithubImportUrl("https://github.com/acme/site/")).toEqual({
      ok: true,
      owner: "acme",
      repo: "site",
      kind: "root",
    });
  });

  it("keeps slashes in /tree/feature/new-ui", () => {
    expect(parseGithubImportUrl("https://github.com/acme/site/tree/feature/new-ui")).toEqual({
      ok: true,
      owner: "acme",
      repo: "site",
      kind: "tree",
      pathSegments: ["feature", "new-ui"],
    });
  });

  it("decodes a slash once and does not decode twice", () => {
    expect(
      parseGithubImportUrl("https://github.com/acme/site/tree/feature%2Fnew-ui"),
    ).toEqual({
      ok: true,
      owner: "acme",
      repo: "site",
      kind: "tree",
      pathSegments: ["feature/new-ui"],
    });
  });

  it("parses a commit URL", () => {
    expect(
      parseGithubImportUrl("https://github.com/acme/site/commit/abc1234"),
    ).toEqual({
      ok: true,
      owner: "acme",
      repo: "site",
      kind: "commit",
      sha: "abc1234",
    });
  });

  it("rejects a non-GitHub host", () => {
    expect(() => parseGithubImportUrl("https://gitlab.com/acme/site")).toThrow(ImportInitError);
  });
});

describe("candidateRefPrefixes", () => {
  it("tries the longest path first", () => {
    expect(candidateRefPrefixes(["feature", "new-ui", "src"])).toEqual([
      "feature/new-ui/src",
      "feature/new-ui",
      "feature",
    ]);
  });
});

describe("parseGithubRepo", () => {
  it("strips .git from the repo name", () => {
    expect(parseGithubRepo("https://github.com/acme/site.git")).toEqual({
      owner: "acme",
      repo: "site",
    });
  });
});

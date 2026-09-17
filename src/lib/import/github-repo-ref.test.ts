import { describe, expect, it } from "vitest";
import { ImportInitError } from "./github-import-errors";
import { candidateRefPrefixes, parseGithubImportUrl, parseGithubRepo } from "./github-repo-ref";
import {
  MAX_GITHUB_IMPORT_URL_LENGTH,
  MAX_GITHUB_TREE_SEGMENTS,
} from "./import-init-contract";

function longTreeUrl(segmentCount: number): string {
  const segments = Array.from({ length: segmentCount }, (_, index) => `s${index}`);
  return `https://github.com/acme/site/tree/${segments.join("/")}`;
}

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

  it("rejects a /tree path with too many segments before any ref probing", () => {
    expect(() => parseGithubImportUrl(longTreeUrl(MAX_GITHUB_TREE_SEGMENTS + 1))).toThrow(
      ImportInitError,
    );
    try {
      parseGithubImportUrl(longTreeUrl(MAX_GITHUB_TREE_SEGMENTS + 1));
      throw new Error("expected parseGithubImportUrl to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "github_url_invalid", step: "parse" });
    }
  });

  it("rejects an oversized GitHub URL", () => {
    const oversized = `https://github.com/acme/site/${"a".repeat(MAX_GITHUB_IMPORT_URL_LENGTH)}`;
    expect(() => parseGithubImportUrl(oversized)).toThrow(ImportInitError);
  });

  it("still accepts a bounded feature/new-ui tree URL", () => {
    expect(parseGithubImportUrl("https://github.com/acme/site/tree/feature/new-ui").kind).toBe(
      "tree",
    );
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

  it("does not build an unbounded prefix list", () => {
    const tooMany = Array.from({ length: MAX_GITHUB_TREE_SEGMENTS + 1 }, (_, index) => `s${index}`);
    expect(() => candidateRefPrefixes(tooMany)).toThrow(ImportInitError);
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

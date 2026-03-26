import { describe, expect, it } from "vitest";
import { findInvalidJsonConfigPaths } from "./version-file-integrity";

describe("findInvalidJsonConfigPaths", () => {
  it("returns empty when package.json is valid", () => {
    expect(
      findInvalidJsonConfigPaths([{ path: "package.json", content: '{"name":"x"}' }]),
    ).toEqual([]);
  });

  it("flags invalid package.json", () => {
    expect(
      findInvalidJsonConfigPaths([{ path: "package.json", content: "{not json" }]),
    ).toEqual(["package.json"]);
  });

  it("ignores non-package paths", () => {
    expect(
      findInvalidJsonConfigPaths([{ path: "app/page.tsx", content: "{not json" }]),
    ).toEqual([]);
  });
});

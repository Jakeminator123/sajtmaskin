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

  it("flags invalid components.json", () => {
    expect(
      findInvalidJsonConfigPaths([{ path: "components.json", content: "{bad" }]),
    ).toEqual(["components.json"]);
  });

  it("flags invalid nested jsconfig.json", () => {
    expect(
      findInvalidJsonConfigPaths([{ path: "packages/web/jsconfig.json", content: "[" }]),
    ).toEqual(["packages/web/jsconfig.json"]);
  });

  it("ignores tsconfig.json (JSONC — avoid false positives)", () => {
    expect(
      findInvalidJsonConfigPaths([
        { path: "tsconfig.json", content: '{ "compilerOptions": { } } // comment' },
      ]),
    ).toEqual([]);
  });

  it("ignores non-package paths", () => {
    expect(
      findInvalidJsonConfigPaths([{ path: "app/page.tsx", content: "{not json" }]),
    ).toEqual([]);
  });
});

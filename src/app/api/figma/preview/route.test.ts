import { describe, expect, it } from "vitest";

import { parseFigmaUrl } from "./figma-url";

describe("Figma preview URL parsing", () => {
  it("accepts figma.com and its subdomains", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/file-key/name?node-id=1-2")).toEqual({
      fileKey: "file-key",
      nodeId: "1-2",
    });
    expect(parseFigmaUrl("https://figma.com/file/another-key/name")).toEqual({
      fileKey: "another-key",
      nodeId: undefined,
    });
  });

  it("rejects lookalike and suffix-spoofed hosts", () => {
    expect(parseFigmaUrl("https://evilfigma.com/design/file-key/name")).toBeNull();
    expect(parseFigmaUrl("https://figma.com.evil.example/design/file-key/name")).toBeNull();
  });

  it("rejects unsupported paths", () => {
    expect(parseFigmaUrl("https://www.figma.com/community/file-key/name")).toBeNull();
  });
});

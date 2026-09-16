import { describe, expect, it } from "vitest";
import { kostnadsfriAuthReturnPath, sanitizeKostnadsfriAuthReturnTo } from "./auth-return";

describe("sanitizeKostnadsfriAuthReturnTo", () => {
  const origin = "https://sajtmaskin.se";

  it("accepts the invitation path", () => {
    expect(sanitizeKostnadsfriAuthReturnTo("/kostnadsfri/demo-foretag-ab", origin)).toBe(
      "/kostnadsfri/demo-foretag-ab",
    );
    expect(kostnadsfriAuthReturnPath("demo-foretag-ab")).toBe("/kostnadsfri/demo-foretag-ab");
  });

  it("rejects another origin and non-invitation paths", () => {
    expect(
      sanitizeKostnadsfriAuthReturnTo("https://evil.example/kostnadsfri/demo-foretag-ab", origin),
    ).toBeNull();
    expect(sanitizeKostnadsfriAuthReturnTo("/builder?project=1", origin)).toBeNull();
    expect(sanitizeKostnadsfriAuthReturnTo("/kostnadsfri/../admin", origin)).toBeNull();
  });
});

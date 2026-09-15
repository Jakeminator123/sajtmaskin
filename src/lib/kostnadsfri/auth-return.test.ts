import { describe, expect, it } from "vitest";
import { kostnadsfriAuthReturnPath, sanitizeKostnadsfriAuthReturnTo } from "./auth-return";

describe("sanitizeKostnadsfriAuthReturnTo", () => {
  const origin = "https://sajtmaskin.se";

  it("accepts the invitation path", () => {
    expect(sanitizeKostnadsfriAuthReturnTo("/kostnadsfri/zax-2-0-ab", origin)).toBe(
      "/kostnadsfri/zax-2-0-ab",
    );
    expect(kostnadsfriAuthReturnPath("zax-2-0-ab")).toBe("/kostnadsfri/zax-2-0-ab");
  });

  it("rejects another origin and non-invitation paths", () => {
    expect(
      sanitizeKostnadsfriAuthReturnTo("https://evil.example/kostnadsfri/zax-2-0-ab", origin),
    ).toBeNull();
    expect(sanitizeKostnadsfriAuthReturnTo("/builder?project=1", origin)).toBeNull();
    expect(sanitizeKostnadsfriAuthReturnTo("/kostnadsfri/../admin", origin)).toBeNull();
  });
});

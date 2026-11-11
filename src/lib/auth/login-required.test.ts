import { describe, expect, it } from "vitest";
import { buildLoginRequiredUrl, sanitizeLoginReturnTo } from "./login-required";

const ORIGIN = "https://sajtmaskin.se";

describe("sanitizeLoginReturnTo", () => {
  it.each([
    ["/projects", "/projects"],
    ["/buy-credits?package=starter", "/buy-credits?package=starter"],
    ["/projects/abc#x", "/projects/abc"],
    ["/projects/../konto", "/konto"],
  ])("keeps own path %s", (raw, expected) => {
    expect(sanitizeLoginReturnTo(raw, ORIGIN)).toBe(expected);
  });

  it.each([
    null,
    "",
    "/",
    "//evil.example/projects",
    "/\\evil.example",
    "/..//evil.example",
    "/.//evil.example",
    "/a/..//evil.example",
    "/%2e%2e//evil.example",
    "https://evil.example/projects",
    "javascript:alert(1)",
    `/${"a".repeat(600)}`,
  ])("rejects %s", (raw) => {
    expect(sanitizeLoginReturnTo(raw, ORIGIN)).toBeNull();
  });
});

describe("buildLoginRequiredUrl", () => {
  it("points at the home page with login=required and the return path", () => {
    const url = buildLoginRequiredUrl(`${ORIGIN}/konto`, "/konto");
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("login")).toBe("required");
    expect(url.searchParams.get("returnTo")).toBe("/konto");
  });

  it("drops an unsafe return path but still asks for login", () => {
    const url = buildLoginRequiredUrl(`${ORIGIN}/x`, "//evil.example");
    expect(url.searchParams.get("login")).toBe("required");
    expect(url.searchParams.has("returnTo")).toBe(false);
  });
});

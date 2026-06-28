import { describe, it, expect, vi, beforeEach } from "vitest";

// The owner token is read from OPENCLAW.debugRunToken (env-backed). Mock the
// config so the test controls the server secret directly.
let serverToken = "";
vi.mock("@/lib/config", () => ({
  OPENCLAW: {
    get debugRunToken() {
      return serverToken;
    },
  },
}));

import { matchesOpenClawDebugToken } from "./owner-token";

function reqWith(token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set("x-oc-debug-token", token);
  return new Request("http://localhost/api/openclaw/debug/run", {
    method: "POST",
    headers,
  });
}

describe("matchesOpenClawDebugToken (owner gate)", () => {
  beforeEach(() => {
    serverToken = "";
  });

  it("fails closed when the server secret is unset", () => {
    serverToken = "";
    expect(matchesOpenClawDebugToken(reqWith("anything"))).toBe(false);
  });

  it("rejects a request with no token header", () => {
    serverToken = "s3cret-owner-token";
    expect(matchesOpenClawDebugToken(reqWith())).toBe(false);
  });

  it("rejects a wrong token", () => {
    serverToken = "s3cret-owner-token";
    expect(matchesOpenClawDebugToken(reqWith("not-the-token"))).toBe(false);
  });

  it("rejects a length-mismatched token (constant-time guard)", () => {
    serverToken = "s3cret-owner-token";
    expect(matchesOpenClawDebugToken(reqWith("s3cret"))).toBe(false);
  });

  it("accepts the exact matching token", () => {
    serverToken = "s3cret-owner-token";
    expect(matchesOpenClawDebugToken(reqWith("s3cret-owner-token"))).toBe(true);
  });
});

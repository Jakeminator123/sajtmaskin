import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/oauth-state";

const getGoogleAuthUrl = vi.hoisted(() =>
  vi.fn((state: string, callbackUrl: string) => {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", callbackUrl);
    return url.toString();
  }),
);

vi.mock("@/lib/auth/auth", () => ({ getGoogleAuthUrl }));

import { GET } from "./route";

function setCookieHeader(response: Response): string {
  const multi = response.headers.getSetCookie?.() ?? [];
  if (multi.length > 0) return multi.join("\n");
  return response.headers.get("set-cookie") ?? "";
}

function decodeGoogleState(location: string): { redirect?: string; nonce?: string } {
  const url = new URL(location);
  const raw = url.searchParams.get("state");
  if (!raw) return {};
  return JSON.parse(Buffer.from(raw, "base64url").toString()) as {
    redirect?: string;
    nonce?: string;
  };
}

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    getGoogleAuthUrl.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sets the nonce cookie and embeds the same nonce in state", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/auth/google?redirect=/projects"),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    const payload = decodeGoogleState(location);
    const header = setCookieHeader(response);

    expect(payload.nonce).toBeTruthy();
    expect(header).toContain(`${OAUTH_STATE_COOKIE_NAME}=${payload.nonce}`);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/Max-Age=600/i);
    expect(payload.redirect).toBe("/projects");
    expect(getGoogleAuthUrl).toHaveBeenCalledWith(
      expect.any(String),
      "https://app.test/api/auth/google/callback",
    );
  });

  it("keeps same-origin redirect sanitisation (remote hosts fall back to /)", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/auth/google?redirect=https://evil.example/phish"),
    );

    const payload = decodeGoogleState(response.headers.get("location") ?? "");
    expect(payload.redirect).toBe("/");
  });
});

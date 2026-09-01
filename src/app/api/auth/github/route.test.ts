import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE_NAME } from "@/lib/auth/oauth-state";

vi.mock("@/lib/config", () => ({
  SECRETS: {
    githubClientId: "gh-client-id",
    githubClientSecret: "gh-secret",
  },
  URLS: {
    baseUrl: "https://app.test",
    githubCallbackUrl: "https://app.test/api/auth/github/callback",
  },
  FEATURES: {
    useGitHubAuth: true,
  },
}));

import { GET } from "./route";

function setCookieHeader(response: Response): string {
  const multi = response.headers.getSetCookie?.() ?? [];
  if (multi.length > 0) return multi.join("\n");
  return response.headers.get("set-cookie") ?? "";
}

function decodeGithubState(location: string): { returnTo?: string; nonce?: string; timestamp?: unknown } {
  const url = new URL(location);
  const raw = url.searchParams.get("state");
  if (!raw) return {};
  return JSON.parse(Buffer.from(raw, "base64").toString()) as {
    returnTo?: string;
    nonce?: string;
    timestamp?: unknown;
  };
}

describe("GET /api/auth/github", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sets the nonce cookie and embeds the same nonce in state", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/auth/github?returnTo=/builder"),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);

    const payload = decodeGithubState(location ?? "");
    const header = setCookieHeader(response);
    expect(payload.nonce).toBeTruthy();
    expect(header).toContain(`${OAUTH_STATE_COOKIE_NAME}=${payload.nonce}`);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/Max-Age=600/i);
    expect(payload.returnTo).toBe("/builder");
    expect(payload.timestamp).toBeUndefined();
  });

  it("keeps same-origin returnTo sanitisation (remote hosts fall back to /projects)", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/auth/github?returnTo=https://evil.example/phish"),
    );

    const payload = decodeGithubState(response.headers.get("location") ?? "");
    expect(payload.returnTo).toBe("/projects");
  });
});

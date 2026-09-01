import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_MAX_AGE_SECONDS,
  clearOAuthFlowCookie,
  createOAuthFlow,
  createPkceChallenge,
  oauthCookieName,
  parseOAuthState,
  relayOAuthCallbackIfNeeded,
  setOAuthFlowCookie,
  verifyOAuthFlow,
} from "./oauth-state";

function request(
  url: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(url, {
    headers: cookie ? { cookie } : undefined,
  });
}

function flowCookie(
  provider: "google" | "github",
  flow: ReturnType<typeof createOAuthFlow>,
  startRequest: NextRequest,
): string {
  const response = NextResponse.json({ ok: true });
  setOAuthFlowCookie(response, provider, flow, startRequest);
  const value = response.cookies.get(oauthCookieName(provider))?.value;
  if (!value) throw new Error("OAuth flow cookie was not set");
  return value;
}

describe("OAuth state binding", () => {
  it("creates a signed random nonce and an S256 PKCE challenge", () => {
    const start = request("https://sajtmaskin.se/api/auth/google");
    const first = createOAuthFlow("google", start, { returnTo: "/builder" });
    const second = createOAuthFlow("google", start, { returnTo: "/builder" });

    expect(first.payload.nonce).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(first.payload.nonce).not.toBe(second.payload.nonce);
    expect(first.state).not.toBe(second.state);
    expect(first.codeChallenge).toBe(
      createHash("sha256")
        .update(
          JSON.parse(
            Buffer.from(first.cookieValue, "base64url").toString(),
          ).codeVerifier,
        )
        .digest("base64url"),
    );
    expect(createPkceChallenge("known-verifier")).toBe(
      createHash("sha256").update("known-verifier").digest("base64url"),
    );
  });

  it("rejects tampered, cross-provider and expired state", () => {
    const start = request("https://sajtmaskin.se/api/auth/google");
    const flow = createOAuthFlow("google", start, { returnTo: "/" });
    const [body, signature] = flow.state.split(".");

    expect(parseOAuthState("github", flow.state)).toMatchObject({
      ok: false,
    });
    const badSignature = `${signature.slice(0, -1)}${
      signature.endsWith("A") ? "B" : "A"
    }`;
    expect(
      parseOAuthState("google", `${body}.${badSignature}`),
    ).toMatchObject({ ok: false, reason: "state_signature" });
    expect(
      parseOAuthState(
        "google",
        flow.state,
        flow.payload.issuedAt + OAUTH_STATE_MAX_AGE_SECONDS * 1_000 + 1,
      ),
    ).toEqual({ ok: false, reason: "state_expired" });
  });

  it("rejects replay after the one-time host cookie is consumed", () => {
    const start = request("https://sajtmaskin.se/api/auth/google");
    const flow = createOAuthFlow("google", start, { returnTo: "/builder" });
    const cookie = flowCookie("google", flow, start);
    const callbackUrl =
      `https://sajtmaskin.se/api/auth/google/callback?code=abc&state=${encodeURIComponent(flow.state)}`;

    expect(
      verifyOAuthFlow(
        "google",
        request(callbackUrl, {
          [oauthCookieName("google")]: cookie,
        }),
        flow.state,
      ),
    ).toMatchObject({ ok: true });

    const consumed = NextResponse.redirect("https://sajtmaskin.se/builder");
    clearOAuthFlowCookie(consumed, "google", request(callbackUrl));
    expect(consumed.headers.get("set-cookie")).toMatch(/Max-Age=0/i);

    expect(
      verifyOAuthFlow("google", request(callbackUrl), flow.state),
    ).toEqual({ ok: false, reason: "state_cookie_missing" });
  });

  it("binds a GitHub connection to the exact initiating auth session", () => {
    const start = request("https://sajtmaskin.se/api/auth/github", {
      sajtmaskin_auth: "session-a",
    });
    const flow = createOAuthFlow("github", start, {
      returnTo: "/projects",
      subject: "user-a",
    });
    const cookie = flowCookie("github", flow, start);
    const callbackUrl =
      `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(flow.state)}`;

    expect(
      verifyOAuthFlow(
        "github",
        request(callbackUrl, {
          sajtmaskin_auth: "session-b",
          [oauthCookieName("github")]: cookie,
        }),
        flow.state,
      ),
    ).toEqual({ ok: false, reason: "state_session_mismatch" });

    expect(
      verifyOAuthFlow(
        "github",
        request(callbackUrl, {
          sajtmaskin_auth: "session-a",
          [oauthCookieName("github")]: cookie,
        }),
        flow.state,
      ),
    ).toMatchObject({
      ok: true,
      payload: { subject: "user-a" },
    });
  });

  it("relays a canonical GitHub callback to the signed start origin", () => {
    const start = request("https://sajtmaskin.se/api/auth/github", {
      sajtmaskin_auth: "session-a",
    });
    const flow = createOAuthFlow("github", start, {
      returnTo: "/builder?tab=github",
      subject: "user-a",
    });
    const cookie = flowCookie("github", flow, start);
    const canonical = request(
      `https://sajtmaskin.vercel.app/api/auth/github/callback?code=abc&state=${encodeURIComponent(flow.state)}`,
    );
    const parsed = parseOAuthState("github", flow.state);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);
    const relay = relayOAuthCallbackIfNeeded(canonical, parsed);
    expect(relay?.headers.get("location")).toBe(
      `https://sajtmaskin.se/api/auth/github/callback?code=abc&state=${encodeURIComponent(flow.state)}`,
    );
    expect(relay?.headers.get("referrer-policy")).toBe("no-referrer");

    const relayed = request(relay!.headers.get("location")!, {
      sajtmaskin_auth: "session-a",
      [oauthCookieName("github")]: cookie,
    });
    expect(verifyOAuthFlow("github", relayed, flow.state)).toMatchObject({
      ok: true,
    });
  });

  it("keeps Google and GitHub flows independent in parallel", () => {
    const start = request("https://sajtmaskin.se/api/auth/google", {
      sajtmaskin_auth: "session-a",
    });
    const google = createOAuthFlow("google", start, { returnTo: "/" });
    const github = createOAuthFlow("github", start, {
      returnTo: "/projects",
      subject: "user-a",
    });
    const googleCookie = flowCookie("google", google, start);
    const githubCookie = flowCookie("github", github, start);

    expect(oauthCookieName("google")).not.toBe(oauthCookieName("github"));

    const both = {
      sajtmaskin_auth: "session-a",
      [oauthCookieName("google")]: googleCookie,
      [oauthCookieName("github")]: githubCookie,
    };
    expect(
      verifyOAuthFlow(
        "google",
        request(
          `https://sajtmaskin.se/api/auth/google/callback?state=${encodeURIComponent(google.state)}`,
          both,
        ),
        google.state,
      ),
    ).toMatchObject({ ok: true });
    expect(
      verifyOAuthFlow(
        "github",
        request(
          `https://sajtmaskin.se/api/auth/github/callback?state=${encodeURIComponent(github.state)}`,
          both,
        ),
        github.state,
      ),
    ).toMatchObject({ ok: true });

    const clearGitHub = NextResponse.redirect("https://sajtmaskin.se/projects");
    clearOAuthFlowCookie(clearGitHub, "github", start);
    const header = clearGitHub.headers.get("set-cookie") ?? "";
    expect(header).toContain(oauthCookieName("github"));
    expect(header).not.toContain(oauthCookieName("google"));
  });
});

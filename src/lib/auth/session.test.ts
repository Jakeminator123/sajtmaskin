import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_HOST_NAME,
  SESSION_COOKIE_LEGACY_NAME,
} from "./host-cookies";
import {
  createSessionCookie,
  ensureSessionIdFromRequest,
  getSessionIdFromRequest,
  isGuestSessionId,
  resolveGuestSessionFromRequest,
} from "./session";

const VALID_HOST = "sess_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const VALID_LEGACY = "sess_ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";
const VALID_PARENT = "sess_11111111-2222-4333-8444-555555555555";

describe("session cookie flags", () => {
  it("writes __Host- with Secure, HttpOnly, Path=/ and no Domain over HTTPS", () => {
    const cookie = createSessionCookie(VALID_HOST, { secure: true });
    expect(cookie.startsWith(`${SESSION_COOKIE_HOST_NAME}=${VALID_HOST};`)).toBe(
      true,
    );
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=");
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("keeps the unprefixed name without Secure on local HTTP", () => {
    const cookie = createSessionCookie(VALID_HOST, { secure: false });
    expect(cookie).toContain(`${SESSION_COOKIE_LEGACY_NAME}=${VALID_HOST}`);
    expect(cookie).not.toContain(SESSION_COOKIE_HOST_NAME);
    expect(cookie).not.toContain("Secure");
  });
});

describe("guest session read", () => {
  it("prefers __Host- when old and new names arrive together", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}; ${SESSION_COOKIE_HOST_NAME}=${VALID_HOST}`,
      },
    });
    expect(resolveGuestSessionFromRequest(request)).toEqual({
      sessionId: VALID_HOST,
      source: "host",
    });
    expect(getSessionIdFromRequest(request)).toBe(VALID_HOST);
  });

  it("does not pick a winner when the leftover name is sent twice", () => {
    const request = new Request("https://sajtmaskin.se/api/projects", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_HOST}; ${SESSION_COOKIE_LEGACY_NAME}=${VALID_PARENT}`,
      },
    });
    expect(getSessionIdFromRequest(request)).toBeNull();
  });

  it("still uses __Host- when the leftover name is shadowed", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        cookie: [
          `${SESSION_COOKIE_LEGACY_NAME}=${VALID_HOST}`,
          `${SESSION_COOKIE_LEGACY_NAME}=${VALID_PARENT}`,
          `${SESSION_COOKIE_HOST_NAME}=${VALID_HOST}`,
        ].join("; "),
      },
    });
    expect(getSessionIdFromRequest(request)).toBe(VALID_HOST);
  });

  it("rejects an ill-formed leftover instead of treating it as a claimable guest", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: { cookie: `${SESSION_COOKIE_LEGACY_NAME}=guest-session-1` },
    });
    expect(getSessionIdFromRequest(request)).toBeNull();
    expect(isGuestSessionId("guest-session-1")).toBe(false);
  });

  it("is not a live identity over HTTPS even when lone and well formed", () => {
    const cookie = `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}`;
    expect(
      getSessionIdFromRequest(
        new Request("https://sajtmaskin.se/api/projects", {
          headers: { cookie },
        }),
      ),
    ).toBeNull();
    expect(
      getSessionIdFromRequest(
        new Request("http://127.0.0.1:3010/api/projects", {
          headers: { cookie },
        }),
      ),
    ).toBe(VALID_LEGACY);
  });

  it("does not let a leftover name open the x-session-id fallback on HTTPS", () => {
    const request = new Request("https://sajtmaskin.se/api/projects", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}`,
        "x-session-id": VALID_PARENT,
      },
    });
    expect(getSessionIdFromRequest(request)).toBeNull();
  });

  it("does not fall through to x-session-id after an ambiguous leftover cookie", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_HOST}; ${SESSION_COOKIE_LEGACY_NAME}=${VALID_PARENT}`,
        "x-session-id": VALID_PARENT,
      },
    });
    expect(getSessionIdFromRequest(request)).toBeNull();
  });

  it("accepts a well-formed x-session-id only when no session cookie was sent", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: { "x-session-id": VALID_HOST },
    });
    expect(getSessionIdFromRequest(request)).toBe(VALID_HOST);
  });
});

describe("guest transition", () => {
  it("mints a new id over HTTPS instead of promoting a leftover to __Host-", () => {
    const request = new Request("https://sajtmaskin.se/api/projects", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}`,
        host: "sajtmaskin.se",
      },
    });
    const ensured = ensureSessionIdFromRequest(request);

    expect(ensured.sessionId).not.toBe(VALID_LEGACY);
    expect(isGuestSessionId(ensured.sessionId)).toBe(true);
    expect(ensured.setCookie).toContain(
      `${SESSION_COOKIE_HOST_NAME}=${ensured.sessionId}`,
    );
    expect(ensured.setCookie).not.toContain(VALID_LEGACY);
    expect(ensured.setCookie).toContain("Secure");
  });

  it("expires the leftover on the parent Domain when it minted a new HTTPS id", () => {
    const request = new Request("https://preview.sajtmaskin.se/api/projects", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}`,
        host: "preview.sajtmaskin.se",
      },
    });
    const ensured = ensureSessionIdFromRequest(request);
    const expiry = ensured.setCookies.filter((header) =>
      header.startsWith(`${SESSION_COOKIE_LEGACY_NAME}=;`),
    );

    expect(ensured.setCookies[0]).toBe(ensured.setCookie);
    expect(expiry).toHaveLength(1);
    expect(expiry[0]).toContain("Domain=.sajtmaskin.se");
    expect(expiry[0]).toContain("Max-Age=0");
  });

  it("keeps the leftover id under the unprefixed name on local HTTP", () => {
    const request = new Request("http://127.0.0.1:3010/api/projects", {
      headers: { cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}` },
    });
    const ensured = ensureSessionIdFromRequest(request);

    expect(ensured.sessionId).toBe(VALID_LEGACY);
    expect(ensured.setCookie).toContain(
      `${SESSION_COOKIE_LEGACY_NAME}=${VALID_LEGACY}`,
    );
    expect(ensured.setCookie).not.toContain(SESSION_COOKIE_HOST_NAME);
    expect(ensured.setCookies).toEqual([ensured.setCookie]);
  });

  it("does not mint a cookie when the __Host- session is already present", () => {
    const request = new Request("https://sajtmaskin.se/api/projects", {
      headers: { cookie: `${SESSION_COOKIE_HOST_NAME}=${VALID_HOST}` },
    });
    expect(ensureSessionIdFromRequest(request)).toEqual({
      sessionId: VALID_HOST,
      setCookie: null,
      setCookies: [],
    });
  });

  it("creates a new session instead of claiming a shadowed leftover pair", () => {
    const request = new Request("https://sajtmaskin.se/api/projects", {
      headers: {
        cookie: `${SESSION_COOKIE_LEGACY_NAME}=${VALID_HOST}; ${SESSION_COOKIE_LEGACY_NAME}=${VALID_PARENT}`,
      },
    });
    const ensured = ensureSessionIdFromRequest(request);
    expect(ensured.sessionId).not.toBe(VALID_HOST);
    expect(ensured.sessionId).not.toBe(VALID_PARENT);
    expect(isGuestSessionId(ensured.sessionId)).toBe(true);
    expect(ensured.setCookie).toContain(`${SESSION_COOKIE_HOST_NAME}=`);
  });
});

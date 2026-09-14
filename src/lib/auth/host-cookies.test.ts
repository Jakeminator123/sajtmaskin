import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_HOST_NAME,
  AUTH_COOKIE_LEGACY_NAME,
  SESSION_COOKIE_HOST_NAME,
  SESSION_COOKIE_LEGACY_NAME,
  expireLeftoverCookieHeader,
  expireLeftoverCookieOptions,
  forwardedProtoIsHttps,
  getAuthTokenFromRequest,
  isGuestSessionId,
  leftoverCookieDomain,
  leftoverGuestClaimId,
  parseCookieHeader,
  pickHostOrLegacyCookie,
  pickHostOrLegacyCookieFromHeader,
  portalCookieApex,
  requestUsesSecureCookies,
} from "./host-cookies";

const HTTPS = { secure: true } as const;
const HTTP = { secure: false } as const;
const VALID_GUEST = "sess_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_GUEST = "sess_11111111-2222-4333-8444-555555555555";

describe("cookie header parse + pick", () => {
  it("collects duplicate names instead of first-wins", () => {
    const parsed = parseCookieHeader(
      `${SESSION_COOKIE_LEGACY_NAME}=aaa; ${SESSION_COOKIE_LEGACY_NAME}=bbb`,
    );
    expect(parsed.get(SESSION_COOKIE_LEGACY_NAME)).toEqual(["aaa", "bbb"]);
  });

  it("prefers __Host- when both names are present", () => {
    for (const policy of [HTTPS, HTTP]) {
      expect(
        pickHostOrLegacyCookieFromHeader(
          `${AUTH_COOKIE_LEGACY_NAME}=legacy; ${AUTH_COOKIE_HOST_NAME}=host`,
          AUTH_COOKIE_HOST_NAME,
          AUTH_COOKIE_LEGACY_NAME,
          policy,
        ),
      ).toEqual({ value: "host", source: "host" });
    }
  });

  it("does not fall back to the leftover name when __Host- is present but unusable", () => {
    const parsed = parseCookieHeader(
      `${AUTH_COOKIE_HOST_NAME}=one; ${AUTH_COOKIE_HOST_NAME}=two; ${AUTH_COOKIE_LEGACY_NAME}=legacy`,
    );
    expect(
      pickHostOrLegacyCookie(
        parsed,
        AUTH_COOKIE_HOST_NAME,
        AUTH_COOKIE_LEGACY_NAME,
        HTTP,
      ),
    ).toBeNull();
  });

  it("rejects two values for the same leftover name (host-only vs parent domain)", () => {
    for (const policy of [HTTPS, HTTP]) {
      expect(
        pickHostOrLegacyCookieFromHeader(
          `${SESSION_COOKIE_LEGACY_NAME}=host_only; ${SESSION_COOKIE_LEGACY_NAME}=parent_domain`,
          SESSION_COOKIE_HOST_NAME,
          SESSION_COOKIE_LEGACY_NAME,
          policy,
        ),
      ).toBeNull();
    }
  });

  it("ignores a lone leftover name on HTTPS but still reads it on local HTTP", () => {
    const header = `${SESSION_COOKIE_LEGACY_NAME}=only-legacy`;
    expect(
      pickHostOrLegacyCookieFromHeader(
        header,
        SESSION_COOKIE_HOST_NAME,
        SESSION_COOKIE_LEGACY_NAME,
        HTTPS,
      ),
    ).toBeNull();
    expect(
      pickHostOrLegacyCookieFromHeader(
        header,
        SESSION_COOKIE_HOST_NAME,
        SESSION_COOKIE_LEGACY_NAME,
        HTTP,
      ),
    ).toEqual({ value: "only-legacy", source: "legacy" });
  });
});

describe("secure cookie policy", () => {
  it("follows the request protocol", () => {
    expect(
      requestUsesSecureCookies(new Request("https://sajtmaskin.se/")),
    ).toBe(true);
    expect(
      requestUsesSecureCookies(new Request("http://127.0.0.1:3010/")),
    ).toBe(false);
  });

  it("reads only the first x-forwarded-proto hop", () => {
    expect(forwardedProtoIsHttps("https")).toBe(true);
    expect(forwardedProtoIsHttps("https,http")).toBe(true);
    expect(forwardedProtoIsHttps("http,https")).toBe(false);
    expect(forwardedProtoIsHttps(null)).toBe(false);
  });
});

describe("auth token from request", () => {
  it("lets Authorization beat any cookie", () => {
    const request = new Request("https://sajtmaskin.se/", {
      headers: {
        authorization: "Bearer from-header",
        cookie: `${AUTH_COOKIE_HOST_NAME}=from-cookie`,
      },
    });
    expect(getAuthTokenFromRequest(request)).toBe("from-header");
  });

  it("refuses a lone leftover auth cookie over HTTPS and accepts it on HTTP", () => {
    const cookie = `${AUTH_COOKIE_LEGACY_NAME}=leftover_jwt`;
    expect(
      getAuthTokenFromRequest(
        new Request("https://sajtmaskin.se/", { headers: { cookie } }),
      ),
    ).toBeNull();
    expect(
      getAuthTokenFromRequest(
        new Request("http://127.0.0.1:3010/", { headers: { cookie } }),
      ),
    ).toBe("leftover_jwt");
  });
});

describe("parent-domain leftover clearing", () => {
  it("derives the portal apex and never a public suffix", () => {
    expect(portalCookieApex("sajtmaskin.se")).toBe("sajtmaskin.se");
    expect(portalCookieApex("preview.sajtmaskin.se")).toBe("sajtmaskin.se");
    expect(portalCookieApex("bistro.sites.sajtmaskin.se")).toBe("sajtmaskin.se");
    expect(portalCookieApex("SAJTMASKIN.SE:443")).toBe("sajtmaskin.se");
    expect(portalCookieApex("www.sajtmaskin.com")).toBe("sajtmaskin.com");
    expect(portalCookieApex("sajtmaskin.vercel.app")).toBeNull();
    expect(portalCookieApex("127.0.0.1:3010")).toBeNull();
    expect(portalCookieApex("notsajtmaskin.se")).toBeNull();
    expect(portalCookieApex(null)).toBeNull();

    expect(leftoverCookieDomain("preview.sajtmaskin.se")).toBe(".sajtmaskin.se");
    expect(leftoverCookieDomain("localhost")).toBeNull();
  });

  it("expires the leftover on the parent Domain a host-only clear cannot reach", () => {
    expect(expireLeftoverCookieOptions("preview.sajtmaskin.se")).toMatchObject({
      domain: ".sajtmaskin.se",
      path: "/",
      maxAge: 0,
      secure: true,
    });
    expect(
      expireLeftoverCookieOptions("sajtmaskin.vercel.app").domain,
    ).toBeUndefined();

    const httpsHeader = expireLeftoverCookieHeader(AUTH_COOKIE_LEGACY_NAME, {
      secure: true,
      host: "sajtmaskin.se",
    });
    expect(httpsHeader).toContain("Domain=.sajtmaskin.se");
    expect(httpsHeader).toContain("Max-Age=0");
    expect(httpsHeader).toContain("Secure");
    expect(httpsHeader).not.toContain("Domain=.se");

    const httpHeader = expireLeftoverCookieHeader(AUTH_COOKIE_LEGACY_NAME, {
      secure: false,
      host: "127.0.0.1:3010",
    });
    expect(httpHeader.toLowerCase()).not.toContain("domain=");
  });
});

describe("guest session format", () => {
  it("accepts the two generateSessionId shapes and rejects arbitrary leftovers", () => {
    expect(isGuestSessionId("sess_01234567-89ab-4def-8123-456789abcdef")).toBe(
      true,
    );
    expect(isGuestSessionId("sess_0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isGuestSessionId("sess_test")).toBe(false);
    expect(isGuestSessionId("guest-session-1")).toBe(false);
    expect(isGuestSessionId("sess_01234567-89AB-4DEF-8123-456789ABCDEF")).toBe(
      false,
    );
  });
});

describe("leftover guest claim source", () => {
  it("returns an unambiguous, format-valid leftover id", () => {
    expect(
      leftoverGuestClaimId(`${SESSION_COOKIE_LEGACY_NAME}=${VALID_GUEST}`),
    ).toBe(VALID_GUEST);
  });

  it("refuses a shadowed leftover so a parent domain cannot move ownership", () => {
    expect(
      leftoverGuestClaimId(
        `${SESSION_COOKIE_LEGACY_NAME}=${VALID_GUEST}; ${SESSION_COOKIE_LEGACY_NAME}=${OTHER_GUEST}`,
      ),
    ).toBeNull();
  });

  it("refuses an ill-formed or absent leftover", () => {
    expect(
      leftoverGuestClaimId(`${SESSION_COOKIE_LEGACY_NAME}=guest-session-1`),
    ).toBeNull();
    expect(
      leftoverGuestClaimId(`${SESSION_COOKIE_HOST_NAME}=${VALID_GUEST}`),
    ).toBeNull();
    expect(leftoverGuestClaimId(null)).toBeNull();
  });
});

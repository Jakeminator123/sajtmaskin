import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_HOST_NAME,
  AUTH_COOKIE_LEGACY_NAME,
  SESSION_COOKIE_HOST_NAME,
  SESSION_COOKIE_LEGACY_NAME,
  getAuthTokenFromRequest,
  isGuestSessionId,
  parseCookieHeader,
  pickHostOrLegacyCookie,
  pickHostOrLegacyCookieFromHeader,
} from "./host-cookies";

describe("cookie header parse + pick", () => {
  it("collects duplicate names instead of first-wins", () => {
    const parsed = parseCookieHeader(
      `${SESSION_COOKIE_LEGACY_NAME}=aaa; ${SESSION_COOKIE_LEGACY_NAME}=bbb`,
    );
    expect(parsed.get(SESSION_COOKIE_LEGACY_NAME)).toEqual(["aaa", "bbb"]);
  });

  it("prefers __Host- when both names are present", () => {
    const picked = pickHostOrLegacyCookieFromHeader(
      `${AUTH_COOKIE_LEGACY_NAME}=legacy; ${AUTH_COOKIE_HOST_NAME}=host`,
      AUTH_COOKIE_HOST_NAME,
      AUTH_COOKIE_LEGACY_NAME,
    );
    expect(picked).toEqual({ value: "host", source: "host" });
  });

  it("does not fall back to the leftover name when __Host- is present but unusable", () => {
    const parsed = parseCookieHeader(
      `${AUTH_COOKIE_HOST_NAME}=one; ${AUTH_COOKIE_HOST_NAME}=two; ${AUTH_COOKIE_LEGACY_NAME}=legacy`,
    );
    expect(
      pickHostOrLegacyCookie(parsed, AUTH_COOKIE_HOST_NAME, AUTH_COOKIE_LEGACY_NAME),
    ).toBeNull();
  });

  it("rejects two values for the same leftover name (host-only vs parent domain)", () => {
    expect(
      pickHostOrLegacyCookieFromHeader(
        `${SESSION_COOKIE_LEGACY_NAME}=host_only; ${SESSION_COOKIE_LEGACY_NAME}=parent_domain`,
        SESSION_COOKIE_HOST_NAME,
        SESSION_COOKIE_LEGACY_NAME,
      ),
    ).toBeNull();
  });

  it("accepts a lone leftover name during the transition window", () => {
    expect(
      pickHostOrLegacyCookieFromHeader(
        `${SESSION_COOKIE_LEGACY_NAME}=only-legacy`,
        SESSION_COOKIE_HOST_NAME,
        SESSION_COOKIE_LEGACY_NAME,
      ),
    ).toEqual({ value: "only-legacy", source: "legacy" });
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

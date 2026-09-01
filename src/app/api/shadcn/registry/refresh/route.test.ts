import { describe, expect, it } from "vitest";
import { isCronRefreshAuthorized } from "./route";

describe("isCronRefreshAuthorized", () => {
  it("fails closed on hosted runtimes when CRON_SECRET is unset", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh");
    expect(isCronRefreshAuthorized(req, { VERCEL_ENV: "production" })).toBe(false);
    expect(isCronRefreshAuthorized(req, { VERCEL_ENV: "preview" })).toBe(false);
  });

  it("allows local/dev without a secret", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh");
    expect(isCronRefreshAuthorized(req, {})).toBe(true);
  });

  it("accepts a matching bearer secret", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh", {
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(
      isCronRefreshAuthorized(req, { CRON_SECRET: "cron-secret", VERCEL_ENV: "production" }),
    ).toBe(true);
  });

  it("rejects a mismatched secret", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh", {
      headers: { authorization: "Bearer other" },
    });
    expect(
      isCronRefreshAuthorized(req, { CRON_SECRET: "cron-secret", VERCEL_ENV: "production" }),
    ).toBe(false);
  });
});

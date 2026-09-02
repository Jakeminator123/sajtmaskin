import { describe, expect, it } from "vitest";
import { isCronRefreshAuthorized } from "./cron-auth";

function envWith(overrides: { CRON_SECRET?: string; VERCEL_ENV?: string }): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

describe("isCronRefreshAuthorized", () => {
  it("fails closed on hosted runtimes when CRON_SECRET is unset", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh");
    expect(isCronRefreshAuthorized(req, envWith({ VERCEL_ENV: "production", CRON_SECRET: "" }))).toBe(
      false,
    );
    expect(isCronRefreshAuthorized(req, envWith({ VERCEL_ENV: "preview", CRON_SECRET: "" }))).toBe(
      false,
    );
  });

  it("allows local/dev without a secret", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh");
    expect(isCronRefreshAuthorized(req, envWith({ VERCEL_ENV: "", CRON_SECRET: "" }))).toBe(true);
  });

  it("accepts a matching bearer secret", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh", {
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(
      isCronRefreshAuthorized(
        req,
        envWith({ CRON_SECRET: "cron-secret", VERCEL_ENV: "production" }),
      ),
    ).toBe(true);
  });

  it("rejects a mismatched secret", () => {
    const req = new Request("http://localhost/api/shadcn/registry/refresh", {
      headers: { authorization: "Bearer other" },
    });
    expect(
      isCronRefreshAuthorized(
        req,
        envWith({ CRON_SECRET: "cron-secret", VERCEL_ENV: "production" }),
      ),
    ).toBe(false);
  });
});

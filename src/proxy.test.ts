import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCspPolicy } from "./proxy";

describe("buildCspPolicy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows Vercel Analytics and Speed Insights in production CSP", () => {
    vi.stubEnv("NODE_ENV", "production");

    const policy = buildCspPolicy(
      "/",
      "nonce_1",
      false,
      ["https://sajtmaskin.se"],
    );

    expect(policy).toContain("script-src 'self' https://sajtmaskin.se 'nonce-nonce_1' https://va.vercel-scripts.com");
    expect(policy).toContain("connect-src 'self' https://sajtmaskin.se");
    expect(policy).toContain("https://vitals.vercel-insights.com");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("keeps preview-render CSP contained to the permissive preview route", () => {
    vi.stubEnv("NODE_ENV", "production");

    const policy = buildCspPolicy(
      "/api/preview-render",
      "nonce_1",
      false,
      ["https://sajtmaskin.se"],
    );

    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("report-uri /api/csp-report");
  });
});

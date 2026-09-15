import { describe, expect, it } from "vitest";
import { isGitPreviewVercelHost, isVerifiedProductionSiteHost } from "./live-site-url";

describe("isGitPreviewVercelHost", () => {
  it("matches Vercel git-branch aliases only", () => {
    expect(isGitPreviewVercelHost("demo-git-feat-x-team.vercel.app")).toBe(true);
    expect(isGitPreviewVercelHost("https://demo-git-preview-team.vercel.app")).toBe(true);
    expect(isGitPreviewVercelHost("demo.vercel.app")).toBe(false);
    expect(isGitPreviewVercelHost("www.kund.se")).toBe(false);
  });

  it("does not treat a per-deployment host as a git alias", () => {
    expect(isGitPreviewVercelHost("demo-a1b2c3-team.vercel.app")).toBe(false);
  });
});

describe("isVerifiedProductionSiteHost", () => {
  it("accepts the attested production alias and a customer host", () => {
    expect(isVerifiedProductionSiteHost("demo.vercel.app", "demo.vercel.app")).toBe(true);
    expect(isVerifiedProductionSiteHost("www.kund.se")).toBe(true);
  });

  it("rejects preview-shaped vercel.app hosts even with a matching project", () => {
    expect(isVerifiedProductionSiteHost("demo-a1b2c3-team.vercel.app", "demo.vercel.app")).toBe(
      false,
    );
    expect(isVerifiedProductionSiteHost("demo-git-feat-x-team.vercel.app", "demo.vercel.app")).toBe(
      false,
    );
    expect(isVerifiedProductionSiteHost("demo.vercel.app", "annat.vercel.app")).toBe(false);
    expect(isVerifiedProductionSiteHost("demo.vercel.app")).toBe(false);
  });
});

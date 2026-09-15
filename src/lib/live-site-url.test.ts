import { describe, expect, it } from "vitest";
import {
  isCurrentProductionSiteHost,
  isGitPreviewVercelHost,
  isProductionProviderVercelHost,
  selectCurrentProductionIdentityUrl,
} from "./live-site-url";

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

describe("isProductionProviderVercelHost", () => {
  it("accepts a production alias and rejects git and unique-deployment hosts", () => {
    expect(isProductionProviderVercelHost("demo.vercel.app")).toBe(true);
    expect(isProductionProviderVercelHost("demo-a1b2c3-team.vercel.app")).toBe(false);
    expect(
      isProductionProviderVercelHost("sajtmaskin-a1b2c3-jakeminator123s-projects.vercel.app"),
    ).toBe(false);
    expect(isProductionProviderVercelHost("demo-git-feat-x-team.vercel.app")).toBe(false);
    expect(isProductionProviderVercelHost("sajtmaskin.vercel.app")).toBe(false);
  });
});

describe("isCurrentProductionSiteHost", () => {
  it("requires current proof for both provider and customer hosts", () => {
    expect(isCurrentProductionSiteHost("demo.vercel.app", { attestedProductionHost: "demo.vercel.app" })).toBe(
      true,
    );
    expect(
      isCurrentProductionSiteHost("www.kund.se", { verifiedCustomerHosts: ["www.kund.se"] }),
    ).toBe(true);
    expect(isCurrentProductionSiteHost("www.kund.se")).toBe(false);
    expect(
      isCurrentProductionSiteHost("demo.sites.sajtmaskin.se", {
        verifiedCustomerHosts: ["demo.sites.sajtmaskin.se"],
      }),
    ).toBe(true);
    expect(isCurrentProductionSiteHost("demo.sites.sajtmaskin.se")).toBe(false);
  });

  it("rejects preview-shaped vercel.app hosts even with a matching project", () => {
    expect(
      isCurrentProductionSiteHost("demo-a1b2c3-team.vercel.app", {
        attestedProductionHost: "demo.vercel.app",
      }),
    ).toBe(false);
    expect(
      isCurrentProductionSiteHost("demo-git-feat-x-team.vercel.app", {
        attestedProductionHost: "demo.vercel.app",
      }),
    ).toBe(false);
    expect(isCurrentProductionSiteHost("demo.vercel.app", { attestedProductionHost: "annat.vercel.app" })).toBe(
      false,
    );
    expect(isCurrentProductionSiteHost("demo.vercel.app")).toBe(false);
  });

  it("keeps a last-working 3-label provider host only while alias status is unknown", () => {
    expect(
      isCurrentProductionSiteHost("kund-project.vercel.app", { allowLastWorkingProvider: true }),
    ).toBe(true);
    expect(
      isCurrentProductionSiteHost("demo-a1b2c3-team.vercel.app", { allowLastWorkingProvider: true }),
    ).toBe(false);
    expect(
      isCurrentProductionSiteHost("www.kund.se", { allowLastWorkingProvider: true }),
    ).toBe(false);
  });
});

describe("selectCurrentProductionIdentityUrl", () => {
  it("uses the attested provider when last-working custom or branded is unverified", () => {
    expect(
      selectCurrentProductionIdentityUrl(
        { url: "https://www.kund.se", providerUrl: "https://demo.vercel.app" },
        { attestedProductionHost: "demo.vercel.app" },
      ),
    ).toBe("https://demo.vercel.app");
    expect(
      selectCurrentProductionIdentityUrl(
        { url: "https://demo.sites.sajtmaskin.se", providerUrl: "https://demo.vercel.app" },
        { attestedProductionHost: "demo.vercel.app" },
      ),
    ).toBe("https://demo.vercel.app");
    expect(
      selectCurrentProductionIdentityUrl(
        { url: "https://www.kund.se", providerUrl: "https://demo.vercel.app" },
        {},
      ),
    ).toBeNull();
  });
});

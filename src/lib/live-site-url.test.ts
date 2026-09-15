import { describe, expect, it } from "vitest";
import {
  isCurrentProductionSiteHost,
  isGitPreviewVercelHost,
  isProductionProviderVercelHost,
  isUniqueVercelDeploymentHost,
  persistableDeploymentUrl,
  pickCustomerFacingProductionAlias,
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

describe("isUniqueVercelDeploymentHost", () => {
  it("matches Vercel {name}-{hash}-{scope} with an 8–12 alphanumeric hash", () => {
    expect(isUniqueVercelDeploymentHost("demo-8fyovx8jc-team.vercel.app")).toBe(true);
    expect(isUniqueVercelDeploymentHost("demo-a1b2c3d4-team.vercel.app")).toBe(true);
    expect(isUniqueVercelDeploymentHost("https://demo-8fyovx8jc-team.vercel.app")).toBe(true);
    expect(
      isUniqueVercelDeploymentHost("sajtmaskin-lotta-bonanova-ec66b7c6-8fyovx8jc.vercel.app"),
    ).toBe(true);
  });

  it("does not treat production-alias hyphen words as a unique hash", () => {
    expect(isUniqueVercelDeploymentHost("demo.vercel.app")).toBe(false);
    expect(isUniqueVercelDeploymentHost("kund-projekt-team.vercel.app")).toBe(false);
    expect(isUniqueVercelDeploymentHost("demo-a1b2c3-team.vercel.app")).toBe(false);
  });
});

describe("isProductionProviderVercelHost", () => {
  it("accepts a production alias and rejects git and unique-deployment hosts", () => {
    expect(isProductionProviderVercelHost("demo.vercel.app")).toBe(true);
    expect(isProductionProviderVercelHost("kund-projekt-team.vercel.app")).toBe(true);
    expect(isProductionProviderVercelHost("demo-8fyovx8jc-team.vercel.app")).toBe(false);
    expect(isProductionProviderVercelHost("demo-a1b2c3d4-team.vercel.app")).toBe(false);
    expect(
      isProductionProviderVercelHost("sajtmaskin-8fyovx8jc-jakeminator123s-projects.vercel.app"),
    ).toBe(false);
    expect(isProductionProviderVercelHost("demo-git-feat-x-team.vercel.app")).toBe(false);
    expect(isProductionProviderVercelHost("sajtmaskin.vercel.app")).toBe(false);
    expect(
      isProductionProviderVercelHost("sajtmaskin-lotta-bonanova-ec66b7c6-8fyovx8jc.vercel.app"),
    ).toBe(false);
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
      isCurrentProductionSiteHost("demo-8fyovx8jc-team.vercel.app", {
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
      isCurrentProductionSiteHost("kund-projekt-team.vercel.app", { allowLastWorkingProvider: true }),
    ).toBe(true);
    expect(
      isCurrentProductionSiteHost("demo-8fyovx8jc-team.vercel.app", { allowLastWorkingProvider: true }),
    ).toBe(false);
    expect(
      isCurrentProductionSiteHost("demo-a1b2c3d4-team.vercel.app", { allowLastWorkingProvider: true }),
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
    expect(
      selectCurrentProductionIdentityUrl(
        {
          url: "https://sajtmaskin-lotta-bonanova-ec66b7c6-8fyovx8jc.vercel.app",
          providerUrl: "https://sajtmaskin-lotta-bonanova-ec66b7c6-8fyovx8jc.vercel.app",
        },
        { attestedProductionHost: "sajtmaskin-lotta-bonanova-ec66b7c6.vercel.app" },
      ),
    ).toBeNull();
  });
});

describe("persistableDeploymentUrl", () => {
  it("writes policyUrl when present, including proven custom", () => {
    expect(
      persistableDeploymentUrl({
        policyUrl: "https://demo.vercel.app",
        candidateUrl: "https://www.kund.se",
      }),
    ).toBe("https://demo.vercel.app");
    expect(
      persistableDeploymentUrl({
        policyUrl: "https://www.kund.se",
        candidateUrl: "https://demo.vercel.app",
      }),
    ).toBe("https://www.kund.se");
  });

  it("does not persist resolveLiveUrl-custom when policy is absent", () => {
    expect(
      persistableDeploymentUrl({
        policyUrl: null,
        candidateUrl: "https://www.kund.se",
        verifiedCustomerHosts: ["www.kund.se"],
      }),
    ).toBeNull();
  });

  it("keeps an already stored alias instead of overwriting with custom", () => {
    expect(
      persistableDeploymentUrl({
        existingUrl: "https://demo.vercel.app",
        candidateUrl: "https://www.kund.se",
        verifiedCustomerHosts: ["www.kund.se"],
      }),
    ).toBe("https://demo.vercel.app");
  });

  it("keeps an already stored verified custom host", () => {
    expect(
      persistableDeploymentUrl({
        existingUrl: "https://www.kund.se",
        candidateUrl: "https://demo.vercel.app",
        verifiedCustomerHosts: ["www.kund.se"],
      }),
    ).toBe("https://www.kund.se");
  });

  it("does not keep unverified custom or branded hosts as last-working", () => {
    expect(
      persistableDeploymentUrl({
        existingUrl: "https://www.kund.se",
        candidateUrl: "https://demo.vercel.app",
      }),
    ).toBe("https://demo.vercel.app");
    expect(
      persistableDeploymentUrl({
        existingUrl: "https://old.sites.sajtmaskin.se",
        candidateUrl: "https://legacy-provider.vercel.app",
      }),
    ).toBe("https://legacy-provider.vercel.app");
  });

  it("persists a provider alias candidate and rejects unique or git hosts", () => {
    expect(persistableDeploymentUrl({ candidateUrl: "https://demo.vercel.app" })).toBe(
      "https://demo.vercel.app",
    );
    expect(persistableDeploymentUrl({ candidateUrl: "demo.vercel.app" })).toBe(
      "https://demo.vercel.app",
    );
    expect(
      persistableDeploymentUrl({ candidateUrl: "https://demo-8fyovx8jc-team.vercel.app" }),
    ).toBeNull();
    expect(
      persistableDeploymentUrl({
        existingUrl: "https://demo-8fyovx8jc-team.vercel.app",
        candidateUrl: "https://demo-git-feat-x-team.vercel.app",
      }),
    ).toBeNull();
  });

  it("writes an attested policy alias even when the 8–12 heuristic would flag it", () => {
    expect(
      persistableDeploymentUrl({
        policyUrl: "https://sajtmaskin-lotta-bonanova-ec66b7c6.vercel.app",
        candidateUrl: "https://sajtmaskin-lotta-bonanova-ec66b7c6-8fyovx8jc.vercel.app",
      }),
    ).toBe("https://sajtmaskin-lotta-bonanova-ec66b7c6.vercel.app");
  });

  it("rejects a git policyUrl", () => {
    expect(
      persistableDeploymentUrl({
        policyUrl: "https://demo-git-feat-x-team.vercel.app",
        candidateUrl: "https://demo.vercel.app",
      }),
    ).toBeNull();
  });
});

describe("pickCustomerFacingProductionAlias", () => {
  it("picks the shortest customer-facing alias among team and user suffixes", () => {
    expect(
      pickCustomerFacingProductionAlias([
        "sajtmaskin-simon-1f7c897f-jakeminator0-jakeminator123s-projects.vercel.app",
        "sajtmaskin-simon-1f7c897f-jakeminator123s-projects.vercel.app",
        "sajtmaskin-simon-1f7c897f.vercel.app",
      ]),
    ).toBe("sajtmaskin-simon-1f7c897f.vercel.app");
  });

  it("uses the payload alias when Vercel truncated the project name", () => {
    expect(
      pickCustomerFacingProductionAlias([
        "sajtmaskin-bygg-en-komplett-fungerande-oc-a846ed4f-jakeminator123s-projects.vercel.app",
        "sajtmaskin-bygg-en-komplett-fungera.vercel.app",
      ]),
    ).toBe("sajtmaskin-bygg-en-komplett-fungera.vercel.app");
  });

  it("does not invent a shorter host from project-name-like words", () => {
    expect(pickCustomerFacingProductionAlias(["aaa-red-one.vercel.app"])).toBe(
      "aaa-red-one.vercel.app",
    );
  });
});

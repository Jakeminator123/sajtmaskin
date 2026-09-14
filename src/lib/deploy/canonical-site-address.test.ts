import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANONICAL_ADDRESS_FEATURE_ENV,
  applyCanonicalHostRedirect,
  isCanonicalAddressContractEnabled,
  prepareCanonicalAddressContract,
  type CanonicalAddressDeployIdentity,
  type CanonicalHostRedirectCandidate,
} from "./canonical-site-address";

const identity = {
  projectId: "project-1",
  vercelProjectId: "prj_1",
  target: "production" as const,
  verifiedLiveUrl: "https://www.kund.se",
  verifiedProviderDomain: "kund-project.vercel.app",
};

const candidate: CanonicalHostRedirectCandidate = {
  canonicalUrl: "https://www.kund.se",
  providerHost: "kund-project.vercel.app",
  projectId: "project-1",
  vercelProjectId: "prj_1",
  target: "production",
};

const deployIdentity: CanonicalAddressDeployIdentity = {
  projectId: candidate.projectId,
  vercelProjectId: candidate.vercelProjectId,
  target: "production",
};

describe("canonical site address contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is default off and accepts only affirmative feature values", () => {
    vi.stubEnv(CANONICAL_ADDRESS_FEATURE_ENV, undefined);
    expect(isCanonicalAddressContractEnabled(undefined)).toBe(false);
    expect(isCanonicalAddressContractEnabled("false")).toBe(false);
    expect(isCanonicalAddressContractEnabled("true")).toBe(true);
  });

  it("leaves customer env untouched while the feature is off", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: false,
      configuredEnv: { NEXT_PUBLIC_SITE_URL: "https://old.example" },
    });
    expect(result.envVars).toEqual({ NEXT_PUBLIC_SITE_URL: "https://old.example" });
    expect(result.contract.redirectReady).toBe(false);
    expect(result.contract.activationReason).toBe("feature_disabled");
    expect(result.hostRedirectCandidate).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("keeps activation closed even when the feature flag is requested", () => {
    vi.stubEnv(CANONICAL_ADDRESS_FEATURE_ENV, "true");
    const configuredEnv = {
      NEXT_PUBLIC_SITE_URL: "https://wrong.example",
      CUSTOMER_SETTING: "preserved",
    };
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: isCanonicalAddressContractEnabled(),
      configuredEnv,
    });
    expect(result.envVars).toEqual({
      NEXT_PUBLIC_SITE_URL: "https://wrong.example",
      CUSTOMER_SETTING: "preserved",
    });
    expect(result.contract.requested).toBe(true);
    expect(result.contract.enabled).toBe(false);
    expect(result.contract.redirectReady).toBe(false);
    expect(result.contract.activationReason).toBe("activation_not_ready");
    expect(result.hostRedirectCandidate).toBeNull();
    expect(result.warnings).toEqual([]);
    const files = [{ name: "vercel.json", content: '{"framework":"nextjs"}' }];
    expect(applyCanonicalHostRedirect(files, result.hostRedirectCandidate, deployIdentity)).toEqual(
      {
        files,
        warnings: [],
        applied: false,
      },
    );
  });

  it("does not discard configured identity while provider status is unknown", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      verifiedProviderDomain: null,
      configuredEnv: { NEXT_PUBLIC_SITE_URL: "https://old.example" },
    });
    expect(result.envVars.NEXT_PUBLIC_SITE_URL).toBe("https://old.example");
    expect(result.contract.redirectReady).toBe(false);
    expect(result.contract.canonicalUrl).toBe("https://www.kund.se");
  });

  it("never redirects protected preview deployments", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      target: "preview",
      configuredEnv: {},
    });
    expect(result.envVars.NEXT_PUBLIC_SITE_URL).toBeUndefined();
    expect(result.contract.redirectReady).toBe(false);
  });

  it("merges an exact temporary host redirect and preserves customer config", () => {
    const result = applyCanonicalHostRedirect(
      [
        {
          name: "vercel.json",
          content: JSON.stringify({
            framework: "nextjs",
            redirects: [{ source: "/old", destination: "/new", permanent: true }],
          }),
        },
      ],
      candidate,
      deployIdentity,
    );
    const config = JSON.parse(result.files[0].content) as {
      framework: string;
      redirects: Array<Record<string, unknown>>;
    };
    expect(config.framework).toBe("nextjs");
    expect(config.redirects).toHaveLength(2);
    expect(config.redirects[0]).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: { eq: "kund-project.vercel.app" } }],
      destination: "https://www.kund.se/:path*",
      permanent: false,
    });
    expect(config.redirects[1]).toEqual({ source: "/old", destination: "/new", permanent: true });
    expect(applyCanonicalHostRedirect(result.files, candidate, deployIdentity).files).toEqual(
      result.files,
    );
  });

  it("does not overwrite malformed or competing Vercel config", () => {
    for (const content of ["{", '{"redirects":null}', '{"redirects":{"source":"/old"}}']) {
      const malformed = [{ name: "vercel.json", content }];
      expect(applyCanonicalHostRedirect(malformed, candidate, deployIdentity)).toMatchObject({
        files: malformed,
        applied: false,
        warnings: [expect.stringContaining("inte kunde slås ihop")],
      });
    }
    for (const name of ["vercel.ts", "vercel.toml"]) {
      const competing = [{ name, content: "" }];
      for (const files of [competing, [...competing, { name: "vercel.json", content: "{}" }]]) {
        expect(applyCanonicalHostRedirect(files, candidate, deployIdentity)).toMatchObject({
          files,
          applied: false,
          warnings: [expect.stringContaining("vercel.ts")],
        });
      }
    }
  });

  it("rejects duplicate root-equivalent vercel.json files", () => {
    const files = [
      { name: "vercel.json", content: "{}" },
      { name: "/vercel.json", content: '{"framework":"nextjs"}' },
    ];
    const result = applyCanonicalHostRedirect(files, candidate, deployIdentity);
    expect(result).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("flera root-ekvivalenta vercel.json")],
    });
    expect(result.files).toBe(files);
  });

  it("preserves customer catch-all redirects that differ from the generated rule", () => {
    const host = { type: "host", value: { eq: candidate.providerHost } };
    const generatedShape = {
      source: "/:path*",
      has: [host],
      destination: `${candidate.canonicalUrl}/:path*`,
      permanent: false,
    };
    const customerRedirects = [
      { ...generatedShape, has: [host, { type: "header", key: "x-customer", value: "yes" }] },
      { ...generatedShape, destination: "https://customer.example/:path*" },
      { ...generatedShape, permanent: true },
      { ...generatedShape, missing: [{ type: "query", key: "preview" }] },
    ];
    const result = applyCanonicalHostRedirect(
      [{ name: "vercel.json", content: JSON.stringify({ redirects: customerRedirects }) }],
      candidate,
      deployIdentity,
    );
    const config = JSON.parse(result.files[0].content) as { redirects: unknown[] };
    expect(config.redirects).toEqual([generatedShape, ...customerRedirects]);
  });

  it.each([
    ["project", { ...deployIdentity, projectId: "project-2" }],
    ["Vercel project", { ...deployIdentity, vercelProjectId: "prj_2" }],
  ])("rejects a candidate for a different %s", (_label, identity) => {
    const files = [{ name: "vercel.json", content: "{}" }];
    const result = applyCanonicalHostRedirect(files, candidate, identity);
    expect(result).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("projektidentitet")],
    });
    expect(result.files).toBe(files);
  });

  it.each([
    ["current deploy", candidate, { ...deployIdentity, target: "preview" as const }],
    [
      "candidate",
      { ...candidate, target: "preview" } as unknown as CanonicalHostRedirectCandidate,
      deployIdentity,
    ],
  ])("rejects a non-production %s", (_label, redirectCandidate, identity) => {
    const files = [{ name: "vercel.json", content: "{}" }];
    const result = applyCanonicalHostRedirect(files, redirectCandidate, identity);
    expect(result).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("produktionsdeploy")],
    });
    expect(result.files).toBe(files);
  });

  it.each([
    ["scheme", "http://www.kund.se"],
    ["path", "https://www.kund.se/path"],
    ["credentials", "https://user:secret@www.kund.se"],
    ["port", "https://www.kund.se:444"],
  ])("rejects a canonical URL with %s", (_label, canonicalUrl) => {
    const files = [{ name: "vercel.json", content: "{}" }];
    const result = applyCanonicalHostRedirect(
      files,
      { ...candidate, canonicalUrl },
      deployIdentity,
    );
    expect(result).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("HTTPS-origin")],
    });
    expect(result.files).toBe(files);
  });

  it.each([
    ["scheme", "https://kund-project.vercel.app"],
    ["path", "kund-project.vercel.app/path"],
    ["credentials", "user@kund-project.vercel.app"],
    ["port", "kund-project.vercel.app:443"],
  ])("rejects a provider host with %s", (_label, providerHost) => {
    const files = [{ name: "vercel.json", content: "{}" }];
    const result = applyCanonicalHostRedirect(
      files,
      { ...candidate, providerHost },
      deployIdentity,
    );
    expect(result).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("bart värdnamn")],
    });
    expect(result.files).toBe(files);
  });

  it("rejects a self-redirect after hostname normalization", () => {
    const files = [{ name: "vercel.json", content: "{}" }];
    const result = applyCanonicalHostRedirect(
      files,
      {
        ...candidate,
        canonicalUrl: "https://KUND-PROJECT.VERCEL.APP.",
        providerHost: "kund-project.vercel.app.",
      },
      deployIdentity,
    );
    expect(result).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("samma värd")],
    });
    expect(result.files).toBe(files);
  });
});

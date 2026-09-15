import { afterEach, describe, expect, it, vi } from "vitest";
import { PLACEHOLDER_SITE_URL } from "@/lib/seo/audit";
import {
  CANONICAL_HTTPS_PROOF_KIND,
  type CanonicalHttpsProofResult,
} from "./canonical-https-proof";
import {
  CANONICAL_ADDRESS_FEATURE_ENV,
  applyCanonicalHostRedirect,
  applyCanonicalMetadataToFiles,
  isCanonicalAddressContractEnabled,
  prepareCanonicalAddressContract,
  shouldProbeCanonicalHttps,
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

function readyProof(
  overrides: Partial<Extract<CanonicalHttpsProofResult, { status: "ready" }>["proof"]> = {},
): CanonicalHttpsProofResult {
  return {
    status: "ready",
    proof: {
      kind: CANONICAL_HTTPS_PROOF_KIND,
      version: 1,
      origin: "https://www.kund.se",
      hostname: "www.kund.se",
      projectId: "project-1",
      vercelProjectId: "prj_1",
      verifiedAt: "2026-09-15T01:00:00.000Z",
      certificateHosts: ["www.kund.se"],
      serverName: "www.kund.se",
      statusCode: 200,
      ...overrides,
    },
  };
}

describe("canonical site address contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is default off and accepts only affirmative feature values", () => {
    vi.stubEnv(CANONICAL_ADDRESS_FEATURE_ENV, undefined);
    expect(isCanonicalAddressContractEnabled(undefined)).toBe(false);
    expect(isCanonicalAddressContractEnabled("false")).toBe(false);
    expect(isCanonicalAddressContractEnabled("true")).toBe(true);
  });

  it("sets SITE_URL from verified identity even when the flag and SEO are off", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: false,
      providerAliasStatus: "attested",
      configuredEnv: {
        NEXT_PUBLIC_SITE_URL: "https://old.example",
        CUSTOMER_SETTING: "preserved",
      },
    });
    expect(result.envVars).toEqual({
      NEXT_PUBLIC_SITE_URL: "https://www.kund.se",
      CUSTOMER_SETTING: "preserved",
    });
    expect(result.warnings[0]).toContain("skiljer sig");
    expect(result.contract.redirectReady).toBe(false);
    expect(result.contract.activationReason).toBe("feature_disabled");
    expect(result.hostRedirectCandidate).toBeNull();
  });

  it("keeps activation closed when the flag is on but proof or alias is missing", () => {
    vi.stubEnv(CANONICAL_ADDRESS_FEATURE_ENV, "true");
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: isCanonicalAddressContractEnabled(),
      providerAliasStatus: "attested",
      configuredEnv: { NEXT_PUBLIC_SITE_URL: "https://wrong.example", CUSTOMER_SETTING: "kept" },
    });
    expect(result.envVars).toEqual({
      NEXT_PUBLIC_SITE_URL: "https://www.kund.se",
      CUSTOMER_SETTING: "kept",
    });
    expect(result.contract.requested).toBe(true);
    expect(result.contract.enabled).toBe(false);
    expect(result.contract.redirectReady).toBe(false);
    expect(result.contract.activationReason).toBe("https_not_ready");
    expect(result.hostRedirectCandidate).toBeNull();
    const files = [{ name: "vercel.json", content: '{"framework":"nextjs"}' }];
    expect(applyCanonicalHostRedirect(files, result.hostRedirectCandidate, deployIdentity)).toEqual(
      {
        files,
        warnings: [],
        applied: false,
        noindexApplied: false,
      },
    );
  });

  it("emits a 307 candidate only when flag, attested alias and HTTPS proof all hold", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      providerAliasStatus: "attested",
      httpsProof: readyProof(),
      configuredEnv: { NEXT_PUBLIC_SITE_URL: "https://wrong.example" },
    });
    expect(result.contract).toMatchObject({
      enabled: true,
      redirectReady: true,
      activationReason: "ready",
      canonicalUrl: "https://www.kund.se",
      pendingAddress: null,
    });
    expect(result.hostRedirectCandidate).toEqual(candidate);
    expect(result.envVars.NEXT_PUBLIC_SITE_URL).toBe("https://www.kund.se");
  });

  it("does not discard last-working identity while provider status is unknown", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      verifiedProviderDomain: null,
      providerAliasStatus: "unknown",
      lastWorkingCanonicalUrl: "https://www.kund.se",
      lastWorkingProviderHost: "kund-project.vercel.app",
      httpsProof: { status: "not_ready", verdict: "unknown", reason: "provider_unknown" },
      configuredEnv: { NEXT_PUBLIC_SITE_URL: "https://old.example" },
    });
    expect(result.envVars.NEXT_PUBLIC_SITE_URL).toBe("https://www.kund.se");
    expect(result.contract.usedLastWorkingIdentity).toBe(true);
    expect(result.contract.activationReason).toBe("provider_unknown");
    expect(result.hostRedirectCandidate).toEqual(candidate);
  });

  it("falls back to last working when a new candidate is confirmed invalid", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      verifiedLiveUrl: "https://trasig.se",
      providerAliasStatus: "attested",
      lastWorkingCanonicalUrl: "https://www.kund.se",
      lastWorkingProviderHost: "kund-project.vercel.app",
      httpsProof: { status: "not_ready", verdict: "invalid", reason: "cert_mismatch" },
      configuredEnv: {},
    });
    expect(result.contract.canonicalUrl).toBe("https://www.kund.se");
    expect(result.contract.pendingAddress).toBe("https://trasig.se");
    expect(result.contract.usedLastWorkingIdentity).toBe(true);
    expect(result.contract.enabled).toBe(false);
    expect(result.hostRedirectCandidate).toEqual(candidate);
  });

  it("never lets a free env value become the canonical or redirect target", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      verifiedLiveUrl: null,
      verifiedProviderDomain: null,
      featureRequested: true,
      configuredEnv: { NEXT_PUBLIC_SITE_URL: "https://old.example" },
    });
    expect(result.envVars.NEXT_PUBLIC_SITE_URL).toBeUndefined();
    expect(result.hostRedirectCandidate).toBeNull();
    expect(result.warnings[0]).toContain("verifierad projektidentitet");
  });

  it("never redirects protected preview deployments but still sets SITE_URL", () => {
    const result = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      target: "preview",
      providerAliasStatus: "attested",
      httpsProof: readyProof(),
      configuredEnv: {},
    });
    expect(result.envVars.NEXT_PUBLIC_SITE_URL).toBe("https://www.kund.se");
    expect(result.contract.redirectReady).toBe(false);
    expect(result.contract.activationReason).toBe("preview_protected");
    expect(result.hostRedirectCandidate).toBeNull();
  });

  it("rejects same-host and wrong-project proofs", () => {
    const sameHost = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      verifiedLiveUrl: "https://kund-project.vercel.app",
      providerAliasStatus: "attested",
      httpsProof: readyProof({
        origin: "https://kund-project.vercel.app",
        hostname: "kund-project.vercel.app",
      }),
      configuredEnv: {},
    });
    expect(sameHost.contract.activationReason).toBe("same_host");
    expect(sameHost.hostRedirectCandidate).toBeNull();

    const otherProject = prepareCanonicalAddressContract({
      ...identity,
      featureRequested: true,
      providerAliasStatus: "attested",
      httpsProof: readyProof({ projectId: "project-2" }),
      configuredEnv: {},
    });
    expect(otherProject.contract.activationReason).toBe("https_not_ready");
    expect(otherProject.hostRedirectCandidate).toBeNull();
  });

  it("does not probe when flag is off or hosts already match", () => {
    expect(
      shouldProbeCanonicalHttps({
        featureRequested: false,
        target: "production",
        verifiedLiveUrl: "https://www.kund.se",
        attestedProviderHost: "kund-project.vercel.app",
      }),
    ).toBe(false);
    expect(
      shouldProbeCanonicalHttps({
        featureRequested: true,
        target: "production",
        verifiedLiveUrl: "https://kund-project.vercel.app",
        attestedProviderHost: "kund-project.vercel.app",
      }),
    ).toBe(false);
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
      { ...generatedShape, permanent: true },
      { ...generatedShape, missing: [{ type: "query", key: "preview" }] },
    ];
    const previousManaged = { ...generatedShape, destination: "https://old.kund.se/:path*" };
    const result = applyCanonicalHostRedirect(
      [
        {
          name: "vercel.json",
          content: JSON.stringify({ redirects: [...customerRedirects, previousManaged] }),
        },
      ],
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

  it("replaces a previous managed redirect when the canonical target changes", () => {
    const files = [
      {
        name: "vercel.json",
        content: JSON.stringify({
          redirects: [
            {
              source: "/:path*",
              has: [{ type: "host", value: { eq: candidate.providerHost } }],
              destination: "https://old.kund.se/:path*",
              permanent: false,
            },
          ],
        }),
      },
    ];
    const result = applyCanonicalHostRedirect(files, candidate, deployIdentity);
    const config = JSON.parse(result.files[0].content) as { redirects: unknown[] };
    expect(config.redirects).toEqual([
      {
        source: "/:path*",
        has: [{ type: "host", value: { eq: candidate.providerHost } }],
        destination: `${candidate.canonicalUrl}/:path*`,
        permanent: false,
      },
    ]);
  });

  it("adds provider-only noindex and never tags the primary host", () => {
    const result = applyCanonicalHostRedirect(
      [{ name: "vercel.json", content: JSON.stringify({ framework: "nextjs" }) }],
      candidate,
      deployIdentity,
      { noindexHost: candidate.providerHost, primaryHost: "www.kund.se" },
    );
    const config = JSON.parse(result.files[0].content) as {
      headers: Array<Record<string, unknown>>;
    };
    expect(result.noindexApplied).toBe(true);
    expect(config.headers[0]).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: { eq: candidate.providerHost } }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    });

    const primaryOnly = applyCanonicalHostRedirect(
      [{ name: "vercel.json", content: "{}" }],
      null,
      deployIdentity,
      { noindexHost: "www.kund.se", primaryHost: "www.kund.se" },
    );
    expect(primaryOnly).toMatchObject({ applied: false, noindexApplied: false });
    expect(primaryOnly.files[0].content).toBe("{}");
  });

  it("adds global noindex on protected preview deploys", () => {
    const result = applyCanonicalHostRedirect(
      [{ name: "vercel.json", content: "{}" }],
      null,
      { ...deployIdentity, target: "preview" },
      { previewNoindex: true, primaryHost: "www.kund.se" },
    );
    const config = JSON.parse(result.files[0].content) as {
      headers: Array<Record<string, unknown>>;
    };
    expect(result.noindexApplied).toBe(true);
    expect(config.headers[0]).toEqual({
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
    });
  });

  it("fails closed when existing headers cannot be merged", () => {
    const files = [{ name: "vercel.json", content: '{"headers":null}' }];
    expect(applyCanonicalHostRedirect(files, candidate, deployIdentity)).toMatchObject({
      files,
      applied: false,
      warnings: [expect.stringContaining("inte kunde slås ihop")],
    });
  });

  it("rewrites leftover example.com placeholders in existing metadata files", () => {
    const files = [
      {
        name: "app/layout.tsx",
        content: `const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "${PLACEHOLDER_SITE_URL}";`,
      },
      {
        name: "src/app/sitemap.ts",
        content: `export default function sitemap() { return [{ url: "${PLACEHOLDER_SITE_URL}" }]; }`,
      },
      { name: "app/page.tsx", content: `const keep = "${PLACEHOLDER_SITE_URL}";` },
    ];
    const result = applyCanonicalMetadataToFiles(files, "https://www.kund.se");
    expect(result.rewritten).toEqual(["app/layout.tsx", "src/app/sitemap.ts"]);
    expect(result.files[0].content).toContain("https://www.kund.se");
    expect(result.files[1].content).toContain("https://www.kund.se");
    expect(result.files[2].content).toContain(PLACEHOLDER_SITE_URL);
  });
});

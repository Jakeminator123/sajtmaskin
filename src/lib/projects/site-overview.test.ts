import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  inFlightDeploymentId,
  resolveOverviewAddress,
  resolveSiteAddress,
  selectLivePublishIdentity,
  toPublishState,
} from "./site-overview";

const ORIGINAL_ENV = { ...process.env };

function enableBrandedGate(domain = "sites.sajtmaskin.se") {
  process.env.SAJTMASKIN_BRANDED_LIVE_URLS = "true";
  process.env.SAJTMASKIN_LIVE_SITE_DOMAIN = domain;
  process.env.SAJTMASKIN_BRANDED_PILOT_ALLOWLIST = JSON.stringify([
    { projectId: "project_1", versionId: "version_1", filesRevision: "revision_1" },
  ]);
}

beforeEach(() => {
  delete process.env.SAJTMASKIN_BRANDED_LIVE_URLS;
  delete process.env.SAJTMASKIN_LIVE_SITE_DOMAIN;
  delete process.env.SAJTMASKIN_BRANDED_PILOT_ALLOWLIST;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveSiteAddress", () => {
  it("classifies a verified custom domain as the customer's own", () => {
    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      customDomain: "kundforetag.se",
      customDomainVerifiedAt: new Date("2026-09-01"),
    });

    expect(result).toEqual({ liveUrl: "https://kundforetag.se", kind: "custom" });
  });

  it("keeps a reviewed branded host on the provider URL until activation is safe", () => {
    enableBrandedGate();

    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      brandedDomain: "kundforetag.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: new Date("2026-09-01"),
      projectId: "project_1",
      versionId: "version_1",
    });

    expect(result).toEqual({
      liveUrl: "https://generated-abc.vercel.app",
      kind: "provider",
    });
  });

  it("falls back to provider and labels it as such when the branded gate is off", () => {
    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      brandedDomain: "kundforetag.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: new Date("2026-09-01"),
      projectId: "project_1",
      versionId: "version_1",
    });

    // The gate being off must not present the branded host as live — and the
    // portal must be able to tell that what it got is a technical address.
    expect(result).toEqual({ liveUrl: "https://generated-abc.vercel.app", kind: "provider" });
  });

  it("does not treat an unverified custom domain as live", () => {
    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      customDomain: "kundforetag.se",
      customDomainVerifiedAt: null,
    });

    expect(result).toEqual({ liveUrl: "https://generated-abc.vercel.app", kind: "provider" });
  });

  it("prefers a verified custom domain over a verified branded host", () => {
    enableBrandedGate();

    const result = resolveSiteAddress({
      providerUrl: "generated-abc.vercel.app",
      brandedDomain: "kundforetag.sites.sajtmaskin.se",
      brandedDomainVerifiedAt: new Date("2026-09-01"),
      customDomain: "kundforetag.se",
      customDomainVerifiedAt: new Date("2026-09-02"),
    });

    expect(result).toEqual({ liveUrl: "https://kundforetag.se", kind: "custom" });
  });

  it("reports no address when nothing is published", () => {
    expect(resolveSiteAddress({ providerUrl: null })).toEqual({ liveUrl: null, kind: "none" });
  });
});

describe("resolveOverviewAddress", () => {
  it("classifies a ready row whose only host lives in deployments.url", () => {
    // Older rows never got providerUrl written; the deploy list already
    // recovers the vercel.app host via resolveLegacyProviderUrl.
    const result = resolveOverviewAddress(
      {},
      { providerUrl: null, url: "https://generated-abc.vercel.app" },
    );

    expect(result).toEqual({
      liveUrl: "https://generated-abc.vercel.app",
      kind: "provider",
    });
  });

  it("classifies a verified custom host even without a ready row", () => {
    const result = resolveOverviewAddress(
      {
        customDomain: "kundforetag.se",
        customDomainVerifiedAt: new Date("2026-09-01"),
      },
      null,
    );

    expect(result).toEqual({ liveUrl: "https://kundforetag.se", kind: "custom" });
  });

  it("does not present branded without the reviewed live version identity", () => {
    enableBrandedGate();

    const result = resolveOverviewAddress(
      {
        projectId: "project_1",
        brandedDomain: "kundforetag.sites.sajtmaskin.se",
        brandedDomainVerifiedAt: new Date("2026-09-01"),
      },
      null,
    );

    expect(result).toEqual({ liveUrl: null, kind: "none" });
  });

  it("does not expose branded from a reviewed version without a provider URL", () => {
    enableBrandedGate();

    const result = resolveOverviewAddress(
      {
        projectId: "project_1",
        brandedDomain: "kundforetag.sites.sajtmaskin.se",
        brandedDomainVerifiedAt: new Date("2026-09-01"),
      },
      { versionId: "version_1" },
    );

    expect(result).toEqual({ liveUrl: null, kind: "none" });
  });

  it("does not invent a provider address from a non-vercel deployments.url", () => {
    expect(
      resolveOverviewAddress({}, { providerUrl: null, url: "https://kundforetag.se" }),
    ).toEqual({ liveUrl: null, kind: "none" });
  });
});

describe("selectLivePublishIdentity", () => {
  const productionA = {
    id: "dep_a",
    chatId: "chat_1",
    versionId: "ver_a",
    status: "ready",
    url: "https://demo.vercel.app",
    providerUrl: "https://demo.vercel.app",
    vercelProjectId: "vp_1",
    vercelDeploymentId: "dpl_a",
    updatedAt: new Date("2026-09-10T08:00:00Z"),
  };
  const previewB = {
    id: "dep_b",
    chatId: "chat_1",
    versionId: "ver_b",
    status: "ready",
    url: "https://demo-8fyovx8jc-team.vercel.app",
    providerUrl: "https://demo-8fyovx8jc-team.vercel.app",
    vercelProjectId: "vp_1",
    vercelDeploymentId: "dpl_b",
    updatedAt: new Date("2026-09-11T08:00:00Z"),
  };
  const failedC = {
    id: "dep_c",
    chatId: "chat_1",
    versionId: "ver_c",
    status: "error",
    url: null,
    providerUrl: null,
    vercelProjectId: "vp_1",
    vercelDeploymentId: "dpl_c",
    updatedAt: new Date("2026-09-12T08:00:00Z"),
  };

  it("keeps production A after a later preview READY and a failed deploy", () => {
    const live = selectLivePublishIdentity([failedC, previewB, productionA], {
      vercelProjectId: "vp_1",
      productionDeploymentId: "dpl_a",
    });

    expect(live?.versionId).toBe("ver_a");
    expect(live?.id).toBe("dep_a");
  });

  it("does not guess the newest READY when production identity is unknown", () => {
    expect(
      selectLivePublishIdentity([failedC, previewB, productionA], {
        vercelProjectId: "vp_1",
        productionDeploymentId: null,
      }),
    ).toBeNull();
  });

  it("does not treat a READY hostname or approved domain as production", () => {
    expect(
      selectLivePublishIdentity(
        [
          {
            ...previewB,
            url: "https://www.kund.se",
            providerUrl: "https://demo.vercel.app",
          },
          productionA,
        ],
        { vercelProjectId: "vp_1", productionDeploymentId: "dpl_missing" },
      ),
    ).toBeNull();
  });

  it("keeps a rolled-back older production deploy over a newer READY", () => {
    const live = selectLivePublishIdentity([previewB, productionA], {
      vercelProjectId: "vp_1",
      productionDeploymentId: "dpl_a",
    });
    expect(live?.versionId).toBe("ver_a");
  });

  it("rejects a matching deployment id on another Vercel project", () => {
    expect(
      selectLivePublishIdentity([{ ...productionA, vercelProjectId: "vp_other" }], {
        vercelProjectId: "vp_1",
        productionDeploymentId: "dpl_a",
      }),
    ).toBeNull();
  });

  it("does not invent identity from a legacy READY row without a deployment id", () => {
    expect(
      selectLivePublishIdentity(
        [{ ...productionA, vercelDeploymentId: null }],
        { vercelProjectId: "vp_1", productionDeploymentId: "dpl_a" },
      ),
    ).toBeNull();
  });
});

describe("inFlightDeploymentId", () => {
  it("exposes the newest id only while the build is pending or building", () => {
    expect(inFlightDeploymentId({ id: "dep_1", status: "building" })).toBe("dep_1");
    expect(inFlightDeploymentId({ id: "dep_2", status: "pending" })).toBe("dep_2");
    expect(inFlightDeploymentId({ id: "dep_3", status: "queued" })).toBe("dep_3");
  });

  it("is null once the newest deployment is terminal", () => {
    expect(inFlightDeploymentId({ id: "dep_4", status: "ready" })).toBeNull();
    expect(inFlightDeploymentId({ id: "dep_5", status: "error" })).toBeNull();
    expect(inFlightDeploymentId({ id: "dep_6", status: "cancelled" })).toBeNull();
    expect(inFlightDeploymentId(null)).toBeNull();
  });
});

describe("toPublishState", () => {
  it.each([
    ["ready", "ready"],
    ["READY", "ready"],
    ["error", "error"],
    ["building", "building"],
    ["cancelled", "cancelled"],
    ["canceled", "cancelled"],
  ])("maps %s to %s", (input, expected) => {
    expect(toPublishState(input)).toBe(expected);
  });

  it("treats unknown and missing status as pending rather than ready", () => {
    expect(toPublishState(null)).toBe("pending");
    expect(toPublishState("queued")).toBe("pending");
    expect(toPublishState("something-new")).toBe("pending");
  });
});

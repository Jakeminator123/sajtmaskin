import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const getProjectDomain = vi.hoisted(() => vi.fn());
const removeDomainFromProject = vi.hoisted(() => vi.fn());
const updateProjectDomainRedirect = vi.hoisted(() => vi.fn());
const observeVercelDomain = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const setProjectCustomDomainCandidate = vi.hoisted(() => vi.fn());
const setProjectVerifiedCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomainVerification = vi.hoisted(() => vi.fn());
const setLatestDeploymentLiveUrlForChat = vi.hoisted(() => vi.fn());
const getVercelToken = vi.hoisted(() => vi.fn(() => "token"));

vi.mock("@/lib/capture/pinned-fetch", () => ({
  fetchWithPinnedDns,
  PINNED_ADDRESS_BLOCKED_MESSAGE: "Pinned fetch blocked: hostname resolved to a private/internal address",
}));
vi.mock("@/lib/vercel/vercel-client", () => ({
  addDomainToProject,
  getProjectDomain,
  removeDomainFromProject,
  updateProjectDomainRedirect,
}));
vi.mock("@/lib/vercel/domain-observation", () => ({ observeVercelDomain }));
vi.mock("@/lib/db/services/projects", () => ({
  getProjectById,
  setProjectCustomDomainCandidate,
  setProjectVerifiedCustomDomain,
  clearProjectCustomDomain,
  clearProjectCustomDomainVerification,
}));
vi.mock("@/lib/deployment", () => ({ setLatestDeploymentLiveUrlForChat }));
vi.mock("@/lib/vercel", () => ({ getVercelToken }));

const {
  activateCustomerDomain,
  checkCustomerHttps,
  inspectCustomerDomain,
  linkCustomerDomain,
  unlinkCustomerDomain,
  verifyCustomerDomain,
} = await import("./customer-domain-flow");

const HOSTING = {
  vercelProjectId: "vp_owned",
  appProjectId: "proj_1",
  chatId: "chat_1",
};

function observation(
  domain: string,
  overrides: Partial<{
    connection: "connected" | "not_connected" | "unknown";
    ownership: "pending" | "verified" | "unknown";
    dns: "pending" | "valid" | "invalid" | "unknown";
    value: string;
  }> = {},
) {
  return {
    domain,
    connection: overrides.connection ?? "connected",
    ownership: overrides.ownership ?? "pending",
    dns: overrides.dns ?? "invalid",
    https: "not_checked" as const,
    activation: "not_started" as const,
    records: [
      {
        type: "A",
        host: domain,
        value: overrides.value ?? "192.0.2.10",
        purpose: "configuration" as const,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectById.mockResolvedValue({
    id: "proj_1",
    custom_domain: null,
    custom_domain_verified_at: null,
    published_slug: "kund",
  });
  addDomainToProject.mockResolvedValue({ name: "exempel.se", apexName: "exempel.se", verified: false });
  observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
    observation(domain),
  );
  fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
  setProjectCustomDomainCandidate.mockResolvedValue({ id: "proj_1" });
  setProjectVerifiedCustomDomain.mockResolvedValue({ id: "proj_1" });
  removeDomainFromProject.mockResolvedValue({ removed: true, unknown: false });
  getProjectDomain.mockResolvedValue({
    name: "www.exempel.se",
    apexName: "exempel.se",
    verified: true,
    redirect: null,
  });
  updateProjectDomainRedirect.mockResolvedValue({
    name: "www.exempel.se",
    apexName: "exempel.se",
    verified: true,
    redirect: "exempel.se",
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ verified: true }), { status: 200 })));
});

describe("checkCustomerHttps", () => {
  it("treats a timeout as unknown, not invalid", async () => {
    fetchWithPinnedDns.mockRejectedValue(new Error("Pinned fetch timed out after 8000 ms"));
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("unknown");
  });

  it("treats a certificate failure as invalid", async () => {
    fetchWithPinnedDns.mockRejectedValue(new Error("unable to verify the first certificate"));
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("invalid");
  });

  it.each([401, 404])("treats HTTP %s as invalid, not valid", async (status) => {
    fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("no") });
    await expect(checkCustomerHttps("ny.se")).resolves.toBe("invalid");
  });

  it.each([502, 503])("treats HTTP %s as unknown, not invalid", async (status) => {
    fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("blip") });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("unknown");
  });

  it("treats 2xx as valid", async () => {
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("valid");
  });

  it.each([301, 308])(
    "treats a %s to the intended primary host as valid",
    async (status) => {
      fetchWithPinnedDns.mockResolvedValue({
        status,
        headers: { location: "https://exempel.se/" },
        body: Buffer.from(""),
      });
      await expect(checkCustomerHttps("www.exempel.se", "exempel.se")).resolves.toBe("valid");
    },
  );

  it("treats a 302 to another host as not valid", async () => {
    fetchWithPinnedDns.mockResolvedValue({
      status: 302,
      headers: { location: "https://annan.se/" },
      body: Buffer.from(""),
    });
    await expect(checkCustomerHttps("www.exempel.se", "exempel.se")).resolves.not.toBe("valid");
  });

  it.each([
    ["https://exempel.se/", "invalid"],
    ["/", "invalid"],
    ["https://exempel.se/en", "valid"],
    ["/en", "valid"],
  ] as const)("treats Location %s as %s (loop vs path redirect)", async (location, expected) => {
    fetchWithPinnedDns.mockResolvedValue({
      status: 301,
      headers: { location },
      body: Buffer.from(""),
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe(expected);
  });
});

describe("inspectCustomerDomain HTTPS", () => {
  it.each([301, 308])(
    "keeps a companion %s to primary as ready, not Problem",
    async (status) => {
      observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
        observation(domain, { ownership: "verified", dns: "valid" }),
      );
      getProjectDomain.mockResolvedValue({
        name: "www.exempel.se",
        apexName: "exempel.se",
        verified: true,
        redirect: "exempel.se",
      });
      fetchWithPinnedDns.mockImplementation(async (url: string) => {
        if (String(url).includes("www.exempel.se")) {
          return {
            status,
            headers: { location: "https://exempel.se/" },
            body: Buffer.from(""),
          };
        }
        return { status: 200, headers: {}, body: Buffer.from("ok") };
      });

      const snapshot = await inspectCustomerDomain({
        hosting: HOSTING,
        domain: "exempel.se",
        checkHttps: true,
      });

      expect(snapshot.companion?.https).toBe("valid");
      expect(snapshot.companion?.status).not.toBe("problem");
      expect(snapshot.redirectArmed).toBe(true);
    },
  );
});

describe("linkCustomerDomain", () => {
  it("rejects a reserved platform hostname before any provider write", async () => {
    const result = await linkCustomerDomain({ hosting: HOSTING, domain: "admin.sajtmaskin.se" });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(addDomainToProject).not.toHaveBeenCalled();
  });

  it("attaches apex and www as a pair and does not promote the live URL", async () => {
    const result = await linkCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(addDomainToProject).toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(addDomainToProject).toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(setProjectCustomDomainCandidate).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.snapshot.primary?.records[0]?.value).toBe("192.0.2.10");
      expect(JSON.stringify(result.snapshot)).not.toContain("vp_owned");
    }
  });

  it("does not persist a candidate when the companion attach fails", async () => {
    addDomainToProject
      .mockResolvedValueOnce({ name: "exempel.se", apexName: "exempel.se", verified: false })
      .mockRejectedValueOnce(new Error("network timeout"));

    const result = await linkCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(false);
    expect(setProjectCustomDomainCandidate).not.toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
  });
});

describe("verifyCustomerDomain", () => {
  it("keeps a previously verified domain when the provider is temporarily unknown", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 503 }));
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { connection: "unknown", ownership: "unknown", dns: "unknown" }),
    );

    const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.snapshot.primary?.status).toBe("unknown");
      expect(result.snapshot.message).toMatch(/just nu|okänd|oförändrad/i);
    }
  });

  it("does not auto-activate a builder-poll candidate when a live site is already verified", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });

    const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(true);
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    expect(removeDomainFromProject).not.toHaveBeenCalled();
  });

  it("retries a failed redirect from verify without claiming it is active", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
    getProjectDomain.mockResolvedValue({
      name: "www.exempel.se",
      apexName: "exempel.se",
      verified: true,
      redirect: null,
    });
    updateProjectDomainRedirect.mockRejectedValue(new Error("502 from provider"));

    const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(updateProjectDomainRedirect).toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.snapshot.redirectArmed).toBe(false);
      expect(result.snapshot.canArmRedirect).toBe(true);
    }
  });

  it.each([401, 404, 500])(
    "does not auto-activate a first-time candidate that returns %s",
    async (status) => {
      observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
        observation(domain, { ownership: "verified", dns: "valid" }),
      );
      fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("no") });

      const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

      expect(result.ok).toBe(true);
      expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
      expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    },
  );
});

describe("activateCustomerDomain", () => {
  it("refuses to replace a live domain when HTTPS is unknown", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "gammal.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockRejectedValue(new Error("Pinned fetch timed out after 8000 ms"));

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(false);
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
  });

  it.each([401, 404, 500])(
    "refuses to replace a live domain when the candidate returns %s",
    async (status) => {
      getProjectById.mockResolvedValue({
        id: "proj_1",
        custom_domain: "exempel.se",
        custom_domain_verified_at: new Date("2026-09-01"),
        published_slug: "kund",
      });
      observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
        observation(domain, { ownership: "verified", dns: "valid" }),
      );
      fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("no") });

      const result = await activateCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

      expect(result.ok).toBe(false);
      expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
      expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
      expect(removeDomainFromProject).not.toHaveBeenCalled();
    },
  );

  it("promotes only a fully ready host and arms www redirect", async () => {
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(setProjectVerifiedCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(setLatestDeploymentLiveUrlForChat).toHaveBeenCalledWith("chat_1", "exempel.se");
    expect(updateProjectDomainRedirect).toHaveBeenCalledWith(
      "vp_owned",
      "www.exempel.se",
      "exempel.se",
      undefined,
    );
    if (result.ok) {
      expect(result.snapshot.redirectArmed).toBe(true);
      expect(result.snapshot.canArmRedirect).toBe(false);
    }
  });

  it("does not claim redirect is active when the PATCH fails, and leaves retry open", async () => {
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
    updateProjectDomainRedirect.mockRejectedValue(new Error("502 from provider"));

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(setProjectVerifiedCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
    if (result.ok) {
      expect(result.snapshot.redirectArmed).toBe(false);
      expect(result.snapshot.canArmRedirect).toBe(true);
      expect(result.snapshot.message).toMatch(/omdirigeringen kunde inte/i);
    }
  });
});

describe("unlinkCustomerDomain", () => {
  it("removes the apex/www pair at the provider before clearing live advertising", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(true);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomainVerification).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(clearProjectCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
    const removedAt = Math.min(...removeDomainFromProject.mock.invocationCallOrder);
    const clearedAt = clearProjectCustomDomainVerification.mock.invocationCallOrder[0];
    expect(removedAt).toBeLessThan(clearedAt);
  });

  it("does not change verification when provider remove fails", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    removeDomainFromProject.mockResolvedValue({ removed: false, unknown: true });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
  });

  it("removes an unfinished candidate host without touching the live address", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(true);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "ny.se", undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "www.ny.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    if (result.ok) expect(result.snapshot.message).toMatch(/oförändrad/i);
  });

  it.each([
    ["exempel.se", "www.exempel.se"],
    ["www.exempel.se", "exempel.se"],
    ["exempel.co.uk", "www.exempel.co.uk"],
  ])("treats typed %s as the live pair stored as %s and runs the full unlink", async (typed, stored) => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: stored,
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING, domain: typed });

    expect(result.ok).toBe(true);
    const storedPair = stored.startsWith("www.") ? stored.slice(4) : stored;
    const www = stored.startsWith("www.") ? stored : `www.${stored}`;
    const apex = storedPair;
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", apex, undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", www, undefined);
    expect(clearProjectCustomDomainVerification).toHaveBeenCalledWith("proj_1", stored);
    expect(clearProjectCustomDomain).toHaveBeenCalledWith("proj_1", stored);
  });

  it("does not treat a subdomain as the live pair", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING, domain: "shop.exempel.se" });

    expect(result.ok).toBe(true);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "shop.exempel.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
  });

  it("leaves verification untouched when the second host in the pair fails", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    removeDomainFromProject
      .mockResolvedValueOnce({ removed: true, unknown: false })
      .mockResolvedValueOnce({ removed: false, unknown: true });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
  });
});
